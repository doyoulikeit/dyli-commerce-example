const coinbasePaymaster = '0xdcbe0c1a00e4cf24ae77c52125e6e6b4f7c6db4e';

// This is a pre-broadcast freshness hint, never proof that a submitted
// operation failed or authorization to clear its journal.
export function coinbaseQuoteNeedsRefresh(operation, { now = Date.now(), minimumRemainingSeconds = 15 } = {}) {
  if (String(operation?.paymaster || '').toLowerCase() !== coinbasePaymaster
      || !/^0x[0-9a-f]{348}$/i.test(operation.paymasterData || '')) return false;
  const validUntil = BigInt('0x' + operation.paymasterData.slice(2, 14));
  const validAfter = BigInt('0x' + operation.paymasterData.slice(14, 26));
  const seconds = BigInt(Math.floor(now / 1000));
  return validAfter > seconds || validUntil !== 0n && validUntil <= seconds + BigInt(minimumRemainingSeconds);
}
