import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestedShippingAddress } from '../src/lib/shipping-address.ts';

test('carrier correction maps the corrected ZIP and apartment back to form fields', () => {
  const result = suggestedShippingAddress({ name: 'Test Customer', address_line_1: '305 E 51st St', address_line_2: 'Apt 4C', city: 'New York', state: 'NY', postal_code: '10022-6769', country_alpha2: 'US', phone: '5555555555', email: 'private@example.com', extra: 'discard' });
  assert.equal(result.postal_code, '10022-6769');
  assert.equal(result.address1, '305 E 51st St');
  assert.equal(result.address2, 'Apt 4C');
  assert.equal(result.country, 'US');
  assert.equal(result.extra, undefined);
  assert.equal(result.email, undefined);
});
test('malformed corrections do not replace the customer address', () => {
  for (const input of [null, [], 'invalid', {}, { address_line_1: 'Street', city: 'City' }]) assert.equal(suggestedShippingAddress(input), null);
});
