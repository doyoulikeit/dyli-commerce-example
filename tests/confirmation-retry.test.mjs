import test from 'node:test';
import assert from 'node:assert/strict';
import { retryConfirmation } from '../src/lib/confirmation-retry.mjs';

test('receipt propagation and temporary failures retry with bounded backoff', async () => {
  const waits = []; let calls = 0;
  const result = await retryConfirmation(async () => {
    calls++;
    if (calls === 1) throw Object.assign(Error('Not indexed'), { status: 409, code: 'transaction_not_confirmed' });
    if (calls === 2) throw Object.assign(Error('Unavailable'), { status: 503 });
    return 'completed';
  }, { sleep: async ms => { waits.push(ms); } });
  assert.equal(result, 'completed'); assert.deepEqual(waits, [600, 1200]);
});

test('invalid receipts, ownership failures, review requirements and real limits are not retried', async () => {
  for (const [status, code] of [[409, 'acceptance_event_mismatch'], [403, 'not_owned'], [409, 'redemption_requires_action'], [429, 'rate_limited']]) {
    let calls = 0;
    await assert.rejects(retryConfirmation(async () => { calls++; throw Object.assign(Error(code), { status, code }); },
      { sleep: async () => assert.fail('Must not retry') }));
    assert.equal(calls, 1);
  }
});

test('unavailable confirmation stops after four attempts', async () => {
  let calls = 0;
  await assert.rejects(retryConfirmation(async () => { calls++; throw Object.assign(Error('Unavailable'), { status: 503 }); }, { sleep: async () => {} }));
  assert.equal(calls, 4);
});
