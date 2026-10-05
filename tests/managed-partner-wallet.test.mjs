import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const wallet = `0x${'a'.repeat(40)}`;
const source = ts.transpileModule(readFileSync(new URL('../src/lib/managed-partner-wallet.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(identity) {
  const exports = {}, calls = [];
  vm.runInNewContext(source, { exports, require(name) {
    if (name === 'server-only') return {};
    if (name === './dyli') return { commerce: async (path, options) => { calls.push({ path, ...options }); return { identity }; } };
    throw Error(name);
  } });
  return { verify: exports.verifyManagedPartnerWallet, calls };
}

test('managed wallet helper pairs a backend-verified customer with the provider token and preserves trusted profile data', async () => {
  const f = fixture({ userId: 'user_clerk', externalCustomerId: 'user_clerk', walletAddress: wallet, email: 'untrusted@example.test' });
  const identity = await f.verify({ userId: 'user_clerk', email: 'verified@example.test' }, 'privy-wallet-token', wallet);
  assert.equal(identity.email, 'verified@example.test');
  assert.equal(f.calls[0].path, '/auth/session');
  assert.equal(f.calls[0].headers['x-customer-access-token'], 'privy-wallet-token');
  assert.deepEqual(JSON.parse(f.calls[0].body), { external_customer_id: 'user_clerk', wallet_address: wallet });
});

test('managed wallet helper rejects mismatched users, customer namespaces, wallets and malformed provider responses', async () => {
  for (const identity of [undefined,
    { userId: 'other', externalCustomerId: 'user_clerk', walletAddress: wallet },
    { userId: 'user_clerk', externalCustomerId: 'privy:clerk', walletAddress: wallet },
    { userId: 'user_clerk', externalCustomerId: 'user_clerk', walletAddress: 'invalid' },
    { userId: 'user_clerk', externalCustomerId: 'user_clerk', walletAddress: `0x${'b'.repeat(40)}` },
  ]) {
    await assert.rejects(fixture(identity).verify({ userId: 'user_clerk' }, 'wallet-token', wallet), error => error.status === 403);
  }
});
