import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parseCardCheckout, unpaidCardError } from '../src/lib/card-checkout.ts';
import * as storefrontPolicy from '../src/lib/storefront-policy.ts';

test('embedded checkout requires a secret bound to its session and matching key mode', () => {
  const checkout = { ui_mode: 'embedded', stripe_session_id: 'cs_live_abc', client_secret: 'cs_live_abc_secret_xyz', publishable_key: 'pk_live_abc' };
  assert.equal(parseCardCheckout(checkout).mode, 'embedded');
  assert.throws(() => parseCardCheckout({ ...checkout, publishable_key: 'pk_test_abc' }));
  assert.throws(() => parseCardCheckout({ ...checkout, client_secret: 'cs_live_other_secret_xyz' }));
  assert.throws(() => parseCardCheckout({ ...checkout, client_secret: null }));
  assert.equal(unpaidCardError({ code: 'stripe_payment_pending' }), true);
  for (const code of ['stripe_amount_mismatch', 'stripe_payment_unverified', 'stripe_metadata_mismatch']) assert.equal(unpaidCardError({ code }), false);
});
test('hosted checkout redirects only to Stripe', () => {
  const checkout = { stripe_session_id: 'cs_test_abc', checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_abc' };
  assert.equal(parseCardCheckout(checkout).mode, 'hosted');
  assert.throws(() => parseCardCheckout({ ...checkout, checkout_url: 'https://evil.example/checkout' }));
});

test('server selects embedded checkout and ignores client payment-mode overrides', async () => {
  const calls = [];
  const exports = {};
  class AuthError extends Error {}
  const compiled = ts.transpileModule(readFileSync(new URL('../src/app/api/checkout/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, Response, process: { env: {} }, require: name => {
    if (name === '@/lib/dyli') return { commerce: async (path, init) => {
      calls.push({ path, ...init, body: JSON.parse(init.body) });
      return { checkout: { stripe_session_id: 'cs_live_fixture' } };
    }, apiErrorResponse: error => Response.json({ error: error.message }, { status: 500 }) };
    if (name === '@/lib/privy-server') return { AuthError, authErrorResponse: () => null };
    if (name === '@/lib/live-server') return {
      requireLiveIdentity: async () => ({ externalCustomerId: 'verified-customer' }), customerFor: () => ({ external_customer_id: 'verified-customer' }),
      requestKey: () => 'stable-key', ownedQuoteResponse: async () => ({}),
    };
    if (name === '@/lib/commerce-runtime') return { checkoutReturnUrls: () => ({ successUrl: 'http://localhost:3000/?session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'http://localhost:3000/?checkout=cancelled' }) };
    if (name === '@/lib/runtime-server') return { loadCommerceRuntime: async () => ({}) };
    if (name === '@/lib/storefront-policy') return storefrontPolicy;
    throw Error(name);
  } });
  const result = await exports.POST({ json: async () => ({ action: 'card', quoteId: 'quote' }) });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(calls[0].body.ui_mode, 'embedded');
  assert.equal(calls[0].body.return_url, 'http://localhost:3000/?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(calls[0].body.success_url, undefined);
  assert.equal(calls[0].headers['Idempotency-Key'], 'stripe:stable-key');
  await exports.POST({ json: async () => ({ action: 'card', quoteId: 'quote', test: true, ui_mode: 'hosted', payment: { paid: true }, headers: { authorization: 'untrusted' } }) });
  assert.equal(calls[1].body.ui_mode, 'embedded');
  assert.equal(calls[1].body.return_url, calls[0].body.return_url);
  assert.equal(calls[1].body.test, undefined);
  assert.deepEqual(Object.keys(calls[1].headers), ['Idempotency-Key']);
});
