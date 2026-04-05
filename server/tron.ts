import { TronWeb } from "tronweb";
import { ENV } from "./_core/env";

const USDT_DECIMALS = 1_000_000;

const GASFREE_API_BASE = "https://open.gasfree.io/tron";
// TRON mainnet chainId for GasFree SDK
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

/** Returns the USDT balance of the wallet in human-readable form (e.g. "150.50"). */
export async function getUsdtBalance(): Promise<string> {
  const tronWeb = getTronWeb();
  const contract = await tronWeb.contract().at(ENV.tronUsdtContract);
  const address = getWalletAddress();
  const raw = await contract.balanceOf(address).call();
  return (Number(raw) / USDT_DECIMALS).toFixed(2);
}

// ─── GasFree API helpers ───────────────────────────────────────────

function gasFreeHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-KEY": ENV.gasFreeApiKey,
    "X-API-SECRET": ENV.gasFreeApiSecret,
  };
}

async function gasFreeGet(path: string): Promise<any> {
  const res = await fetch(`${GASFREE_API_BASE}${path}`, {
    headers: gasFreeHeaders(),
  });
  if (!res.ok) {
    throw new Error(`GasFree API ${path} returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function gasFreePost(path: string, body: any): Promise<any> {
  const res = await fetch(`${GASFREE_API_BASE}${path}`, {
    method: "POST",
    headers: gasFreeHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GasFree API ${path} returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Sends USDT via GasFree (no TRX needed — fee deducted in USDT).
 * @param recipientAddress - TRON base58 address
 * @param amount - Human-readable USDT amount (e.g. 50.00)
 * @returns Transaction hash string
 */
async function sendUsdtGasFree(
  recipientAddress: string,
  amount: number,
): Promise<string> {
  const tronWeb = getTronWeb();
  const userAddress = getWalletAddress();

  // 1. Get account info (nonce, gasfree address, activation status)
  const accountInfo = await gasFreeGet(`/api/v1/address/${userAddress}`);
  const nonce = accountInfo.data?.nonce ?? accountInfo.nonce ?? 0;

  // 2. Get provider config
  const providerData = await gasFreeGet("/api/v1/config/provider/all");
  const providers = providerData.data ?? providerData;
  const provider = Array.isArray(providers) ? providers[0] : providers;
  if (!provider?.address) {
    throw new Error("No GasFree service provider available");
  }

  // 3. Get token config for maxFee
  const tokenData = await gasFreeGet("/api/v1/config/token/all");
  const tokens = tokenData.data ?? tokenData;
  const tokenList = Array.isArray(tokens) ? tokens : [];
  const usdtToken = tokenList.find(
    (t: any) =>
      t.token_address === ENV.tronUsdtContract ||
      t.tokenAddress === ENV.tronUsdtContract,
  );
  // Default maxFee: 2 USDT (2_000_000 in 6 decimals) if token config not found
  const transferFeeRaw = usdtToken?.transfer_fee ?? usdtToken?.transferFee ?? "2000000";

  const rawAmount = Math.round(amount * USDT_DECIMALS).toString();
  const deadline = Math.floor(Date.now() / 1000) + (provider.config?.default_deadline_duration ?? 300);

  // 4. Assemble TIP-712 message using the GasFree SDK
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

  // 6. Submit the signed transfer to the GasFree API
  const submitResult = await gasFreePost("/api/v1/transfer/submit", {
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

  const transferId = submitResult.data?.id ?? submitResult.id;
  if (!transferId) {
    throw new Error("GasFree transfer submission failed — no transfer ID returned");
  }

  // 7. Poll for completion (max 60 seconds)
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const status = await gasFreeGet(`/api/v1/transfer/${transferId}`);
    const state = status.data?.state ?? status.state;
    const txnHash = status.data?.txn_hash ?? status.txnHash ?? status.data?.txnHash;

    if (state === "SUCCESS" || state === "COMPLETED") {
      if (txnHash) return txnHash;
    }
    if (state === "FAILED" || state === "REJECTED") {
      throw new Error(`GasFree transfer ${state}: ${JSON.stringify(status.data ?? status)}`);
    }
  }

  throw new Error("GasFree transfer timed out waiting for confirmation");
}

/**
 * Returns the GasFree account info: derived address and USDT balance.
 * This is the address that needs to be funded with USDT for gasfree transfers.
 */
export async function getGasFreeAccountInfo(): Promise<{
  gasFreeAddress: string;
  usdtBalance: string;
}> {
  const userAddress = getWalletAddress();
  const accountInfo = await gasFreeGet(`/api/v1/address/${userAddress}`);
  const data = accountInfo.data ?? accountInfo;

  const gasFreeAddress =
    data.gas_free_address ?? data.gasFreeAddress ?? "";

  // Balance from the API (raw 6 decimals) or fall back to on-chain query
  let usdtBalance = "0.00";
  const assets = data.assets ?? [];
  const usdtAsset = assets.find(
    (a: any) =>
      a.token_address === ENV.tronUsdtContract ||
      a.tokenAddress === ENV.tronUsdtContract,
  );
  if (usdtAsset) {
    const rawBalance = parseFloat(usdtAsset.balance ?? usdtAsset.amount ?? "0");
    usdtBalance = (rawBalance / USDT_DECIMALS).toFixed(2);
  }

  return { gasFreeAddress, usdtBalance };
}

// ─── Public send function ──────────────────────────────────────────

/**
 * Sends USDT to a recipient address.
 * Uses GasFree if configured, otherwise falls back to standard TRC-20 transfer.
 * @param recipientAddress - TRON base58 address (starts with T)
 * @param amount - Human-readable USDT amount (e.g. 50.00)
 * @returns Transaction hash string
 */
export async function sendUsdt(
  recipientAddress: string,
  amount: number,
): Promise<string> {
  const tronWeb = getTronWeb();

  if (!tronWeb.isAddress(recipientAddress)) {
    throw new Error("Invalid TRON wallet address");
  }

  // Try GasFree first if configured
  if (isGasFreeConfigured()) {
    try {
      console.log("[TRON] Sending via GasFree...");
      const hash = await sendUsdtGasFree(recipientAddress, amount);
      console.log("[TRON] GasFree transfer complete:", hash);
      return hash;
    } catch (err) {
      console.error("[TRON] GasFree transfer failed, falling back to standard:", err);
    }
  }

  // Fallback: standard TRC-20 transfer (requires TRX for fees)
  console.log("[TRON] Sending via standard TRC-20 transfer...");
  const contract = await tronWeb.contract().at(ENV.tronUsdtContract);
  const rawAmount = Math.round(amount * USDT_DECIMALS);

  const txHash = await contract
    .transfer(recipientAddress, rawAmount)
    .send({ feeLimit: 100_000_000 });

  return txHash as string;
}
