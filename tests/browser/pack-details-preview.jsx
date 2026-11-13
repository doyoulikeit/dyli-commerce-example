// Read-only layout preview. No wallet, login, payment or write transport.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LiveProductDetail } from "../../src/components/live-catalog";
import { LiveStorefront } from "../../src/components/live-storefront";
import { Storefront } from "../../src/components/storefront";
import { CommerceAuthContext } from "../../src/components/commerce-auth";
import "../../src/app/globals.css";
import "../../src/components/live-storefront.css";

const snapshot = await (await fetch("/api/storefront")).json();
const params = new URLSearchParams(location.search);
const packs = snapshot.packs || snapshot.boxes || [];
const item = packs.find(pack => pack.id === params.get("id"))
  || packs.find(pack => /gold.*silver/i.test(pack.name)) || packs[0];
if (!item) throw Error("The read-only catalog did not return a pack");
const guest = {
  ready: true, authenticated: false, login() {}, logout: async () => {},
  getAccessToken: async () => null,
  sendTransaction: async () => { throw Error("No wallet sends in this preview"); },
  signMessage: async () => { throw Error("No wallet signatures in this preview"); },
};
function Preview() {
  const [open, setOpen] = useState(true);
  if (params.get("mode") === "demo") return <Storefront initialStorefront={snapshot} />;
  if (params.get("mode") === "live") return <CommerceAuthContext.Provider value={guest}><LiveStorefront initialStorefront={snapshot} /></CommerceAuthContext.Provider>;
  return open ? <LiveProductDetail item={item} onClose={() => setOpen(false)} onCheckout={() => setOpen(false)} />
    : <p>Preview closed. No purchase was made.</p>;
}
createRoot(document.getElementById("root")).render(<Preview />);
