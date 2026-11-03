import TelegramBot from "node-telegram-bot-api";
import {
  consumeTelegramLinkToken,
  getMagicNumbersByTelegramHandle,
  updateMagicNumber,
} from "./db";
import { maybeActivateOnboarding } from "./onboarding";
import { logEvent } from "./logStore";
import { toLanguage, translate, type Language } from "@shared/i18n";
import { ENV } from "./_core/env";

let bot: TelegramBot | null = null;
let pollingStarted = false;

/**
 * The bot's own @username, for building `t.me` deep links. Asked once and
 * cached; a link is not worth a round trip per request.
 */
let cachedBotUsername: string | null = null;

export async function telegramDeepLink(payload: string): Promise<string | null> {
  const b = getBot();
  if (!b) return null;
  if (!cachedBotUsername) {
    try {
      const me = await b.getMe();
      cachedBotUsername = me.username ?? null;
    } catch (e) {
      console.warn("[Telegram] getMe failed, cannot build a deep link:", e);
      return null;
    }
  }
  if (!cachedBotUsername) return null;
  return `https://t.me/${cachedBotUsername}?start=${encodeURIComponent(payload)}`;
}

function getBot(): TelegramBot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!bot) {
    bot = new TelegramBot(token, { polling: false });
  }
  return bot;
}

/**
 * Start polling for incoming Telegram messages.
 * When a user sends /start, we look up their handle in the DB and store their chat ID.
 * This must be called once at server startup.
 */
