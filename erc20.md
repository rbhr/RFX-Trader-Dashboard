# USDT-ERC20 Wallet Integration

> **Status: ✅ Implemented** — see `server/erc20.ts`. This document is the original design spec, kept for reference.

## Overview

Add a server-side custodial USDT-ERC20 wallet to the RFX Trader Dashboard, enabling outbound USDT payments on Ethereum or any EVM-compatible L2 (Polygon, Base, Arbitrum). Follows the same pattern as `tron.md` — same `payments` table, same tRPC structure, same Telegram notifications.

## Chain Decision

**Recommendation: Polygon or Base over Ethereum mainnet.**

|Chain           |Gas Cost per Transfer|USDT Contract                               |
|----------------|---------------------|--------------------------------------------|
|Ethereum Mainnet|$5–50                |`0xdAC17F958D2ee523a2206206994597C13D831ec7`|
|Polygon         |$0.01–0.05           |`0xc2132D05D31c914a87C6611C10748AEb04B58e8F`|
|Base            |$0.01–0.05           |`0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2`|
|Arbitrum        |$0.05–0.20           |`0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`|

All chains use identical code — only the RPC URL and contract address change. You can support multiple chains simultaneously by instantiating one service per chain.

## Stack Context

- **SDK**: `ethers` v6 — ESM-native, no import quirks, works cleanly in this project
- **Runtime**: Pure Node.js Express — no restrictions, `ethers` works natively
- **Private key**: Same `0x`-prefixed key works across all EVM chains (Ethereum, Polygon, Base, Arbitrum)
- **DB**: Existing `payments` table — `transactionHash` stores the `0x...` EVM tx hash, no schema changes needed
- **Notifications**: Existing `sendTelegramMessage` + `buildPaymentMessage` reused directly

-----

## Step 1 — Install the SDK

```bash
pnpm add ethers
```

-----

## Step 2 — Add Environment Variables

Add to `.env` (example shown for Polygon — swap URLs/contract for other chains):

```env
EVM_PRIVATE_KEY=0xyour_private_key_here
EVM_RPC_URL=https://polygon-mainnet.infura.io/v3/YOUR_INFURA_KEY
EVM_USDT_CONTRACT=0xc2132D05D31c914a87C6611C10748AEb04B58e8F
EVM_CHAIN_NAME=Polygon
```

**Free RPC providers** (pick one):

