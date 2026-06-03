# USDT-TRC20 Custodial Wallet Integration

> **Status: ✅ Implemented** — see `server/tron.ts`. This document is the original design spec, kept for reference.

## Overview

Add a server-side custodial USDT-TRC20 wallet to the RFX Trader Dashboard, enabling outbound USDT payments to trader wallet addresses. The private key lives exclusively on the server. The existing `payments` table and Telegram notification system are reused directly.

## Stack Context

- **Runtime**: Pure Node.js (Express) — no edge runtime restrictions, `tronweb` works natively
- **API layer**: tRPC — wallet procedures follow the same pattern as existing routers
- **ESM**: Project uses `"type": "module"` — `tronweb` must be imported carefully (see below)
- **Database**: `payments` table already has `transactionHash`, `amount`, `networkFee`, `magicNumberId` — no schema changes needed
- **Notifications**: `sendTelegramMessage` + `buildPaymentMessage` already exist in `server/telegram.ts`

-----

## Step 1 — Install the SDK

Use the ESM-compatible fork:

```bash
pnpm add @tronweb-sdk/tronweb
```

> Do **not** use the older `tronweb` package — it is CommonJS-only and will break under `"type": "module"`.

-----

## Step 2 — Add Environment Variables

Add to `.env`:

```env
TRON_PRIVATE_KEY=your_private_key_here
TRON_FULL_NODE=https://api.trongrid.io
TRON_USDT_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
```

Add to `server/_core/env.ts` following the existing pattern:

```ts
export const ENV = {
  // ...existing entries...
  tronPrivateKey: process.env.TRON_PRIVATE_KEY ?? "",
  tronFullNode: process.env.TRON_FULL_NODE ?? "https://api.trongrid.io",
  tronUsdtContract: process.env.TRON_USDT_CONTRACT ?? "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
};
```

-----

## Step 3 — Create `server/tron.ts`

This is the singleton TronWeb service. All wallet operations go through here.

```ts
import TronWeb from "@tronweb-sdk/tronweb";
import { ENV } from "./_core/env";

// USDT TRC-20 has 6 decimal places
const USDT_DECIMALS = 1_000_000;

let _tronWeb: TronWeb | null = null;

function getTronWeb(): TronWeb {
  if (!_tronWeb) {
    if (!ENV.tronPrivateKey) {
      throw new Error("TRON_PRIVATE_KEY is not set in environment");
    }
    _tronWeb = new TronWeb({
      fullHost: ENV.tronFullNode,
      privateKey: ENV.tronPrivateKey,
    });
  }
  return _tronWeb;
}

/**
 * Returns the wallet address derived from the configured private key.
 */
export function getWalletAddress(): string {
  return getTronWeb().defaultAddress.base58 as string;
}

/**
 * Returns the USDT balance of the wallet in human-readable form (e.g. "150.50").
 */
export async function getUsdtBalance(): Promise<string> {
  const tronWeb = getTronWeb();
  const contract = await tronWeb.contract().at(ENV.tronUsdtContract);
  const address = getWalletAddress();
  const raw = await contract.balanceOf(address).call();
  return (Number(raw) / USDT_DECIMALS).toFixed(2);
}

/**
 * Sends USDT to a recipient address.
 * @param recipientAddress - TRON base58 address (starts with T)
 * @param amount - Human-readable USDT amount (e.g. 50.00)
 * @returns Transaction hash string
 */
export async function sendUsdt(
  recipientAddress: string,
  amount: number
): Promise<string> {
  const tronWeb = getTronWeb();

  if (!tronWeb.isAddress(recipientAddress)) {
    throw new Error("Invalid TRON wallet address");
  }

  const contract = await tronWeb.contract().at(ENV.tronUsdtContract);
  const rawAmount = Math.round(amount * USDT_DECIMALS);

  const txHash = await contract
    .transfer(recipientAddress, rawAmount)
    .send({ feeLimit: 100_000_000 }); // 100 TRX fee limit — covers normal USDT transfers

  return txHash as string;
}
```

-----

## Step 4 — Create `server/walletRouter.ts`

Follows the exact same tRPC pattern as the existing routers.

```ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getUsdtBalance, getWalletAddress, sendUsdt } from "./tron";
import { createPayment } from "./db";
import { sendTelegramMessage, buildPaymentMessage } from "./telegram";
import { getMagicNumberById } from "./db";

// Reuse the admin auth middleware already in routers.ts
// Import it from wherever it's defined, or duplicate the pattern here.
// The wallet procedures should be admin-only.

export const walletRouter = router({

  /**
   * Get wallet address and current USDT balance.
   * Admin only.
   */
  getWalletInfo: publicProcedure
    // TODO: swap publicProcedure for your adminProcedure middleware
    .query(async () => {
      try {
        const [address, balance] = await Promise.all([
          getWalletAddress(),
          getUsdtBalance(),
        ]);
        return { address, balance };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch wallet info",
        });
      }
    }),

  /**
   * Send USDT to a trader wallet address.
   * Logs to the payments table and sends a Telegram notification.
   * Admin only.
   */
  sendPayment: publicProcedure
    // TODO: swap publicProcedure for your adminProcedure middleware
    .input(
      z.object({
        magicNumberId: z.number().int().positive(),
        recipientAddress: z.string().min(34).max(34), // TRON addresses are always 34 chars
        amount: z.number().positive().max(10_000), // safety cap — adjust as needed
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { magicNumberId, recipientAddress, amount, notes } = input;

      // 1. Send the on-chain transaction
      let txHash: string;
      try {
        txHash = await sendUsdt(recipientAddress, amount);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Transaction failed",
        });
      }

      // 2. Log to the existing payments table
      await createPayment({
        magicNumberId,
        amount: amount.toFixed(2),
        transactionHash: txHash,
        paymentDate: new Date(),
        networkFee: "0.00", // TRC-20 fees are negligible; update if you want to track TRX cost
        notificationSent: false,
      });

      // 3. Fire Telegram notification using the existing helper
      try {
        const magicNumber = await getMagicNumberById(magicNumberId);
        if (magicNumber?.telegramChatId) {
          const message = buildPaymentMessage({
            amount,
            transactionHash: txHash,
            traderName: magicNumber.name ?? "Trader",
          });
          await sendTelegramMessage(magicNumber.telegramChatId, message);
        }
      } catch {
        // Notification failure should not block the response
        console.error("Telegram notification failed for payment", txHash);
      }

      return { success: true, txHash };
    }),
});
```

-----

## Step 5 — Merge into `appRouter` in `server/routers.ts`

```ts
import { walletRouter } from "./walletRouter";

export const appRouter = router({
  // ...existing routers...
  wallet: walletRouter,
});
```

-----

## Step 6 — Client-Side Usage

tRPC client calls work identically to existing procedures:

```ts
// Get wallet info
const { data } = trpc.wallet.getWalletInfo.useQuery();
// data.address, data.balance

// Send a payment
const sendPayment = trpc.wallet.sendPayment.useMutation();

await sendPayment.mutateAsync({
  magicNumberId: 42,
  recipientAddress: "TRecipientAddressHere",
  amount: 150.00,
});
```

-----

## Step 7 — Admin UI (suggested placement)

Add a **Wallet** section to the existing admin panel with:

- Wallet address display (copyable) + QR code for deposits
- Current USDT balance (auto-refresh or manual)
- Send payment form: recipient address, amount, linked magic number
- Recent payments list (reuse existing `getAllPayments` tRPC call)

-----

## Key Decisions & Notes

|Topic         |Decision                                                                                      |
|--------------|----------------------------------------------------------------------------------------------|
|Custody model |Server-side custodial — private key in `.env`, never sent to client                           |
|Package       |`@tronweb-sdk/tronweb` — ESM-compatible, required for this project                            |
|Network       |TRON Mainnet via TronGrid (`https://api.trongrid.io`)                                         |
|USDT contract |`TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` (official mainnet)                                       |
|DB logging    |Existing `payments` table — `transactionHash` column stores TRON tx hash                      |
|Fees          |Sender needs TRX in the wallet for energy (~13 TRX covers most transfers)                     |
|Auth          |Wallet procedures must be protected by admin auth middleware                                  |
|Error handling|On-chain failures throw `TRPCError` INTERNAL_SERVER_ERROR; notification failures are swallowed|
|Safety cap    |`amount` input capped at 10,000 USDT per transaction — adjust to suit                         |

-----

## Testing Checklist

- [ ] `getWalletAddress()` returns the correct base58 address for the configured key
- [ ] `getUsdtBalance()` returns a readable string (e.g. `"150.00"`)
- [ ] `sendUsdt()` rejects an invalid address before broadcasting
- [ ] `sendPayment` mutation logs a row to the `payments` table with the correct `transactionHash`
- [ ] Telegram notification fires (or fails gracefully) after a successful send
- [ ] Admin auth middleware blocks unauthenticated calls to wallet procedures
- [ ] Test on **Shasta testnet** before going to mainnet (`https://api.shasta.trongrid.io`, testnet USDT contract: `TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs`)

-----

## Testnet Setup (Shasta)

Use Shasta for development so you don’t spend real USDT:

```env
TRON_FULL_NODE=https://api.shasta.trongrid.io
TRON_USDT_CONTRACT=TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs
```

Get free test TRX at: https://www.trongrid.io/shasta
