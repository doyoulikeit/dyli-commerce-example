import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as preferences from '../src/lib/opening-preferences.ts';

function previewComponent() {
  const states = [];
  let cursor = 0;
  const refs = [];
  let refCursor = 0;
  let effects = [];
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/components/live-reveal.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return {
      useState: initial => {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      },
      useRef: initial => {
        const index = refCursor++;
        return refs[index] ||= { current: initial };
      }, useEffect: effect => effects.push(effect),
    };
    if (name === 'motion/react') return { motion: { div: 'motion-div', article: 'motion-article' }, useReducedMotion: () => false };
    if (name === '@/components/use-reveal-sounds') return { useRevealSounds: () => ({ enabled: true, ready: false, interaction() {}, toggle() {}, unlock() {}, play() {} }) };
    if (name === '@/components/live-catalog') return { LiveModal: 'modal', Art: 'art' };
    if (name === '@/lib/pack-artwork') return { packArtwork: () => null, packPoster: () => '/pack.webp' };
    if (name === '@/lib/opening-preferences') return preferences;
    if (name === '@/lib/live-commerce') return { assetImage: () => '/item.webp', usd: value => `$${value}`, settlementSummary: () => ({ sold: 0, claimed: 0, action: 'Confirm choices' }) };
    if (name === '@/lib/reveal') return { rarityAccent: () => '#888888' };
    return {};
  } });
  const render = props => { cursor = 0; refCursor = 0; effects = []; return exports.LiveReveal(props); };
  render.effects = () => effects[0](); // Choice-selection effect; artwork preload needs a browser.
  render.openingEffect = () => effects[2]();
  return render;
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

test('Skip opens review without choosing, selling, vaulting or finalizing any reward', () => {
  const render = previewComponent();
  const writes = [];
  const props = {
    play: { id: 'play', quantity: 2, rewards: [0, 1].map(index => ({ index, product: { name: `Pull ${index}` }, buyback_amount: 10 })) },
    item: { name: 'Box' }, decisions: [], busy: '', error: '', preferences: preferences.normalizeOpeningPreferences(),
    onOpen() { writes.push('open'); }, onChoose() { writes.push('choose'); },
    onSettle() { writes.push('settle'); }, onClose() {},
  };
  const tree = render(props);
  assert.equal(tree.props.header, null, 'reveal supplies its own full-screen controls');
  nodes(tree, node => node.props?.className === 'vr-skip')[0].props.onClick();
  const review = render(props);
  render.effects();
  assert.equal(nodes(review, node => node.props?.className === 'vr-review-card').length, 2);
  assert.equal(nodes(review, node => node.props?.className === 'vr-primary')[0].props.disabled, true);
  assert.deepEqual(writes, []);
  const chosen = render({ ...props, decisions: ['claim', 'sell_back'] });
  const confirm = nodes(chosen, node => node.props?.className === 'vr-primary')[0];
  assert.equal(confirm.props.disabled, false);
  assert.deepEqual(writes, []);
  confirm.props.onClick();
  assert.deepEqual(writes, ['settle']);
});

test('paid reveal opens its existing order once, locks while pending and retries without settlement', () => {
  const render = previewComponent();
  const calls = [];
  const props = {
    play: { id: 'play', quantity: 1, rewards: [] }, item: { name: 'Box' }, decisions: [],
    busy: '', error: '', preferences: preferences.normalizeOpeningPreferences(),
    onOpen: () => calls.push('open'), onChoose() {}, onSettle: () => calls.push('settle'), onClose() {},
  };
  const tree = render(props);
  assert.equal(nodes(tree, node => node.props?.['aria-label'] === 'Opening mode').length, 0);
  assert.equal(nodes(tree, node => node.type === 'button' && node.props?.className === 'vr-idle-box').length, 0);
  render.openingEffect();
  render.openingEffect(); // React Strict Mode replays the same mounted effect.
  render(props);
  render.openingEffect(); // Parent callback identity changes cannot open twice.
  assert.deepEqual(calls, ['open']);
  const loading = render({ ...props, busy: 'Opening…' });
  render.openingEffect();
  assert.equal(loading.props.dismissible, false);
  assert.equal(nodes(loading, node => node.props?.className === 'vr-primary').length, 0);
  const retry = render({ ...props, error: 'Connection interrupted' });
  render.openingEffect();
  assert.deepEqual(calls, ['open'], 'errors never automatically retry');
  nodes(retry, node => node.props?.className === 'vr-primary')[0].props.onClick();
  assert.deepEqual(calls, ['open', 'open'], 'retry resumes the existing order, without settlement');
});

