import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeOpeningPreferences, parseOpeningPreferences, openingPreferenceKey, shouldAutoSellPull, pendingAutoSellIndices, shouldSkipOpening } from '../src/lib/opening-preferences.ts';

const turbo = normalizeOpeningPreferences({ version: 1, mode: 'turbo', autoSell: { common: true, uncommon: true, rare: true }, autoSkip: true });

test('preferences are account-scoped, survive serialization and fail closed on malformed storage', () => {
  assert.equal(openingPreferenceKey(' 0xAbC '), openingPreferenceKey('0xabc'));
  assert.notEqual(openingPreferenceKey('customer-a'), openingPreferenceKey('customer-b'));
  assert.deepEqual(parseOpeningPreferences(JSON.stringify(turbo)), turbo);
  for (const raw of [null, '', '{', 'null', 'true', '42', '[]', '{"version":2,"mode":"turbo","autoSkip":true}']) {
    assert.deepEqual(parseOpeningPreferences(raw), normalizeOpeningPreferences());
  }
  assert.deepEqual(normalizeOpeningPreferences({ version: 1, mode: 'turbo', autoSell: { common: 'true', rare: 1 }, autoSkip: 'yes' }).autoSell,
    { common: false, uncommon: false, rare: false });
  assert.equal(normalizeOpeningPreferences().mode, 'normal');
});

test('auto-sell only selects supported opted-in rarities with a real buyback value', () => {
  for (const rarity of ['Common', ' UNCOMMON ', 'rare']) assert.equal(shouldAutoSellPull({ rarity, buyback_amount: 10 }, turbo), true);
  for (const rarity of ['Epic', 'Legendary', 'Mythical', '', null, undefined, 'Common / Rare']) assert.equal(shouldAutoSellPull({ rarity, buyback_amount: 10 }, turbo), false);
  for (const buyback_amount of [0, -1, NaN, Infinity, '10', undefined]) assert.equal(shouldAutoSellPull({ rarity: 'Common', buyback_amount }, turbo), false);
  assert.equal(shouldAutoSellPull({ rarity: 'Common', buyback_amount: 10 }, { ...turbo, mode: 'normal' }), false);
  assert.equal(shouldAutoSellPull({ rarity: 'Common', buyback_amount: 10 }, normalizeOpeningPreferences({ version: 1, mode: 'turbo' })), false);
  const rewards = ['Common', 'Common', 'Rare', 'Epic'].map(rarity => ({ rarity, buyback_amount: 12 }));
  assert.deepEqual(pendingAutoSellIndices(rewards, ['claim', 'sell_back'], turbo), [2]);
});

test('Auto Skip only changes multi-pull Turbo presentation, never normal or single pulls', () => {
  assert.equal(shouldSkipOpening(turbo, 10), true);
  assert.equal(shouldSkipOpening(turbo, 1), false);
  assert.equal(shouldSkipOpening({ ...turbo, mode: 'normal' }, 10), false);
  assert.equal(shouldSkipOpening({ ...turbo, autoSkip: false }, 10), false);
});

test('checkout freezes preferences in recovery without sending them as purchase authority', () => {
  const hook = readFileSync(new URL('../src/components/use-live-commerce.ts', import.meta.url), 'utf8');
  assert.match(hook, /openingPreferences: normalizeOpeningPreferences\(openingPreferences\)/);
  const page = readFileSync(new URL('../src/components/live-storefront.tsx', import.meta.url), 'utf8');
  assert.match(page, /preferences=\{normalizeOpeningPreferences\(flow.openingPreferences\)\}/);
  assert.match(page, /useOpeningPreferences\(commerce.address\)/);
  assert.doesNotMatch(hook, /Getting your price|Authorizing your order|Preparing your sponsored payment|Confirming balance payment/);
});
