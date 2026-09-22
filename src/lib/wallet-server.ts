import "server-only";
import { createPublicClient, erc20Abi, erc1155Abi, formatUnits, http, isAddress } from "viem";
import { abstract, abstractTestnet } from "viem/chains";
import type { ApiRecord } from "./types";
import { abstractRpcUrl } from "./abstract-rpc.mjs";
import { asRecord, asRows } from "./live-commerce";

export function walletReadContext(readiness: ApiRecord) {
  const capabilities = readiness.capabilities as ApiRecord;
  const chainId = Number((capabilities?.box_play as ApiRecord)?.chain_id);
  const crypto = (readiness.payment as ApiRecord)?.crypto as ApiRecord;
  const token = (crypto?.tokens as ApiRecord)?.abstract;
  if (![2741, 11124].includes(chainId) || typeof token !== "string" || !isAddress(token) || /^0x0{40}$/i.test(token))
    throw new Error("DYLI balance configuration is unavailable");
  const client = createPublicClient({
    chain: chainId === 2741 ? abstract : abstractTestnet,
    transport: http(abstractRpcUrl(chainId, {
      url: process.env.DYLI_ABSTRACT_RPC_URL || process.env.NEXT_PUBLIC_ABSTRACT_RPC_URL,
      alchemyKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
    }), { timeout: 12000 }),
  });
  return { client, token, chainId };
}

export async function readWalletBalance(context: ReturnType<typeof walletReadContext>, wallet: `0x${string}`) {
  if (await context.client.getChainId() !== context.chainId) throw new Error("The balance connection is on the wrong network.");
  const units = await context.client.readContract({ address: context.token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
  return { amount: formatUnits(units, 6), currency: "USDC" as const, token: context.token, chain_id: context.chainId };
}

export async function readWalletHoldings(context: ReturnType<typeof walletReadContext>, wallet: `0x${string}`, holdings: ApiRecord) {
  const indexed = asRows(holdings.items);
  if (!indexed.length) return holdings;
  const contract = String(holdings.contract_address || indexed[0].contract_address || "");
  if (!isAddress(contract) || indexed.length > 100 || indexed.some(item => !/^\d+$/.test(String(item.token_id))))
    throw new Error("Vault balances could not be verified");
  // Bypassing our cache does not bypass the NFT indexer's indexing delay. Read
  // real quantities in one RPC so sold/shipped cards cannot linger in the vault.
  const balances = await context.client.readContract({ address: contract, abi: erc1155Abi,
    functionName: "balanceOfBatch", args: [indexed.map(() => wallet), indexed.map(item => BigInt(String(item.token_id)))] });
  if (balances.length !== indexed.length || balances.some(value => value > BigInt(Number.MAX_SAFE_INTEGER)))
    throw new Error("Vault balances could not be verified");
  const items = indexed.flatMap((item, index) => {
    const balance = Number(balances[index]);
    if (!balance) return [];
    const unit = item.estimated_unit_value_usd;
    const value = unit == null ? null : Math.round(Number(unit) * balance * 100) / 100;
    return [{ ...item, balance, balance_raw: String(balance), estimated_value_usd: value,
      value: { ...asRecord(item.value), estimated_total_usd: value } }];
  });
  const oldBalance = indexed.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const totalBalance = items.reduce((sum, item) => sum + item.balance, 0);
  const oldValue = indexed.reduce((sum, item) => sum + Number(item.estimated_value_usd || 0), 0);
  const totalValue = items.reduce((sum, item) => sum + Number(item.estimated_value_usd || 0), 0);
  const collectionValue = asRecord(holdings.collection_value);
  const summary = asRecord(holdings.summary);
  const balanceTotal = Math.max(0, Number(holdings.total_balance || 0) + totalBalance - oldBalance);
  return { ...holdings, items,
    ...(holdings.total_tokens != null ? { total_tokens: Number(holdings.total_tokens) - indexed.length + items.length } : {}),
    ...(holdings.total_balance != null ? { total_balance: balanceTotal, total_balance_raw: String(balanceTotal) } : {}),
    ...(collectionValue.estimated_usd != null ? { collection_value: { ...collectionValue,
      estimated_usd: Math.round((Number(collectionValue.estimated_usd) + totalValue - oldValue) * 100) / 100 } } : {}),
    summary: { ...summary, returned: items.length, returned_balance: totalBalance, returned_balance_raw: String(totalBalance),
      returned_value: { ...asRecord(summary.returned_value), estimated_usd: totalValue, token_count: items.length } },
  };
}
