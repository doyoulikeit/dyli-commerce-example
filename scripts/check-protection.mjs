import { createHmac } from 'node:crypto';
import { createCommerceClient } from '../sdk/commerce-client.mjs';

// Explicit non-financial write: consumes one customer counter, never pays or opens.
try {
  const apiKey = process.env.DYLI_API_KEY?.trim();
  if (!apiKey) throw new Error('missing-key');
  const client = createCommerceClient({ apiKey, baseUrl: process.env.DYLI_COMMERCE_BASE_URL });
  const result = await client.request('/storefront/limits', { method: 'POST', body: {
    budget: 'customer', subject_hash: createHmac('sha256', apiKey).update('protection-preflight').digest('hex'),
  } });
  if (result.allowed !== true) throw new Error('unavailable');
  console.log('PASS Shared storefront protection is available. One non-financial counter was incremented.');
} catch {
  console.error('FAIL Check your Commerce key and DYLI storefront-protection availability. No payment was submitted.');
  process.exitCode = 1;
}
