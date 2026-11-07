import test from 'node:test';
import assert from 'node:assert/strict';
import { activeVaultOffers, loadVaultOffers, loadVaultOfferSnapshot } from '../src/lib/vault-offers.ts';

const quote = (id, price, expiry, type = 'claim_buyback') => ({ id, price, type, expires_at: new Date(expiry).toISOString() });
test('the saved $1.50 claim expires at its original 48-hour deadline, leaving the live $1.18 standing offer', () => {
  const claimed = Date.parse('2026-09-22T17:29:46.889Z'), expires = claimed + 48 * 3600000;
  const offers = [quote('standing', 1.18, expires + 86400000, 'standing_buyback'), quote('claim', 1.5, expires)];
  assert.equal(activeVaultOffers(offers, expires - 1)[0].price, 1.5);
  assert.equal(activeVaultOffers(offers, expires)[0].price, 1.18);
  assert.equal(activeVaultOffers(offers, expires + 86400000).length, 0);
});
test('card and detail share a request, with customer isolation and an explicit fresh quote on retry', async () => {
  let calls = 0;
  const api = async () => { calls++; return { offers: [quote(String(calls), 1.5, Date.now() + 86400000)] }; };
  const [card, detail] = await Promise.all([loadVaultOffers(api, '19569'), loadVaultOffers(api, '19569')]);
  assert.deepEqual(card, detail); assert.equal(calls, 1);
  await loadVaultOffers(api, '19569'); assert.equal(calls, 1);
  await loadVaultOffers(api, '19569', true); assert.equal(calls, 2);
  const otherCustomer = async () => ({ offers: [] });
  assert.deepEqual(await loadVaultOffers(otherCustomer, '19569'), []);
});
test('vault discovery never runs more than two requests at once', async () => {
  let active = 0, maximum = 0;
  const api = async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return { offers: [] }; };
  await Promise.all(Array.from({ length: 8 }, (_, id) => loadVaultOffers(api, String(id))));
  assert.equal(maximum, 2);
});
test('authoritative zero ownership replaces cached offers and is distinct from an owned item without bids', async () => {
  let owned = true, calls = 0;
  const api = async () => { calls++; return { offers: [quote('old', 1.5, Date.now() + 86400000)], ownership: { owned } }; };
  assert.equal((await loadVaultOffers(api, '123')).length, 1);
  owned = false;
  assert.deepEqual(await loadVaultOfferSnapshot(api, '123', true), { offers: [], owned: false });
  assert.deepEqual(await loadVaultOffers(api, '123'), []); assert.equal(calls, 2);
  const otherCustomer = async () => ({ offers: [], ownership: { owned: true } });
  assert.deepEqual(await loadVaultOfferSnapshot(otherCustomer, '123'), { offers: [], owned: true });
});
test('balance/RPC failures remain retryable errors and never create a zero-ownership cache entry', async () => {
  let failed = true;
  const api = async () => { if (failed) throw Object.assign(Error('temporarily unavailable'), { status: 503 }); return { offers: [], ownership: { owned: true } }; };
  await assert.rejects(loadVaultOfferSnapshot(api, '123'), /temporarily unavailable/);
  failed = false;
  assert.equal((await loadVaultOfferSnapshot(api, '123')).owned, true);
});
