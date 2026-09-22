import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as viem from 'viem';
import * as chains from 'viem/chains';
import * as live from '../src/lib/live-commerce.ts';

const wallet = `0x${'1'.repeat(40)}`, contract = `0x${'2'.repeat(40)}`, usdc = `0x${'3'.repeat(40)}`;
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const walletSource = compile('../src/lib/wallet-server.ts'), metadataSource = compile('../src/lib/activity-items.ts');
const routeSource = compile('../src/app/api/session/route.ts');
const trackingOrder = { id: 123, shipment_id: 'ESUS360467167', tracking_number: null,
  tracking_url: 'https://www.trackmyshipment.co/shipment-tracking/ESUS360467167', shipment_status: 'in_transit',
  delivered: false, tracking_unavailable: false };

function fixture({ rpcFailure = false, metadataFailure = false } = {}) {
  const calls = [];
  const stale = { contract_address: contract, total_tokens: 2, total_balance: 4, items: [
    { token_id: '10', name: 'Sold card', balance: 1, estimated_unit_value_usd: 1.5, estimated_value_usd: 1.5 },
    { token_id: '11', name: 'Multiple copies', balance: 3, estimated_unit_value_usd: 2, estimated_value_usd: 6 },
  ] };
  const rpc = { getChainId: async () => 2741, readContract: async request => {
    calls.push({ action: request.functionName });
    if (request.functionName === 'balanceOf') return 101425000n;
    assert.equal(request.address, contract);
    assert.deepEqual(Array.from(request.args[0]), [wallet, wallet]);
    assert.deepEqual(Array.from(request.args[1]), [10n, 11n]);
    if (rpcFailure) throw Error('Unavailable');
    return [0n, 2n];
  } };
  const walletModule = {}, metadataModule = {}, exports = {};
  vm.runInNewContext(walletSource, { exports: walletModule, process: { env: {} }, require(name) {
    if (name === 'server-only') return {};
    if (name === 'viem') return { ...viem, createPublicClient: () => rpc };
    if (name === 'viem/chains') return chains;
    if (name === './abstract-rpc.mjs') return { abstractRpcUrl: () => undefined };
    if (name === './live-commerce') return live;
    throw Error(name);
  } });
  vm.runInNewContext(metadataSource, { exports: metadataModule, require: () => live });
  vm.runInNewContext(routeSource, { exports, URL, Response, require(name) {
    if (name === '@/lib/wallet-server') return walletModule;
    if (name === '@/lib/activity-items') return metadataModule;
    if (name === '@/lib/live-commerce') return live;
    if (name === '@/lib/live-server') return { customerFor: () => ({}), requireLiveContext: async () => ({
      identity: { externalCustomerId: 'customer', walletAddress: wallet },
      readiness: { capabilities: { box_play: { chain_id: 2741 }, post_vault_offers: { ready: true } }, payment: { crypto: { tokens: { abstract: usdc } } } },
    }) };
    if (name === '@/lib/privy-server') return { authErrorResponse: () => null };
    if (name === '@/lib/dyli') return {
      apiErrorResponse: error => Response.json({ error: error.message }, { status: 503 }),
      commerce: async path => path.startsWith('/offer-acceptances') ? { acceptances: [
        { id: 'sold', token_id: '10', status: 'completed', external_customer_id: 'customer', wallet_address: wallet },
        { id: 'foreign', token_id: '99', status: 'completed', external_customer_id: 'other', wallet_address: wallet },
      ] } : path.startsWith('/redemptions') ? { redemptions: [
        { id: 'shipment', external_customer_id: 'customer', status: 'completed', items: [{ token_id: '11' }], result: { orders: [trackingOrder] } },
        { id: 'foreign-shipment', external_customer_id: 'other', status: 'completed', items: [], result: { orders: [trackingOrder] } },
      ] } : {},
      readApi: async (path, options) => {
        calls.push({ path, options });
        if (path.startsWith('/holdings')) return structuredClone(stale);
        assert.equal(path, '/metadata/advanced?tokenIds=10,11');
        if (metadataFailure) throw Error('Artwork unavailable');
        return { items: [{ token_id: '10', name: 'Houndstone Holo', image_url: 'https://example.test/houndstone.webp' }] };
      },
    };
    throw Error(name);
  } });
  return { calls, get: fresh => exports.GET(new Request(`http://localhost/api/session?wallet=${wallet}${fresh ? '&fresh=1' : ''}`)) };
}

test('fresh account reads remove sold/shipped items and preserve remaining copies using actual chain balances', async () => {
  const f = fixture(), response = await f.get(true), snapshot = await response.json();
  assert.equal(response.status, 200);
  assert.equal(snapshot.balance.amount, '101.425');
  assert.deepEqual(snapshot.holdings.items.map(item => [item.token_id, item.balance, item.estimated_value_usd]), [['11', 2, 4]]);
  assert.equal(snapshot.holdings.total_tokens, 1);
  assert.equal(snapshot.holdings.total_balance, 2);
  assert.equal(f.calls.find(call => call.path?.startsWith('/holdings')).options.headers['Cache-Control'], 'no-cache');
  assert.equal(f.calls.filter(call => call.action === 'balanceOfBatch').length, 1);
  assert.equal(snapshot.offerAcceptances.length, 1);
  assert.equal(snapshot.offerAcceptances[0].status, 'completed');
  assert.equal(snapshot.offerAcceptances[0].item.name, 'Houndstone Holo');
  assert.equal(snapshot.offerAcceptances[0].item.image_url, 'https://example.test/houndstone.webp');
  assert.equal(snapshot.redemptions.length, 1);
  assert.equal(snapshot.redemptions[0].items[0].name, 'Multiple copies');
  assert.deepEqual(snapshot.redemptions[0].result.orders, [trackingOrder]);
});

test('RPC failure cannot return stale holdings as a successful refreshed account', async () => {
  assert.equal((await fixture({ rpcFailure: true }).get(true)).status, 503);
});

test('ordinary reads avoid extra ownership RPCs and missing artwork cannot block account refresh', async () => {
  const f = fixture({ metadataFailure: true }), response = await f.get(false);
  assert.equal(response.status, 200);
  assert.equal(f.calls.some(call => call.action === 'balanceOfBatch'), false);
  const snapshot = await response.json();
  assert.equal(snapshot.offerAcceptances[0].item.name, 'Sold card');
  assert.equal(snapshot.offerAcceptances[0].status, 'completed');
});
