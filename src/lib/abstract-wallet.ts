import { createWalletClient, custom, http, isAddress, type Transport } from "viem";
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
// from an uncertain network submission. Never retry a broadcast automatically.
export async function sendSponsoredAbstractTransaction(
  wallet: AbstractWallet | undefined,
  transaction: CommerceTransaction,
  options: { address: string; paymaster?: AbstractPaymaster | null; expiresAt?: string; rpcTransport?: Transport },
) {
  let broadcastAttempted = false;
  try {
    const { paymaster } = options;
    if (!paymaster || !isAddress(paymaster.address) || /^0x0{40}$/i.test(paymaster.address) ||
        paymaster.chainId !== transaction.chainId ||
        paymaster.input !== getGeneralPaymasterInput({ innerInput: "0x" })) {
      throw new Error("DYLI gas sponsorship is unavailable. No transaction was sent.");
    }
    if (!wallet || wallet.address.toLowerCase() !== options.address.toLowerCase() ||
        ![2741, 11124].includes(transaction.chainId) || !isAddress(transaction.to) ||
        transaction.value !== BigInt(0) || !/^0x(?:[a-f\d]{2})+$/i.test(transaction.data)) {
      throw new Error("Transaction does not match your wallet or network");
    }
    const assertFresh = () => {
      if (options.expiresAt !== undefined && (!Number.isFinite(Date.parse(options.expiresAt)) ||
          Date.parse(options.expiresAt) - Date.now() < 30000)) {
        throw new Error("Your quote expired before payment. Get a fresh price; no transaction was sent.");
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
    if (await client.getChainId() !== chain.id) throw new Error("Switch your wallet to Abstract before paying");
    if (await rpc.getChainId() !== chain.id) throw new Error("The configured RPC is not on the expected Abstract network");
    const request = await rpc.prepareTransactionRequest({
      account, chain, to: transaction.to, data: transaction.data, value: BigInt(0),
      type: "eip712", paymaster: paymaster.address, paymasterInput: paymaster.input,
      parameters: ["gas", "nonce", "fees"],
    });
    assertFresh();
    const serializedTransaction = await client.signTransaction({ ...request, account, chain });
    assertFresh();
    broadcastAttempted = true;
    const hash = await rpc.sendRawTransaction({ serializedTransaction });
    return { hash };
  } catch (cause) {
    throw Object.assign(new Error(cause instanceof Error ? cause.message : "Wallet transaction failed", { cause }), { broadcastAttempted });
  }
}