export function startTelegramPolling(): void {
  if (pollingStarted) {
    console.log("[Telegram] Polling already started — skipping duplicate init");
    return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[Telegram] No bot token — polling disabled");
    return;
  }
  pollingStarted = true;

  // Use a separate polling bot instance; dropPendingUpdates clears any stale sessions
  const pollingBot = new TelegramBot(token, {
    polling: { params: { timeout: 10, allowed_updates: ['message'] } }
  });

  // Gracefully stop polling on process exit to avoid 409 on next restart
  const stopPolling = () => pollingBot.stopPolling().catch(() => {});
  process.once('SIGTERM', stopPolling);
  process.once('SIGINT', stopPolling);

  pollingBot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from?.username;
    const text = msg.text?.trim();

    // "/start", but also "/start <payload>" (what a t.me deep link sends) and
    // "/start@RFXTraderBot" — an exact match silently ignored both.
    const isStart = /^\/start(@\w+)?(\s|$)/i.test(text ?? "");

    // Anything else used to get no reply and no log line, which from the
    // outside is indistinguishable from the bot being down.
    if (!isStart) {
      const who = username ? `@${username}` : "no username";
      try {
        await pollingBot.sendMessage(
          chatId,
          translate(toLanguage(msg.from?.language_code), "telegram.help")
        );
        logEvent(
          "telegram",
          `Message from ${who} (chat ${chatId}): "${(text ?? "[non-text]").slice(0, 60)}" — replied with /start help`
        );
      } catch (err) {
        console.error("[Telegram] Error replying with help:", err);
      }
      return;
    }

    if (isStart) {
      // `/start <token>` — a link opened from a signed-in dashboard. The token
      // is the authority, so this may rebind an established chat id; `/start`
      // on its own may not (see below).
      const payload = (text ?? "").replace(/^\/start(@\w+)?\s*/i, "").trim();
      if (payload) {
        try {
          const trader = await consumeTelegramLinkToken(payload);
          if (!trader) {
            await pollingBot.sendMessage(
              chatId,
              translate(
                toLanguage(msg.from?.language_code),
                "telegram.startLinkExpired"
              )
            );
            logEvent(
              "telegram",
              `/start with an unknown or expired link token (chat ${chatId})`,
              "warn"
            );
            return;
          }

          const wasLinked = !!trader.telegramChatId;
          await updateMagicNumber(trader.id, { telegramChatId: String(chatId) });
          const lang = toLanguage(trader.language);
          await pollingBot.sendMessage(
            chatId,
            translate(lang, wasLinked ? "telegram.startRelinked" : "telegram.startLinked", {
              count: 1,
              accounts: `• [Magic ${trader.magicNumber}] ${trader.name}`,
              dashboardLink: `<a href="https://tradersdash.rftrust.co/">https://tradersdash.rftrust.co/</a>`,
            }),
            { parse_mode: "HTML", disable_web_page_preview: true } as any
          );
          logEvent(
            "telegram",
            `${wasLinked ? "Re-linked" : "Linked"} ${trader.name} (magic ${trader.magicNumber}) ` +
              `to chat ${chatId} via a dashboard link token`
          );
          await maybeActivateOnboarding(trader.id);
        } catch (err) {
          console.error("[Telegram] Error handling /start token:", err);
          logEvent(
            "telegram",
            `/start token (chat ${chatId}) failed: ${err instanceof Error ? err.message : String(err)}`,
            "error"
          );
        }
        return;
      }

      // A Telegram account with no public @username can't be matched to a
      // dashboard handle. Without this branch the /start is silently dropped
      // (no link, no reply, no log) — tell the user how to fix it instead.
      // No trader to read a language from yet, so go by the Telegram client's.
      const clientLang = toLanguage(msg.from?.language_code);
      if (!username) {
        await pollingBot.sendMessage(
          chatId,
          translate(clientLang, "telegram.startNoUsername"),
          { parse_mode: "HTML", disable_web_page_preview: true } as any
        );
        logEvent("telegram", `/start with no Telegram username set (chat ${chatId})`, "warn");
        return;
      }
      try {
        const matched = await getMagicNumbersByTelegramHandle(username);
        // A username match is only ever enough for a *first* link. Anything
        // already bound keeps the chat id it has: a Telegram username can be
        // abandoned and re-registered by somebody else, and the codes that go
        // to that chat are the ones that reset a password.
        const traders = matched.filter((t) => !t.telegramChatId);
        const alreadyLinked = matched.filter((t) => !!t.telegramChatId);

        if (alreadyLinked.length > 0) {
          logEvent(
            "telegram",
            `/start from @${username} (chat ${chatId}) — ignored for ` +
              `${alreadyLinked.length} already-linked account(s): ` +
              `${alreadyLinked.map((t) => t.magicNumber).join(", ")}. ` +
              `Re-linking needs a dashboard link.`,
            "warn"
          );
        }

        if (traders.length > 0) {
          const anyFirstLink = true;

          for (const t of traders) {
            await updateMagicNumber(t.id, { telegramChatId: String(chatId) });
          }

          const dashboardUrl = "https://tradersdash.rftrust.co/";
          const accountList = traders
            .map((t) => `• [Magic ${t.magicNumber}] ${t.name}`)
            .join("\n");

          const welcomeMsg = translate(
            toLanguage(traders[0].language),
            anyFirstLink ? "telegram.startLinked" : "telegram.startRelinked",
            {
              count: traders.length,
              accounts: accountList,
              dashboardLink: `<a href="${dashboardUrl}">${dashboardUrl}</a>`,
            }
          );

          await pollingBot.sendMessage(chatId, welcomeMsg, { parse_mode: "HTML", disable_web_page_preview: true } as any);
          logEvent("telegram", `${anyFirstLink ? 'Linked' : 'Re-linked'} @${username} (chat ${chatId}) to ${traders.length} account(s): ${traders.map((t) => t.magicNumber).join(', ')}`);

          // Linking Telegram may complete onboarding → activate live copiers.
          // Idempotent (guarded by liveCopiersActivatedAt); safe to call every /start.
          for (const t of traders) {
            await maybeActivateOnboarding(t.id);
          }
        } else if (alreadyLinked.length > 0) {
          // The handle is known but every match is already connected, possibly
          // to a different Telegram account. Send them through the dashboard.
          await pollingBot.sendMessage(
            chatId,
            translate(
              toLanguage(alreadyLinked[0]!.language),
              "telegram.startAlreadyLinked"
            ),
            { parse_mode: "HTML", disable_web_page_preview: true } as any
          );
        } else {
          await pollingBot.sendMessage(
            chatId,
            translate(clientLang, "telegram.startUnknown", { username })
          );
          logEvent("telegram", `/start from unknown handle @${username} (chat ${chatId}) — no matching trader`, "warn");
        }
      } catch (err) {
        console.error("[Telegram] Error handling /start:", err);
        logEvent(
          "telegram",
          `/start from @${username} (chat ${chatId}) failed: ${err instanceof Error ? err.message : String(err)}`,
          "error"
        );
      }
    }
  });

  let conflictCount = 0;
  pollingBot.on("polling_error", (err) => {
    // A 409 Conflict means another process is polling with the same bot token
    // and is taking some of the updates. One or two during a redeploy are
    // normal; a steady stream means a second bot instance is running somewhere.
    if (err.message.includes('409')) {
      conflictCount++;
      if (conflictCount === 5 || conflictCount % 200 === 0) {
        logEvent(
          "telegram",
          `Polling conflict x${conflictCount}: another process is polling @RFXTraderBot with the same token and may be swallowing /start messages`,
          "warn"
        );
      }
      return;
    }
    console.error("[Telegram] Polling error:", err.message);
    logEvent("telegram", `Polling error: ${err.message}`, "warn");
  });

  console.log("[Telegram] Bot polling started — listening for /start messages");
}

