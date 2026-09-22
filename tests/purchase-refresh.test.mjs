import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as live from '../src/lib/live-commerce.ts';
import * as preferences from '../src/lib/opening-preferences.ts';
import * as viem from 'viem';

const wallet = `0x${'a'.repeat(40)}`;
const hash = `0x${'b'.repeat(64)}`;
const item = { id: '12997', surface: 'boxes', purchase: { quoteItem: { type: 'box', box_id: 12997 } } };
const saved = { version: 1, wallet, key: 'fixture-key', item, quote: { id: 'quote' }, paymentHash: hash, paymentAttempted: true };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture({ failRefresh = false, failOpening = false, recovery = saved, boxResponse, sendTransaction, sessionResponse } = {}) {
  const state = [], refs = [], callbacks = [];
  let index = 0, refIndex = 0, callbackIndex = 0, effect;
  const calls = [];
  const storage = new Map([[`dyli-live-purchase-v1:${wallet}`, JSON.stringify(recovery)]]);
  const auth = { ready: true, authenticated: true, wallet: { address: wallet, switchChain: async () => {} }, getAccessToken: async () => 'fixture',
    sendTransaction: sendTransaction || (async () => { throw Error('Recovery must never send another payment'); }),
    signMessage: async () => { throw Error('An existing order must not be authorized again'); } };
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/components/use-live-commerce.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, URLSearchParams, setTimeout: callback => queueMicrotask(callback), clearTimeout, window: { location: { search: '' } },
    navigator: { locks: { request: async (_key, _options, callback) => callback({}) } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: async (path, init) => {
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ path, body });
      if (path.startsWith('/api/session')) return sessionResponse ? sessionResponse(path) : failRefresh ? Response.json({ error: 'temporary limit failure' }, { status: 503 })
        : Response.json({ identity: { walletAddress: wallet }, balance: { amount: '65', chain_id: 2741 }, orders: [] });
      if (path === '/api/checkout') return Response.json({ order: { id: 'paid-order', items: [] } });
      if (path === '/api/box-plays') return failOpening ? Response.json({ error: 'Opening unavailable; purchase saved' }, { status: 503 })
        : Response.json(boxResponse ? boxResponse(body) : { box_play: { id: 'saved-play', status: 'authorized', opening_reference: 'opening', rewards: [] } });
      throw Error(`Unexpected request ${path}`);
    }, require(name) {
      if (name === 'react') return {
        useState(initial) { const i = index++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
          return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
        useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; },
        useCallback(fn, deps) { const i = callbackIndex++; const prior = callbacks[i];
          if (!prior || deps.some((dep, j) => dep !== prior.deps[j])) callbacks[i] = { fn, deps };
          return callbacks[i].fn; },
        useEffect(fn) { effect = fn; },
      };
      if (name === '@/components/commerce-auth') return { useCommerceAuth: () => auth };
      if (name === '@/components/providers') return { useCommerceRuntime: () => ({}) };
      if (name === '@/lib/live-commerce') return live;
      if (name === '@/lib/opening-preferences') return preferences;
      if (name === 'viem') return viem;
      return {};
    },
  });
  const render = () => { index = refIndex = callbackIndex = 0; return exports.useLiveCommerce(); };
  return { render, mount: () => effect(), calls, storage };
}

test('a failed account refresh cannot turn a paid, saved opening into a failed payment', async () => {
  const f = fixture({ failRefresh: true }); f.render(); f.mount(); await flush();
  assert.equal(await f.render().resume(), true);
  await flush();
  const result = f.render();
  assert.equal(result.flow.orderId, 'paid-order');
  assert.equal(result.flow.paymentHash, hash);
  assert.equal(result.play.id, 'saved-play');
  assert.match(result.error, /payment is confirmed/);
  assert.equal(f.calls.filter(call => call.path === '/api/checkout').length, 1);
  assert.equal(f.calls.find(call => call.path === '/api/checkout').body.action, 'authorize');
});

