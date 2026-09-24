import type { ApiRecord, TransactionInstruction } from "./types";
import { retryConfirmation } from "./confirmation-retry.mjs";

export type CommunityAction = {
  id: string;
  kind: string;
  external_customer_id: string;
  wallet_address: string;
  input: ApiRecord;
  status:
    | "prepared"
    | "expired"
    | "processing"
    | "requires_action"
    | "completed";
  transaction: TransactionInstruction | null;
  approvals: TransactionInstruction[];
  tx_hash?: string;
  expires_at: string;
  created_at: string;
  result?: ApiRecord;
};
export type CommunityRecovery = {
  wallet: string;
  key: string;
  input: ApiRecord;
  id?: string;
  attempted?: boolean;
  hash?: string;
  approval?: { index: number; attempted: boolean; hash?: string };
};
export const communityStorageKey = (wallet: string) =>
  `dyli-community-v1:${wallet.toLowerCase()}`;
export const transactionHash = (value: unknown): value is `0x${string}` =>
  typeof value === "string" && /^0x[\da-f]{64}$/i.test(value);
export const communityPending = (value: CommunityRecovery | null) =>
  Boolean(value?.attempted || value?.hash || value?.approval?.attempted);
// A storage write can fail after the wallet broadcasts. Keep the stronger
// in-memory evidence rather than reverting to the pre-broadcast stored record.
export function mergeCommunityRecovery(
  stored: CommunityRecovery | null,
  memory: CommunityRecovery | null,
): CommunityRecovery | null {
  if (!memory) return stored;
  if (!stored) return memory;
  if (stored.key !== memory.key) {
    if (communityPending(memory))
      throw new Error("Finish the pending wallet action in this tab first.");
    return stored;
  }
  if (memory.hash || memory.approval?.hash) return memory;
  if (stored.hash || stored.approval?.hash) return stored;
  return communityPending(memory) ? memory : stored;
}
export const actionLabel = (kind: string) =>
  ({
    list: "Create listing",
    offer: "Make offer",
    buy: "Buy collectible",
    accept_offer: "Accept offer",
    cancel_listing: "Cancel listing",
    cancel_offer: "Cancel offer",
    trade: "Send trade",
    accept_trade: "Accept trade",
    cancel_trade: "Cancel trade",
  })[kind] || "Continue";
export function communityRecovery(
  raw: string | null,
  wallet: string,
): CommunityRecovery | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as CommunityRecovery;
    if (
      value.wallet !== wallet.toLowerCase() ||
      typeof value.key !== "string" ||
      !/^[\w:-]{8,128}$/.test(value.key) ||
      !value.input ||
      typeof value.input.kind !== "string" ||
      (value.id && !/^[\da-f-]{36}$/i.test(value.id)) ||
      (value.hash && !transactionHash(value.hash)) ||
      (value.approval?.hash && !transactionHash(value.approval.hash)) ||
      (value.approval &&
        (!Number.isInteger(value.approval.index) || value.approval.index < 0))
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export async function settleCommunityAction({
  action,
  recovery,
  save,
  send,
  wait,
  approved,
  confirm,
  progress,
}: {
  action: CommunityAction;
  recovery: CommunityRecovery;
  save: (value: CommunityRecovery) => void;
  send: (
    tx: TransactionInstruction,
    expiresAt?: string,
  ) => Promise<`0x${string}`>;
  wait: (hash: `0x${string}`) => Promise<{ status: string }>;
  approved: (tx: TransactionInstruction) => Promise<boolean>;
  confirm: (hash: string) => Promise<CommunityAction>;
  progress: (label: string) => void;
}) {
  if (
    action.wallet_address.toLowerCase() !== recovery.wallet ||
    action.id !== recovery.id
  )
    throw new Error("This action belongs to a different account.");
  if (action.status === "completed") return action;
  let saved = { ...recovery };
  const persist = (patch: Partial<CommunityRecovery>) => {
    saved = { ...saved, ...patch };
    save(saved);
  };
  const fresh = () => {
    if (
      action.status !== "prepared" ||
      !Number.isFinite(Date.parse(action.expires_at)) ||
      Date.parse(action.expires_at) - Date.now() < 30000
    ) {
      throw new Error("This review has expired. Refresh it before continuing.");
    }
  };
  let hash = action.tx_hash || saved.hash;
  if (
    !hash &&
    (saved.attempted ||
      ["processing", "requires_action"].includes(action.status))
  ) {
    throw new Error(
      "Check your wallet history and add the transaction reference below. Do not submit this action again.",
    );
  }
  const broadcast = async (
    tx: TransactionInstruction,
    approvalIndex?: number,
  ) => {
    const isApproval = approvalIndex !== undefined;
    persist(
      isApproval
        ? { approval: { index: approvalIndex, attempted: true } }
        : { attempted: true },
    );
    try {
      const result = await send(tx, action.expires_at);
      persist(
        isApproval
          ? {
              approval: { index: approvalIndex, attempted: true, hash: result },
            }
          : { hash: result },
      );
      return result;
    } catch (error) {
      const failure = error as {
        broadcastAttempted?: boolean;
        transactionHash?: string;
      };
      if (failure.broadcastAttempted === false)
        persist(isApproval ? { approval: undefined } : { attempted: false });
      else if (transactionHash(failure.transactionHash))
        persist(
          isApproval
            ? {
                approval: {
                  index: approvalIndex,
                  attempted: true,
                  hash: failure.transactionHash,
                },
              }
            : { hash: failure.transactionHash },
        );
      throw error;
    }
  };
  if (!hash) {
    fresh();
    for (const [index, instruction] of action.approvals.entries()) {
      if (await approved(instruction)) {
        if (saved.approval?.index === index) persist({ approval: undefined });
        continue;
      }
      let approvalHash =
        saved.approval?.index === index ? saved.approval.hash : undefined;
      if (!approvalHash && saved.approval?.attempted)
        throw new Error(
          "Check the pending permission in your wallet before continuing.",
        );
      progress("Confirm access in your wallet…");
      approvalHash ||= await broadcast(instruction, index);
      const receipt = await wait(approvalHash as `0x${string}`);
      if (receipt.status !== "success") {
        persist({ approval: undefined });
        throw new Error(
          "Access wasn’t approved. No purchase or trade was sent.",
        );
      }
      if (!(await approved(instruction)))
        throw new Error(
          "Waiting for wallet access to update. Please retry shortly.",
        );
      persist({ approval: undefined });
    }
    fresh();
    if (!action.transaction)
      throw new Error("Refresh this review before continuing.");
    progress("Confirm in your wallet…");
    hash = await broadcast(action.transaction);
  }
  progress("Confirming your transaction…");
  const receipt = await retryConfirmation(() => wait(hash as `0x${string}`));
  if (receipt.status !== "success") {
    persist({ attempted: false, hash: undefined });
    throw new Error(
      "The transaction did not complete. Nothing was exchanged. You can refresh and try again.",
    );
  }
  progress("Updating your account…");
  return retryConfirmation(() => confirm(hash!));
}
