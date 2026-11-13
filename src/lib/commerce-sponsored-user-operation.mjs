import { signAuthorization } from 'viem/actions';
import { coinbaseQuoteNeedsRefresh } from './commerce-coinbase-quote-window.mjs';

export class CoinbaseFailoverError extends Error {}

function executionReverted(error) {
  const seen = new Set();
  for (let cause = error; cause && !seen.has(cause); cause = cause.cause) {
    seen.add(cause);
    if (cause.code === -32521) return true;
  }
  return false;
}

export async function sendSponsoredUserOperation({ bundler, preferredBundler, smart, client, calls,
  assertCurrent = () => {}, now = Date.now, nonce = undefined }) {
  assertCurrent();
  if (preferredBundler && await smart.isDeployed()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      assertCurrent();
      let prepared;
      try {
        // Preparation only uses a stub signature. No user operation is authorized
        // or broadcast here. Rebuild from calls if sponsorship/estimation fails.
        prepared = await preferredBundler.prepareUserOperation({ calls, ...(nonce !== undefined ? { nonce } : {}) });
      } catch (error) {
        // Another sponsor cannot repair a definite contract execution failure.
        // Preserve the original actionable error instead of estimating it twice.
        if (executionReverted(error)) throw error;
        assertCurrent();
        return sendSponsoredUserOperation({ bundler, smart, client, calls, assertCurrent, now, nonce });
      }
      assertCurrent();
      if (coinbaseQuoteNeedsRefresh(prepared, { now: now() })) { nonce = prepared.nonce; continue; }
      const signature = await smart.signUserOperation(prepared);
      assertCurrent();
      // Signing can outlast the sponsor's short validity window. Neither set of
      // bytes has reached a bundler yet, so refresh and sign using the same nonce.
      if (coinbaseQuoteNeedsRefresh(prepared, { now: now() })) { nonce = prepared.nonce; continue; }
      // account:null skips viem's automatic re-preparation. Send exactly what was signed.
      try {
        return await preferredBundler.sendUserOperation({ ...prepared, account: null,
          entryPointAddress: smart.entryPoint.address, signature });
      } catch (error) {
        // Only DYLI's journal-backed rejection signal authorizes a replacement.
        const canReplace = error instanceof CoinbaseFailoverError
          || error?.walk?.(cause => cause instanceof CoinbaseFailoverError) instanceof CoinbaseFailoverError;
        if (!canReplace) throw error;
        assertCurrent();
        return bundler.sendUserOperation({ calls, nonce: prepared.nonce });
      }
    }
    // Repeated stale quotes use the existing unsigned Alchemy path. A send
    // failure above still exits immediately and keeps its original journal.
    return sendSponsoredUserOperation({ bundler, smart, client, calls, assertCurrent, now, nonce });
  }
  // prepareUserOperation uses a stub authorization for estimation. The final
  // request must carry the owner's signed authorization on its first send.
  const authorization = smart.authorization && !(await smart.isDeployed())
    ? await signAuthorization(client, smart.authorization) : undefined;
  assertCurrent();
  return bundler.sendUserOperation({ calls, ...(nonce !== undefined ? { nonce } : {}), ...(authorization ? { authorization } : {}) });
}