const reward = { index: 0, product: { name: 'Saved pull' }, buyback_amount: 36.46 };
const transaction = { chain: 'abstract', chain_id: 2741, from: wallet, to: `0x${'c'.repeat(40)}`, value: '0', data: '0x12345678' };
const paidRecovery = { ...saved, orderId: 'paid-order', playId: 'saved-play', openingReference: 'old-opening', buyHash: hash, decisions: ['sell_back'] };

test('restarting a paid opening hides retained rewards and confirms the new buy before revealing', async () => {
  let sends = 0;
  const f = fixture({ recovery: paidRecovery, sendTransaction: async () => { sends++; return { hash }; },
    boxResponse: body => body.action === 'results'
      ? { box_play: { id: 'saved-play', status: 'revealed', opening_reference: 'new-opening', rewards: [reward] }, ready: true }
      : { box_play: { id: 'saved-play', status: 'buy_prepared', opening_reference: 'new-opening', rewards: [reward], transaction } },
  });
  f.render(); f.mount(); await flush();
  assert.equal(await f.render().resume(), true);
  assert.equal(f.render().play.rewards.length, 0);
  assert.equal(f.render().flow.buyHash, undefined);
  assert.equal(f.render().flow.decisions, undefined);
  assert.equal(await f.render().openBoxes(), true);
  assert.equal(sends, 1);
  assert.equal(f.render().play.rewards.length, 1);
  assert.equal(f.calls.filter(call => call.body?.action === 'results').length, 1);
  assert.ok(!f.calls.some(call => call.path === '/api/checkout'));
});

test('an expired sell returns to the opening controls and clears obsolete settlement state', async () => {
  const f = fixture({ recovery: paidRecovery, boxResponse: body => ({
    box_play: { id: 'saved-play', status: body.action === 'decision' ? 'restart_required' : 'revealed', opening_reference: 'old-opening', rewards: [reward] },
    ready: false, restart: body.action === 'decision',
  }) });
  f.render(); f.mount(); await flush(); await f.render().resume();
  assert.equal(await f.render().settle(), false);
  assert.equal(f.render().play.rewards.length, 0);
  assert.equal(f.render().flow.buyHash, undefined);
  assert.equal(f.render().flow.decisions, undefined);
  assert.equal(f.render().flow.orderId, 'paid-order');
});

test('uncertain settlement saves its exact transaction hash; retry checks its receipt without another signature', async () => {
  let sends = 0;
  const f = fixture({ recovery: paidRecovery,
    sendTransaction: async () => { sends++; throw Object.assign(Error('Submission is being checked'), { transactionHash: hash, broadcastAttempted: true }); },
    boxResponse: body => ({ box_play: { id: 'saved-play', status: body.action === 'finalize' ? 'completed' : 'revealed', opening_reference: 'old-opening', rewards: [reward], transaction }, ready: true }),
  });
  f.render(); f.mount(); await flush(); await f.render().resume();
  assert.equal(await f.render().settle(), false);
  assert.equal(f.render().flow.finalizeHash, hash);
  f.render().choose(0, 'claim');
  assert.equal(f.render().flow.decisions[0], 'sell_back');
  assert.equal(await f.render().settle(), true);
  assert.equal(sends, 1);
  assert.equal(f.calls.filter(call => call.body?.action === 'decision').length, 1);
  assert.equal(f.calls.find(call => call.body?.action === 'finalize').body.txHash, hash);
  assert.equal(f.render().flow, null);
});

test('opening errors still surface and preserve the paid order for recovery', async () => {
  const f = fixture({ failOpening: true }); f.render(); f.mount(); await flush();
  assert.equal(await f.render().resume(), false);
  assert.equal(f.render().flow.orderId, 'paid-order');
  assert.match(f.render().error, /Opening unavailable/);
});

