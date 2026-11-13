import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baseRpcUrl } from '../src/lib/base-rpc.mjs';

test('optional Alchemy key follows the authoritative Base network', () => {
  assert.equal(baseRpcUrl(8453, { alchemyKey: ' example-key ' }), 'https://base-mainnet.g.alchemy.com/v2/example-key');
  assert.equal(baseRpcUrl(84532, { alchemyKey: 'example-key' }), 'https://base-sepolia.g.alchemy.com/v2/example-key');
  assert.equal(baseRpcUrl(8453), undefined);
  assert.equal(baseRpcUrl(84532, { alchemyKey: ' ' }), undefined);
  assert.throws(() => baseRpcUrl(1, { alchemyKey: 'example-key' }), /Unsupported/);
});

test('explicit RPC override wins and browser configuration cannot read server credentials', () => {
  assert.equal(baseRpcUrl(8453, { url: ' https://rpc.example ', alchemyKey: 'example-key' }), 'https://rpc.example');
  assert.equal(baseRpcUrl(8453, { alchemyKey: 'key/with?path' }), 'https://base-mainnet.g.alchemy.com/v2/key%2Fwith%3Fpath');
  const wallet = readFileSync(new URL('../src/lib/base-wallet.ts', import.meta.url), 'utf8');
  const rpc = readFileSync(new URL('../src/lib/base-rpc.mjs', import.meta.url), 'utf8');
  assert.match(wallet, /alchemyKey: process\.env\.NEXT_PUBLIC_ALCHEMY_API_KEY/);
  assert.doesNotMatch(wallet + rpc, /process\.env\.(ALCHEMY_API_KEY|DYLI_BASE_RPC_URL)/);
});
