import { TronWeb } from "tronweb";
import { createHmac } from "crypto";
import { ENV } from "./_core/env";
import {
  TxFailedError,
  type ConfirmationResult,
  type SendResult,
} from "./walletErrors";

const USDT_DECIMALS = 1_000_000;

const GASFREE_API_BASE = "https://open.gasfree.io/tron";
const GASFREE_BASE_PATH = "/tron"; // base path for HMAC signature
const TRON_MAINNET_CHAIN_ID = Number("0x2b6653dc");

// GasFree's terminal states. Anything else ("PENDING", "PROCESSING", ...) means
// the transfer is still working and we keep polling.
const GASFREE_SUCCESS_STATES = new Set([
  "SUCCESS",
  "SUCCEED",
  "COMPLETED",
  "CONFIRMED",
]);
const GASFREE_FAILED_STATES = new Set(["FAILED", "REJECTED", "EXPIRED"]);

/**
 * Timings for the wait between submitting a transfer and learning its hash.
 *
 * We no longer wait for GasFree to confirm — in a real payout the hash was
 * published after 1 second while confirmation took 60, and blocking for that
 * minute is what made a browser time out and report a successful payout as
 * failed. We wait only for the hash, which is what makes the payment
 * recordable and verifiable; `paymentConfirmer` settles it afterwards.
 *
 * Exported as a mutable object so tests can shrink the waits.
 */
export const GASFREE_POLL = {
  /** How long to wait for a transaction hash before recording without one. */
  hashWaitMs: 20_000,
  /** Poll at `fastIntervalMs` for this long, then back off. */
  fastWindowMs: 10_000,
  fastIntervalMs: 1_000,
  slowIntervalMs: 3_000,
};

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

/** Returns true if TRON wallet env vars are configured. */
export function isTronConfigured(): boolean {
  return !!ENV.tronPrivateKey;
}

/** Returns true if GasFree API credentials are configured. */
export function isGasFreeConfigured(): boolean {
  return !!(ENV.gasFreeApiKey && ENV.gasFreeApiSecret);
}

/** Returns the wallet address derived from the configured private key. */
export function getWalletAddress(): string {
  return getTronWeb().defaultAddress.base58 as string;
}

// Cache the USDT contract instance to avoid repeated TronGrid calls
let _usdtContract: any = null;

async function getUsdtContract(): Promise<any> {
  if (!_usdtContract) {
    const tronWeb = getTronWeb();
    _usdtContract = await tronWeb.contract().at(ENV.tronUsdtContract);
  }
  return _usdtContract;
}

/** Returns the USDT balance of the wallet in human-readable form (e.g. "150.50"). */
export async function getUsdtBalance(): Promise<string> {
  const contract = await getUsdtContract();
  const address = getWalletAddress();
  const raw = await contract.balanceOf(address).call();
  return (Number(raw) / USDT_DECIMALS).toFixed(2);
}

/**
 * Returns the USDT balance of any TRON address (used for gasfree address).
 */
async function getUsdtBalanceOf(address: string): Promise<string> {
  const contract = await getUsdtContract();
  const raw = await contract.balanceOf(address).call();
  return (Number(raw) / USDT_DECIMALS).toFixed(2);
}

// ─── GasFree API helpers (HMAC-SHA256 auth) ───────────────────────

function gasFreeSign(method: string, apiPath: string, timestamp: number): string {
  // message = METHOD + FULL_PATH + TIMESTAMP
  // full path = /tron + /api/v1/...
  const fullPath = `${GASFREE_BASE_PATH}${apiPath}`;
  const message = `${method}${fullPath}${timestamp}`;
  const hmac = createHmac("sha256", ENV.gasFreeApiSecret);
  hmac.update(message);
  return hmac.digest("base64");
}

function gasFreeHeaders(method: string, apiPath: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = gasFreeSign(method, apiPath, timestamp);
  return {
    "Content-Type": "application/json",
    Timestamp: timestamp.toString(),
    Authorization: `ApiKey ${ENV.gasFreeApiKey}:${signature}`,
  };
}

