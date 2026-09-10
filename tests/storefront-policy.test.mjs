import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storefrontPolicy, boxIsIncluded } from '../src/lib/storefront-policy.ts';

test('box filters are optional, deduplicated and fail closed on invalid input', () => {
  assert.equal(boxIsIncluded(12997, {}), true);
  assert.deepEqual(storefrontPolicy({ INCLUDED_IDS: '12997, 12998,12997' }).includedIds, ['12997', '12998']);
  assert.equal(boxIsIncluded(12997, { INCLUDED_IDS: '12997' }), true);
  assert.equal(boxIsIncluded(12998, { INCLUDED_IDS: '12997' }), false);
  for (const ids of ['0', '-1', 'abc', '12997,', '12997.0', '1e3', '9007199254740992']) {
    assert.throws(() => storefrontPolicy({ INCLUDED_IDS: ids }), /INCLUDED_IDS/);
  }
});
test('named fee env selects per-box flat OR subtotal percentage and preserves zero', () => {
  assert.equal(storefrontPolicy({}).feeRules, undefined);
  assert.deepEqual(storefrontPolicy({ FLAT_FEE: '2' }).feeRules, {
    enabled: true, type: 'fixed', fixed_amount: 2, percent: 0, per_unit: true,
    minimum: null, maximum: null, label: 'Platform fee',
  });
  assert.equal(storefrontPolicy({ PERCENT_FEE: '2.50' }).feeRules.percent, 2.5);
  assert.equal(storefrontPolicy({ FLAT_FEE: '0' }).feeRules.enabled, false);
  for (const env of [{ FLAT_FEE: '2', PERCENT_FEE: '0' }, { FLAT_FEE: '-2' },
    { PERCENT_FEE: '101' }, { FLAT_FEE: '1.111' }, { FLAT_FEE: 'Infinity' }]) assert.throws(() => storefrontPolicy(env));
});
test('all entry points enforce selected boxes and only server config supplies quote fees', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const checkout = read('src/app/api/checkout/route.ts');
  assert.match(checkout, /boxIsIncluded\(item.box_id\)/);
  assert.match(checkout, /storefrontPolicy\(\).feeRules/);
  assert.doesNotMatch(checkout, /body\.fee_rules|body\.feeRules/);
  assert.match(checkout, /pricing\.partner_fee_cents !== expectedFee/);
  assert.match(read('src/app/api/boxes/[id]/route.ts'), /boxIsIncluded\(id\)/);
  assert.match(read('src/lib/storefront-server.ts'), /loadStorefrontBoxes\(\)/);
  assert.match(read('src/app/api/catalog/route.ts'), /loadStorefrontBoxes\(/);
});
