import { ethers } from "ethers";
import { ENV } from "./_core/env";

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
 * Waits for 1 block confirmation before returning.
 * @param recipientAddress - EVM hex address (0x...)
 * @param amount - Human-readable USDT amount (e.g. 50.00)
 * @returns Transaction hash string
 */
export async function sendUsdtErc20(
  recipientAddress: string,
  amount: number,
): Promise<string> {
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

  const tx = await contract.transfer(recipientAddress, rawAmount);
  await tx.wait(1);

  return tx.hash as string;
}
