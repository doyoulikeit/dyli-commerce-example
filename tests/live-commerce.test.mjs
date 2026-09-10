import test from "node:test";
import assert from "node:assert/strict";
import {
  balancePaymentCents,
  parseRecovery,
  receiptRequired,
  validateTransaction,
  quantityLimit,
  checkoutOrigin,
  canClearBalanceRecovery,
  waitingForAccount,
  settlementSummary,
} from "../src/lib/live-commerce.ts";

const wallet = `0x${"a".repeat(40)}`;
test("settlement messaging distinguishes cash, vault, and mixed outcomes", () => {
  const rewards = [{ buyback_amount: 15.3 }, { buyback_amount: 7.2 }];
  const sell = settlementSummary(["sell_back", "sell_back"], rewards);
  assert.equal(sell.action, "Sell for $22.50");
  assert.equal(sell.success, "$22.50 added to your balance");
  assert.ok(!sell.progress.includes("vault"));
  const vault = settlementSummary(["claim", "claim"], rewards);
  assert.equal(vault.action, "Vault 2 items");
  assert.ok(!vault.progress.includes("cash"));
  const mixed = settlementSummary(["sell_back", "claim"], rewards);
  assert.equal(mixed.success, "$15.30 added to your balance · 1 vaulted");
  assert.equal(mixed.action, "Confirm sell & vault");
});
test("account loading hides missing or stale balances, but does not block signed-out browsing", () => {
  assert.equal(waitingForAccount(false, false, ""), true);
  assert.equal(waitingForAccount(true, false, ""), false);
  assert.equal(waitingForAccount(true, true, ""), true);
  assert.equal(waitingForAccount(true, true, wallet), true);
  assert.equal(waitingForAccount(true, true, wallet, `0x${"b".repeat(40)}`), true);
  assert.equal(waitingForAccount(true, true, wallet, wallet.toUpperCase()), false);
});
test("only unresolved balance attempts can be manually cleared", () => {
  const pending = { paymentAttempted: true };
  assert.equal(canClearBalanceRecovery(pending), true);
  assert.equal(canClearBalanceRecovery({ paymentHash: "0xabc" }), true);
  assert.equal(canClearBalanceRecovery(null), false);
  assert.equal(canClearBalanceRecovery({}), false);
  for (const field of ["stripeSessionId", "orderId", "playId", "buyHash", "finalizeHash"]) {
    assert.equal(canClearBalanceRecovery({ ...pending, [field]: "saved" }), false);
  }
});
test("production card returns never trust a caller-controlled Host header", () => {
  assert.equal(
    checkoutOrigin("https://store.example/", "https://untrusted.example", true),
    "https://store.example",
  );
  assert.equal(
    checkoutOrigin(undefined, "http://localhost:3000/api/checkout", false),
    "http://localhost:3000",
  );
  for (const origin of [
    undefined,
    "",
    "http://store.example",
    "https://user:secret@store.example",
    "javascript:alert(1)",
  ])
    assert.throws(() =>
      checkoutOrigin(origin, "https://untrusted.example", true),
    );
});
test("recovery is scoped to the wallet; incomplete broadcasts cannot be discarded", () => {
  const flow = {
    version: 1,
    key: "key",
    wallet,
    item: { id: "box" },
    paymentAttempted: true,
  };
  assert.equal(receiptRequired(flow), true);
  assert.deepEqual(parseRecovery(JSON.stringify(flow), wallet), flow);
  assert.equal(
    parseRecovery(JSON.stringify(flow), `0x${"b".repeat(40)}`),
    null,
  );
  assert.equal(parseRecovery("broken", wallet), null);
});
test("fresh quotes must be open, unexpired, correctly identified and integer-priced", () => {
  const quote = {
    id: "quote",
    status: "open",
    expires_at: new Date(600000).toISOString(),
    price_breakdown: { total_cents: 50100 },
  };
  assert.equal(balancePaymentCents(quote, "quote", 0), 50100);
  for (const patch of [
    { id: "other" },
    { status: "converted" },
    { expires_at: "invalid" },
    { expires_at: new Date(100000).toISOString() },
    { price_breakdown: { total_cents: 5.01 } },
    { price_breakdown: { total_cents: 0 } },
  ]) {
    assert.throws(() =>
      balancePaymentCents({ ...quote, ...patch }, "quote", 0),
    );
  }
});
test("opaque instructions are bound to the customer and network, and have zero ETH value", () => {
  const tx = {
    chain: "abstract",
    chain_id: 11124,
    from: wallet,
    to: `0x${"b".repeat(40)}`,
    data: "0x1234",
    value: "0",
  };
  assert.equal(validateTransaction(tx, wallet, 11124), tx);
  for (const patch of [
    { from: tx.to },
    { chain_id: 2741 },
    { value: "1" },
    { to: "invalid" },
    { data: "0x0" },
  ]) {
    assert.throws(() =>
      validateTransaction({ ...tx, ...patch }, wallet, 11124),
    );
  }
});
test("quantity controls cap boxes at ten and collectibles at one", () => {
  assert.equal(quantityLimit({ surface: "boxes", availability: 100 }), 10);
  assert.equal(quantityLimit({ surface: "boxes", availability: 2 }), 2);
  assert.equal(
    quantityLimit({ surface: "listings", availability: 10, purchase: {} }),
    1,
  );
});
