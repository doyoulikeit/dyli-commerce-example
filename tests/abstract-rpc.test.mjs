import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { abstractRpcUrl } from '../src/lib/abstract-rpc.mjs';

test('optional Alchemy key follows the authoritative Abstract network', () => {
  assert.equal(abstractRpcUrl(2741, { alchemyKey: ' example-key ' }), 'https://abstract-mainnet.g.alchemy.com/v2/example-key');
  assert.equal(abstractRpcUrl(11124, { alchemyKey: 'example-key' }), 'https://abstract-testnet.g.alchemy.com/v2/example-key');
  assert.equal(abstractRpcUrl(2741), undefined);
  assert.equal(abstractRpcUrl(11124, { alchemyKey: ' ' }), undefined);
  assert.throws(() => abstractRpcUrl(1, { alchemyKey: 'example-key' }), /Unsupported/);
});

test('explicit RPC override wins and browser configuration cannot read server credentials', () => {
  assert.equal(abstractRpcUrl(2741, { url: ' https://rpc.example ', alchemyKey: 'example-key' }), 'https://rpc.example');
  assert.equal(abstractRpcUrl(2741, { alchemyKey: 'key/with?path' }), 'https://abstract-mainnet.g.alchemy.com/v2/key%2Fwith%3Fpath');
  const wallet = readFileSync(new URL('../src/lib/abstract-wallet.ts', import.meta.url), 'utf8');
  const rpc = readFileSync(new URL('../src/lib/abstract-rpc.mjs', import.meta.url), 'utf8');
  assert.match(wallet, /alchemyKey: process\.env\.NEXT_PUBLIC_ALCHEMY_API_KEY/);
  assert.doesNotMatch(wallet + rpc, /process\.env\.(ALCHEMY_API_KEY|DYLI_ABSTRACT_RPC_URL)/);
});
