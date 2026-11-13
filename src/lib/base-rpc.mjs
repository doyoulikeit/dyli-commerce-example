// An optional browser key replaces the public RPC without changing the network.
// Never import server credentials into this browser-shared module.
export function baseRpcUrl(chainId, { url = '', alchemyKey = '' } = {}) {
  const network = chainId === 8453 ? 'base-mainnet' : chainId === 84532 ? 'base-sepolia' : null;
  if (!network) throw new Error('Unsupported Base network');
  if (url.trim()) return url.trim();
  const key = alchemyKey.trim();
  return key ? `https://${network}.g.alchemy.com/v2/${encodeURIComponent(key)}` : undefined;
}
