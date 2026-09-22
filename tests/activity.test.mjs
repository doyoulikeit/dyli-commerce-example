import { test } from "node:test";
import assert from "node:assert/strict";
import { orderActivity, saleActivity, shipmentActivity, shipmentTracking } from "../src/lib/activity.ts";

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

const withParcels = orders => ({ status: 'completed', result: { orders } });

test('Easyship IDs link to the resolved shipment even before a carrier number is assigned', () => {
  const shipment = withParcels([{ shipment_id: 'ESUS360467167', shipment_status: 'in_transit',
    tracking_url: 'https://example.test/old-shipment' }]);
  const [parcel] = shipmentTracking(shipment);
  assert.equal(parcel.reference, 'ESUS360467167');
  assert.equal(parcel.url, 'https://www.trackmyshipment.co/shipment-tracking/ESUS360467167');
  assert.equal(shipmentActivity(shipment), 'In transit');
});

test('merged orders share one tracking entry and provider outages retain its link', () => {
  const order = { shipment_id: 'ESUS360467167', tracking_number: 'CARRIER-123', tracking_unavailable: true };
  const tracking = shipmentTracking(withParcels([{ id: 1, ...order }, { id: 2, ...order }]));
  assert.equal(tracking.length, 1);
  assert.equal(tracking[0].number, 'CARRIER-123');
  assert.equal(tracking[0].unavailable, true);
  assert.equal(tracking[0].status, 'Tracking available');
  assert.ok(tracking[0].url);
});

test('split packages expose every tracking number and never mark partial delivery as complete', () => {
  const shipment = withParcels([{ shipment_id: 42, shipment_status: 'fulfilled', shipments: [
    { tracking_number: 'ONE', tracking_url: 'https://example.test/one', delivered: true },
    { tracking_number: 'TWO', tracking_url: 'https://example.test/two', shipment_status: 'OUT_FOR_DELIVERY' },
  ] }]);
  assert.deepEqual(shipmentTracking(shipment).map(parcel => [parcel.reference, parcel.status]), [
    ['ONE', 'Delivered'], ['TWO', 'Out for delivery'],
  ]);
  assert.equal(shipmentActivity(shipment), 'Partially delivered');
  assert.equal(shipmentActivity(withParcels([{ shipment_status: 'fulfilled' }])), 'Shipped');
  assert.equal(shipmentActivity(withParcels([{ shipment_status: 'Successfully Delivered' }])), 'Delivered');
});

test('manual tracking is readable without inventing links or trusting unsafe provider URLs', () => {
  for (const tracking_url of [null, '', 'javascript:alert(1)', 'data:text/html,unsafe', '/relative']) {
    const [parcel] = shipmentTracking(withParcels([{ tracking_number: 'MANUAL-123', tracking_url }]));
    assert.equal(parcel.reference, 'MANUAL-123');
    assert.equal(parcel.url, null);
  }
  assert.equal(shipmentTracking(withParcels([{ shipment_id: 'internal-order-id' }]))[0].reference, '');
  assert.equal(shipmentActivity(withParcels([{ shipment_status: 'pending' }])), 'Preparing shipment');
});
