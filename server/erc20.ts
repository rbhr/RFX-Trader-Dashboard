import { ethers } from "ethers";
import { ENV } from "./_core/env";
import type { ConfirmationResult, SendResult } from "./walletErrors";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

const USDT_DECIMALS = BigInt(1_000_000);

// Minimum native balance required to attempt a transfer (0.001 ETH/MATIC)
const MIN_GAS_BALANCE = ethers.parseEther("0.001");

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
  if (!_contract)
    _contract = new ethers.Contract(ENV.evmUsdtContract, ERC20_ABI, _wallet);

  return { provider: _provider, wallet: _wallet, contract: _contract };
}

/** Returns true if EVM wallet env vars are configured. */
export function isEvmConfigured(): boolean {
  return !!(ENV.evmPrivateKey && ENV.evmRpcUrl && ENV.evmUsdtContract);
}

/** Returns the wallet address derived from the configured private key. */
export function getWalletAddress(): string {
  const { wallet } = getInstances();
  return wallet.address;
}

/** Returns the USDT balance of the wallet in human-readable form (e.g. "150.50"). */
export async function getUsdtBalance(): Promise<string> {
  const { contract, wallet } = getInstances();
  const raw: bigint = await contract.balanceOf(wallet.address);
  return (Number(raw) / Number(USDT_DECIMALS)).toFixed(2);
}

/** Returns the native token balance (ETH/MATIC) in human-readable form (e.g. "0.5432"). */
export async function getNativeBalance(): Promise<string> {
  const { provider, wallet } = getInstances();
  const raw = await provider.getBalance(wallet.address);
  return ethers.formatEther(raw);
}

/**
 * Sends USDT to a recipient address.
 * Pre-checks native balance to avoid cryptic gas errors.
 *
 * Returns as soon as the transfer is broadcast, without waiting for a
 * confirmation — `paymentConfirmer` settles it from the receipt. Blocking here
 * meant the caller's HTTP request could time out after the money had moved.
 * @param recipientAddress - EVM hex address (0x...)
 * @param amount - Human-readable USDT amount (e.g. 50.00)
 */
export async function sendUsdtErc20(
  recipientAddress: string,
  amount: number,
): Promise<SendResult> {
  const { contract, provider, wallet } = getInstances();

  if (!ethers.isAddress(recipientAddress)) {
    throw new Error("Invalid EVM wallet address");
  }

  // Pre-check native balance for gas
  const nativeBalance = await provider.getBalance(wallet.address);
  if (nativeBalance < MIN_GAS_BALANCE) {
    const current = ethers.formatEther(nativeBalance);
    const required = ethers.formatEther(MIN_GAS_BALANCE);
    throw new Error(
      `Insufficient gas balance — wallet holds ${current} ${ENV.evmChainName} native token, need at least ${required} to cover gas`,
    );
  }

  const rawAmount = BigInt(Math.round(amount * Number(USDT_DECIMALS)));

  // Anything that throws before this line never reached the network, so it is
  // safe to report as a failure. Once `transfer` resolves we hold a broadcast
  // transaction and the hash must never be lost, or the caller may retry and
  // double-send real funds.
  const tx = await contract.transfer(recipientAddress, rawAmount);
  const txHash = tx.hash as string;

  console.log(`[EVM] USDT transfer broadcast: ${txHash}`);
  return { txHash, confirmed: false, transferId: null };
}

/**
 * Confirms an ERC-20 transfer from its receipt, for `paymentConfirmer`.
 * An unreachable RPC reads as pending, never as failed — reporting a failure
 * we cannot prove would invite re-sending money that already moved.
 */
export async function getErc20TxStatus(
  txHash: string,
): Promise<ConfirmationResult> {
  try {
    const { provider } = getInstances();
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { settled: "pending", txHash, detail: "not yet mined" };
    }
    if (receipt.status === 0) {
      return {
        settled: "failed",
        txHash,
        detail: `transfer reverted on-chain in block ${receipt.blockNumber}`,
      };
    }
    return {
      settled: "confirmed",
      txHash,
      detail: `mined in block ${receipt.blockNumber}`,
    };
  } catch (err: any) {
    return {
      settled: "pending",
      txHash,
      detail: `receipt lookup failed: ${err?.message ?? "unknown error"}`,
    };
  }
}
