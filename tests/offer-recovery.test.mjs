import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOfferRecovery, offerStorageKey, saleMayHaveBeenSent, settleVaultOffer } from '../src/lib/offer-recovery.ts';

const wallet = `0x${'a'.repeat(40)}`, hash = `0x${'b'.repeat(64)}`, approvalHash = `0x${'c'.repeat(64)}`;
const id = '11111111-1111-4111-8111-111111111111';
const saved = { wallet, tokenId: '123', key: 'offer-key-123', offerId: '77', expectedAmount: '75000000', id };
const tx = { chain: 'abstract', chain_id: 2741, from: wallet, to: `0x${'d'.repeat(40)}`, data: '0x1234', value: '0' };
function fixture({ approval = false, approved = false, failure = '', recovery = {}, status = 'prepared', expired = false } = {}) {
  let latest = { ...saved, ...recovery }, approvalDone = approved;
  const calls = [], states = [];
  const sale = { id, token_id: '123', wallet_address: wallet, status, transaction: tx,
    approval_transaction: approval ? { ...tx, data: '0xabcd' } : null, expires_at: new Date(Date.now() + (expired ? -1 : 600000)).toISOString() };
  const options = { sale, recovery: latest, save(value) { latest = structuredClone(value); states.push(latest); },
    progress() {}, approved: async () => approvalDone,
    send: async value => {
      const phase = value.data === '0xabcd' ? 'approval' : 'sale'; calls.push(phase);
      assert.equal(phase === 'approval' ? latest.approvalAttempted : latest.attempted, true);
      if (failure === 'rejected') throw Object.assign(Error('Rejected'), { broadcastAttempted: false });
      if (failure === 'uncertain') throw Object.assign(Error('Unknown broadcast'), { broadcastAttempted: true });
      if (failure === 'known-uncertain') throw Object.assign(Error('Unknown broadcast'), { broadcastAttempted: true, transactionHash: phase === 'approval' ? approvalHash : hash });
      return phase === 'approval' ? approvalHash : hash;
    },
    wait: async value => {
      calls.push(`wait:${value}`);
      assert.equal(value === approvalHash ? latest.approvalHash : latest.hash, value);
      if (failure === 'pending') throw Error('Still pending');
      if (value === approvalHash) approvalDone = true;
      return { status: failure === 'reverted' ? 'reverted' : 'success' };
    },
    confirm: async value => {
      calls.push('confirm'); assert.equal(value, hash); assert.equal(latest.hash, hash);
      if (failure === 'recording') throw Error('Recording pending');
      return { ...sale, status: 'completed', tx_hash: hash };
    },
  };
  return { run: () => settleVaultOffer(options), calls, states, latest: () => latest, options };
}
test('approval and sale persist attempts/hashes before the next async step', async () => {
  const f = fixture({ approval: true });
  assert.equal((await f.run()).status, 'completed');
  assert.deepEqual(f.calls, ['approval', `wait:${approvalHash}`, 'sale', `wait:${hash}`, 'confirm']);
  assert.equal(f.latest().approvalAttempted, false);
});
test('already-approved wallet signs only one acceptance', async () => {
  const f = fixture({ approval: true, approved: true });
  await f.run(); assert.equal(f.calls.includes('approval'), false); assert.equal(f.calls.filter(v => v === 'sale').length, 1);
});
test('definite wallet rejection clears only the attempt; uncertain broadcast is retained', async () => {
  for (const approval of [false, true]) {
    const rejected = fixture({ approval, failure: 'rejected' });
    await assert.rejects(rejected.run());
    assert.equal(approval ? rejected.latest().approvalAttempted : rejected.latest().attempted, false);
    const uncertain = fixture({ approval, failure: 'uncertain' });
    await assert.rejects(uncertain.run());
    assert.equal(approval ? uncertain.latest().approvalAttempted : uncertain.latest().attempted, true);
  }
});
test('unknown broadcasts never trigger a second send', async () => {
  for (const recovery of [{ attempted: true }, { approvalAttempted: true }]) {
    const f = fixture({ approval: true, recovery });
    await assert.rejects(f.run(), /wallet history/); assert.equal(f.calls.length, 0);
  }
});

test('uncertain approval and sale retain the signed hash and recover without another send for that phase', async () => {
  for (const approval of [false, true]) {
    const first = fixture({ approval, failure: 'known-uncertain' });
    await assert.rejects(first.run());
    assert.equal(approval ? first.latest().approvalHash : first.latest().hash, approval ? approvalHash : hash);
    const resumed = fixture({ approval, recovery: first.latest() });
    assert.equal((await resumed.run()).status, 'completed');
    assert.equal(resumed.calls.includes(approval ? 'approval' : 'sale'), false);
  }
});
test('known sale hash confirms after expiry without sending again', async () => {
  const f = fixture({ expired: true, status: 'requires_action', recovery: { hash, attempted: true } });
  assert.equal((await f.run()).status, 'completed'); assert.deepEqual(f.calls, [`wait:${hash}`, 'confirm']);
});
test('pending receipt and recording failure retain the hash for recovery', async () => {
  for (const failure of ['pending', 'recording']) {
    const f = fixture({ failure }); await assert.rejects(f.run());
    assert.equal(f.latest().hash, hash); assert.equal(f.latest().attempted, true);
  }
});
test('expired unsubmitted offers never open wallet prompts; reverted receipt allows retry', async () => {
  const expired = fixture({ expired: true }); await assert.rejects(expired.run(), /expired/); assert.equal(expired.calls.length, 0);
  const reverted = fixture({ failure: 'reverted' }); await assert.rejects(reverted.run(), /failed/);
  assert.equal(reverted.latest().hash, undefined); assert.equal(reverted.latest().attempted, false);
});
test('wallet/item scoped recovery accepts no foreign or malformed transaction data', () => {
  assert.equal(offerStorageKey(wallet.toUpperCase(), '123'), offerStorageKey(wallet, '123'));
  assert.equal(parseOfferRecovery(JSON.stringify(saved), wallet, '123').id, id);
  for (const patch of [{ wallet: tx.to }, { tokenId: '124' }, { hash: 'invalid' }, { approvalHash: 'invalid' }, { id: 'invalid' }]) {
    assert.equal(parseOfferRecovery(JSON.stringify({ ...saved, ...patch }), wallet, '123'), null);
  }
  assert.equal(saleMayHaveBeenSent({ status: 'requires_action' }, null), true);
});
