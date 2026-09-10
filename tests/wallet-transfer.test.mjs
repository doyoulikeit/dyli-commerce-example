import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, erc20Abi } from 'viem';
import { makeWithdrawal, parseWithdrawal, pendingWithdrawal, reconcileWithdrawal, submitWithdrawal, usdcUnits, withdrawalKey } from '../src/lib/wallet-transfer.ts';

const wallet = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const token = '0x84A71ccD554Cc1b02749b35d22F684CC8ec987e1';
const hash = `0x${'ab'.repeat(32)}`;
const snapshot = { wallet, balance: { amount: '10.123456', currency: 'USDC', token, chain_id: 2741 } };
const draft = () => makeWithdrawal(recipient, '3.123456', snapshot, wallet);

test('withdrawals use exact six-decimal amounts and reject unsafe recipients or networks', () => {
  assert.equal(usdcUnits('3.123456'), 3123456n);
  assert.equal(makeWithdrawal(recipient, snapshot.balance.amount, snapshot, wallet).amount, snapshot.balance.amount);
  for (const amount of ['0', '-1', 'NaN', 'Infinity', '1e3', '.1', '1.0000001', '1,000', '11', '', '01', '9'.repeat(90)])
    assert.throws(() => makeWithdrawal(recipient, amount, snapshot, wallet));
  for (const to of ['', 'alice.eth', '0x123', wallet, token, `0x${'0'.repeat(40)}`, `0x${'0'.repeat(36)}dead`])
    assert.throws(() => makeWithdrawal(to, '1', snapshot, wallet));
  assert.throws(() => makeWithdrawal(recipient, '1', { ...snapshot, wallet: recipient }, wallet));
  assert.throws(() => makeWithdrawal(recipient, '1', { ...snapshot, balance: { ...snapshot.balance, chain_id: 1 } }, wallet));
  assert.throws(() => makeWithdrawal(recipient, '1', { ...snapshot, balance: { ...snapshot.balance, currency: 'ETH' } }, wallet));
});

test('a confirmed review rechecks balance, persists before send, and transfers only native Abstract USDC', async () => {
  const events = [];
  let saved = null;
  const record = await submitWithdrawal(draft(), {
    load: () => saved, read: async () => { events.push('balance'); return snapshot; },
    save: next => { events.push(next.status); saved = next; },
    send: async tx => {
      events.push('send');
      assert.equal(saved.status, 'submitting');
      assert.equal(tx.chain_id, 2741);
      assert.equal(tx.from, wallet);
      assert.equal(tx.to, token);
      assert.equal(tx.value, '0');
      const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
      assert.equal(decoded.functionName, 'transfer');
      assert.deepEqual(decoded.args, [recipient, 3123456n]);
      return hash;
    },
  });
  assert.deepEqual(events, ['balance', 'submitting', 'send', 'pending']);
  assert.equal(record.hash, hash);
  assert.equal(pendingWithdrawal(record), true);
  assert.deepEqual(parseWithdrawal(JSON.stringify(record), wallet), record);
  assert.throws(() => parseWithdrawal(JSON.stringify(record), recipient));
  assert.notEqual(withdrawalKey(wallet), withdrawalKey(recipient));
});

test('pending/corrupt recovery, insufficient fresh funds, network changes and blocked storage cannot send', async () => {
  let sends = 0;
  const dependencies = { read: async () => snapshot, load: () => null, save() {}, send: async () => { sends++; return hash; } };
  await assert.rejects(submitWithdrawal(draft(), { ...dependencies, load: draft }), /pending transfer/);
  await assert.rejects(submitWithdrawal(draft(), { ...dependencies, load: () => parseWithdrawal('{', wallet) }), /could not be read/);
  await assert.rejects(submitWithdrawal(draft(), { ...dependencies, read: async () => ({ ...snapshot, balance: { ...snapshot.balance, amount: '1' } }) }), /exceeds/);
  await assert.rejects(submitWithdrawal(draft(), { ...dependencies, read: async () => ({ ...snapshot, balance: { ...snapshot.balance, chain_id: 11124 } }) }), /network changed/);
  await assert.rejects(submitWithdrawal(draft(), { ...dependencies, save() { throw Error('Storage blocked'); } }), /Storage blocked/);
  assert.equal(sends, 0);
});

test('rejected signing is retryable, but ambiguous broadcasts remain locked across refresh', async () => {
  for (const broadcastAttempted of [false, true, undefined]) {
    let saved = null;
    await assert.rejects(submitWithdrawal(draft(), {
      read: async () => snapshot, load: () => saved, save: next => { saved = next; },
      send: async () => { throw Object.assign(Error('Wallet rejected or connection lost'), { broadcastAttempted }); },
    }));
    if (broadcastAttempted === false) assert.equal(saved, null);
    else assert.equal(pendingWithdrawal(parseWithdrawal(JSON.stringify(saved), wallet)), true);
  }
});

test('broadcast receipt stays recoverable in memory if storage fails after sending', async () => {
  let saved = null;
  await assert.rejects(submitWithdrawal(draft(), {
    read: async () => snapshot, load: () => saved,
    save: next => { if (next.hash) throw Error('Storage failed'); saved = next; },
    send: async () => hash,
  }), error => error.withdrawal?.hash === hash);
  assert.equal(saved.status, 'submitting', 'reload still blocks a second send');
});

test('only matching on-chain receipts resolve withdrawals; unknown and wrong receipts never do', () => {
  const record = { ...draft(), status: 'pending', hash };
  const receipt = { ...snapshot, transfer: { hash, status: 'confirmed', recipient, amount: record.amount, timestamp: Math.ceil(Date.now() / 1000) } };
  assert.equal(reconcileWithdrawal(record, receipt).status, 'confirmed');
  assert.equal(reconcileWithdrawal(record, { ...receipt, transfer: { ...receipt.transfer, status: 'failed' } }).status, 'failed');
  assert.equal(reconcileWithdrawal(record, { ...snapshot, transfer: { hash, status: 'pending' } }), record);
  for (const change of [{ recipient: wallet }, { amount: '1' }, { timestamp: 1 }, { hash: `0x${'cd'.repeat(32)}` }])
    assert.throws(() => reconcileWithdrawal(record, { ...receipt, transfer: { ...receipt.transfer, ...change } }), /does not match/);
  assert.throws(() => reconcileWithdrawal(record, { ...receipt, wallet: recipient }), /does not match/);
});
