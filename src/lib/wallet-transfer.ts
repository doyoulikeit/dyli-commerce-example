import { encodeFunctionData, erc20Abi, formatUnits, getAddress, isAddress, parseUnits } from "viem";
import type { SessionResponse, TransactionInstruction } from "./types";

export type WalletSnapshot = {
  wallet: string;
  balance: SessionResponse["balance"];
  transfer?: {
    hash: `0x${string}`;
    status: "pending" | "confirmed" | "failed";
    recipient?: string;
    amount?: string;
    timestamp?: number;
  };
};
export type Withdrawal = {
  version: 1; wallet: string; recipient: string; amount: string;
  token: `0x${string}`; chainId: number; createdAt: number;
  status: "submitting" | "pending" | "confirmed" | "failed";
  hash?: `0x${string}`;
};
export const withdrawalKey = (wallet: string) => `vaulted:withdrawal:v1:${wallet.toLowerCase()}`;
export const pendingWithdrawal = (record: Withdrawal | null) => !!record && ["submitting", "pending"].includes(record.status);
export const validTransferHash = (hash: string) => /^0x[a-f\d]{64}$/i.test(hash);

export function usdcUnits(value: string) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value.trim()) || value.length > 80)
    throw new Error("Enter an amount with up to 6 decimal places.");
  const units = parseUnits(value.trim(), 6);
  if (units > (BigInt(1) << BigInt(256)) - BigInt(1)) throw new Error("Amount is too large.");
  return units;
}

export function makeWithdrawal(recipient: string, amount: string, snapshot: WalletSnapshot, wallet: string) {
  if (!isAddress(wallet) || snapshot.wallet.toLowerCase() !== wallet.toLowerCase() ||
      ![2741, 11124].includes(snapshot.balance.chain_id) || snapshot.balance.currency !== "USDC" || !isAddress(snapshot.balance.token))
    throw new Error("Wait for your Abstract balance to load.");
  const destination = recipient.trim();
  if (!isAddress(destination) || /^0x0{40}$/i.test(destination) || /^0x0{36}dead$/i.test(destination) ||
      [wallet.toLowerCase(), snapshot.balance.token.toLowerCase()].includes(destination.toLowerCase()))
    throw new Error("Enter a valid recipient wallet address, different from your own.");
  const units = usdcUnits(amount);
  if (units <= BigInt(0)) throw new Error("Enter an amount greater than zero.");
  if (units > usdcUnits(snapshot.balance.amount)) throw new Error("This amount exceeds your available balance.");
  return {
    version: 1, wallet: wallet.toLowerCase(), recipient: getAddress(destination), amount: formatUnits(units, 6),
    token: snapshot.balance.token, chainId: snapshot.balance.chain_id, createdAt: Date.now(), status: "submitting",
  } satisfies Withdrawal;
}

export function parseWithdrawal(raw: string | null, wallet: string): Withdrawal | null {
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as Withdrawal;
    if (record.version !== 1 || record.wallet !== wallet.toLowerCase() || !isAddress(record.recipient) ||
        !isAddress(record.token) || ![2741, 11124].includes(record.chainId) ||
        !Number.isFinite(record.createdAt) || record.createdAt <= 0 || usdcUnits(record.amount) <= BigInt(0) ||
        !["submitting", "pending", "confirmed", "failed"].includes(record.status) ||
        (record.hash && !validTransferHash(record.hash)) || (record.status !== "submitting" && !record.hash)) throw new Error();
    return record;
  } catch { throw new Error("Your saved transfer could not be read. Check your wallet activity before sending again."); }
}

export async function submitWithdrawal(record: Withdrawal, dependencies: {
  read: () => Promise<WalletSnapshot>;
  load: () => Withdrawal | null;
  save: (record: Withdrawal | null) => void;
  send: (transaction: TransactionInstruction) => Promise<`0x${string}`>;
}) {
  if (pendingWithdrawal(dependencies.load())) throw new Error("Check your pending transfer before sending another.");
  const fresh = makeWithdrawal(record.recipient, record.amount, await dependencies.read(), record.wallet);
  if (fresh.token.toLowerCase() !== record.token.toLowerCase() || fresh.chainId !== record.chainId)
    throw new Error("Your network changed. Review the transfer again.");
  // A durable marker is mandatory before signing/broadcasting. After a crash or
  // uncertain broadcast, only receipt checks are allowed — never another send.
  dependencies.save(fresh);
  let hash: `0x${string}`;
  try {
    hash = await dependencies.send({
      chain: "abstract", chain_id: fresh.chainId, from: fresh.wallet as `0x${string}`,
      to: fresh.token, value: "0",
      data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [fresh.recipient as `0x${string}`, usdcUnits(fresh.amount)] }),
    });
  } catch (error) {
    if ((error as { broadcastAttempted?: boolean })?.broadcastAttempted === false) dependencies.save(null);
    throw error;
  }
  if (!validTransferHash(hash)) throw new Error("Check your wallet activity to confirm the transfer. Do not send it again.");
  const pending = { ...fresh, status: "pending" as const, hash };
  try { dependencies.save(pending); }
  catch { throw Object.assign(new Error("Your transfer was sent. Keep this window open while we confirm it."), { withdrawal: pending }); }
  return pending;
}

export function reconcileWithdrawal(record: Withdrawal, snapshot: WalletSnapshot): Withdrawal {
  const transfer = snapshot.transfer;
  if (snapshot.wallet.toLowerCase() !== record.wallet || snapshot.balance.chain_id !== record.chainId ||
      snapshot.balance.token.toLowerCase() !== record.token.toLowerCase() || !transfer ||
      !validTransferHash(transfer.hash) || (record.hash && transfer.hash.toLowerCase() !== record.hash.toLowerCase()))
    throw new Error("This receipt does not match your transfer.");
  if (transfer.status === "pending") return record;
  if (transfer.recipient?.toLowerCase() !== record.recipient.toLowerCase() ||
      usdcUnits(transfer.amount || "0") !== usdcUnits(record.amount) ||
      !transfer.timestamp || transfer.timestamp * 1000 < record.createdAt - 120000)
    throw new Error("This receipt does not match your transfer.");
  return { ...record, hash: transfer.hash, status: transfer.status };
}

export function walletExplorer(chainId: number, wallet: string, hash?: string) {
  const host = chainId === 11124 ? "https://sepolia.abscan.org" : "https://abscan.org";
  return hash && validTransferHash(hash) ? `${host}/tx/${hash}` : `${host}/address/${getAddress(wallet)}`;
}
