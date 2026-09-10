/** Server-only, dependency-free Commerce transport. Never bundle a DYLI key in a client. */
export class CommerceError extends Error {
  constructor(status, payload, requestId) {
    super(String(payload.message || payload.error || `DYLI request failed (${status})`));
    this.name = 'CommerceError';
    this.status = status;
    this.payload = payload;
    this.requestId = requestId || null;
  }
}

export function createCommerceClient({ apiKey, partnerSlug, baseUrl = 'https://www.dyli.io/api/commerce/v1', fetch: fetcher = globalThis.fetch, timeoutMs = 30000 }) {
  if (typeof window !== 'undefined') throw new Error('DYLI Commerce credentials belong on your server, not in a browser');
  if (!apiKey?.trim()) throw new Error('DYLI_API_KEY is required');
  if (partnerSlug !== undefined && (typeof partnerSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(partnerSlug) || partnerSlug.length > 80)) throw new Error('An optional partnerSlug must be a stable lowercase slug');
  const base = new URL(baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) || base.username || base.password || base.search || base.hash) throw new Error('DYLI base URL must use HTTPS (HTTP is allowed only on localhost) without credentials');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error('Invalid request timeout');

  const request = async (path, { method = 'GET', body, headers: suppliedHeaders, signal } = {}) => {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\#\r\n]/.test(path) || /(?:^|\/)\.{1,2}(?:\/|\?|$)/.test(decodeURIComponent(path))) throw new Error('Use a relative Commerce endpoint path');
    const headers = new Headers(suppliedHeaders);
    headers.set('x-api-key', apiKey.trim());
    // The authenticated key selects the app. Never forward a caller's tenant
    // header; an explicit SDK slug is only a backwards-compatible assertion.
    headers.delete('x-partner-slug');
    if (partnerSlug !== undefined) headers.set('x-partner-slug', partnerSlug);
    headers.set('accept', 'application/json');
    headers.delete('authorization');
    if (body !== undefined) headers.set('content-type', 'application/json');
    const response = await fetcher(`${base.toString().replace(/\/+$/, '')}${path === '/' ? '' : path}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', cache: 'no-store', signal: signal || AbortSignal.timeout(timeoutMs),
    });
    let payload;
    try { payload = await response.json(); } catch { payload = { error: 'invalid_upstream_response' }; }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = { error: 'invalid_upstream_response' };
    if (!response.ok) throw new CommerceError(response.status, payload, response.headers.get('x-request-id'));
    if (payload.error === 'invalid_upstream_response') throw new CommerceError(502, payload, response.headers.get('x-request-id'));
    return payload;
  };
  const write = (path, body, key) => {
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(key || '')) throw new Error('Persist a stable idempotency key before submitting a write');
    return request(path, { method: 'POST', body, headers: { 'Idempotency-Key': key } });
  };
  return Object.freeze({
    request,
    readiness: () => request('/'),
    bootstrap: () => request('/bootstrap'),
    verifySession: (accessToken, walletAddress) => request('/auth/session', {
      method: 'POST', headers: { 'x-customer-access-token': accessToken }, body: { wallet_address: walletAddress },
    }),
    quote: (body, key) => write('/quotes', body, key),
    stripeCheckout: (quoteId, body, key) => write(`/quotes/${encodeURIComponent(quoteId)}/stripe-checkout`, body, key),
    createOrder: (body, key) => write('/orders', body, key),
    openBox: (orderId, key) => write('/box-plays', { order_id: orderId }, key),
    // Never retry a mutation automatically. Recover using its key and receipts.
  });
}