/**
 * Send a plain-text message to a Telegram user by their stored chat ID.
 * Falls back to username resolution if no chat ID is stored yet.
 * Returns true on success, false on any failure.
 */
export async function sendTelegramMessage(
  telegramHandle: string,
  message: string,
  chatId?: string | null,
  opts?: {
    logLabel?: string;
    /** Language `message` is written in, when it is not English. */
    lang?: Language;
    /** The same message in English, so the admin Logs show both. */
    englishMessage?: string;
  }
): Promise<boolean> {
  const recipient = telegramRecipientLabel(telegramHandle, chatId);
  // Sensitive sends (e.g. 2FA codes) pass an explicit logLabel so the code body
  // is never persisted; everything else logs a sanitized content preview — in
  // English first, then in the language it actually went out in.
  const summary =
    opts?.logLabel ??
    (opts?.englishMessage && opts.lang && opts.lang !== "en"
      ? `${previewTelegramMessage(opts.englishMessage)} | [${opts.lang}] ${previewTelegramMessage(message)}`
      : previewTelegramMessage(message));

  const b = getBot();
  if (!b) {
    console.warn("[Telegram] Bot token not configured — skipping notification");
    logEvent("telegram", `Not sent to ${recipient} (${summary}) — bot token not configured`, "warn");
    return false;
  }

  try {
    // Prefer stored chat ID over username resolution
    const targetId = chatId ?? null;
    if (!targetId) {
      console.warn(`[Telegram] No chat ID stored for handle: ${telegramHandle}. User must send /start to @RFXTraderBot first.`);
      logEvent("telegram", `Not sent to ${recipient} (${summary}) — no chat ID; user must /start the bot`, "warn");
      return false;
    }
    await b.sendMessage(targetId, message, { parse_mode: "HTML" });
    logEvent("telegram", `Sent to ${recipient}: ${summary}`);
    return true;
  } catch (err) {
    console.error(`[Telegram] Failed to send message to ${telegramHandle} (chat ID: ${chatId}):`, err);
    logEvent("telegram", `Failed to send to ${recipient} (${summary}): ${err instanceof Error ? err.message : String(err)}`, "warn");
    return false;
  }
}

/** "@handle (chat 123)" / "@handle" / "chat 123" — for telegram log lines. */
function telegramRecipientLabel(handle: string, chatId?: string | null): string {
  const h = handle ? `@${handle}` : null;
  if (h && chatId) return `${h} (chat ${chatId})`;
  if (h) return h;
  return `chat ${chatId ?? "unknown"}`;
}

/** Strip HTML, collapse whitespace, and cap length for a log-friendly preview. */
function previewTelegramMessage(message: string): string {
  const text = message.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

/**
 * A trader-facing message in the trader's language, plus what
 * sendTelegramMessage needs to log the English alongside it.
 */
export function localizedTelegram<P>(
  build: (params: P, lang: Language) => string,
  params: P,
  language: string | null | undefined
): {
  message: string;
  /** The English rendering, whatever language the trader reads. */
  english: string;
  opts: { lang: Language; englishMessage?: string };
} {
  const lang = toLanguage(language);
  const english = build(params, "en");
  return {
    message: lang === "en" ? english : build(params, lang),
    english,
    opts: { lang, englishMessage: lang === "en" ? undefined : english },
  };
}

/**
 * Copy a trader-facing risk message to the team's alerts channel, in English.
 * A no-op when TELEGRAM_ALERT_CHANNEL_ID is unset, and it never throws: a
 * missing channel must not get in the way of telling the trader.
 */
export async function copyToAlertChannel(englishMessage: string): Promise<void> {
  const channel = ENV.telegramAlertChannelId;
  if (!channel) return;
  const b = getBot();
  if (!b) return;
  try {
    await b.sendMessage(channel, englishMessage, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    } as any);
    logEvent("telegram", `Copied to alerts channel: ${previewTelegramMessage(englishMessage)}`);
  } catch (err) {
    logEvent(
      "telegram",
      `Alerts channel copy failed (${previewTelegramMessage(englishMessage)}): ${err instanceof Error ? err.message : String(err)}`,
      "warn"
    );
  }
}

