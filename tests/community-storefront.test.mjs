import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { publicStorefrontReadiness } from '../src/lib/public-storefront.ts';

test('runtime storefront applies settings before returning fresh sanitized capabilities', async () => {
  let synced = false;
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/app/api/storefront/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, Response, require(name) {
    if (name === '@/lib/community-server') return { ensureCommunitySettings: async () => { synced = true; } };
    if (name === '@/lib/storefront-server') return { loadStorefront: async () => ({ boxes: [{ id: 123 }], readiness: { stale: true }, partner: { stale: true } }) };
    if (name === '@/lib/public-storefront') return { publicStorefrontReadiness };
    if (name === '@/lib/dyli') return { commerce: async () => {
      assert.equal(synced, true);
      return { capabilities: { community: { marketplace: { ready: true, include_dyli: true } } }, partner: { display_name: 'Vaulted', webhook: { url: 'https://private.invalid/secret' } } };
    }, apiErrorResponse: () => Response.json({}, { status: 500 }) };
    throw Error(name);
  } });
  const response = await exports.GET(), body = await response.json();
  assert.equal(body.readiness.capabilities.community.marketplace.ready, true);
  assert.equal(body.readiness.capabilities.community.marketplace.include_dyli, true);
  assert.equal(body.boxes[0].id, 123);
  assert.doesNotMatch(JSON.stringify(body), /private.invalid|webhook|stale/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('static catalog/build loaders cannot mutate app settings', () => {
  for (const path of ['../src/app/page.tsx', '../src/lib/storefront-server.ts', '../src/lib/runtime-server.ts'])
    assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), 'utf8'), /ensureCommunitySettings|community-server|createCommunitySettingsSync/);
});
