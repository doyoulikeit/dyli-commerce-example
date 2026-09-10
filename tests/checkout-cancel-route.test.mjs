import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real route with inert auth/API dependencies. No API key, Stripe
// call, login or production mutation is possible from this test.
const source = readFileSync(new URL('../src/app/api/checkout/confirm/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function fixture({ owner = 'customer-a', authenticated = true, result = { cancelled: true }, fail = false } = {}) {
  const calls = [];
  const commerce = async (path, options) => {
    calls.push({ path, options });
    if (path.startsWith('/stripe-checkouts/resolve?')) return { checkout: { id: 'payment-a' } };
    if (path === '/stripe-checkouts/payment-a') return { checkout: { quote_id: 'quote-a' } };
    if (path === '/quotes/quote-a') return { quote: { external_customer_id: owner } };
    if (path === '/stripe-checkouts/payment-a/cancel') {
      if (fail) throw new Error('provider timeout');
      return result;
    }
    throw Error(`Unexpected API access: ${path}`);
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, Response, require: name => {
    if (name === '@/lib/dyli') return { commerce, apiErrorResponse: () => Response.json({ error: 'Unavailable' }, { status: 502 }) };
    if (name === '@/lib/live-server') return { requireLiveIdentity: async () => {
      if (!authenticated) throw Object.assign(Error('Sign in'), { status: 401 });
      return { externalCustomerId: 'customer-a' };
    } };
    if (name === '@/lib/privy-server') return { authErrorResponse: error => error.status === 401 ? Response.json({ error: 'Sign in' }, { status: 401 }) : null };
    throw Error(`Unexpected dependency: ${name}`);
  } });
  return { calls, post: () => exports.POST({ json: async () => ({ action: 'cancel', stripeSessionId: 'cs_live_owned' }) }) };
}

test('cancellation authenticates, resolves the session and checks customer ownership before writing', async () => {
  const f = fixture();
  const response = await f.post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { cancelled: true });
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(f.calls.map(call => call.path), ['/stripe-checkouts/resolve?stripe_session_id=cs_live_owned', '/stripe-checkouts/payment-a', '/quotes/quote-a', '/stripe-checkouts/payment-a/cancel']);
  assert.equal(f.calls[3].options.method, 'POST');
});
test('unauthenticated and foreign-customer cancellation cannot reach the write endpoint', async () => {
  const unsigned = fixture({ authenticated: false });
  assert.equal((await unsigned.post()).status, 401);
  assert.equal(unsigned.calls.length, 0);
  const foreign = fixture({ owner: 'customer-b' });
  assert.equal((await foreign.post()).status, 403);
  assert.ok(foreign.calls.every(call => !call.options));
});
test('provider failure or unconfirmed cancellation never tells the client to discard recovery', async () => {
  for (const options of [{ fail: true }, { result: {} }, { result: { cancelled: false } }]) {
    const response = await fixture(options).post();
    assert.ok(response.status >= 400);
    assert.notEqual((await response.json()).cancelled, true);
  }
});
