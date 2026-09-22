import type { OfferAcceptance, TransactionInstruction } from "./types";

export type OfferRecovery = {
  wallet: string; tokenId: string; key: string; offerId: string; expectedAmount: string;
  id?: string; hash?: string; attempted?: boolean; approvalHash?: string; approvalAttempted?: boolean;
};
export const offerStorageKey = (wallet: string, tokenId: string) => `dyli-vault-sale-v1:${wallet.toLowerCase()}:${tokenId}`;

export function parseOfferRecovery(raw: string | null, wallet: string, tokenId: string): OfferRecovery | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value.wallet !== wallet.toLowerCase() || value.tokenId !== tokenId ||
        typeof value.key !== "string" || !/^[\w:-]{8,128}$/.test(value.key) ||
        !/^\d+$/.test(value.offerId) || !/^\d+$/.test(value.expectedAmount)) return null;
    for (const key of ["hash", "approvalHash"]) {
      if (value[key] !== undefined && !/^0x[a-f\d]{64}$/i.test(value[key])) return null;
    }
    if (value.id !== undefined && !/^[\da-f-]{36}$/i.test(value.id)) return null;
    return { wallet: value.wallet, tokenId, key: value.key, offerId: value.offerId, expectedAmount: value.expectedAmount,
      ...(value.id ? { id: value.id } : {}), ...(value.hash ? { hash: value.hash } : {}),
      ...(value.approvalHash ? { approvalHash: value.approvalHash } : {}),
      attempted: value.attempted === true, approvalAttempted: value.approvalAttempted === true };
  } catch { return null; }
}

export const saleMayHaveBeenSent = (sale: OfferAcceptance | null, saved: OfferRecovery | null) =>
  Boolean(saved?.attempted || saved?.hash || sale?.tx_hash || ["processing", "requires_action", "completed"].includes(sale?.status || ""));

// Save before each wallet prompt and immediately after broadcast. Only a
// definite pre-broadcast failure or reverted receipt can clear an attempt.
export async function settleVaultOffer({ sale, recovery, save, send, wait, approved, confirm, progress }: {
  sale: OfferAcceptance; recovery: OfferRecovery; save: (value: OfferRecovery) => void;
  send: (tx: TransactionInstruction, expiresAt?: string) => Promise<`0x${string}`>;
  wait: (hash: `0x${string}`) => Promise<{ status: string }>;
  approved: (transaction: TransactionInstruction) => Promise<boolean>;
  confirm: (hash: string) => Promise<OfferAcceptance>; progress: (message: string) => void;
}) {
  if (sale.wallet_address.toLowerCase() !== recovery.wallet || sale.token_id !== recovery.tokenId || sale.id !== recovery.id) {
    throw new Error("This sale belongs to a different wallet or item.");
  }
  if (sale.status === "completed") return sale;
  let saved = { ...recovery };
  const persist = (patch: Partial<OfferRecovery>) => { saved = { ...saved, ...patch }; save(saved); };
  const fresh = () => {
    if (!Number.isFinite(Date.parse(sale.expires_at)) || Date.parse(sale.expires_at) - Date.now() < 30000 || sale.status !== "prepared") {
      throw new Error("This offer has expired. Refresh offers before selling.");
    }
  };
  let hash = sale.tx_hash || saved.hash;
  if (!hash && saleMayHaveBeenSent(sale, saved)) throw new Error("Check your wallet history and enter the sale transaction hash below. Do not send another sale.");
  if (!hash) {
    fresh();
    if (sale.approval_transaction && !(await approved(sale.approval_transaction))) {
      let approvalHash = saved.approvalHash;
      if (!approvalHash && saved.approvalAttempted) throw new Error("Check your wallet history and enter the approval transaction hash below.");
      if (!approvalHash) {
        progress("Approve marketplace access in your wallet…");
        persist({ approvalAttempted: true });
        try { approvalHash = await send(sale.approval_transaction, sale.expires_at); }
        catch (error) {
          if ((error as { broadcastAttempted?: boolean }).broadcastAttempted === false) persist({ approvalAttempted: false });
          throw error;
        }
        persist({ approvalHash });
      }
      progress("Waiting for marketplace approval…");
      const receipt = await wait(approvalHash as `0x${string}`);
      if (receipt.status !== "success") {
        persist({ approvalHash: undefined, approvalAttempted: false });
        throw new Error("Approval failed. No sale was sent. Please try again.");
      }
      if (!(await approved(sale.approval_transaction))) throw new Error("Marketplace approval is not available yet. Please check again.");
    }
    persist({ approvalHash: undefined, approvalAttempted: false });
    fresh();
    if (!sale.transaction) throw new Error("Refresh this offer before selling.");
    progress("Confirm the sale in your wallet…");
    persist({ attempted: true });
    try { hash = await send(sale.transaction, sale.expires_at); }
    catch (error) {
      if ((error as { broadcastAttempted?: boolean }).broadcastAttempted === false) persist({ attempted: false });
      throw error;
    }
    persist({ hash });
  }
  progress("Confirming your sale…");
  const receipt = await wait(hash as `0x${string}`);
  if (receipt.status !== "success") {
    persist({ hash: undefined, attempted: false });
    throw new Error("The sale transaction failed. Your item was not sold. Refresh offers to try again.");
  }
  return confirm(hash);
}
