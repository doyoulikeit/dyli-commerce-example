import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as recovery from '../src/lib/redemption-recovery.ts';
import { suggestedShippingAddress } from '../src/lib/shipping-address.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/live-redemption.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const wallet = `0x${'1'.repeat(40)}`, hash = `0x${'2'.repeat(64)}`;
const storageKey = `dyli-live-shipment-v1:${wallet}`;
const epoch = Date.parse('2026-09-10T12:00:00Z');

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function label(node) {
  if (Array.isArray(node)) return node.map(label).join('');
  return typeof node === 'string' ? node : label(node?.props?.children || []);
}

function fixture({ expired = false, prepared = false, saved = {}, failure = '', allowance = true } = {}) {
  let clock = epoch, cursor = 0, uuid = 0, effects = [], fail = failure;
  const states = [], deps = [], calls = [], storage = new Map();
  let record = {
    id: 'original', external_customer_id: 'customer', wallet_address: wallet,
    status: prepared ? 'prepared' : 'quoted', expires_at: new Date(epoch + (expired ? -1 : 600000)).toISOString(),
    items: [{ token_id: '123', quantity: 2, name: 'Collectible' }],
    address: { name: 'Test Buyer', address_line_1: '123 Main St', address_line_2: 'Apt 2', city: 'New York', state: 'NY', postal_code: '10001', country_alpha2: 'US', phone: '5555555555' },
    shipping_options: { manual: [{ id: 'option_0', courier_id: 'usps', carrier: 'USPS', amount: 8 }] },
    pricing: { amount: 8 }, payment: { token_address: `0x${'3'.repeat(40)}`, spender: `0x${'4'.repeat(40)}`, amount_cents: 800 },
    transaction: { chain: 'abstract', from: wallet, to: `0x${'4'.repeat(40)}`, data: '0x1234', value: '0' },
  };
  storage.set(storageKey, JSON.stringify({ id: record.id, ...saved }));
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const context = { exports, Date: FakeDate, Error, BigInt, JSON, process: { env: {} },
    crypto: { randomUUID: () => `key-${++uuid}` },
    window: { setInterval: () => 1, clearInterval() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    navigator: { locks: { request: async (_key, _options, callback) => callback({}) } },
    require: name => {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react') return {
        useState: initial => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
        useRef: initial => { const index = cursor++; return states[index] ||= { current: initial }; },
        useEffect: (effect, inputs) => { const index = cursor++; if (!deps[index] || inputs.some((value, i) => value !== deps[index][i])) { effects.push(effect); deps[index] = inputs; } },
      };
      if (name === 'viem') return { isAddress: value => /^0x[a-f\d]{40}$/i.test(value), erc20Abi: [], http: () => ({}), encodeFunctionData: () => '0xapproval', createPublicClient: () => ({ readContract: async () => allowance ? BigInt(1000000000) : BigInt(0), waitForTransactionReceipt: async () => { if (fail === 'after-approval') clock += 700000; return { status: 'success' }; } }) };
      if (name === 'viem/chains') return { abstract: {}, abstractTestnet: {} };
      if (name === '@/components/live-catalog') return { LiveModal: 'modal', Art: 'art' };
      if (name === '@/components/commerce-progress') return { CommerceProgress: 'progress' };
      if (name === '@/lib/live-commerce') return { asRecord: value => value && typeof value === 'object' ? value : {}, asRows: value => Array.isArray(value) ? value : [], assetImage: () => null, usd: value => `$${value}` };
      if (name === '@/lib/shipping-address') return { suggestedShippingAddress };
      if (name === '@/lib/abstract-rpc.mjs') return { abstractRpcUrl: () => undefined };
      if (name === '@/lib/redemption-recovery') return { ...recovery, redemptionNeedsRefresh: (value, now = clock) => recovery.redemptionNeedsRefresh(value, now) };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  const props = { holdings: [{ token_id: '123', balance: 3 }], session: { identity: { name: 'Test Buyer', walletAddress: wallet }, balance: { chain_id: 2741 } },
    api: async (_path, body) => {
      calls.push(JSON.parse(JSON.stringify(body)));
      if (body.action === 'get') return { redemption: structuredClone(record) };
      if (body.action === 'quote') {
        if (fail === 'refresh-once') { fail = ''; throw new Error('Connection lost'); }
        record = { ...record, id: 'refreshed', status: 'quoted', expires_at: new Date(clock + 600000).toISOString() };
      }
      if (body.action === 'prepare') {
        if (fail === 'unavailable') throw Object.assign(new Error('Unavailable'), { code: 'shipping_option_unavailable' });
        record = { ...record, status: 'prepared', expires_at: new Date(clock + 600000).toISOString() };
      }
      if (body.action === 'confirm') record.status = 'completed';
      return { redemption: structuredClone(record) };
    },
    send: async (tx, expiresAt) => {
      calls.push({ action: 'send', data: tx.data, expiresAt });
      if (fail === 'during-sign') { clock += 700000; throw Object.assign(new Error('Expired before broadcast'), { broadcastAttempted: false }); }
      if (fail === 'uncertain') throw Object.assign(new Error('Unknown submission'), { broadcastAttempted: true, code: 4001 });
      return hash;
    },
    onComplete: async () => {}, onClose() {},
  };
  const render = () => { cursor = 0; effects = []; const tree = exports.LiveRedemption(props); for (const effect of effects) effect(); return tree; };
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); return render(); };
  const button = (tree, name) => nodes(tree, node => node.type === 'button' && label(node.props.children) === name)[0];
  const click = async name => { const node = button(render(), name); assert.ok(node, `Expected button: ${name}`); assert.ok(!node.props.disabled); node.props.onClick(); return settle(); };
  render();
  return { render, settle, click, button, calls, storage, expire: () => { clock += 700000; } };
}

