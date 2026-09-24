import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/app/api/community/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const wallet = `0x${'a'.repeat(40)}`, id = '11111111-1111-4111-8111-111111111111', hash = `0x${'b'.repeat(64)}`;
function fixture(foreign = false) {
  const calls = [], exports = {};
  class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } }
  vm.runInNewContext(source, { exports, Response, URL, URLSearchParams, require(name) {
    if (name === '@/lib/live-server') return { requireLiveContext: async request => {
      if (!request.headers.get('authorization')) throw new AuthError(401, 'Sign in');
      return { identity: { externalCustomerId: 'signed-in-user', walletAddress: wallet } };
    }, requestKey: key => key };
    if (name === '@/lib/privy-server') return { AuthError, authErrorResponse: error => error instanceof AuthError ? Response.json({ error: error.message }, { status: error.status }) : null };
    if (name === '@/lib/dyli') return { apiErrorResponse: () => Response.json({}, { status: 500 }), commerce: async (path, options) => { calls.push({ path, ...options }); return { action: { id, wallet_address: wallet, external_customer_id: foreign ? 'another-user' : 'signed-in-user' } }; } };
    throw Error(name);
  } });
  return { calls, post: (body, auth = true) => exports.POST(new Request('http://localhost/api/community', { method: 'POST', headers: { ...(auth ? { authorization: 'Bearer fixture' } : {}), 'content-type': 'application/json' }, body: JSON.stringify({ walletAddress: wallet, ...body }) })), get: query => exports.GET(new Request(`http://localhost/api/community?${query}`)) };
}
test('every private community action requires login, and never proxies arbitrary routes', async () => {
  for (const action of ['prepare', 'trades', 'history', 'get', 'confirm', 'decline', 'holdings']) { const f = fixture(); assert.equal((await f.post({ action }, false)).status, 401); assert.equal(f.calls.length, 0); }
  const f = fixture(); assert.equal((await f.post({ action: '/config', path: '/config' })).status, 400); assert.equal(f.calls.length, 0);
});
test('prepare binds authenticated identity and strips client fees, target wallet, policy and calldata', async () => {
  const f = fixture(); await f.post({ action: 'prepare', idempotencyKey: 'community-123', input: { kind: 'list', token_id: '123', quantity: 1, external_customer_id: 'other', transaction: { to: 'attacker' }, include_dyli_marketplace: true, fee_rules: { percent: 50 } } });
  assert.deepEqual(JSON.parse(f.calls[0].body), { external_customer_id: 'signed-in-user', kind: 'list', token_id: '123', quantity: 1 });
});
test('public market cannot inject a customer, path or inclusion setting', async () => {
  const f = fixture(); await f.get('external_customer_id=another&include_dyli_marketplace=true&path=/config');
  assert.match(f.calls[0].path, /^\/community\/market\?/); assert.doesNotMatch(f.calls[0].path, /another|include_dyli|config/);
});
test('foreign actions cannot be viewed or confirmed and invalid references never reach settlement', async () => {
  for (const action of ['get', 'confirm']) { const f = fixture(true); assert.equal((await f.post({ action, id, txHash: hash })).status, 403); assert.equal(f.calls.length, 1); }
  const f = fixture(); assert.equal((await f.post({ action: 'confirm', id, txHash: 'invalid' })).status, 400); assert.equal(f.calls.length, 1);
});
test('trade history, decline and mine filters use the signed-in customer', async () => {
  const f = fixture(); await f.post({ action: 'trades', external_customer_id: 'foreign' }); assert.match(f.calls[0].path, /external_customer_id=signed-in-user/);
  await f.post({ action: 'decline', tradeId: '42', external_customer_id: 'foreign' }); assert.equal(JSON.parse(f.calls[1].body).external_customer_id, 'signed-in-user');
  await f.post({ action: 'market', mine: true, external_customer_id: 'foreign' }); assert.match(f.calls[2].path, /external_customer_id=signed-in-user/);
});
