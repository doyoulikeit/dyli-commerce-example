import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, erc20Abi, keccak256, fromRlp, custom } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getGeneralPaymasterInput } from 'viem/zksync';
import { sendSponsoredAbstractTransaction } from '../src/lib/abstract-wallet.ts';

// Deterministic disposable signer, used only against this in-memory RPC. No
// network, real wallet, credentials or production transaction can be accessed.
const account = privateKeyToAccount(`0x${'1'.repeat(64)}`);
const paymaster = { chainId: 2741, address: `0x${'b'.repeat(40)}`, input: getGeneralPaymasterInput({ innerInput: '0x' }) };
const transfer = { chainId: 2741, to: `0x${'c'.repeat(40)}`, value: 0n,
  data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [`0x${'d'.repeat(40)}`, 35000000n] }) };
function parseTransaction(raw) {
  assert.equal(raw.slice(0, 4), '0x71');
  const fields = fromRlp(`0x${raw.slice(4)}`);
  return { type: 'eip712', to: fields[4], value: fields[5] === '0x' ? 0n : BigInt(fields[5]), data: fields[6], chainId: BigInt(fields[10]), paymaster: fields[15][0], paymasterInput: fields[15][1] };
}
function fixture({ fail, chainId = 2741, onSign } = {}) {
  const calls = []; let signed; let raw;
  const provider = { request: async ({ method, params = [] }) => {
    calls.push({ method, params });
    if (method === fail) throw Error(`Fixture rejected ${method}`);
    if (method === 'eth_chainId') return `0x${chainId.toString(16)}`;
    if (method === 'eth_getTransactionCount') return '0x0';
    if (method === 'eth_gasPrice') return '0x5f5e100';
    if (method === 'eth_maxPriorityFeePerGas') return '0x0';
    if (method === 'eth_estimateGas') return '0x493e0';
    if (method === 'eth_getBlockByNumber') return { number: '0x1', baseFeePerGas: '0x5f5e100', timestamp: '0x1', gasLimit: '0x1c9c380', gasUsed: '0x0', transactions: [] };
    if (method === 'eth_signTypedData_v4') {
      signed = JSON.parse(params[1]);
      onSign?.();
      return account.signTypedData(signed);
    }
    if (method === 'eth_sendRawTransaction') { raw = params[0]; return keccak256(raw); }
    throw Error(`Unexpected fixture RPC ${method}`);
  } };
  const walletCalls = [];
  const wallet = { address: account.address, switchChain: async () => {}, getEthereumProvider: async () => ({ request: async (request) => {
    walletCalls.push(request.method);
    if (!['eth_chainId', 'eth_signTypedData_v4'].includes(request.method)) throw Error('Unsupported transaction type: 0x71');
    return provider.request(request);
  } }) };
  return { calls, walletCalls, wallet, send: (tx = transfer, overrides = {}) => sendSponsoredAbstractTransaction(wallet, tx, { address: account.address, paymaster, rpcTransport: custom(provider, { retryCount: 0 }), ...overrides }), get signed() { return signed; }, get raw() { return raw; } };
}
test('balance transfer is signed and broadcast with native Abstract paymaster, exact USDC and zero ETH', async () => {
  const f = fixture(); const result = await f.send();
  const tx = parseTransaction(f.raw);
  assert.equal(result.hash, keccak256(f.raw));
  assert.equal(tx.type, 'eip712'); assert.equal(tx.paymaster.toLowerCase(), paymaster.address);
  assert.equal(tx.paymasterInput, paymaster.input); assert.equal(tx.data, transfer.data);
  assert.equal(tx.to.toLowerCase(), transfer.to); assert.equal(tx.value, 0n);
  assert.equal(Number(tx.chainId), 2741);
  assert.equal(f.calls.filter(call => call.method === 'eth_sendRawTransaction').length, 1);
  assert.ok(!f.calls.some(call => call.method === 'eth_sendTransaction'));
  assert.ok(f.walletCalls.every(method => ['eth_chainId', 'eth_signTypedData_v4'].includes(method)));
  assert.equal(f.walletCalls.filter(method => method === 'eth_signTypedData_v4').length, 1);
});
test('opening and settlement after card checkout use the same native sponsored sender', async () => {
  for (const data of ['0x12345678', '0xabcdef12']) {
    const f = fixture(); await f.send({ ...transfer, data });
    const tx = parseTransaction(f.raw);
    assert.equal(tx.paymaster.toLowerCase(), paymaster.address);
    assert.equal(tx.data, data); assert.equal(tx.value, 0n);
  }
});
test('missing sponsorship, wrong wallet/network and expired quotes fail before broadcast', async () => {
  for (const options of [{ paymaster: null }, { address: `0x${'e'.repeat(40)}` }, { paymaster: { ...paymaster, chainId: 11124 } }, { expiresAt: 'invalid' }, { expiresAt: new Date(0).toISOString() }]) {
    const f = fixture();
    await assert.rejects(f.send(transfer, options), error => error.broadcastAttempted === false);
    assert.equal(f.raw, undefined);
  }
  const wrongNetwork = fixture({ chainId: 11124 });
  await assert.rejects(wrongNetwork.send(), error => error.broadcastAttempted === false);
  assert.equal(wrongNetwork.raw, undefined);
});
test('preparation/signing failures are safely retryable; uncertain broadcasts never are', async () => {
  for (const fail of ['eth_estimateGas', 'eth_signTypedData_v4', 'eth_sendRawTransaction']) {
    const f = fixture({ fail });
    await assert.rejects(f.send(), error => error.broadcastAttempted === (fail === 'eth_sendRawTransaction'));
    assert.equal(f.calls.filter(call => call.method === fail).length, 1);
    if (fail !== 'eth_sendRawTransaction') assert.ok(!f.calls.some(call => call.method === 'eth_sendRawTransaction'));
  }
});
