import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommerceClient, CommerceError } from '../sdk/commerce-client.mjs';
const options = { apiKey: 'server-only-key' };
test('client keeps keys in headers, rejects redirects, and serializes stable idempotency keys', async () => {
  let calls = 0;
  const client = createCommerceClient({ ...options, fetch: async (url, init) => {
    calls++;
    assert.equal(url, 'https://www.dyli.io/api/commerce/v1/quotes');
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.get('x-api-key'), options.apiKey);
    assert.equal(init.headers.has('x-partner-slug'), false);
    assert.equal(init.headers.get('Idempotency-Key'), 'quote:request-123');
    assert.equal(init.body, '{"items":[]}');
    return Response.json({ quote: { id: 'quote' } });
  } });
  await client.quote({ items: [] }, 'quote:request-123');
  assert.equal(calls, 1);
  assert.throws(() => client.quote({}, ''), /idempotency/);
});
test('key-only bootstrap discovers the app and never forwards a supplied tenant header', async () => {
  let calls = 0;
  const client = createCommerceClient({ ...options, fetch: async (url, init) => {
    calls++;
    assert.equal(init.headers.get('x-api-key'), options.apiKey);
    assert.equal(init.headers.has('x-partner-slug'), false);
    assert.equal(init.headers.has('authorization'), false);
    assert.equal(url, 'https://www.dyli.io/api/commerce/v1/bootstrap');
    return Response.json({ partner: { slug: 'registered-store' }, integration: { application_id: 'app' } });
  } });
  assert.equal((await client.bootstrap()).partner.slug, 'registered-store');
  await client.request('/bootstrap', { headers: { 'x-partner-slug': 'other-store', authorization: 'Bearer untrusted' } });
  assert.equal(calls, 2);
});
test('explicit SDK slug remains an optional assertion and cannot be overridden per request', async () => {
  const client = createCommerceClient({ ...options, partnerSlug: 'registered-store', fetch: async (_url, init) => {
    assert.equal(init.headers.get('x-partner-slug'), 'registered-store');
    return Response.json({});
  } });
  await client.request('/bootstrap', { headers: { 'x-partner-slug': 'other-store' } });
  for (const partnerSlug of ['', 'UPPER CASE', '../other', 'a'.repeat(81), 123, null]) {
    assert.throws(() => createCommerceClient({ ...options, partnerSlug }), /optional partnerSlug/);
  }
});
test('untrusted absolute/traversal paths and credential-bearing base URLs are rejected', async () => {
  let calls = 0;
  const client = createCommerceClient({ ...options, fetch: async () => { calls++; return Response.json({}); } });
  for (const path of ['https://other.example', '//other.example', '/../../elsewhere', '/%2e%2e/elsewhere', '/\\evil', '/quotes#fragment']) await assert.rejects(client.request(path));
  for (const baseUrl of ['http://remote.example', 'https://user:password@example.test', 'https://example.test?key=secret']) assert.throws(() => createCommerceClient({ ...options, baseUrl }));
  assert.equal(calls, 0);
});
test('uncertain writes are never retried automatically; errors retain support request ID', async () => {
  let calls = 0;
  const client = createCommerceClient({ ...options, fetch: async () => { calls++; return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'x-request-id': 'support-id' } }); } });
  await assert.rejects(client.createOrder({}, 'order:request-123'), error => error instanceof CommerceError && error.requestId === 'support-id');
  assert.equal(calls, 1);
});
