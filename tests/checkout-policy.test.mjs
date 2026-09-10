import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { storefrontPolicy, boxIsIncluded } from '../src/lib/storefront-policy.ts';
const compiled = ts.transpileModule(readFileSync(new URL('../src/app/api/checkout/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(env, { acknowledged = true, fee = 400 } = {}) {
  const exports = {}, calls = [];
  class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } }
  vm.runInNewContext(compiled, { exports, Response, process: { env }, require: name => {
    if (name === '@/lib/dyli') return { commerce: async (path, init) => {
      const body = JSON.parse(init.body); calls.push({ path, body });
      return path === '/quotes' ? { quote: { price_breakdown: { subtotal_cents: 7000, partner_fee_cents: fee, ...(acknowledged ? { fee_rules: body.fee_rules } : {}) } } } : {};
    }, apiErrorResponse: error => Response.json({ error: error.message }, { status: error.status || 500 }) };
    if (name === '@/lib/privy-server') return { AuthError, authErrorResponse: () => null };
    if (name === '@/lib/live-server') return { requireLiveIdentity: async () => ({ externalCustomerId: 'verified-customer' }),
      customerFor: () => ({ external_customer_id: 'verified-customer' }), requestKey: () => 'key' };
    if (name === '@/lib/storefront-policy') return { storefrontPolicy: () => storefrontPolicy(env), boxIsIncluded: id => boxIsIncluded(id, env) };
    if (['@/lib/commerce-runtime', '@/lib/runtime-server'].includes(name)) return {};
    throw Error(name);
  } });
  return { calls, quote: (boxId = 12997) => exports.POST({ json: async () => ({ quoteItem: { type: 'box', box_id: boxId, quantity: 2 }, fee_rules: { enabled: false }, feeRules: { enabled: false } }) }) };
}
test('shopper input cannot remove configured fees; server quotes carry per-box policy', async () => {
  const f = fixture({ FLAT_FEE: '2', INCLUDED_IDS: '12997' });
  assert.equal((await f.quote()).status, 200);
  assert.equal(f.calls[1].body.fee_rules.fixed_amount, 2);
  assert.equal(f.calls[1].body.fee_rules.per_unit, true);
  assert.equal(f.calls[1].body.items[0].quantity, 2);
  const before = f.calls.length;
  assert.equal((await f.quote(12998)).status, 404);
  assert.equal(f.calls.length, before);
});
test('unacknowledged or wrong fee totals stop checkout; explicit zero overrides saved fees', async () => {
  for (const options of [{ acknowledged: false }, { fee: 200 }]) {
    const f = fixture({ FLAT_FEE: '2' }, options);
    assert.equal((await f.quote()).status, 503);
    assert.deepEqual(f.calls.map(c => c.path), ['/customers/verified-customer', '/quotes']);
  }
  const f = fixture({ FLAT_FEE: '0' }, { fee: 0 });
  assert.equal((await f.quote()).status, 200);
  assert.equal(f.calls[1].body.fee_rules.enabled, false);
});
