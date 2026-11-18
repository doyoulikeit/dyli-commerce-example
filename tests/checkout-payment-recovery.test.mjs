import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/app/api/checkout/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture({ errorCode = 'quote_expired', foreign = false, recovered = true } = {}) {
  const calls = [], exports = {};
  class DyliApiError extends Error { constructor(status, payload) { super(payload.error); Object.assign(this, { status, payload }); } }
  class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const commerce = async (path, init) => {
    calls.push({ path, init });
    if (path.startsWith('/orders?')) return { orders: [] };
    if (path.endsWith('/payment-authorization')) throw new DyliApiError(409, { error: errorCode });
    if (path.endsWith('/recover-payment')) {
      if (!recovered) throw new DyliApiError(409, { error: 'payment_refunded' });
      return { quote: { id: 'fresh-quote', price_breakdown: { total_cents: 500 } }, requires_new_payment: false,
        payment_verified: true, authorization: { message: 'fresh intent' } };
    }
    if (path === '/orders') return { order: { id: 'order-1' } };
    throw Error(`Unexpected API access: ${path}`);
  };
  vm.runInNewContext(compiled, { exports, Response, process: { env: {} }, require: name => {
    if (name === '@/lib/dyli') return { commerce, DyliApiError,
      apiErrorResponse: error => Response.json(error.payload || { error: error.message }, { status: error.status || 500 }) };
    if (name === '@/lib/privy-server') return { AuthError, authErrorResponse: () => null };
    if (name === '@/lib/live-server') return { customerFor: () => ({ external_customer_id: 'verified-customer' }),
      requireLiveIdentity: async () => ({ externalCustomerId: 'verified-customer', walletAddress: `0x${'a'.repeat(40)}` }),
      ownedQuoteResponse: async () => { if (foreign) throw new AuthError(403, 'Not your quote'); return { quote: {} }; },
      requestKey: value => value };
    if (['@/lib/commerce-runtime', '@/lib/runtime-server', '@/lib/storefront-policy'].includes(name)) return {};
    throw Error(name);
  } });
  const post = (body = {}) => exports.POST({ json: async () => ({ action: 'authorize', quoteId: 'old-quote',
    idempotencyKey: 'purchase-key', recoveryKey: 'recovery-key', txHash: `0x${'d'.repeat(64)}`, ...body }) });
  return { post, calls };
}
test('expired paid checkout recovers using the original transfer and verified customer without a second charge', async () => {
  const f = fixture();
  const response = await f.post();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.requires_new_payment, false);
  assert.equal(payload.quote.id, 'fresh-quote');
  const recovery = f.calls[2];
  assert.equal(recovery.path, '/quotes/old-quote/recover-payment');
  assert.equal(recovery.init.headers['Idempotency-Key'], 'recover:recovery-key');
  const body = JSON.parse(recovery.init.body);
  assert.equal(body.external_customer_id, 'verified-customer');
  assert.equal(body.payment.tx_hash, `0x${'d'.repeat(64)}`);
  assert.equal(body.payment.payer_signature, undefined);
  assert.equal(f.calls.some(c => c.path === '/quotes' || c.path === '/orders'), false);
});
test('refunded, pending, reused and foreign payments stop instead of silently starting a new checkout', async () => {
  for (const errorCode of ['payment_refunded', 'payment_refund_pending', 'payment_reused', 'payment_pending']) {
    const f = fixture({ errorCode });
    assert.equal((await f.post()).status, 409);
    assert.equal(f.calls.some(c => c.path.endsWith('/recover-payment')), false);
  }
  const f = fixture({ foreign: true });
  assert.equal((await f.post()).status, 403);
  assert.equal(f.calls.length, 0);
  assert.equal((await fixture({ recovered: false }).post()).status, 409);
});
test('confirmation uses the fresh quote and existing payment, never a replacement transfer', async () => {
  const f = fixture();
  assert.equal((await f.post({ action: 'confirm_balance', quoteId: 'fresh-quote', signature: 'fresh-signature' })).status, 200);
  assert.equal(f.calls.length, 1);
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.quote_id, 'fresh-quote');
  assert.equal(body.payment.tx_hash, `0x${'d'.repeat(64)}`);
  assert.equal(body.payment.payer_signature, 'fresh-signature');
  assert.equal(f.calls[0].init.headers['Idempotency-Key'], 'order:purchase-key');
});
