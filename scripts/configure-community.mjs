import { createCommerceClient } from '../sdk/commerce-client.mjs';

const fields = { MARKETPLACE_ENABLED: 'marketplace_enabled', TRADING_ENABLED: 'trading_enabled',
  INCLUDE_DYLI_MARKETPLACE: 'include_dyli_marketplace', INCLUDE_DYLI_COLLECTORS: 'include_dyli_collectors' };
const settings = {};
for (const [variable, field] of Object.entries(fields)) {
  const value = process.env[variable]?.trim();
  if (!value) continue;
  if (!['true', 'false'].includes(value)) { console.error(`${variable} must be true or false.`); process.exit(1); }
  settings[field] = value === 'true';
}
if (!Object.keys(settings).length) { console.error('Set at least one community setting in .env.local first. See docs/MARKETPLACE-AND-TRADING.md.'); process.exit(1); }
const patch = { community_settings: settings };
if (!process.argv.includes('--apply')) {
  console.log('Preview only. Add --apply to save these settings on your DYLI Commerce app.');
  console.log(JSON.stringify(patch, null, 2));
} else {
  try {
    const client = createCommerceClient({ apiKey: process.env.DYLI_API_KEY, baseUrl: process.env.DYLI_COMMERCE_BASE_URL });
    const result = await client.request('/config', { method: 'PATCH', body: patch });
    if (Object.entries(settings).some(([key, value]) => result.partner?.community_settings?.[key] !== value)) throw new Error('Settings could not be verified');
    console.log('Community settings saved. Refresh the storefront to load the updated capabilities.');
  } catch (error) { console.error(error?.status ? `DYLI returned HTTP ${error.status}. Check your connection and app permissions.` : 'Could not save community settings. Check /config before retrying.'); process.exitCode = 1; }
}
