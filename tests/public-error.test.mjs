import test from 'node:test';
import assert from 'node:assert/strict';
import { publicApiError } from '../src/lib/public-error.ts';

test('provider failures never forward debug bodies or internal exception messages', () => {
  const result = publicApiError({ error: 'internal_error', message: 'private SQL exception', stack: 'private',
    details: { secret: 'private' }, request_id: 'request-123' }, 500);
  assert.equal(result.request_id, 'request-123');
  assert.equal(result.error, 'internal_error');
  assert.doesNotMatch(JSON.stringify(result), /private|SQL|stack|secret/);
  assert.equal(publicApiError({ error: '<html>provider traceback</html>' }, 502).error, 'request_failed');
});
test('address correction stays usable without leaking arbitrary provider fields', () => {
  const result = publicApiError({ error: 'address_correction_required', message: 'Confirm the recommended address',
    details: { recommended_address: { city: 'New York', postal_code: '10022', secret: 'private' }, provider: 'private' } }, 409);
  assert.equal(result.details.recommended_address.postal_code, '10022');
  assert.doesNotMatch(JSON.stringify(result), /private|secret|provider/);
});
