import bcrypt from "bcrypt";

import { getMagicNumberById, updateMagicNumber } from "./db";
import { enableTraderLiveCopiers } from "./metacopier";
import { sendTelegramMessage } from "./telegram";

type TraderRow = NonNullable<Awaited<ReturnType<typeof getMagicNumberById>>>;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Build the "LOGIN DETAILS" Telegram message (HTML). The aligned block is
 * wrapped in <pre> so monospace padding survives; labels are padded to the
 * longest present label so the emoji/colon column lines up. The ShowMyTrades
 * line is included only when the trader has a showMyTradesUrl.
 */
export function buildLoginDetailsMessage(trader: TraderRow): string {
  const rows: [string, string, string][] = [
    ["Name", "🆔", `RFX - ${trader.name} - ${trader.magicNumber}`],
    ["Acct", "🧾", trader.mtAccount ?? ""],
    ["Password", "🔑", trader.mtPassword ?? ""],
    ["Server", "🌐", trader.mtServer ?? ""],
  ];
  if (trader.showMyTradesUrl) {
    rows.push(["ShowMyTrades", "📈", trader.showMyTradesUrl]);
  }
  const width = Math.max(...rows.map(([label]) => label.length));
  const body = rows
    .map(([label, emoji, val]) => `${label.padEnd(width)} ${emoji} : ${escapeHtml(val)}`)
    .join("\n");
  return `🔐 <b>LOGIN DETAILS</b>\n\n<pre>${body}</pre>`;
}

/**
 * True when the trader still has the default password (password == magicNumber,
 * bcrypt-hashed). Passwords are stored hashed, so this must use bcrypt.compare,
 * not string equality.
 */
async function isDefaultPassword(trader: TraderRow): Promise<boolean> {
  try {
    return await bcrypt.compare(trader.magicNumber, trader.password);
  } catch {
    return false;
  }
}

/**
 * Re-evaluate a trader's onboarding gate and, if all conditions are now met,
 * activate their live copiers and send their login details — exactly once.
 *
 * Gate (all required): Telegram linked (telegramChatId), password changed off
 * the default, USDT address + network set, trader active, and a MetaCopier
 * account exists. One-way: guarded by liveCopiersActivatedAt so it fires once
 * and later edits never re-trigger or re-enable.
 *
 * Safe to call from anywhere (after /start, password change, USDT save). Never
 * throws — failures are logged; the activation flag is stamped only after the
 * copier enable succeeds, so a transient MetaCopier failure will be retried on
 * the next qualifying action.
 */
export async function maybeActivateOnboarding(traderId: number): Promise<void> {
  try {
    const trader = await getMagicNumberById(traderId);
    if (!trader) {
      console.log(`[Onboarding] traderId ${traderId} not found — skipping`);
      return;
    }
    const who = `${trader.name} (magic ${trader.magicNumber})`;

    // One-way: already activated.
    if (trader.liveCopiersActivatedAt) {
      console.log(`[Onboarding] ${who}: already activated — skipping`);
      return;
    }

    // Evaluate every gate condition so the log shows exactly what's outstanding.
    const pending: string[] = [];
    if (!trader.isActive) pending.push("trader inactive");
    if (!trader.mcAccountId) pending.push("no MetaCopier account");
    if (!trader.telegramChatId) pending.push("Telegram not linked");
    if (!trader.usdtAddress || !trader.usdtNetwork) pending.push("USDT address/network not set");
    if (await isDefaultPassword(trader)) pending.push("password still default");

    if (pending.length > 0) {
      console.log(`[Onboarding] ${who} not activated — waiting on: ${pending.join(", ")}`);
      return;
    }

    // All conditions met — activate live copiers, then stamp + notify.
    const result = await enableTraderLiveCopiers(trader);

    await updateMagicNumber(trader.id, { liveCopiersActivatedAt: new Date() });

    try {
      await sendTelegramMessage(
        trader.telegramHandle ?? "",
        buildLoginDetailsMessage(trader),
        trader.telegramChatId
      );
    } catch (e) {
      console.error(
        `[Onboarding] ${who}: activated but failed to deliver login details:`,
        e
      );
    }

    console.log(
      `🎉 [Onboarding] ${who} ACTIVATED — onboarding complete! Enabled ${result.enabled} live copier(s) and sent login details to ${trader.telegramHandle}. Welcome aboard! 🚀`
    );
  } catch (e) {
    console.error(`[Onboarding] maybeActivateOnboarding(${traderId}) failed:`, e);
  }
}
