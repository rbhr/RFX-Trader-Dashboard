import { describe, it, expect } from "vitest";
import TelegramBot from "node-telegram-bot-api";

describe("Telegram Bot Token", () => {
  it("should have TELEGRAM_BOT_TOKEN set in environment", () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    expect(token, "TELEGRAM_BOT_TOKEN must be set in environment").toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token!.length).toBeGreaterThan(10);
  });

  it("should be able to connect to Telegram API and get bot info", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN not set");
    }
    const bot = new TelegramBot(token, { polling: false });
    const me = await bot.getMe();
    expect(me).toBeDefined();
    expect(me.id).toBeGreaterThan(0);
    expect(me.is_bot).toBe(true);
    console.log(`[Telegram] Bot connected: @${me.username} (ID: ${me.id})`);
  }, 15000);
});
