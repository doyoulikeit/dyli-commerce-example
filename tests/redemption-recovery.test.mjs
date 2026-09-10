import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShipmentRecovery, shipmentMayHaveBeenSent, redemptionNeedsRefresh, shippingOptionReference, redemptionDraft, isShippingQuoteError } from '../src/lib/redemption-recovery.ts';

const now = Date.parse('2026-09-10T12:00:00Z');
const quote = { id: 'shipment', status: 'quoted', expires_at: new Date(now + 600000).toISOString() };

test('expired and nearly expired quotes need refresh, including prepared quotes', () => {
  assert.equal(redemptionNeedsRefresh(quote, now), false);
  for (const status of ['quoted', 'prepared']) {
    for (const expires_at of [undefined, 'invalid', new Date(now - 1).toISOString(), new Date(now + 30000).toISOString()])
      assert.equal(redemptionNeedsRefresh({ ...quote, status, expires_at }, now), true);
    assert.equal(redemptionNeedsRefresh({ ...quote, status, expires_at: new Date(now + 30001).toISOString() }, now), false);
  }
  assert.equal(redemptionNeedsRefresh({ ...quote, status: 'expired' }, now), true);
  assert.equal(redemptionNeedsRefresh({ ...quote, status: 'processing' }, now), false);
});

test('a possible shipment submission always prevents starting over, even past expiry', () => {
  const expired = { ...quote, status: 'expired' };
  const hash = `0x${'1'.repeat(64)}`;
  assert.equal(shipmentMayHaveBeenSent(expired, { id: quote.id }), false);
  assert.equal(shipmentMayHaveBeenSent(expired, { id: quote.id, attempted: true }), true);
  assert.equal(shipmentMayHaveBeenSent(expired, { id: quote.id, hash }), true);
  assert.equal(shipmentMayHaveBeenSent({ ...expired, redemption_tx_hash: hash }, null), true);
  for (const status of ['processing', 'requires_action', 'completed', 'confirmed'])
    assert.equal(shipmentMayHaveBeenSent({ ...expired, status }, null), true);
});

test('unreadable recovery records fail closed instead of losing a possible payment', () => {
  assert.equal(parseShipmentRecovery(null), null);
  const saved = { id: quote.id, attempted: true };
  assert.deepEqual(parseShipmentRecovery(JSON.stringify(saved)), saved);
  for (const raw of ['broken', 'null', '{}', '{"id":"shipment","attempted":"yes"}', '{"id":"shipment","hash":"invalid"}'])
    assert.throws(() => parseShipmentRecovery(raw), /Check your wallet/);
});

test('fresh quotes retain item quantities and normalized address, but never payment data', () => {
  const draft = redemptionDraft({ ...quote,
    items: [{ token_id: '123', quantity: 2 }, { token_id: '456', quantity: 1 }],
    address: { name: 'Test Buyer', address_line_1: '123 Main St', address_line_2: 'Apt 2', city: 'New York', state: 'NY', postal_code: '10001', country_alpha2: 'US', phone: '5555555555', email: 'not-forwarded@example.com' },
    amount_cents: 999, transaction: { data: 'not-forwarded' },
  });
  assert.deepEqual(draft.quantities, { '123': 2, '456': 1 });
  assert.equal(draft.address.address1, '123 Main St');
  assert.equal(draft.address.postal_code, '10001');
  assert.equal(draft.address.address2, 'Apt 2');
  assert.equal(draft.address.email, undefined);
  assert.equal(draft.transaction, undefined);
});

test('courier identity is preferred over a positional quote ID', () => {
  assert.equal(shippingOptionReference({ id: 'option_0', courier_id: 'ups' }), 'ups');
  assert.equal(shippingOptionReference({ id: 'STANDARD' }), 'STANDARD');
  for (const code of ['redemption_quote_expired', 'shipping_option_required', 'shipping_option_unavailable', 'shipping_options_unavailable'])
    assert.equal(isShippingQuoteError(code), true);
  for (const code of ['redemption_processing', 'redemption_requires_action', 'transaction_pending'])
    assert.equal(isShippingQuoteError(code), false);
});
