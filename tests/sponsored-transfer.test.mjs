import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi } from 'viem';
import { entryPoint07Abi, entryPoint07Address } from 'viem/account-abstraction';
import { encodeCallsMAv2 } from '@alchemy/smart-accounts';
import { sponsoredTransferReceipt } from '../src/lib/sponsored-transfer.mjs';

const wallet = '0x' + '1'.repeat(40), recipient = '0x' + '2'.repeat(40), token = '0x' + '3'.repeat(40);
function fixture({ success = true, extraCall = false, foreignEvent = false } = {}) {
  const transfer = { to: token, value: 0n,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipient, 1000000n] }) };
  const op = { sender: wallet, nonce: 0n, initCode: '0x', callData: encodeCallsMAv2(extraCall ? [transfer, transfer] : [transfer]),
    accountGasLimits: '0x' + '0'.repeat(64), preVerificationGas: 1n, gasFees: '0x' + '0'.repeat(64), paymasterAndData: '0x', signature: '0x' };
  const before = { address: entryPoint07Address, data: '0x', topics: encodeEventTopics({ abi: entryPoint07Abi, eventName: 'BeforeExecution' }) };
  const event = { address: entryPoint07Address, topics: encodeEventTopics({ abi: entryPoint07Abi, eventName: 'UserOperationEvent',
    args: { userOpHash: '0x' + 'a'.repeat(64), sender: foreignEvent ? recipient : wallet, paymaster: token } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'bool' }, { type: 'uint256' }, { type: 'uint256' }], [0n, success, 1n, 1n]) };
  const transferLog = { address: token, data: encodeAbiParameters([{ type: 'uint256' }], [1000000n]),
    topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: wallet, to: recipient } }) };
  return { wallet, token, transaction: { to: entryPoint07Address, from: recipient,
    input: encodeFunctionData({ abi: entryPoint07Abi, functionName: 'handleOps', args: [[op], recipient] }) },
    receipt: { to: entryPoint07Address, status: 'success', logs: [before, transferLog, event] } };
}

test('sponsored USDC receipt identifies the customer operation and isolates its transfer log', () => {
  const f = fixture(), result = sponsoredTransferReceipt(f);
  assert.equal(result.transaction.from, wallet); assert.equal(result.transaction.to, token);
  assert.deepEqual(result.receipt.logs, [f.receipt.logs[1]]);
  assert.equal(result.receipt.status, 'success');
  assert.equal(sponsoredTransferReceipt(fixture({ success: false })).receipt.status, 'reverted');
});

test('foreign operations, extra calls, duplicate events and missing execution boundaries are rejected', () => {
  for (const f of [fixture({ foreignEvent: true }), fixture({ extraCall: true })]) assert.throws(() => sponsoredTransferReceipt(f));
  const missing = fixture(); missing.receipt.logs.shift(); assert.throws(() => sponsoredTransferReceipt(missing));
  const wrongWallet = fixture(); wrongWallet.wallet = recipient; assert.throws(() => sponsoredTransferReceipt(wrongWallet));
  const duplicate = fixture(); duplicate.receipt.logs.push(duplicate.receipt.logs.at(-1)); assert.throws(() => sponsoredTransferReceipt(duplicate));
  const outerRevert = fixture(); outerRevert.receipt.status = 'reverted'; assert.throws(() => sponsoredTransferReceipt(outerRevert));
});
