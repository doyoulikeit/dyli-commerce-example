import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const wallet = `0x${'a'.repeat(40)}`, id = '11111111-1111-4111-8111-111111111111', hash = `0x${'b'.repeat(64)}`;
const compiled = ts.transpileModule(readFileSync(new URL('../src/app/api/offers/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture({ foreign = false, ready = true } = {}) {
  const calls = [], exports = {};
  class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } }
  vm.runInNewContext(compiled, { exports, Response, require(name) {
    if (name === '@/lib/live-server') return { requireLiveContext: async (request, address) => {
      if (!request.headers.get('authorization')) throw new AuthError(401, 'Sign in');
      if (address !== wallet) throw new AuthError(403, 'Wrong wallet');
      return { identity: { externalCustomerId: 'signed-in-user', walletAddress: wallet }, readiness: { capabilities: { post_vault_offers: { ready } } } };
    }, requestKey: value => { if (!value) throw new AuthError(400, 'Key required'); return value; } };
    if (name === '@/lib/privy-server') return { AuthError, authErrorResponse: error => error instanceof AuthError ? Response.json({ error: error.message }, { status: error.status }) : null };
    if (name === '@/lib/dyli') return { apiErrorResponse: () => Response.json({}, { status: 500 }), commerce: async (path, options) => {
      calls.push({ path, ...options });
      return { acceptance: { id, wallet_address: wallet, external_customer_id: foreign ? 'other-user' : 'signed-in-user' } };
    } };
    throw Error(name);
  } });
  return { calls, post: async (body, auth = true) => exports.POST(new Request('http://localhost/api/offers', {
    method: 'POST', headers: { ...(auth ? { authorization: 'Bearer fixture' } : {}), 'content-type': 'application/json' }, body: JSON.stringify({ walletAddress: wallet, ...body }),
  })) };
}
test('offer routes require authenticated ownership and server capability', async () => {
  for (const [options, body, auth, status] of [[{}, {}, false, 401], [{}, { walletAddress: 'foreign' }, true, 403], [{ ready: false }, { action: 'query' }, true, 503]]) {
    const f = fixture(options); assert.equal((await f.post(body, auth)).status, status); assert.equal(f.calls.length, 0);
  }
});
test('prepare binds authenticated customer and forwards only allowed offer input', async () => {
  const f = fixture();
  assert.equal((await f.post({ action: 'prepare', tokenId: '123', offerId: '77', expectedAmount: '75000000', idempotencyKey: 'sale-1234', external_customer_id: 'foreign', fee_rules: { percent: 50 }, recipient: 'foreign' })).status, 200);
  const request = f.calls[0]; assert.equal(request.path, '/offer-acceptances');
  assert.deepEqual(JSON.parse(request.body), { external_customer_id: 'signed-in-user', token_id: '123', offer_id: '77', expected_amount: '75000000' });
  assert.equal(request.headers['Idempotency-Key'], 'offer:sale-1234');
});
test('foreign acceptance cannot be read or confirmed; invalid hash never reaches confirmation', async () => {
  for (const action of ['get', 'confirm']) {
    const f = fixture({ foreign: true }); assert.equal((await f.post({ action, acceptanceId: id, txHash: hash })).status, 403);
    assert.equal(f.calls.length, 1);
  }
  const f = fixture(); assert.equal((await f.post({ action: 'confirm', acceptanceId: id, txHash: 'invalid' })).status, 400); assert.equal(f.calls.length, 1);
});
test('receipt recovery is still available if discovery is disabled', async () => {
  const f = fixture({ ready: false });
  assert.equal((await f.post({ action: 'confirm', acceptanceId: id, txHash: hash })).status, 200);
  assert.equal(f.calls[1].path, `/offer-acceptances/${id}/confirm`);
  assert.deepEqual(JSON.parse(f.calls[1].body), { tx_hash: hash });
});