async function gasFreeGet(path: string): Promise<any> {
  const res = await fetch(`${GASFREE_API_BASE}${path}`, {
    headers: gasFreeHeaders("GET", path),
  });
  if (!res.ok) {
    throw new Error(`GasFree API ${path} returned ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.code && json.code !== 200) {
    throw new Error(`GasFree API error: ${json.message || json.reason || JSON.stringify(json)}`);
  }
  return json;
}

async function gasFreePost(path: string, body: any): Promise<any> {
  const res = await fetch(`${GASFREE_API_BASE}${path}`, {
    method: "POST",
    headers: gasFreeHeaders("POST", path),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GasFree API ${path} returned ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.code && json.code !== 200) {
    throw new Error(`GasFree API error: ${json.message || json.reason || JSON.stringify(json)}`);
  }
  return json;
}

// ─── GasFree transfer ─────────────────────────────────────────────

/**
 * Sends USDT via GasFree (no TRX needed — fee deducted in USDT).
 */
async function sendUsdtGasFree(
  recipientAddress: string,
  amount: number,
): Promise<SendResult> {
  const tronWeb = getTronWeb();
  const userAddress = getWalletAddress();

  // 1. Get account info (nonce, gasfree address)
  const accountInfo = await gasFreeGet(`/api/v1/address/${userAddress}`);
  const data = accountInfo.data;
  const nonce = data?.nonce ?? 0;

  // 2. Get provider config
  const providerData = await gasFreeGet("/api/v1/config/provider/all");
  const providers = providerData.data?.providers ?? [];
  const provider = providers[0];
  if (!provider?.address) {
    throw new Error("No GasFree service provider available");
  }
  const defaultDeadline = provider.config?.defaultDeadlineDuration ?? 300;

  // 3. Get token config for maxFee
  const tokenData = await gasFreeGet("/api/v1/config/token/all");
  const tokens = tokenData.data?.tokens ?? [];
  const usdtToken = tokens.find(
    (t: any) => t.tokenAddress === ENV.tronUsdtContract,
  );
  const transferFeeRaw = usdtToken?.transferFee ?? "2000000";

  const rawAmount = Math.round(amount * USDT_DECIMALS).toString();
  const deadline = Math.floor(Date.now() / 1000) + defaultDeadline;

  // 4. Assemble TIP-712 message
  const { TronGasFree } = (await import("@gasfree/gasfree-sdk")).default;
  const gasFree = new TronGasFree({ chainId: TRON_MAINNET_CHAIN_ID });

  const { domain, types, message } = gasFree.assembleGasFreeTransactionJson({
    token: ENV.tronUsdtContract,
    serviceProvider: provider.address,
    user: userAddress,
    receiver: recipientAddress,
    value: rawAmount,
    maxFee: transferFeeRaw.toString(),
    deadline: deadline.toString(),
    version: "1",
    nonce: nonce.toString(),
  });

  // 5. Sign the TIP-712 message
  const signature = await tronWeb.trx._signTypedData(
    domain,
    types,
    message,
    ENV.tronPrivateKey,
  );

  // 6. Submit
  const submitResult = await gasFreePost("/api/v1/gasfree/submit", {
    token: ENV.tronUsdtContract,
    serviceProvider: provider.address,
    user: userAddress,
    receiver: recipientAddress,
    value: rawAmount,
    maxFee: transferFeeRaw.toString(),
    deadline: deadline.toString(),
    version: "1",
    nonce: nonce.toString(),
    sig: signature,
  });

  const transferId = submitResult.data?.id;
  if (!transferId) {
    throw new Error("GasFree transfer submission failed — no transfer ID returned");
  }

  console.log(`[TRON] GasFree transfer submitted, ID: ${transferId}`);

  // 7. Wait only until GasFree publishes the transaction hash. Settlement is
  // left to paymentConfirmer: see GASFREE_POLL for why.
  const startedAt = Date.now();
  let polls = 0;

  while (Date.now() - startedAt < GASFREE_POLL.hashWaitMs) {
    polls++;

    let statusData: any;
    let polled = false;
    try {
      const status = await gasFreeGet(`/api/v1/gasfree/${transferId}`);
      statusData = status.data;
      polled = true;
    } catch (err: any) {
      // Network error polling status — keep trying, but still pay the interval
      // below so a failing status endpoint is not hammered.
      console.warn(`[TRON] GasFree poll error (poll ${polls}):`, err?.message);
    }

    if (polled) {
      const state: string | undefined = statusData?.state;
      const txnHash: string | undefined = statusData?.txnHash;
      console.log(
        `[TRON] GasFree poll ${polls} at ${Math.round((Date.now() - startedAt) / 1000)}s: state=${state}, txnHash=${txnHash || "none"}`
      );

      const upperState = (state || "").toUpperCase();
      // A definitive rejection is the one case where nothing was sent, so it is
      // the one case the caller may safely treat as "no payment happened".
      if (GASFREE_FAILED_STATES.has(upperState)) {
        throw new TxFailedError(
          `GasFree transfer ${upperState}: ${JSON.stringify(statusData)}`
        );
      }
      if (txnHash) {
        return {
          txHash: txnHash,
          confirmed: GASFREE_SUCCESS_STATES.has(upperState),
          transferId,
        };
      }
    }

    const interval =
      Date.now() - startedAt < GASFREE_POLL.fastWindowMs
        ? GASFREE_POLL.fastIntervalMs
        : GASFREE_POLL.slowIntervalMs;
    await new Promise((r) => setTimeout(r, interval));
  }

  // Submitted, but no hash yet. The transfer id is enough to find it again, so
  // this is still a recordable payout — never a failure.
  console.warn(
    `[TRON] GasFree transfer ${transferId} — no transaction hash after ${polls} polls, recording against the transfer id`
  );
  return { txHash: null, confirmed: false, transferId };
}

/**
 * Looks up a submitted GasFree transfer so a recorded payout can be settled.
 * Never throws for an unknown or unreachable transfer — an error here must not
 * be mistaken for a failed transfer.
 */
export async function getGasFreeTransferStatus(
  transferId: string
): Promise<ConfirmationResult> {
  let statusData: any;
  try {
    const status = await gasFreeGet(`/api/v1/gasfree/${transferId}`);
    statusData = status.data;
  } catch (err: any) {
    return {
      settled: "pending",
      txHash: null,
      detail: `status lookup failed: ${err?.message ?? "unknown error"}`,
    };
  }

  const state = (statusData?.state || "").toUpperCase();
  const txHash: string | null = statusData?.txnHash ?? null;

  if (GASFREE_SUCCESS_STATES.has(state)) {
    return { settled: "confirmed", txHash, detail: state };
  }
  if (GASFREE_FAILED_STATES.has(state)) {
    return {
      settled: "failed",
      txHash,
      detail: `GasFree reported ${state}: ${JSON.stringify(statusData)}`,
    };
  }
  return { settled: "pending", txHash, detail: state || "unknown state" };
}

/**
 * Confirms a TRC-20 transfer by hash, for the standard (non-GasFree) path.
 * As above, an unreachable node reads as pending, never as failed.
 */
export async function getTronTxStatus(
  txHash: string
): Promise<ConfirmationResult> {
  try {
    const info: any = await getTronWeb().trx.getTransactionInfo(txHash);
    // An empty object means the node has not seen it in a block yet.
    if (!info || Object.keys(info).length === 0 || info.blockNumber == null) {
      return { settled: "pending", txHash, detail: "not yet in a block" };
    }
    const result = info.receipt?.result;
    if (result && result !== "SUCCESS") {
      return {
        settled: "failed",
        txHash,
        detail: `on-chain result ${result}`,
      };
    }
    return { settled: "confirmed", txHash, detail: "SUCCESS" };
  } catch (err: any) {
    return {
      settled: "pending",
      txHash,
      detail: `lookup failed: ${err?.message ?? "unknown error"}`,
    };
  }
}

// ─── GasFree account info ─────────────────────────────────────────

/**
 * Returns the GasFree account info: derived address and USDT balance.
 * The gasfree address is where USDT needs to be deposited for gasfree transfers.
 * Balance is queried on-chain for the gasfree address.
 */
export async function getGasFreeAccountInfo(): Promise<{
  gasFreeAddress: string;
  usdtBalance: string;
}> {
  const userAddress = getWalletAddress();
  const accountInfo = await gasFreeGet(`/api/v1/address/${userAddress}`);
  const gasFreeAddress = accountInfo.data?.gasFreeAddress ?? "";

  // Query the on-chain USDT balance of the gasfree address
  let usdtBalance = "0.00";
  if (gasFreeAddress) {
    try {
      usdtBalance = await getUsdtBalanceOf(gasFreeAddress);
    } catch (err) {
      console.error("[TRON] Failed to query gasfree address balance:", err);
    }
  }

  return { gasFreeAddress, usdtBalance };
}

// ─── Public send function ──────────────────────────────────────────

/**
 * Sends USDT to a recipient address.
 * Uses GasFree if configured, otherwise falls back to standard TRC-20 transfer.
 */
export async function sendUsdt(
  recipientAddress: string,
  amount: number,
): Promise<SendResult> {
  const tronWeb = getTronWeb();

  if (!tronWeb.isAddress(recipientAddress)) {
    throw new Error("Invalid TRON wallet address");
  }

  // Use GasFree if configured — no fallback to avoid double-sending
  if (isGasFreeConfigured()) {
    console.log("[TRON] Sending via GasFree...");
    const result = await sendUsdtGasFree(recipientAddress, amount);
    console.log(
      `[TRON] GasFree transfer broadcast: ${result.txHash ?? `(no hash yet, id ${result.transferId})`}${result.confirmed ? " — already confirmed" : ""}`
    );
    return result;
  }

  // Standard TRC-20 transfer (requires TRX for fees)
  console.log("[TRON] Sending via standard TRC-20 transfer...");
  const contract = await tronWeb.contract().at(ENV.tronUsdtContract);
  const rawAmount = Math.round(amount * USDT_DECIMALS);

  const txHash = (await contract
    .transfer(recipientAddress, rawAmount)
    .send({ feeLimit: 100_000_000 })) as string;

  // Broadcast, not yet confirmed — paymentConfirmer settles it by hash.
  return { txHash, confirmed: false, transferId: null };
}
