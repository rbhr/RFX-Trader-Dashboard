import TelegramBot from "node-telegram-bot-api";

let bot: TelegramBot | null = null;

function getBot(): TelegramBot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!bot) {
    bot = new TelegramBot(token, { polling: false });
  }
  return bot;
}

/**
 * Resolve a Telegram handle to a numeric chat ID.
 * This uses the getChat API which works when the user has previously
 * started a conversation with the bot.
 */
async function resolveChatId(handle: string): Promise<number | null> {
  const b = getBot();
  if (!b) return null;
  try {
    // Normalise: ensure it starts with @
    const username = handle.startsWith("@") ? handle : `@${handle}`;
    const chat = await b.getChat(username);
    return chat.id;
  } catch {
    return null;
  }
}

/**
 * Send a plain-text message to a Telegram user by their handle.
 * Returns true on success, false on any failure.
 */
export async function sendTelegramMessage(
  telegramHandle: string,
  message: string
): Promise<boolean> {
  const b = getBot();
  if (!b) {
    console.warn("[Telegram] Bot token not configured — skipping notification");
    return false;
  }

  try {
    const chatId = await resolveChatId(telegramHandle);
    if (!chatId) {
      console.warn(`[Telegram] Could not resolve chat ID for handle: ${telegramHandle}`);
      return false;
    }
    await b.sendMessage(chatId, message, { parse_mode: "HTML" });
    return true;
  } catch (err) {
    console.error(`[Telegram] Failed to send message to ${telegramHandle}:`, err);
    return false;
  }
}

/**
 * Build a payment notification message for a trader.
 */
export function buildPaymentMessage(params: {
  traderName: string;
  amount: number;
  network: string;
  networkFee: number;
  transactionHash: string;
  paymentDate: Date;
}): string {
  const { traderName, amount, network, networkFee, transactionHash, paymentDate } = params;
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
    `💰 <b>Payment Received</b>\n\n` +
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
