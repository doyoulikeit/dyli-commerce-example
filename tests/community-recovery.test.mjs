import test from 'node:test';
import assert from 'node:assert/strict';
import { communityRecovery, communityPending, mergeCommunityRecovery, settleCommunityAction } from '../src/lib/community.ts';

const wallet = `0x${'a'.repeat(40)}`, hash = `0x${'b'.repeat(64)}`, permission = `0x${'c'.repeat(64)}`;
const id = '11111111-1111-4111-8111-111111111111';
const tx = { chain: 'abstract', chain_id: 2741, from: wallet, to: `0x${'d'.repeat(40)}`, data: '0x1234', value: '0' };
function fixture({ approvals = false, expired = false, saved = {}, fail = '' } = {}) {
  let latest = { wallet, key: 'community-123', input: { kind: 'buy' }, id, ...saved }, approved = !approvals;
  const calls = [];
  const action = { id, kind: 'buy', wallet_address: wallet, status: 'prepared', transaction: tx, approvals: approvals ? [{ ...tx, data: '0xabcd' }] : [], expires_at: new Date(Date.now() + (expired ? -1 : 600000)).toISOString() };
  const options = { action, recovery: latest, save(value) { latest = structuredClone(value); }, progress() {}, approved: async () => approved,
    send: async instruction => {
      const approval = instruction.data === '0xabcd'; calls.push(approval ? 'approval' : 'send');
      assert.equal(approval ? latest.approval.attempted : latest.attempted, true);
      if (fail === 'rejected') throw Object.assign(Error('Rejected'), { broadcastAttempted: false });
      if (fail === 'uncertain') throw Object.assign(Error('Unknown broadcast'), { broadcastAttempted: true });
      if (fail === 'known') throw Object.assign(Error('Unknown broadcast'), { broadcastAttempted: true, transactionHash: approval ? permission : hash });
      return approval ? permission : hash;
    }, wait: async reference => {
      calls.push('wait'); assert.equal(reference === permission ? latest.approval.hash : latest.hash, reference);
      if (reference === permission) approved = true;
      return { status: fail === 'revert' ? 'reverted' : 'success' };
    }, confirm: async reference => { calls.push('confirm'); assert.equal(reference, hash); return { ...action, status: 'completed' }; },
  };
  return { run: () => settleCommunityAction(options), options, calls, latest: () => latest };
}
test('marketplace approvals, wallet send and confirmation persist before proceeding', async () => {
  const f = fixture({ approvals: true }); assert.equal((await f.run()).status, 'completed');
  assert.deepEqual(f.calls, ['approval', 'wait', 'send', 'wait', 'confirm']); assert.equal(f.latest().approval, undefined);
});
test('uncertain sends retain reference and cannot send twice after reload', async () => {
  for (const approvals of [true, false]) {
    const first = fixture({ approvals, fail: 'known' }); await assert.rejects(first.run());
    const again = fixture({ approvals, saved: first.latest() }); await again.run();
    assert.equal(again.calls.includes(approvals ? 'approval' : 'send'), false);
  }
});
test('uncertain sends without a reference are blocked; definite rejection is retryable', async () => {
  for (const approvals of [true, false]) {
    const first = fixture({ approvals, fail: 'uncertain' }); await assert.rejects(first.run()); assert.equal(communityPending(first.latest()), true);
    const again = fixture({ approvals, saved: first.latest() }); await assert.rejects(again.run()); assert.equal(again.calls.length, 0);
    const rejected = fixture({ approvals, fail: 'rejected' }); await assert.rejects(rejected.run()); assert.equal(communityPending(rejected.latest()), false);
  }
});
test('expired submitted action reconciles its receipt; expired new action never prompts', async () => {
  const pending = fixture({ expired: true, saved: { hash, attempted: true } }); await pending.run(); assert.deepEqual(pending.calls, ['wait', 'confirm']);
  const fresh = fixture({ expired: true }); await assert.rejects(fresh.run()); assert.deepEqual(fresh.calls, []);
});
test('reverted receipts clear attempts, not successful unknown confirmations', async () => {
  const f = fixture({ fail: 'revert' }); await assert.rejects(f.run()); assert.equal(communityPending(f.latest()), false);
  const pending = fixture(); pending.options.confirm = async () => { throw Error('recording'); };
  await assert.rejects(pending.run()); assert.equal(pending.latest().hash, hash); assert.equal(communityPending(pending.latest()), true);
});
test('recovery and execution reject foreign wallets and malformed hashes', async () => {
  const f = fixture(); assert.ok(communityRecovery(JSON.stringify(f.latest()), wallet));
  assert.equal(communityRecovery(JSON.stringify(f.latest()), 'foreign'), null);
  assert.equal(communityRecovery(JSON.stringify({ ...f.latest(), hash: 'wrong' }), wallet), null);
  f.options.action.wallet_address = `0x${'f'.repeat(40)}`; await assert.rejects(f.run()); assert.equal(f.calls.length, 0);
});
test('storage failure after broadcast preserves memory evidence and never resends', async () => {
  const f = fixture();
  let stored = f.latest(), memory = stored;
  const originalSave = f.options.save;
  f.options.save = value => {
    originalSave(value);
    memory = structuredClone(value);
    if (value.hash) throw Error('Storage quota exceeded');
    stored = structuredClone(value);
  };
  await assert.rejects(f.run());
  assert.equal(memory.hash, hash);
  assert.equal(stored.hash, undefined);
  const merged = mergeCommunityRecovery(stored, memory);
  assert.equal(merged.hash, hash);
  const again = fixture({ saved: merged });
  await again.run();
  assert.equal(again.calls.includes('send'), false);
  assert.equal(mergeCommunityRecovery(null, memory).hash, hash);
  assert.throws(() => mergeCommunityRecovery({ ...stored, key: 'another-action' }, memory));
});
test('storage failure before a wallet prompt prevents broadcasting', async () => {
  const f = fixture();
  f.options.save = () => { throw Error('Storage unavailable'); };
  await assert.rejects(f.run());
  assert.deepEqual(f.calls, []);
});
