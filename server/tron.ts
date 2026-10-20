import { TronWeb } from "tronweb";
import { createHmac } from "crypto";
import { ENV } from "./_core/env";
import { TxFailedError, TxPendingError } from "./walletErrors";

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
 * Timings for the GasFree confirmation poll. This wait is the whole latency of
 * a payout — the admin's HTTP request is held open for it — so the first poll
 * is immediate and the cadence is tight while a fast confirmation is still
 * plausible. Exported as a mutable object so tests can shrink the waits.
 */
export const GASFREE_POLL = {
  /** Total time to wait for a terminal state before giving up. */
  budgetMs: 120_000,
  /** Poll at `fastIntervalMs` for this long, then back off. */
  fastWindowMs: 10_000,
  fastIntervalMs: 1_000,
  slowIntervalMs: 3_000,
  /** Extra time allowed for the hash after GasFree reports success. */
  hashGraceMs: 15_000,
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
): Promise<string> {
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

  // 7. Poll for completion. Timings and their reasoning live in GASFREE_POLL.
  const startedAt = Date.now();
  let lastTxnHash: string | null = null;
  let succeededAt: number | null = null;
  let polls = 0;

  while (Date.now() - startedAt < GASFREE_POLL.budgetMs) {
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
      if (txnHash) lastTxnHash = txnHash;

      const upperState = (state || "").toUpperCase();
      if (GASFREE_SUCCESS_STATES.has(upperState)) {
        if (txnHash) return txnHash;
        if (succeededAt === null) succeededAt = Date.now();
      }
      if (GASFREE_FAILED_STATES.has(upperState)) {
        throw new TxFailedError(
          `GasFree transfer ${upperState}: ${JSON.stringify(statusData)}`
        );
      }
      if (
        succeededAt !== null &&
        Date.now() - succeededAt >= GASFREE_POLL.hashGraceMs
      ) {
        break;
      }
    }

    const interval =
      Date.now() - startedAt < GASFREE_POLL.fastWindowMs
        ? GASFREE_POLL.fastIntervalMs
        : GASFREE_POLL.slowIntervalMs;
    await new Promise((r) => setTimeout(r, interval));
  }

  // Submitted, but we never saw a hash. Either GasFree called it successful
  // without publishing one, or it never reached a terminal state in time.
  // Both mean "may well have moved the money" — never "safe to re-send".
  if (succeededAt !== null) {
    console.warn(
      `[TRON] GasFree transfer ${transferId} reported success but published no transaction hash after ${polls} polls`
    );
    throw new TxPendingError(
      `GasFree reported the transfer (ID: ${transferId}) as successful but published no ` +
      `transaction hash. The funds have almost certainly moved — confirm on TronScan ` +
      `and record the hash against this payment.`,
      lastTxnHash
    );
  }

  console.warn(
    `[TRON] GasFree transfer ${transferId} — polling timed out after ${polls} polls, transfer may still complete`
  );
  throw new TxPendingError(
    `GasFree transfer submitted (ID: ${transferId}) but confirmation timed out. ` +
    `The transfer may still complete — check TronScan or the GasFree dashboard.`,
    lastTxnHash
  );
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
): Promise<string> {
  const tronWeb = getTronWeb();

  if (!tronWeb.isAddress(recipientAddress)) {
    throw new Error("Invalid TRON wallet address");
  }

  // Use GasFree if configured — no fallback to avoid double-sending
  if (isGasFreeConfigured()) {
    console.log("[TRON] Sending via GasFree...");
    const hash = await sendUsdtGasFree(recipientAddress, amount);
    console.log("[TRON] GasFree transfer complete:", hash);
    return hash;
  }

  // Standard TRC-20 transfer (requires TRX for fees)
  console.log("[TRON] Sending via standard TRC-20 transfer...");
  const contract = await tronWeb.contract().at(ENV.tronUsdtContract);
  const rawAmount = Math.round(amount * USDT_DECIMALS);

  const txHash = await contract
    .transfer(recipientAddress, rawAmount)
    .send({ feeLimit: 100_000_000 });

  return txHash as string;
}
