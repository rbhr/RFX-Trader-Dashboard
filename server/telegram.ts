import TelegramBot from "node-telegram-bot-api";
import { getMagicNumbersByTelegramHandle, updateMagicNumber } from "./db";

let bot: TelegramBot | null = null;
let pollingStarted = false;

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

    if (text === "/start" && username) {
      try {
        const traders = await getMagicNumbersByTelegramHandle(username);
        if (traders.length > 0) {
          const anyFirstLink = traders.some((t) => !t.telegramChatId);

          for (const t of traders) {
            await updateMagicNumber(t.id, { telegramChatId: String(chatId) });
          }

          const dashboardUrl = "https://rfxtrader.manus.space";
          const accountList = traders
            .map((t) => `• [Magic ${t.magicNumber}] ${t.name}`)
            .join("\n");

          const welcomeMsg = anyFirstLink
            ? (
                `✅ <b>Welcome to RFX Trader Dashboard!</b>\n\n` +
                `Your Telegram is now linked to ${traders.length} account(s):\n${accountList}\n\n` +
                `• 📊 <b>Dashboard:</b> <a href="${dashboardUrl}">${dashboardUrl}</a>\n\n` +
                `You'll receive payment confirmations, risk limit alerts, and important updates here. Welcome aboard! 🚀`
              )
            : (
                `✅ <b>Re-linked!</b>\n\n` +
                `Your Telegram is connected to ${traders.length} account(s):\n${accountList}\n\n` +
                `Notifications will continue to be delivered here.`
              );

          await pollingBot.sendMessage(chatId, welcomeMsg, { parse_mode: "HTML", disable_web_page_preview: true } as any);
          console.log(`[Telegram] ${anyFirstLink ? 'Linked' : 'Re-linked'} chat ID ${chatId} to ${traders.length} trader(s) (@${username})`);
        } else {
          await pollingBot.sendMessage(
            chatId,
            `👋 Hi @${username}! To link your Telegram to RFX Trader Dashboard, please save your Telegram handle in your dashboard settings first, then send /start again.`
          );
          console.log(`[Telegram] /start from unknown handle @${username} (chat ID: ${chatId})`);
        }
      } catch (err) {
        console.error("[Telegram] Error handling /start:", err);
      }
    }
  });

  pollingBot.on("polling_error", (err) => {
    // 409 Conflict is expected during dev hot-reloads; suppress to avoid log noise
    if (!err.message.includes('409')) {
      console.error("[Telegram] Polling error:", err.message);
    }
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
  chatId?: string | null
): Promise<boolean> {
  const b = getBot();
  if (!b) {
    console.warn("[Telegram] Bot token not configured — skipping notification");
    return false;
  }

  try {
    // Prefer stored chat ID over username resolution
    const targetId = chatId ?? null;
    if (!targetId) {
      console.warn(`[Telegram] No chat ID stored for handle: ${telegramHandle}. User must send /start to @RFXTraderBot first.`);
      return false;
    }
    await b.sendMessage(targetId, message, { parse_mode: "HTML" });
    return true;
  } catch (err) {
    console.error(`[Telegram] Failed to send message to ${telegramHandle} (chat ID: ${chatId}):`, err);
    return false;
  }
}

/**
 * Build a risk limit breach notification message for a trader.
 */
export function buildRiskLimitBreachMessage(params: {
  traderName: string;
  magicNumber: string;
  equity: number;
  riskLimit: number;
}): string {
  const { traderName, magicNumber, equity, riskLimit } = params;
  return (
    `[Magic ${magicNumber}] 🚨 <b>Risk Limit Breached</b>\n\n` +
    `Hi ${traderName},\n\n` +
    `Your incubator account equity has dropped to <b>$${equity.toFixed(2)}</b>, ` +
    `which is below your risk limit of <b>$${riskLimit.toFixed(2)}</b>.\n\n` +
    `<b>All trades have been closed.</b>\n\n` +
    `Please message an admin to re-enable trading on your account.`
  );
}

/**
 * Build a trailing risk limit update notification for a trader.
 */
export function buildTrailingRiskLimitMessage(params: {
  traderName: string;
  magicNumber: string;
  newStopout: number;
}): string {
  const { traderName, magicNumber, newStopout } = params;
  return (
    `[Magic ${magicNumber}] 📈 <b>Risk Limit Updated</b>\n\n` +
    `Hi ${traderName},\n\n` +
    `New Stopout <b>$${newStopout.toFixed(2)}</b>. Manage risk and lot size accordingly.`
  );
}

/**
 * Build a risk limit breach alert message for the admin.
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
    `All trades have been closed. The trader has been notified and must contact an admin to re-enable trading.`
  );
}

/**
 * Build a payment notification message for a trader.
 */
export function buildPaymentMessage(params: {
  traderName: string;
  magicNumber: string;
  amount: number;
  network: string;
  networkFee: number;
  transactionHash: string;
  paymentDate: Date;
}): string {
  const { traderName, magicNumber, amount, network, networkFee, transactionHash, paymentDate } = params;
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
  return (
    `[Magic ${magicNumber}] 💰 <b>Payment Received</b>\n\n` +
    `Hi ${traderName},\n\n` +
    `A payment of <b>${amount.toFixed(2)} USDT</b> has been sent to your wallet.\n\n` +
    `📋 <b>Details</b>\n` +
    `• Network: ${network}\n` +
    `• Network Fee: ${networkFee.toFixed(2)} USDT\n` +
    `• Date: ${dateStr}\n` +
    `• TX: <a href="${explorerUrl}">${transactionHash.substring(0, 10)}...${transactionHash.slice(-6)}</a>\n\n` +
    `You can view the full transmission proof in your RFX Trader dashboard.`
  );
}
