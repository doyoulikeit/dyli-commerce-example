import test from 'node:test';
import assert from 'node:assert/strict';
import { custom, encodeFunctionData, erc20Abi, keccak256, parseTransaction } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sendBaseTransaction } from '../src/lib/base-wallet.ts';

const account = privateKeyToAccount(`0x${'1'.repeat(64)}`);
const transfer = { chainId: 8453, to: `0x${'c'.repeat(40)}`, value: 0n,
  data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [`0x${'d'.repeat(40)}`, 35000000n] }) };

function fixture({ fail, chainId = 8453, balance = '0xde0b6b3a7640000', rateLimits = 0, onSign } = {}) {
  const calls = []; let raw;
  const provider = { request: async ({ method, params = [] }) => {
    calls.push({ method, params });
    if (method === fail) throw Error('RPC failure https://rpc.example/private-key raw=0xdeadbeef');
    if (method === 'eth_chainId') return `0x${chainId.toString(16)}`;
    if (method === 'eth_getTransactionCount') return '0x0';
    if (method === 'eth_getBalance') return balance;
    if (method === 'eth_gasPrice') return '0x5f5e100';
    if (method === 'eth_maxPriorityFeePerGas') return '0x1';
    if (method === 'eth_estimateGas') return '0x186a0';
    if (method === 'eth_getBlockByNumber') return { number: '0x1', baseFeePerGas: '0x5f5e100', timestamp: '0x1',
      gasLimit: '0x1c9c380', gasUsed: '0x0', transactions: [] };
    if (method === 'eth_signTransaction') {
      const tx = params[0]; onSign?.();
      raw = await account.signTransaction({ type: 'eip1559', chainId: Number(tx.chainId), nonce: Number(tx.nonce),
        to: tx.to, data: tx.data, value: BigInt(tx.value), gas: BigInt(tx.gas),
        maxFeePerGas: BigInt(tx.maxFeePerGas), maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas) });
      return raw;
    }
    if (method === 'eth_sendRawTransaction') {
      assert.equal(params[0], raw);
      if (rateLimits-- > 0) throw Object.assign(Error('Request rejected 429'), { code: 429 });
      return keccak256(raw);
    }
    throw Error(`Unexpected RPC ${method}`);
  } };
  const wallet = { address: account.address, switchChain: async () => {}, getEthereumProvider: async () => provider };
  return { calls, get raw() { return raw; }, send: (tx = transfer, options = {}) => sendBaseTransaction(wallet, tx, {
    address: account.address, rpcTransport: custom(provider, { retryCount: 0 }), ...options,
  }) };
}

test('Base USDC uses a standard EIP-1559 transaction with the exact recipient and amount', async () => {
  for (const chainId of [8453, 84532]) {
    const f = fixture({ chainId });
    const { hash } = await f.send({ ...transfer, chainId });
    const tx = parseTransaction(f.raw);
    assert.equal(tx.type, 'eip1559');
    assert.equal(tx.chainId, chainId);
    assert.equal(tx.to.toLowerCase(), transfer.to);
    assert.equal(tx.data, transfer.data);
    assert.equal(tx.value ?? 0n, 0n);
    assert.equal(hash, keccak256(f.raw));
    assert.equal(f.calls.filter(call => call.method === 'eth_sendRawTransaction').length, 1);
    assert.ok(!f.calls.some(call => call.method === 'eth_signTypedData_v4'));
  }
});

test('wrong wallet/network, insufficient gas and expired quotes fail before broadcast', async () => {
  for (const options of [{ address: `0x${'e'.repeat(40)}` }, { expiresAt: 'invalid' }, { expiresAt: new Date(0).toISOString() }]) {
    const f = fixture();
    await assert.rejects(f.send(transfer, options), error => error.broadcastAttempted === false);
    assert.equal(f.raw, undefined);
  }
  for (const config of [{ chainId: 84532 }, { balance: '0x0' }]) {
    const f = fixture(config);
    await assert.rejects(f.send(), error => error.broadcastAttempted === false);
    assert.equal(f.raw, undefined);
  }
  const f = fixture();
  await assert.rejects(f.send({ ...transfer, chainId: 1 }), /Base network/);
});

test('signing failures are retryable; uncertain submission retains the original transaction hash', async () => {
  for (const fail of ['eth_estimateGas', 'eth_signTransaction', 'eth_sendRawTransaction']) {
    const f = fixture({ fail });
    await assert.rejects(f.send(), error => {
      assert.equal(error.broadcastAttempted, fail === 'eth_sendRawTransaction');
      assert.equal(error.transactionHash, fail === 'eth_sendRawTransaction' ? keccak256(f.raw) : undefined);
      assert.doesNotMatch(error.message, /private-key|deadbeef|https:/);
      return true;
    });
  }
});

test('explicit rate limits retry identical bytes without another wallet signature', async () => {
  const f = fixture({ rateLimits: 1 }); await f.send();
  const sends = f.calls.filter(call => call.method === 'eth_sendRawTransaction');
  assert.equal(sends.length, 2);
  assert.deepEqual(sends[0].params, sends[1].params);
  assert.equal(f.calls.filter(call => call.method === 'eth_signTransaction').length, 1);
});
