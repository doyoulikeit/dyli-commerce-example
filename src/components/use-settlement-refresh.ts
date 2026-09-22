"use client";

import { useEffect, useRef, useState } from "react";

// A successful sale/shipment stays successful if the account read fails. Only
// retry that read, and keep the return button pending until it has finished.
export function useSettlementRefresh(complete: boolean, onSettled?: () => Promise<void>) {
  const [status, setStatus] = useState<"pending" | "ready" | "failed">("pending");
  const [attempt, setAttempt] = useState(0);
  const task = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (!complete) return;
    let active = true;
    task.current ||= Promise.resolve().then(() => onSettled?.());
    void task.current.then(
      () => { if (active) setStatus("ready"); },
      () => { if (active) setStatus("failed"); },
    );
    return () => { active = false; };
  }, [complete, onSettled, attempt]);
  return { status, retry: () => {
    task.current = null;
    setStatus("pending");
    setAttempt(value => value + 1);
  } };
}
