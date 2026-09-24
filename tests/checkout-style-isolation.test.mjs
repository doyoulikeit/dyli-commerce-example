import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

test('checkout status styles cannot resize Privy verification inputs', () => {
  const css = postcss.parse(readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8'));
  const statusRules = [];
  css.walkRules(rule => {
    if (!/\.(?:store-checkout-)?(success|processing)\b/.test(rule.selector)) return;
    statusRules.push(rule);
    for (const selector of rule.selectors) {
      assert.match(selector, /^(?:\.checkout-modal\s+\.(success|processing)|\.store-checkout-(success|processing))\b/,
        `Status rule escapes checkout: ${selector}`);
    }
  });
  assert.ok(statusRules.length > 0);
  assert.ok(statusRules.some(rule => rule.nodes.some(declaration =>
    declaration.prop === 'min-height' && declaration.value === '390px')),
  'Keep the existing checkout status layout while isolating it from Privy');
});
