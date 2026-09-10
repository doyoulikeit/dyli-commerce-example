import { createCommerceClient } from '../sdk/commerce-client.mjs';

const args = process.argv.slice(2);
const ids = args.filter(arg => arg.startsWith('--box-id=')).map(arg => Number(arg.slice(9)));
if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
  console.error('Supply at least one real --box-id=123. Empty allowlists would expose all Boxes and are rejected.');
  process.exit(1);
}
const name = args.find(arg => arg.startsWith('--name='))?.slice(7).trim();
const patch = {
  ...(name ? { display_name: name.slice(0, 100), branding: { name: name.slice(0, 100) } } : {}),
  catalog_rules: {
    show_boxes: true, show_primary: false, show_secondary: false, show_explore: false,
    show_ebay_psa: false, show_collections: false, show_fair_drops: false,
    show_digital_packs: false, show_search: false, show_redemptions: true,
    allowed_box_ids: [...new Set(ids)],
  },
  fee_rules: { enabled: false },
};
if (!args.includes('--apply')) {
  console.log('Preview only; no API request made. Add --apply to update this partner configuration.');
  console.log(JSON.stringify(patch, null, 2));
} else {
  try {
    const client = createCommerceClient({ apiKey: process.env.DYLI_API_KEY, baseUrl: process.env.DYLI_COMMERCE_BASE_URL });
    const result = await client.request('/config', { method: 'PATCH', body: patch });
    const saved = result.partner;
    if (JSON.stringify(saved?.catalog_rules?.allowed_box_ids) !== JSON.stringify(patch.catalog_rules.allowed_box_ids) || saved?.fee_rules?.enabled !== false) throw Error('Configuration verification failed');
    console.log('Partner Box allowlist and zero partner fee saved. Run doctor, then complete the payment and fulfillment acceptance checks.');
  } catch (error) {
    console.error(error?.status ? `Configuration returned HTTP ${error.status}; check credentials, scope and target environment.` : 'Configuration failed; check setup and retrieve /config before retrying.');
    process.exitCode = 1;
  }
}
