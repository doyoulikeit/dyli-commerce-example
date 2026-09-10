import "server-only";
import { createPublicClient, erc20Abi, formatUnits, http, isAddress } from "viem";
import { abstract, abstractTestnet } from "viem/chains";
import type { ApiRecord } from "./types";

export function walletReadContext(readiness: ApiRecord) {
  const capabilities = readiness.capabilities as ApiRecord;
  const chainId = Number((capabilities?.box_play as ApiRecord)?.chain_id);
  const crypto = (readiness.payment as ApiRecord)?.crypto as ApiRecord;
  const token = (crypto?.tokens as ApiRecord)?.abstract;
  if (![2741, 11124].includes(chainId) || typeof token !== "string" || !isAddress(token) || /^0x0{40}$/i.test(token))
    throw new Error("DYLI balance configuration is unavailable");
  const client = createPublicClient({
    chain: chainId === 2741 ? abstract : abstractTestnet,
    transport: http(process.env.DYLI_ABSTRACT_RPC_URL || undefined, { timeout: 12000 }),
  });
  return { client, token, chainId };
}

export async function readWalletBalance(context: ReturnType<typeof walletReadContext>, wallet: `0x${string}`) {
  if (await context.client.getChainId() !== context.chainId) throw new Error("The balance connection is on the wrong network.");
  const units = await context.client.readContract({ address: context.token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
  return { amount: formatUnits(units, 6), currency: "USDC" as const, token: context.token, chain_id: context.chainId };
}
