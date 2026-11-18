// Anonymous presentation only. No auth provider, signing, RPC or write requests.
import { createRoot } from 'react-dom/client';
import { Storefront } from '../../src/components/storefront';
import '../../src/app/globals.css';
import '../../src/components/commerce-styles.css';
const originalFetch = window.fetch.bind(window);
window.fixtureAudit = [];
window.fetch = (url, init) => {
  const target = new URL(String(url), location.origin);
  if ((init?.method || 'GET') !== 'GET') throw Error('Demo cannot submit transactions');
  if (target.pathname === '/api/storefront') return originalFetch('/fixtures/catalog');
  if (/^\/api\/(packs|boxes)\/\d+$/.test(target.pathname)) return originalFetch('/fixtures/box/' + target.pathname.split('/').pop());
  if (target.pathname.startsWith('/api/')) throw Error('Unexpected demo API request');
  return originalFetch(url, init);
};
const data = await (await fetch('/api/storefront')).json();
// Keep unpublished assets on this fixture origin, with no auth or proxy writes.
for (const item of [...data.packs, ...data.catalog]) {
  if (!item.raw?.artwork) continue;
  for (const [key,value] of Object.entries(item.raw.artwork)) if (key.endsWith('_url') && typeof value === 'string' && value.includes('/commerce-assets/')) item.raw.artwork[key] = new URL(new URL(value).pathname,location.origin).href;
  item.image = item.raw.artwork.poster_url;
}
createRoot(document.getElementById('root')).render(<Storefront initialStorefront={data} />);
