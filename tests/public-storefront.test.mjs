import test from 'node:test';
import assert from 'node:assert/strict';
import { publicStorefrontReadiness } from '../src/lib/public-storefront.ts';
import { shopEnabled } from '../src/lib/commerce-runtime.ts';

test('browser readiness preserves capabilities without exposing account configuration', () => {
  const result = publicStorefrontReadiness({
    secret: 'do-not-serialize',
    payment: { internal: 'do-not-serialize' },
    partner: { display_name: 'Example', webhook: { url: 'https://example.test/?token=private', secret: 'private' },
      catalog_rules: { show_explore: true, show_primary: false, show_secondary: false, internal: 'private' } },
    capabilities: { payments: ['usdc', 'stripe_card', 'internal'], box_play: { contract_version: 'gacha', secret: 'private' } },
  });
  assert.equal(shopEnabled(result), false);
  assert.equal(result.capabilities.box_play.contract_version, 'gacha');
  assert.deepEqual(result.capabilities.payments, ['usdc', 'stripe_card']);
  assert.doesNotMatch(JSON.stringify(result), /private|internal|secret|webhook|token/);
  assert.equal(publicStorefrontReadiness({}).capabilities.box_play.contract_version, null);
});
