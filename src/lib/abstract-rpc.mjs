// An optional browser key replaces the public RPC without changing the network.
// Never import server credentials into this browser-shared module.
export function abstractRpcUrl(chainId, { url = '', alchemyKey = '' } = {}) {
  const network = chainId === 2741 ? 'abstract-mainnet' : chainId === 11124 ? 'abstract-testnet' : null;
  if (!network) throw new Error('Unsupported Abstract network');
  if (url.trim()) return url.trim();
  const key = alchemyKey.trim();
  return key ? `https://${network}.g.alchemy.com/v2/${encodeURIComponent(key)}` : undefined;
}