/**
 * Build a risk limit breach notification message for a trader.
 */
export function buildRiskLimitBreachMessage(
  params: {
    traderName: string;
    magicNumber: string;
    equity: number;
    riskLimit: number;
  },
  lang: Language = "en"
): string {
  const { traderName, magicNumber, equity, riskLimit } = params;
  return translate(lang, "telegram.breach", {
    magicNumber,
    greeting: translate(lang, "telegram.greeting", { name: traderName }),
    equity: equity.toFixed(2),
    riskLimit: riskLimit.toFixed(2),
  });
}

/**
 * Build a trailing risk limit update notification for a trader.
 */
export function buildTrailingRiskLimitMessage(
  params: {
    traderName: string;
    magicNumber: string;
    newStopout: number;
  },
  lang: Language = "en"
): string {
  const { traderName, magicNumber, newStopout } = params;
  return translate(lang, "telegram.trailing", {
    magicNumber,
    greeting: translate(lang, "telegram.greeting", { name: traderName }),
    stopout: newStopout.toFixed(2),
  });
}

/**
 * Build a "trade not copied to live" notification for a trader. Fired when an
 * open trade on their incubator account is missing the SL/TP their copier
 * requires, so it was never copied to live — we close it and tell them why.
 */
export function buildMissedTradeMessage(
  params: {
    traderName: string;
    magicNumber: string;
    symbol: string;
    missing: string;
  },
  lang: Language = "en"
): string {
  const { traderName, magicNumber, symbol, missing } = params;
  return translate(lang, "telegram.missedTrade", {
    magicNumber,
    greeting: translate(lang, "telegram.greeting", { name: traderName }),
    symbol,
    missing,
  });
}

/**
 * Tell a trader their payout address was changed — the message that lets
 * somebody notice a change they did not make, which is the whole point of the
 * cool-off it announces. Addresses and the hold are wrapped so they read
 * left-to-right in Urdu and Arabic.
 */
export function buildUsdtAddressChangedMessage(
  params: {
    traderName: string;
    magicNumber: string;
    previousAddress: string;
    newAddress: string;
    holdHours: number;
  },
  lang: Language = "en"
): string {
  const { traderName, magicNumber, previousAddress, newAddress, holdHours } =
    params;
  return translate(lang, "telegram.usdtAddressChanged", {
    magicNumber,
    greeting: translate(lang, "telegram.greeting", { name: traderName }),
    previousAddress,
    newAddress,
    holdHours: String(holdHours),
  });
}

/**
 * Build a risk limit breach alert message for the admin. English only.
 */
export function buildAdminRiskLimitAlertMessage(params: {
  traderName: string;
  magicNumber: string;
  equity: number;
  riskLimit: number;
}): string {
  const { traderName, magicNumber, equity, riskLimit } = params;
  return (
    `⚠️ <b>Risk Limit Breach Alert</b>\n\n` +
    `Trader <b>${traderName}</b> (Magic: ${magicNumber}) has breached their risk limit.\n\n` +
    `• Equity at breach: <b>$${equity.toFixed(2)}</b>\n` +
    `• Risk limit: <b>$${riskLimit.toFixed(2)}</b>\n\n` +
    `All trades have been closed and the account is permanently breached. The trader has been notified.`
  );
}

/**
 * Build a payment notification message for a trader.
 */
export function buildPaymentMessage(
  params: {
    traderName: string;
    magicNumber: string;
    amount: number;
    network: string;
    networkFee: number;
    transactionHash: string;
    paymentDate: Date;
  },
  lang: Language = "en"
): string {
  const { traderName, magicNumber, amount, network, networkFee, transactionHash, paymentDate } = params;
  // Dates keep Western digits and English month names in every language.
  const dateStr = paymentDate.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const explorerUrl =
    network === "ERC20"
      ? `https://etherscan.io/tx/${transactionHash}`
      : `https://tronscan.org/#/transaction/${transactionHash}`;
  return translate(lang, "telegram.payment", {
    magicNumber,
    greeting: translate(lang, "telegram.greeting", { name: traderName }),
    amount: amount.toFixed(2),
    network,
    fee: networkFee.toFixed(2),
    date: dateStr,
    txLink: `<a href="${explorerUrl}">${transactionHash.substring(0, 10)}...${transactionHash.slice(-6)}</a>`,
  });
}