test('refresh retains quantities/address and retries a failed quote with one new idempotency key', async () => {
  const f = fixture({ expired: true, failure: 'refresh-once' });
  await f.settle();
  await f.click('Refresh delivery options');
  await f.click('Refresh delivery options');
  const quotes = f.calls.filter(c => c.action === 'quote');
  assert.equal(quotes.length, 2);
  assert.equal(quotes[0].idempotencyKey, quotes[1].idempotencyKey);
  assert.deepEqual(quotes[1].items, [{ tokenId: '123', quantity: 2 }]);
  assert.equal(quotes[1].address.address2, 'Apt 2');
  assert.equal(f.calls.some(c => c.action === 'send'), false);
  assert.equal(f.button(f.render(), 'Review shipment').props.disabled, true);
});

test('review uses courier identity and then sends one transaction with the prepared expiry', async () => {
  const f = fixture(); await f.settle();
  nodes(f.render(), node => node.type === 'input' && node.props.type === 'radio')[0].props.onChange();
  await f.click('Review shipment');
  assert.equal(f.calls.find(c => c.action === 'prepare').shippingSelection.manual, 'usps');
  await f.click('Confirm and ship');
  assert.equal(f.calls.filter(c => c.action === 'send').length, 1);
  assert.ok(f.calls.find(c => c.action === 'send').expiresAt);
  assert.equal(f.calls.filter(c => c.action === 'confirm').length, 1);
  assert.equal(f.storage.has(storageKey), false);
});

test('carrier loss shows refresh, not another payment button', async () => {
  const f = fixture({ failure: 'unavailable' }); await f.settle();
  nodes(f.render(), node => node.type === 'input' && node.props.type === 'radio')[0].props.onChange();
  const tree = await f.click('Review shipment');
  assert.ok(f.button(tree, 'Refresh delivery options'));
  assert.equal(f.calls.some(c => c.action === 'send'), false);
});

test('expiry while approving USDC refreshes options without submitting the shipment', async () => {
  const f = fixture({ prepared: true, allowance: false, failure: 'after-approval' }); await f.settle();
  await f.click('Confirm and ship');
  assert.deepEqual(f.calls.filter(c => c.action === 'send').map(c => c.data), ['0xapproval']);
  assert.equal(f.calls.some(c => c.action === 'quote'), true);
  assert.equal(f.calls.some(c => c.action === 'confirm'), false);
});

test('expiry during signing is safely refreshable only when no broadcast was attempted', async () => {
  const f = fixture({ prepared: true, failure: 'during-sign' }); await f.settle();
  const tree = await f.click('Confirm and ship');
  assert.ok(f.button(tree, 'Refresh delivery options'));
  assert.equal(JSON.parse(f.storage.get(storageKey)).attempted, undefined);
  assert.equal(f.calls.some(c => c.action === 'confirm'), false);
});

test('unknown broadcast stays locked even if an error also carries a rejection code', async () => {
  const f = fixture({ prepared: true, failure: 'uncertain' }); await f.settle();
  await f.click('Confirm and ship');
  assert.equal(JSON.parse(f.storage.get(storageKey)).attempted, true);
  assert.equal(f.button(f.render(), 'Change details'), undefined);
  assert.equal(f.button(f.render(), 'Refresh delivery options'), undefined);
  await f.click('Confirm and ship');
  assert.equal(f.calls.filter(c => c.action === 'send').length, 1);
});

test('an expired saved hash confirms the original shipment without repricing or paying again', async () => {
  const f = fixture({ expired: true, prepared: true, saved: { hash } }); await f.settle();
  await f.click('Confirm shipment');
  assert.equal(f.calls.some(c => ['send', 'quote', 'prepare'].includes(c.action)), false);
  assert.equal(f.calls.find(c => c.action === 'confirm').txHash, hash);
});
