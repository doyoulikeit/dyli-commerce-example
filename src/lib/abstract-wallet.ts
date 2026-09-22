import { concatHex, createWalletClient, custom, fromRlp, hashTypedData, http, isAddress, keccak256, type Hex, type Transport } from "viem";
import { abstract, abstractTestnet } from "viem/chains";
import { eip712WalletActions, getGeneralPaymasterInput } from "viem/zksync";
import type { AbstractPaymaster } from "./commerce-runtime";
import { abstractRpcUrl } from "./abstract-rpc.mjs";

export type CommerceTransaction = { to: `0x${string}`; data: `0x${string}`; value: bigint; chainId: number };
export type AbstractWallet = {
  address: string;
  switchChain: (chain: number) => Promise<unknown>;
  getEthereumProvider: () => Promise<Parameters<typeof custom>[0]>;
};

// Use Abstract's native EIP-712 transaction path, not Privy's ERC-7702 sponsor flag.
// Splitting signing from broadcast lets recovery distinguish a failed preparation
// from an uncertain network submission. Only explicit rate-limit rejections are
// retried, always using the identical signed bytes (and therefore the same hash).
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

// ZKsync/Abstract hashes the typed transaction digest plus the signature hash,
// not keccak256(serializedTransaction). Retain this ID on uncertain submission.
export function abstractTransactionHash(raw: Hex): Hex {
  if (!raw.startsWith("0x71")) throw new WalletPreparationError("Unsupported Abstract transaction");
  const fields = fromRlp(`0x${raw.slice(4)}`);
  if (!Array.isArray(fields) || fields.length !== 16) throw new WalletPreparationError("Invalid Abstract transaction");
  const hex = (index: number) => fields[index] as Hex;
  const number = (index: number) => hex(index) === "0x" ? BigInt(0) : BigInt(hex(index));
  const paymaster = fields[15] as Hex[];
  const typed = abstract.custom.getEip712Domain({
    type: "eip712", chainId: Number(number(10)), nonce: Number(number(0)),
    maxPriorityFeePerGas: number(1), maxFeePerGas: number(2), gas: number(3),
    to: hex(4), value: number(5), data: hex(6), from: hex(11),
    gasPerPubdata: number(12), factoryDeps: fields[13] as Hex[],
    ...(paymaster.length ? { paymaster: paymaster[0], paymasterInput: paymaster[1] } : {}),
  });
  return keccak256(concatHex([hashTypedData(typed), keccak256(hex(14))]));
}

export async function sendSponsoredAbstractTransaction(
  wallet: AbstractWallet | undefined,
  transaction: CommerceTransaction,
  options: { address: string; paymaster?: AbstractPaymaster | null; expiresAt?: string; rpcTransport?: Transport },
) {
  let broadcastAttempted = false;
  let transactionHash: Hex | undefined;
  try {
    const { paymaster } = options;
    if (!paymaster || !isAddress(paymaster.address) || /^0x0{40}$/i.test(paymaster.address) ||
        paymaster.chainId !== transaction.chainId ||
        paymaster.input !== getGeneralPaymasterInput({ innerInput: "0x" })) {
      throw new WalletPreparationError("DYLI gas sponsorship is unavailable. No transaction was sent.");
    }
    if (!wallet || wallet.address.toLowerCase() !== options.address.toLowerCase() ||
        ![2741, 11124].includes(transaction.chainId) || !isAddress(transaction.to) ||
        transaction.value !== BigInt(0) || !/^0x(?:[a-f\d]{2})+$/i.test(transaction.data)) {
      throw new WalletPreparationError("Transaction does not match your wallet or network");
    }
    const assertFresh = () => {
      if (options.expiresAt !== undefined && (!Number.isFinite(Date.parse(options.expiresAt)) ||
          Date.parse(options.expiresAt) - Date.now() < 30000)) {
        throw new WalletPreparationError("Your quote expired before payment. Get a fresh price; no transaction was sent.");
      }
    };
    assertFresh();
    await wallet.switchChain(transaction.chainId);
    const chain = transaction.chainId === 2741 ? abstract : abstractTestnet;
    const account = wallet.address.toLowerCase() as `0x${string}`;
    const client = createWalletClient({
      account, chain, transport: custom(await wallet.getEthereumProvider(), { retryCount: 0 }),
    }).extend(eip712WalletActions());
    // Privy's RPC middleware parses Ethereum transaction types and rejects
    // Abstract's 0x71 during estimation. Only signing goes through the wallet.
    const rpc = createWalletClient({
      account, chain,
      transport: options.rpcTransport || http(abstractRpcUrl(chain.id, {
        url: process.env.NEXT_PUBLIC_ABSTRACT_RPC_URL,
        alchemyKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
      }), { retryCount: 0, timeout: 15000 }),
    }).extend(eip712WalletActions());
    if (await client.getChainId() !== chain.id) throw new WalletPreparationError("Switch your wallet to Abstract before paying");
    if (await rpc.getChainId() !== chain.id) throw new WalletPreparationError("The configured RPC is not on the expected Abstract network");
    const request = await rpc.prepareTransactionRequest({
      account, chain, to: transaction.to, data: transaction.data, value: BigInt(0),
      type: "eip712", paymaster: paymaster.address, paymasterInput: paymaster.input,
      parameters: ["gas", "nonce", "fees"],
    });
    assertFresh();
    const serializedTransaction = await client.signTransaction({ ...request, account, chain });
    assertFresh();
    transactionHash = abstractTransactionHash(serializedTransaction);
    for (let attempt = 0; ; attempt++) {
      broadcastAttempted = true;
      try {
        const hash = await rpc.sendRawTransaction({ serializedTransaction });
        return { hash };
      } catch (cause) {
        if (!isRpcRateLimit(cause)) throw cause;
        // An explicit 429 rejected this submission. Never generate another
        // signature/nonce when retrying it, and never retry ambiguous failures.
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
      : "The wallet could not prepare or sign the transaction. No transaction was sent. Please try again.";
    // Provider errors include RPC credentials and the complete signed payload.
    // Keep those out of the product UI and expose only recovery metadata.
    throw Object.assign(new Error(message), { broadcastAttempted,
      ...(broadcastAttempted && transactionHash ? { transactionHash } : {}),
    });
  }
}
