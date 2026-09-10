import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const run = (script, args = []) => spawnSync(process.execPath, [fileURLToPath(new URL(`../scripts/${script}`, import.meta.url)), ...args], {
  encoding: 'utf8', env: { ...process.env, DYLI_API_KEY: '', DYLI_PARTNER_SLUG: '' },
});
test('doctor explains missing credentials and fails without making a network request', () => {
  const result = run('doctor.mjs');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Set DYLI_API_KEY in/);
  assert.doesNotMatch(result.stdout, /DYLI_PARTNER_SLUG/);
});
test('doctor discovers the application with only a key, even when an obsolete slug is configured', () => {
  const script = `
    import assert from 'node:assert/strict';
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(init.headers.get('x-api-key'), 'fixture-only-key');
      assert.equal(init.headers.has('x-partner-slug'), false);
      assert.equal(init.method, 'GET');
      return Response.json(url.endsWith('/bootstrap') ? {
        bootstrap_version: 1, integration: {application_id: 'app'}, partner: {slug: 'discovered-store'},
        auth: {mode: 'privy'}, wallet: {chain_id: 11124},
      } : {
        environment: 'lab', capabilities: {box_play: {contract_version: 'gacha', max_quantity: 10, ready: true}, writes: {enabled: true}, payments: ['stripe_card']},
      });
    };
    await import(${JSON.stringify(new URL('../scripts/doctor.mjs', import.meta.url).href)});
    assert.equal(calls, 2);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', env: { ...process.env, DYLI_API_KEY: 'fixture-only-key', DYLI_PARTNER_SLUG: 'obsolete-store',
      DYLI_COMMERCE_BASE_URL: 'https://lab.example/api/commerce/v1', DYLI_AUTH_MODE: '', DYLI_EXPECTED_ENVIRONMENT: 'lab',
      NEXT_PUBLIC_PRIVY_APP_ID: 'fixture-app', PRIVY_SECRET_KEY: 'fixture-secret', STOREFRONT_ORIGIN: 'https://shop.example' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PASS Application discovered from the Commerce key/);
  assert.doesNotMatch(result.stdout, /fixture-only-key|fixture-secret|obsolete-store/);
});
test('pilot configuration is dry-run by default and refuses empty or malformed allowlists', () => {
  const result = run('configure-box-pilot.mjs', ['--box-id=123', '--box-id=123']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no API request made/);
  assert.match(result.stdout, /"enabled": false/);
  for (const args of [[], ['--box-id=0'], ['--box-id=-1'], ['--box-id=YOUR_BOX_ID']]) {
    const invalid = run('configure-box-pilot.mjs', args);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Empty allowlists/);
  }
});
