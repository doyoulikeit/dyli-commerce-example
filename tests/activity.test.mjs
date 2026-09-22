import { test } from "node:test";
import assert from "node:assert/strict";
import { orderActivity, saleActivity, shipmentActivity } from "../src/lib/activity.ts";

const order = { id: "one", items: [{ type: "box", quantity: 3 }], price_breakdown: { total_cents: 10500 } };
const reward = { index: 0, product: { name: "Actual API product" }, buyback_amount: 29.03 };
test("activity shows quantity and joins only this order's actual rewards", () => {
  const result = orderActivity(order, [
    { id: "play", order_id: "one", status: "completed", decisions: ["sell_back", "claim"], rewards: [reward, { ...reward, index: 1 }] },
    { id: "other", order_id: "two", status: "completed", decisions: ["sell_back"], rewards: [reward] },
  ]);
  assert.equal(result.quantity, 3);
  assert.equal(result.total, 105);
  assert.equal(result.pulls.length, 2);
  assert.equal(result.sold, 1);
  assert.equal(result.vaulted, 1);
  assert.equal(result.cash, 29.03);
  assert.deepEqual(result.pulls.map(p => p.label), ["Sold", "Vaulted"]);
});
test("unconfirmed selections never appear as completed sales or cash", () => {
  const result = orderActivity(order, [{ id: "play", order_id: "one", status: "finalize_prepared", decisions: ["sell_back"], rewards: [reward] }]);
  assert.equal(result.pulls[0].label, "Sell selected");
  assert.equal(result.sold, 0);
  assert.equal(result.cash, 0);
  assert.deepEqual(orderActivity(order, []).pulls, []);
});

test("completed sales never offer continuation, and expiry cannot hide a pending receipt", () => {
  const sale = { expires_at: '2020-01-01', status: 'completed', tx_hash: '0xexisting' };
  assert.deepEqual(saleActivity(sale), { label: 'Sold', action: null });
  assert.deepEqual(saleActivity({ ...sale, status: 'processing' }), { label: 'Confirming sale', action: 'Check confirmation' });
  assert.deepEqual(saleActivity({ ...sale, status: 'expired', tx_hash: null }), { label: 'Offer expired', action: 'View sale' });
});

test("shipping activity distinguishes a paid request from tracking and delivery", () => {
  assert.equal(shipmentActivity({ status: 'completed' }), 'Shipment requested');
  assert.equal(shipmentActivity({ status: 'completed', result: { orders: [{ tracking_number: '123' }] } }), 'Tracking available');
  assert.equal(shipmentActivity({ status: 'completed', result: { orders: [{ delivered: true }] } }), 'Delivered');
});
