import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { acquireModalScroll } from '../src/lib/modal-scroll.ts';

test('checkout leaves the top layer during wallet approval and restores after it finishes', () => {
  let walletPrompt = false;
  let effect;
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const document = { body: { style: { overflow: 'auto' } } };
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/components/live-catalog.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, document, require: (name) => {
    if (name === 'react') return { useRef: () => ({ current: dialog }), useLayoutEffect: fn => { effect = fn; } };
    if (name === '@/components/providers') return { useWalletPrompt: () => walletPrompt };
    if (name === '@/lib/modal-scroll') return { acquireModalScroll };
    if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
    return {};
  } });
  exports.LiveModal({ title: 'Checkout', children: null, onClose() {} });
  const closeCheckout = effect();
  assert.equal(dialog.open, true);
  assert.equal(document.body.style.overflow, 'hidden');

  // React runs the old effect cleanup before the prompt-state effect.
  closeCheckout();
  walletPrompt = true;
  exports.LiveModal({ title: 'Checkout', children: null, onClose() {} });
  effect();
  assert.equal(dialog.open, false);
  assert.equal(document.body.style.overflow, 'auto');

  walletPrompt = false;
  exports.LiveModal({ title: 'Checkout', children: null, onClose() {} });
  const cleanup = effect();
  assert.equal(dialog.open, true);
  cleanup();
  assert.equal(dialog.open, false);
  assert.equal(document.body.style.overflow, 'auto');
});

test('overlapping checkout/progress sheets release the body lock in either order', () => {
  for (const reverse of [false, true]) {
    const document = { body: { style: { overflow: 'auto' } } };
    const releases = [acquireModalScroll(document), acquireModalScroll(document)];
    if (reverse) releases.reverse();
    releases[0]();
    assert.equal(document.body.style.overflow, 'hidden');
    releases[1]();
    assert.equal(document.body.style.overflow, 'auto');
    releases[1]();
    assert.equal(document.body.style.overflow, 'auto');
  }
});
