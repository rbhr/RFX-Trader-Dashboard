import { TronWeb } from "tronweb";
import { createHmac } from "crypto";
import { ENV } from "./_core/env";
import { TxFailedError, TxPendingError } from "./walletErrors";

const USDT_DECIMALS = 1_000_000;

const GASFREE_API_BASE = "https://open.gasfree.io/tron";
const GASFREE_BASE_PATH = "/tron"; // base path for HMAC signature
const TRON_MAINNET_CHAIN_ID = Number("0x2b6653dc");

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

  // 7. Poll for completion (max 120 seconds)
  const maxAttempts = 40;
  let lastTxnHash: string | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));

    let state: string | undefined;
    let txnHash: string | undefined;
    let statusData: any;
    try {
      const status = await gasFreeGet(`/api/v1/gasfree/${transferId}`);
      statusData = status.data;
      state = statusData?.state;
      txnHash = statusData?.txnHash;
    } catch (err: any) {
      // Network error polling status — log and keep trying
      console.warn(`[TRON] GasFree poll error (attempt ${i + 1}):`, err?.message);
      continue;
    }

    console.log(`[TRON] GasFree poll ${i + 1}/${maxAttempts}: state=${state}, txnHash=${txnHash || "none"}`);
    if (txnHash) lastTxnHash = txnHash;

    const upperState = (state || "").toUpperCase();
    if (upperState === "SUCCESS" || upperState === "SUCCEED" || upperState === "COMPLETED" || upperState === "CONFIRMED") {
      if (txnHash) return txnHash;
    }
    if (upperState === "FAILED" || upperState === "REJECTED" || upperState === "EXPIRED") {
      throw new TxFailedError(`GasFree transfer ${upperState}: ${JSON.stringify(statusData)}`);
    }
    // Any other state (PENDING, PROCESSING, etc.) — keep polling
  }

  // Timeout: transfer was submitted but we couldn't confirm it.
  console.warn(`[TRON] GasFree transfer ${transferId} — polling timed out, transfer may still complete`);
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
