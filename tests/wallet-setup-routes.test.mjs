import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const wallet = `0x${'a'.repeat(40)}`;
const identity = { externalCustomerId: 'customer-a', walletAddress: wallet };
class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } }
const reply = error => Response.json({ error: error.message }, { status: error.status || 500 });
function fixture(kind, { foreignPlay = false, foreignWallet = false } = {}) {
  const calls = [], exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../src/app/api/wallet/${kind}/route.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, Response, require(name) {
    if (name === '@/lib/privy-server') return { AuthError, authErrorResponse: reply };
    if (name === '@/lib/live-server') return { requireLiveIdentity: async (_req, selected) => {
      if (selected !== wallet) throw new AuthError(403, 'Foreign wallet');
      return identity;
    }, requestKey: key => key };
    if (name === '@/lib/runtime-server') return { loadCommerceRuntime: async () => ({ walletRegistration: true,
      authMode: 'dyli_managed', packSponsorship: { chainId: 8453 } }) };
    if (name === '@/lib/dyli') return { apiErrorResponse: reply, commerce: async (path, options) => {
      calls.push({ path, options });
      if (!options) return { box_play: { id: 'play-a', external_customer_id: foreignPlay ? 'customer-b' : 'customer-a',
        wallet_address: foreignWallet ? `0x${'b'.repeat(40)}` : wallet } };
      return { ok: true };
    } };
    throw Error(name);
  } });
  const post = body => exports.POST(new Request('https://shop.example/api/wallet/' + kind, {
    method: 'POST', headers: { Authorization: 'Bearer customer-wallet-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: wallet, ...body }),
  }));
  return { calls, post };
}

test('wallet registration derives customer and wallet from the verified server identity', async () => {
  const f = fixture('registration');
  const result = await f.post({ action: 'prepare', idempotencyKey: 'registration-key', external_customer_id: 'attacker' });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(f.calls[0].path, '/customers/customer-a/wallet-authorizations');
  assert.equal(JSON.parse(f.calls[0].options.body).wallet_address, wallet);
  const rejected = await f.post({ action: 'prepare', walletAddress: `0x${'b'.repeat(40)}` });
  assert.equal(rejected.status, 403);
  assert.equal(f.calls.length, 1);
});

test('wallet confirmation cannot choose another customer or skip authorization validation', async () => {
  const f = fixture('registration');
  assert.equal((await f.post({ action: 'confirm', authorizationId: '../foreign' })).status, 400);
  assert.equal(f.calls.length, 0);
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal((await f.post({ action: 'confirm', authorizationId: id, signature: '0xsignature' })).status, 200);
  assert.equal(f.calls[0].path, `/customers/customer-a/wallet-authorizations/${id}/confirm`);
});

test('sponsorship rejects foreign customers, plays, wallets and unsupported scopes before any wallet write', async () => {
  for (const [config, body] of [
    [{}, { external_customer_id: 'customer-b' }],
    [{ foreignPlay: true }, {}],
    [{ foreignWallet: true }, {}],
    [{}, { item_gift_id: 'gift' }],
    [{}, { action: 'admin' }],
  ]) {
    const f = fixture('sponsorship', config);
    const result = await f.post({ action: 'intent', external_customer_id: 'customer-a', box_play_id: 'play-a', ...body });
    assert.ok(result.status >= 400);
    assert.ok(!f.calls.some(call => call.options));
  }
});

test('sponsored RPC forwards the current provider token and only the allowed scoped fields', async () => {
  const f = fixture('sponsorship');
  const result = await f.post({ action: 'rpc', external_customer_id: 'customer-a', box_play_id: 'play-a',
    intent: 'intent-a', method: 'eth_sendUserOperation', params: [], ignored: 'not-forwarded' });
  assert.equal(result.status, 200);
  const sent = f.calls.find(call => call.options);
  assert.equal(sent.path, '/wallet/rpc');
  assert.equal(sent.options.headers['x-customer-access-token'], 'customer-wallet-token');
  assert.deepEqual(JSON.parse(sent.options.body), { external_customer_id: 'customer-a', box_play_id: 'play-a',
    intent: 'intent-a', method: 'eth_sendUserOperation', params: [] });
});
