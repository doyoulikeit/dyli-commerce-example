import { createPublicClient, createWalletClient, custom, http, isAddress, keccak256, type Hex, type Transport } from "viem";
import { base, baseSepolia } from "viem/chains";
import { baseRpcUrl } from "./base-rpc.mjs";

export type CommerceTransaction = { to: Hex; data: Hex; value: bigint; chainId: number };
export type BaseWallet = {
  address: string;
  switchChain: (chain: number) => Promise<unknown>;
  getEthereumProvider: () => Promise<Parameters<typeof custom>[0]>;
};

class WalletPreparationError extends Error {}

export function isRpcRateLimit(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth++) {
    const value = current as { status?: number; code?: number; details?: string; message?: string; cause?: unknown };
    if (value.status === 429 || value.code === 429 || /request rejected\s*[`'"]?429|too many requests|rate limit/i.test(String(value.details || value.message || ""))) return true;
    current = value.cause;
  }
  return false;
}

// Ordinary Base transactions use ETH for gas. Managed pack sponsorship is a
// separate, play-scoped transport; it cannot sponsor transfers or shipping.
export async function sendBaseTransaction(
  wallet: BaseWallet | undefined,
  transaction: CommerceTransaction,
  options: { address: string; expiresAt?: string; rpcTransport?: Transport },
) {
  let broadcastAttempted = false;
  let transactionHash: Hex | undefined;
  try {
    if (!wallet || !isAddress(options.address) || wallet.address.toLowerCase() !== options.address.toLowerCase() ||
        ![8453, 84532].includes(transaction.chainId) || !isAddress(transaction.to) ||
        transaction.value !== BigInt(0) || !/^0x(?:[a-f\d]{2})+$/i.test(transaction.data)) {
      throw new WalletPreparationError("Transaction does not match your wallet or Base network");
    }
    const assertFresh = () => {
      if (options.expiresAt !== undefined && (!Number.isFinite(Date.parse(options.expiresAt)) ||
          Date.parse(options.expiresAt) - Date.now() < 30000))
        throw new WalletPreparationError("Your quote expired before payment. Get a fresh price; no transaction was sent.");
    };
    assertFresh();
    await wallet.switchChain(transaction.chainId);
    const chain = transaction.chainId === 8453 ? base : baseSepolia;
    const account = wallet.address.toLowerCase() as Hex;
    const client = createWalletClient({ account, chain, transport: custom(await wallet.getEthereumProvider(), { retryCount: 0 }) });
    const rpc = createPublicClient({ chain,
      transport: options.rpcTransport || http(baseRpcUrl(chain.id, {
        url: process.env.NEXT_PUBLIC_BASE_RPC_URL, alchemyKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
      }), { retryCount: 0, timeout: 15000 }),
    });
    if (await client.getChainId() !== chain.id || await rpc.getChainId() !== chain.id)
      throw new WalletPreparationError("Switch your wallet and RPC to the expected Base network");
    const request = await rpc.prepareTransactionRequest({
      account, chain, to: transaction.to, data: transaction.data, value: BigInt(0),
      type: "eip1559", parameters: ["gas", "nonce", "fees"],
    });
    if (await rpc.getBalance({ address: account }) < request.gas * request.maxFeePerGas)
      throw new WalletPreparationError("Add Base ETH to this wallet for gas before continuing.");
    assertFresh();
    const serializedTransaction = await client.signTransaction({ ...request, account, chain });
    assertFresh();
    transactionHash = keccak256(serializedTransaction);
    for (let attempt = 0; ; attempt++) {
      broadcastAttempted = true;
      try {
        const hash = await rpc.sendRawTransaction({ serializedTransaction });
        if (hash.toLowerCase() !== transactionHash.toLowerCase()) throw Error("Unexpected transaction hash");
        return { hash };
      } catch (cause) {
        if (!isRpcRateLimit(cause)) throw cause;
        broadcastAttempted = false;
        if (attempt === 2) throw cause;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        assertFresh();
      }
    }
  } catch (cause) {
    const message = cause instanceof WalletPreparationError ? cause.message
      : isRpcRateLimit(cause) ? "The wallet network is busy. Your purchase is saved; wait a moment and try again."
      : broadcastAttempted ? "Transaction submission is still being checked. Your purchase is saved; continue to check its receipt."
      : "The wallet could not prepare or sign the transaction. Check your Base ETH for gas and try again.";
    throw Object.assign(new Error(message), { broadcastAttempted,
      ...(broadcastAttempted && transactionHash ? { transactionHash } : {}),
    });
  }
}
