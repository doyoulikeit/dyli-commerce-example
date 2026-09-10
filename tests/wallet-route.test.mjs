import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as viem from 'viem';

const wallet = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const token = '0x84A71ccD554Cc1b02749b35d22F684CC8ec987e1';
const hash = `0x${'ab'.repeat(32)}`;
const units = 3123456n;
function routeFixture(options = {}) {
  const calls = [];
  class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const context = { token, chainId: 2741, client: {
    getTransactionReceipt: async () => {
      calls.push('receipt');
      if (options.pending) throw new viem.TransactionReceiptNotFoundError({ hash });
      if (options.rpcFailure) throw Error('RPC unavailable');
      return { status: options.failed ? 'reverted' : 'success', blockNumber: 5n,
        logs: options.missingLog ? [] : [{ address: options.wrongTokenLog ? recipient : token,
          topics: viem.encodeEventTopics({ abi: viem.erc20Abi, eventName: 'Transfer', args: { from: wallet, to: recipient } }),
          data: viem.encodeAbiParameters([{ type: 'uint256' }], [units]) }] };
    },
    getTransaction: async () => ({ from: options.foreign ? recipient : wallet, to: options.wrongToken ? recipient : token,
      input: viem.encodeFunctionData({ abi: viem.erc20Abi, functionName: options.approval ? 'approve' : 'transfer', args: [recipient, units] }) }),
    getBlock: async () => ({ timestamp: 1000000n }),
  } };
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/app/api/wallet/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, URL, Response, require(name) {
    if (name === 'viem') return viem;
    if (name === '@/lib/live-server') return { requireLiveContext: async (request, requested) => {
      calls.push('auth');
      if (!request.headers.get('authorization')) throw new AuthError(401, 'Sign in required');
      if (requested && requested !== wallet) throw new AuthError(403, 'Not your wallet');
      return { identity: { walletAddress: wallet }, readiness: {} };
    } };
    if (name === '@/lib/wallet-server') return { walletReadContext: () => context, readWalletBalance: async (_context, address) => {
      assert.equal(address, wallet); calls.push('balance'); return { amount: '7', currency: 'USDC', token, chain_id: 2741 };
    } };
    if (name === '@/lib/privy-server') return { AuthError, authErrorResponse: error => error instanceof AuthError ? Response.json({ error: error.message }, { status: error.status }) : null };
    if (name === '@/lib/dyli') return { apiErrorResponse: error => Response.json({ error: error.message }, { status: 503 }) };
    throw Error(`Unexpected dependency ${name}`);
  } });
  return { ...exports, calls };
}
const request = (query = `wallet=${wallet}&hash=${hash}`, auth = true) => new Request(`http://localhost/api/wallet?${query}`, { headers: auth ? { authorization: 'Bearer fixture' } : {} });

test('wallet read requires ownership and rejects invalid hashes before RPC', async () => {
  for (const [req, status] of [[request('', false), 401], [request(`wallet=${recipient}`), 403], [request(`wallet=${wallet}&hash=no`), 400]]) {
    const fixture = routeFixture();
    assert.equal((await fixture.GET(req)).status, status);
    assert.deepEqual(fixture.calls, ['auth']);
  }
});
test('deposit refresh is a private balance-only read, not a customer/order/payment write', async () => {
  const fixture = routeFixture();
  const response = await fixture.GET(request(`wallet=${wallet}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(fixture.calls, ['auth', 'balance']);
  assert.equal((await response.json()).balance.amount, '7');
  assert.equal(fixture.POST, undefined);
});
test('confirmation verifies sender, token, transfer calldata and matching USDC log', async () => {
  const fixture = routeFixture();
  const response = await fixture.GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).transfer, { hash, status: 'confirmed', recipient, amount: '3.123456', timestamp: 1000000 });
  for (const options of [{ foreign: true }, { wrongToken: true }, { approval: true }, { missingLog: true }, { wrongTokenLog: true }]) {
    assert.equal((await routeFixture(options).GET(request())).status, 400);
  }
});
test('pending, reverted and unavailable RPC responses remain distinct', async () => {
  assert.equal((await (await routeFixture({ pending: true }).GET(request())).json()).transfer.status, 'pending');
  assert.equal((await (await routeFixture({ failed: true, missingLog: true }).GET(request())).json()).transfer.status, 'failed');
  assert.equal((await routeFixture({ rpcFailure: true }).GET(request())).status, 503);
});