- [Infura](https://infura.io) — free tier, supports Ethereum, Polygon, Arbitrum
- [Alchemy](https://alchemy.com) — free tier, supports Ethereum, Polygon, Base, Arbitrum
- [QuickNode](https://quicknode.com) — free tier, all major chains

Add to `server/_core/env.ts` following the existing pattern:

```ts
export const ENV = {
  // ...existing entries...
  evmPrivateKey: process.env.EVM_PRIVATE_KEY ?? "",
  evmRpcUrl: process.env.EVM_RPC_URL ?? "",
  evmUsdtContract: process.env.EVM_USDT_CONTRACT ?? "",
  evmChainName: process.env.EVM_CHAIN_NAME ?? "EVM",
};
```

-----

## Step 3 — Create `server/erc20.ts`

```ts
import { ethers } from "ethers";
import { ENV } from "./_core/env";

// Minimal ABI — only the functions we need
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

// USDT uses 6 decimal places on all EVM chains
const USDT_DECIMALS = 1_000_000n;

let _provider: ethers.JsonRpcProvider | null = null;
let _wallet: ethers.Wallet | null = null;
let _contract: ethers.Contract | null = null;

function getInstances(): {
  provider: ethers.JsonRpcProvider;
  wallet: ethers.Wallet;
  contract: ethers.Contract;
} {
  if (!ENV.evmPrivateKey) throw new Error("EVM_PRIVATE_KEY is not set");
  if (!ENV.evmRpcUrl) throw new Error("EVM_RPC_URL is not set");
  if (!ENV.evmUsdtContract) throw new Error("EVM_USDT_CONTRACT is not set");

  if (!_provider) _provider = new ethers.JsonRpcProvider(ENV.evmRpcUrl);
  if (!_wallet) _wallet = new ethers.Wallet(ENV.evmPrivateKey, _provider);
  if (!_contract) _contract = new ethers.Contract(ENV.evmUsdtContract, ERC20_ABI, _wallet);

  return { provider: _provider, wallet: _wallet, contract: _contract };
}

/**
 * Returns the wallet address derived from the configured private key.
 */
export function getWalletAddress(): string {
  const { wallet } = getInstances();
  return wallet.address;
}

/**
 * Returns the USDT balance of the wallet in human-readable form (e.g. "150.50").
 */
export async function getUsdtBalance(): Promise<string> {
  const { contract, wallet } = getInstances();
  const raw: bigint = await contract.balanceOf(wallet.address);
  return (Number(raw) / Number(USDT_DECIMALS)).toFixed(2);
}

/**
 * Sends USDT to a recipient address.
 * @param recipientAddress - EVM hex address (0x...)
 * @param amount - Human-readable USDT amount (e.g. 50.00)
 * @returns Transaction hash string
 */
export async function sendUsdtErc20(
  recipientAddress: string,
  amount: number
): Promise<string> {
  const { contract } = getInstances();

  if (!ethers.isAddress(recipientAddress)) {
    throw new Error("Invalid EVM wallet address");
  }

  const rawAmount = BigInt(Math.round(amount * Number(USDT_DECIMALS)));

  const tx = await contract.transfer(recipientAddress, rawAmount);
  await tx.wait(1); // wait for 1 confirmation before returning

  return tx.hash as string;
}
```

-----

## Step 4 — Create `server/walletEvmRouter.ts`

Follows the identical tRPC pattern as `walletRouter.ts` (TRC-20).

```ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getUsdtBalance, getWalletAddress, sendUsdtErc20 } from "./erc20";
import { createPayment, getMagicNumberById } from "./db";
import { sendTelegramMessage, buildPaymentMessage } from "./telegram";

export const walletEvmRouter = router({

  /**
   * Get EVM wallet address and current USDT balance.
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
          message: "Failed to fetch EVM wallet info",
        });
      }
    }),

  /**
   * Send USDT (ERC-20) to a trader wallet address.
   * Waits for 1 on-chain confirmation before logging and notifying.
   * Admin only.
   */
  sendPayment: publicProcedure
    // TODO: swap publicProcedure for your adminProcedure middleware
    .input(
      z.object({
        magicNumberId: z.number().int().positive(),
        recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
        amount: z.number().positive().max(10_000), // safety cap — adjust as needed
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { magicNumberId, recipientAddress, amount } = input;

      // 1. Send the on-chain transaction (waits for confirmation)
      let txHash: string;
      try {
        txHash = await sendUsdtErc20(recipientAddress, amount);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "EVM transaction failed",
        });
      }

      // 2. Log to the existing payments table
      await createPayment({
        magicNumberId,
        amount: amount.toFixed(2),
        transactionHash: txHash,
        paymentDate: new Date(),
        networkFee: "0.00", // optionally fetch actual gas cost from tx receipt
        notificationSent: false,
      });

      // 3. Telegram notification using existing helper
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
        console.error("Telegram notification failed for EVM payment", txHash);
      }

      return { success: true, txHash };
    }),
});
```

-----

## Step 5 — Merge into `appRouter` in `server/routers.ts`

```ts
import { walletEvmRouter } from "./walletEvmRouter";

export const appRouter = router({
  // ...existing routers...
  wallet: walletRouter,       // TRC-20 (from tron.md)
  walletEvm: walletEvmRouter, // ERC-20
});
```

-----

## Step 6 — Client-Side Usage

```ts
// Get EVM wallet info
const { data } = trpc.walletEvm.getWalletInfo.useQuery();
// data.address ("0x..."), data.balance ("150.00")

// Send a payment
const sendPayment = trpc.walletEvm.sendPayment.useMutation();

await sendPayment.mutateAsync({
  magicNumberId: 42,
  recipientAddress: "0xRecipientAddressHere",
  amount: 150.00,
});
```

> **Note**: ERC-20 `sendPayment` is slower than TRC-20 — it waits for 1 block confirmation (~2s on Polygon, ~12s on Ethereum). Handle this with a loading state in the UI.

-----

## Key Decisions & Notes

|Topic             |Decision                                                                               |
|------------------|---------------------------------------------------------------------------------------|
|Custody model     |Server-side custodial — private key in `.env`, never sent to client                    |
|SDK               |`ethers` v6 — ESM-native, no import quirks                                             |
|Recommended chain |Polygon or Base — same code, cents per transaction vs $5–50 on mainnet                 |
|Address validation|Regex `^0x[a-fA-F0-9]{40}$` in Zod + `ethers.isAddress()` in service                   |
|Confirmation wait |`tx.wait(1)` — waits for 1 block before returning hash; increase for higher-value sends|
|DB logging        |Existing `payments` table — `transactionHash` stores `0x...` EVM tx hash               |
|Gas currency      |ETH (or MATIC on Polygon, ETH on Base) must be held in the wallet separately from USDT |
|Auth              |Wallet procedures must be protected by admin auth middleware                           |
|Safety cap        |`amount` capped at 10,000 USDT per transaction — adjust to suit                        |

-----

## Gas Balance Warning

Unlike TRC-20 where the fee is paid in TRX, EVM gas is paid in the **native token of the chain** (ETH, MATIC, etc.) — separate from USDT. The wallet must hold both:

- USDT (the token being sent)
- A small amount of ETH/MATIC/etc. to pay gas

Consider adding a `getNativeBalance()` helper to `erc20.ts` and surfacing it in the admin UI alongside the USDT balance as a low-balance warning.

```ts
export async function getNativeBalance(): Promise<string> {
  const { provider, wallet } = getInstances();
  const raw = await provider.getBalance(wallet.address);
  return ethers.formatEther(raw); // returns e.g. "0.5432"
}
```

-----

## Testing Checklist

- [ ] `getWalletAddress()` returns correct `0x` address for the configured key
- [ ] `getUsdtBalance()` returns a readable string (e.g. `"150.00"`)
- [ ] `sendUsdtErc20()` rejects an invalid address before broadcasting
- [ ] `sendPayment` mutation logs a row to `payments` with the correct `transactionHash`
- [ ] Telegram notification fires (or fails gracefully) after a successful send
- [ ] Admin auth middleware blocks unauthenticated calls
- [ ] Native token balance is sufficient to cover gas before sending
- [ ] Test on **testnet** before mainnet (see below)

-----

## Testnet Setup

Test on the appropriate testnet for your chosen chain before going live:

|Chain   |Testnet RPC                            |Faucet                                                           |
|--------|---------------------------------------|-----------------------------------------------------------------|
|Ethereum|`https://sepolia.infura.io/v3/YOUR_KEY`|[sepoliafaucet.com](https://sepoliafaucet.com)                   |
|Polygon |`https://rpc-amoy.polygon.technology`  |[faucet.polygon.technology](https://faucet.polygon.technology)   |
|Base    |`https://sepolia.base.org`             |[faucet.quicknode.com](https://faucet.quicknode.com/base/sepolia)|

Testnet USDT contracts vary — search the chain’s block explorer for a testnet ERC-20 token to use in place of USDT during testing.