test('Auto Skip starts multi-pulls in review, selects only opted-in rarities, and never settles', () => {
  const render = previewComponent();
  const calls = [];
  const prefs = preferences.normalizeOpeningPreferences({ version: 1, mode: 'turbo', autoSkip: true, autoSell: { common: true } });
  const props = {
    play: { id: 'play', quantity: 3, rewards: [] }, item: { name: 'Box' }, decisions: [],
    busy: '', error: '', preferences: prefs,
    onOpen() { calls.push('open'); }, onChoose(index, choice) { calls.push([index, choice]); },
    onSettle() { calls.push('settle'); }, onClose() {},
  };
  render(props);
  props.play.rewards = ['Common', 'Rare', 'Common'].map((rarity, index) => ({ index, rarity, buyback_amount: 10, product: { name: rarity } }));
  props.decisions = ['claim'];
  const tree = render({ ...props, busy: 'Opening…' });
  assert.equal(nodes(tree, node => node.props?.className === 'vr-review-card').length, 3);
  render.effects();
  assert.deepEqual(calls, [], 'never changes decisions during a pending operation');
  render(props);
  render.effects();
  assert.deepEqual(calls, [[2, 'sell_back']], 'keeps the manual Vault choice and leaves Rare undecided');
  const selected = render({ ...props, decisions: ['claim', 'claim', 'sell_back'] });
  render.effects();
  assert.deepEqual(calls, [[2, 'sell_back']]);
  assert.equal(nodes(selected, node => node.props?.className === 'vr-primary')[0].props.disabled, false);
  nodes(selected, node => node.props?.className === 'vr-skip')[0].props.onClick();
  const back = render(props);
  assert.equal(nodes(back, node => node.props?.className === 'vr-review-card').length, 0, 'Back can inspect the reveal without being auto-skipped again');
});

test('bulk choices select eligible pulls but require an explicit final confirmation', () => {
  const render = previewComponent();
  const calls = [];
  const props = {
    play: { id: 'bulk', quantity: 3, rewards: [12, 0, 8].map((buyback_amount, index) => ({ index, product: { name: `Pull ${index}` }, buyback_amount })) },
    item: { name: 'Pack' }, decisions: [], busy: '', error: '', preferences: preferences.normalizeOpeningPreferences(),
    onOpen() {}, onChoose(index, choice) { calls.push([index, choice]); }, onSettle() { calls.push('settle'); }, onClose() {},
  };
  nodes(render(props), node => node.props?.className === 'vr-skip')[0].props.onClick();
  const review = render(props);
  const bulk = nodes(review, node => node.props?.className === 'vr-bulk-choices')[0];
  const buttons = nodes(bulk, node => node.type === 'button');
  buttons[0].props.onClick();
  assert.deepEqual(calls, [[0,'claim'],[1,'claim'],[2,'claim']]);
  calls.length = 0;
  buttons[1].props.onClick();
  assert.deepEqual(calls, [[0,'sell_back'],[2,'sell_back']], 'a pull without an available offer cannot be sold');
  assert.ok(!calls.includes('settle'));
  const locked = nodes(render({ ...props, busy: 'Confirming…' }), node => node.props?.className === 'vr-bulk-choices')[0];
  assert.ok(nodes(locked, node => node.type === 'button').every(node => node.props.disabled));
});

test('Normal multi-pulls start sealed and picking a pack changes presentation without settlement', () => {
  const render = previewComponent();
  const writes = [];
  const props = {
    play: { id: 'multi', quantity: 3, rewards: [0,1,2].map(index => ({ index, product: { name: `Pull ${index}` }, buyback_amount: 10 })) },
    item: { name: 'Pack' }, decisions: [], busy: '', error: '', preferences: preferences.normalizeOpeningPreferences(),
    onOpen() { writes.push('open'); }, onChoose() { writes.push('choice'); }, onSettle() { writes.push('settle'); }, onClose() {},
  };
  const grid = render(props);
  const packs = nodes(grid, node => node.props?.className === 'vr-grid-pack');
  assert.equal(packs.length, 3);
  assert.equal(packs[1].props['aria-label'], 'Rip pack 2');
  packs[1].props.onClick();
  const opened = render(props);
  assert.equal(nodes(opened, node => node.props?.className === 'vr-pack-grid').length, 0);
  assert.deepEqual(writes, []);
});

test('all ten paid pulls remain available in the sealed grid and review', () => {
  const render = previewComponent();
  const props = {
    play: { id: 'ten', quantity: 10, rewards: Array.from({length:10}, (_,index) => ({ index, product:{name:`Pull ${index + 1}`}, buyback_amount:10 })) },
    item:{name:'Pack'}, decisions:[], busy:'', error:'', preferences:preferences.normalizeOpeningPreferences(),
    onOpen(){}, onChoose(){}, onSettle(){assert.fail('presentation must not settle')}, onClose(){},
  };
  assert.equal(nodes(render(props), node => node.props?.className === 'vr-grid-pack').length, 10);
  nodes(render(props), node => node.props?.className === 'vr-skip')[0].props.onClick();
  assert.equal(nodes(render(props), node => node.props?.className === 'vr-review-card').length, 10);
});
