import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredCommunitySettings, createCommunitySettingsSync } from '../src/lib/community-settings.ts';

test('only explicit server environment settings are considered', () => {
  assert.deepEqual(configuredCommunitySettings({ INCLUDE_DYLI_MARKETPLACE: 'true', TRADING_ENABLED: ' false ', NEXT_PUBLIC_MARKETPLACE_ENABLED: 'true' }), { trading_enabled: false, include_dyli_marketplace: true });
  assert.throws(() => configuredCommunitySettings({ MARKETPLACE_ENABLED: 'yes' }), /true or false/);
});
test('unset settings do not make any requests', async () => {
  await createCommunitySettingsSync({ env: {}, request: () => assert.fail('Unexpected API request') })();
});
test('runtime sync only patches differences, preserves unspecified policy and coalesces requests', async () => {
  let now = 0, calls = [], settings = { trading_enabled: false, include_dyli_marketplace: false };
  const sync = createCommunitySettingsSync({ env: { INCLUDE_DYLI_MARKETPLACE: 'true' }, now: () => now, request: async (path, init) => {
    calls.push({ path, init });
    if (init?.method === 'PATCH') settings = { ...settings, ...JSON.parse(init.body).community_settings };
    return { partner: { community_settings: settings } };
  } });
  await Promise.all([sync(), sync(), sync()]);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[1].init.body), { community_settings: { include_dyli_marketplace: true } });
  assert.equal(settings.trading_enabled, false);
  await sync(); assert.equal(calls.length, 2);
  now = 61000; await sync(); assert.equal(calls.length, 3); assert.equal(calls[2].init, undefined);
});
test('failed or unverifiable config stays closed, backs off, then retries', async () => {
  let now = 0, calls = 0, healthy = false;
  const sync = createCommunitySettingsSync({ env: { MARKETPLACE_ENABLED: 'false' }, now: () => now, request: async () => {
    calls++;
    return { partner: { community_settings: { marketplace_enabled: !healthy } } };
  } });
  await assert.rejects(sync(), /verify/);
  await assert.rejects(sync(), /verify/); assert.equal(calls, 2);
  healthy = true; now = 5001; await sync(); assert.equal(calls, 3);
});
