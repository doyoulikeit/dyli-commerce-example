"use client";

import { LoaderCircle } from "lucide-react";
import { LiveModal } from "./live-catalog";

export function CommerceProgress({ message }: { message: string }) {
  return <LiveModal title={message} onClose={() => {}} dismissible={false} className="lc-working-modal">
    <div role="status" aria-live="polite" className="lc-working-content">
      <LoaderCircle className="lc-account-loading-spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  </LiveModal>;
}