test('overlapping refreshes share the request without persisting account data', async () => {
  const f = fixture(); const hook = f.render();
  const [a, b] = await Promise.all([hook.refresh(), hook.refresh()]);
  assert.deepEqual(a, b);
  assert.equal(f.calls.length, 1);
  assert.equal(f.storage.size, 1);
  assert.equal(JSON.parse([...f.storage.values()][0]).paymentHash, hash);
});

const accountSnapshot = (amount = '65', items = []) => ({
  identity: { walletAddress: wallet }, balance: { amount, chain_id: 2741 }, holdings: { items }, orders: [],
});
const settledPlay = body => ({ box_play: {
  id: 'saved-play', status: body.action === 'finalize' ? 'completed' : 'revealed',
  opening_reference: 'old-opening', rewards: [reward],
} });

test('settlement waits for a new balance and vault snapshot even with an older read in flight', async () => {
  let reads = 0, finishOldRead, finishFreshRead;
  const f = fixture({ recovery: { ...paidRecovery, finalizeHash: hash }, boxResponse: settledPlay,
    sessionResponse: path => {
      reads++;
      if (reads === 1) return Response.json(accountSnapshot());
      if (reads === 2) return new Promise(resolve => { finishOldRead = () => resolve(Response.json(accountSnapshot())); });
      assert.match(path, /fresh=1/);
      return new Promise(resolve => { finishFreshRead = () => resolve(Response.json(accountSnapshot('68.45', [{ token_id: '19569', name: 'Togekiss' }]))); });
    },
  });
  f.render(); f.mount(); await flush(); await f.render().resume();
  const oldRead = f.render().refresh(); await flush();
  let done = false;
  const settlement = f.render().settle().then(result => { done = true; return result; }); await flush();
  assert.equal(done, false);
  finishOldRead(); await oldRead; await flush();
  assert.equal(reads, 3, 'The pre-settlement read must not satisfy the refresh');
  assert.equal(done, false, 'Success must wait for the post-settlement snapshot');
  finishFreshRead();
  assert.equal(await settlement, true);
  assert.equal(f.render().session.balance.amount, '68.45');
  assert.equal(f.render().session.holdings.items[0].token_id, '19569');
  assert.equal(f.render().flow, null);
  assert.equal(f.calls.filter(call => call.body?.action === 'finalize').length, 1);
});

test('a temporary post-settlement refresh failure retries only the account read', async () => {
  let refreshes = 0;
  const f = fixture({ recovery: { ...paidRecovery, finalizeHash: hash }, boxResponse: settledPlay,
    sessionResponse: path => {
      if (!path.includes('fresh=1')) return Response.json(accountSnapshot());
      return ++refreshes === 1 ? Response.json({ error: 'Unavailable' }, { status: 503 })
        : Response.json(accountSnapshot('68.45', [{ token_id: '19569' }]));
    },
  });
  f.render(); f.mount(); await flush(); await f.render().resume();
  assert.equal(await f.render().settle(), true);
  assert.equal(refreshes, 2);
  assert.equal(f.render().session.balance.amount, '68.45');
  assert.equal(f.render().session.holdings.items.length, 1);
  assert.equal(f.render().error, '');
  assert.equal(f.calls.filter(call => call.body?.action === 'finalize').length, 1);
});

test('an unavailable account refresh preserves confirmed settlement and never retries a payment', async () => {
  const f = fixture({ recovery: { ...paidRecovery, finalizeHash: hash }, boxResponse: settledPlay,
    sessionResponse: path => path.includes('fresh=1') ? Response.json({ error: 'Unavailable' }, { status: 503 }) : Response.json(accountSnapshot()),
  });
  f.render(); f.mount(); await flush(); await f.render().resume();
  assert.equal(await f.render().settle(), true);
  assert.equal(f.calls.filter(call => call.path.includes('fresh=1')).length, 3);
  assert.equal(f.calls.filter(call => call.body?.action === 'finalize').length, 1);
  assert.equal(f.render().flow, null);
  assert.match(f.render().error, /choices are confirmed/);
});
