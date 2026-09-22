import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { takeBudget, rateLimitResponse, clientLimitSubject } from '../src/lib/rate-limit.ts';
const env = { NODE_ENV: 'production', DYLI_API_KEY: 'fixture-key', DYLI_COMMERCE_BASE_URL: 'https://dyli.example/api/commerce/v1' };

test('key-only budgets use the shared DYLI endpoint and send no raw identity', async () => {
  let calls = 0;
  const fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://dyli.example/api/commerce/v1/storefront/limits');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.get('x-api-key'), env.DYLI_API_KEY);
    const body = JSON.parse(init.body);
    assert.equal(body.budget, 'upstream-write');
    assert.match(body.subject_hash, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(init.body, /fixture-key|private-customer/);
    return calls === 1 ? Response.json({ allowed: true }) : Response.json({ error: 'storefront_rate_limited', retry_after_seconds: 32 }, { status: 429 });
  };
  await takeBudget('upstream-write', 'private-customer', { env, fetch });
  await assert.rejects(takeBudget('upstream-write', 'private-customer', { env: { ...env }, fetch }), error => {
    const response = rateLimitResponse(error);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '32');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    return true;
  });
  assert.equal(calls, 2, 'No implicit retry');
});

test('missing production keys block requests but unavailable counters let requests continue', async () => {
  const silent = { report() {} };
  await takeBudget('upstream-read', 'local', { ...silent, env: { NODE_ENV: 'development' } });
  await assert.rejects(takeBudget('upstream-read', 'local', { ...silent, env: { NODE_ENV: 'production' } }), error => error.status === 503);
  await assert.rejects(takeBudget('upstream-read', 'local', { ...silent, env: { VERCEL: '1' } }), error => error.status === 503);
  for (const fetch of [
    async () => { throw new Error('private-provider-message'); },
    async () => new Response('private', { status: 503 }),
    async () => Response.json({ error: 'unknown_endpoint' }, { status: 404 }),
    async () => Response.json({ allowed: 'true' }),
  ]) {
    const events = [];
    await takeBudget('upstream-read', 'private-customer', { env, fetch, report: event => events.push(event) });
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'storefront_rate_limit_unavailable');
    assert.equal(events[0].budget, 'upstream-read');
    assert.equal(events[0].action, 'continue');
    assert.ok(Number.isFinite(events[0].duration_ms));
    assert.ok(['upstream_response', 'network', 'invalid_configuration_or_response'].includes(events[0].reason));
    assert.doesNotMatch(JSON.stringify(events), /private|fixture-key/);
  }
});

test('protection timeouts allow the operation once without retrying the check', async () => {
  const events = []; let calls = 0;
  await takeBudget('upstream-read', 'private-customer', {
    env, report: event => events.push(event), fetch: async () => {
      calls++;
      throw new DOMException('private-provider-message', 'TimeoutError');
    },
  });
  assert.equal(calls, 1);
  assert.equal(events[0].reason, 'timeout');
  assert.doesNotMatch(JSON.stringify(events), /private|fixture-key/);
});

test('an explicit counter denial remains enforced even in a successful HTTP response', async () => {
  await assert.rejects(takeBudget('upstream-write', 'private-customer', {
    env, fetch: async () => Response.json({ allowed: false }),
    report() { assert.fail('An explicit denial must not continue'); },
  }), error => error.status === 429);
});

test('only the configured trusted proxy can supply client addresses', () => {
  const request = new Request('https://shop.example/api/session', { headers: {
    'x-forwarded-for': '198.51.100.99', 'x-vercel-forwarded-for': '203.0.113.10', 'x-client-address': '203.0.113.11',
  } });
  assert.equal(clientLimitSubject(request, {}), 'unidentified-client');
  assert.equal(clientLimitSubject(request, { VERCEL: '1' }), '203.0.113.10');
  assert.equal(clientLimitSubject(request, { STOREFRONT_CLIENT_IP_HEADER: 'x-client-address' }), '203.0.113.11');
  assert.equal(clientLimitSubject(new Request(request, { headers: { 'x-vercel-forwarded-for': 'a,b' } }), { VERCEL: '1' }), 'unidentified-client');
});

test('all API routes, authenticated customers and both upstream clients are guarded', () => {
  const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.match(source('../src/proxy.ts'), /matcher: \["\/api\/:path\*"\]/);
  assert.match(source('../src/proxy.ts'), /await limitRequest\(request\)/);
  assert.match(source('../src/lib/live-server.ts'), /await takeBudget\("customer", identity.externalCustomerId\)/);
  assert.equal((source('../src/lib/dyli.ts').match(/await limitUpstream\(init.method\)/g) || []).length, 2);
});
