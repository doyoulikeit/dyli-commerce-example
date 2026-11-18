// Anonymous presentation only. No auth provider, signing, RPC or write requests.
import { createRoot } from 'react-dom/client';
import { Storefront } from '../../src/components/storefront';
import '../../src/app/globals.css';
import '../../src/components/commerce-theme.css';
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
createRoot(document.getElementById('root')).render(<Storefront initialStorefront={data} />);
