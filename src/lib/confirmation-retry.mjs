// Use only for reads and idempotent receipt confirmation. Never wrap a wallet
// send, a new quote, or a new transaction preparation in this retry loop.
/**
 * @template T
 * @param {() => Promise<T>} action
 * @param {{ sleep?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<T>}
 */
export async function retryConfirmation(action, options = {}) {
  const sleep = options.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try { return await action(); }
    catch (failure) {
      const error = failure || {};
      const retryable = Number(error.status) >= 500 || [408, 425].includes(Number(error.status)) ||
        ['transaction_not_confirmed', 'transaction_pending', 'confirmation_pending', 'offer_busy', 'redemption_processing'].includes(String(error.code)) ||
        ['TypeError', 'TimeoutError', 'AbortError'].includes(String(error.name));
      if (!retryable || attempt >= 3) throw failure;
      await sleep(600 * 2 ** attempt);
    }
  }
}
