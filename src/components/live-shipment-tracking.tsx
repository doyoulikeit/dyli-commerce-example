import { ArrowUpRight } from "lucide-react";
import { shipmentTracking } from "@/lib/activity";
import type { ApiRecord } from "@/lib/types";

export function LiveShipmentTracking({ shipment }: { shipment: ApiRecord }) {
  const parcels = shipmentTracking(shipment);
  if (!parcels.length) return <p className="lc-tracking-pending">Tracking will appear once assigned.</p>;

  return <ul className="lc-shipment-tracking" aria-label="Shipment tracking">
    {parcels.map(parcel => {
      const updated = new Date(parcel.updatedAt);
      return <li key={parcel.key}>
        <div className="lc-tracking-heading">
          {parcel.url ? <a href={parcel.url} target="_blank" rel="noopener noreferrer"
            aria-label={`Track shipment ${parcel.reference || ""} (opens in a new tab)`}>
            {parcel.reference || "Track shipment"}<ArrowUpRight size={14} aria-hidden="true" />
          </a> : parcel.reference ? <strong>{parcel.reference}</strong> : <span>Tracking not assigned yet</span>}
          <span className="lc-tracking-status">{parcel.status}</span>
        </div>
        {(parcel.carrier || (parcel.number && parcel.number !== parcel.reference)) && <small>
          {[parcel.carrier, parcel.number !== parcel.reference && parcel.number].filter(Boolean).join(" · ")}
        </small>}
        {!Number.isNaN(updated.getTime()) && <small>Updated <time dateTime={updated.toISOString()}>
          {updated.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </time></small>}
        {parcel.unavailable && <small>Latest carrier update unavailable. Check the tracking page for updates.</small>}
      </li>;
    })}
  </ul>;
}
