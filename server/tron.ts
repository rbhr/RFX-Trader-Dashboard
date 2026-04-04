import { TronWeb } from "tronweb";
import { ENV } from "./_core/env";

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

/** Returns true if TRON wallet env vars are configured. */
export function isTronConfigured(): boolean {
  return !!ENV.tronPrivateKey;
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

/**
 * Sends USDT to a recipient address.
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

  const contract = await tronWeb.contract().at(ENV.tronUsdtContract);
  const rawAmount = Math.round(amount * USDT_DECIMALS);

  const txHash = await contract
    .transfer(recipientAddress, rawAmount)
    .send({ feeLimit: 100_000_000 });

  return txHash as string;
}
