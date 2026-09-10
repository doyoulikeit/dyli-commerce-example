import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as preferences from '../src/lib/opening-preferences.ts';

function previewComponent() {
  const states = [];
  let cursor = 0;
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
      useRef: initial => ({ current: initial }), useEffect: effect => effects.push(effect),
    };
    if (name === 'motion/react') return { motion: { div: 'motion-div' }, useReducedMotion: () => false };
    if (name === '@/components/live-catalog') return { LiveModal: 'modal', Art: 'art' };
    if (name === '@/lib/opening-preferences') return preferences;
    if (name === '@/lib/live-commerce') return { assetImage: () => '/item.webp', usd: value => `$${value}`, settlementSummary: () => ({ sold: 0, claimed: 0, action: 'Confirm choices' }) };
    if (name === '@/lib/reveal') return { rarityAccent: () => '#888888' };
    return {};
  } });
  const render = props => { cursor = 0; effects = []; return exports.LiveReveal(props); };
  render.effects = () => effects[0](); // Choice-selection effect; artwork preload needs a browser.
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

test('paid reveal never offers mode settings, and opening locks controls while busy', () => {
  const render = previewComponent();
  const calls = [];
  const props = {
    play: { id: 'play', quantity: 1, rewards: [] }, item: { name: 'Box' }, decisions: [],
    busy: '', error: '', preferences: preferences.normalizeOpeningPreferences(),
    onOpen: () => calls.push(['open']), onChoose() {}, onSettle() {}, onClose() {},
  };
  const tree = render(props);
  assert.equal(nodes(tree, node => node.props?.['aria-label'] === 'Opening mode').length, 0);
  assert.doesNotMatch(readFileSync(new URL('../src/components/live-reveal.tsx', import.meta.url), 'utf8'), /RevealModeSelector|<small>Selected<\/small>/);
  assert.deepEqual(calls, []);
  const loading = render({ ...props, busy: 'Opening…' });
  assert.equal(nodes(loading, node => node.props?.className === 'vr-primary')[0].props.disabled, true);
  assert.equal(loading.props.dismissible, false);
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
