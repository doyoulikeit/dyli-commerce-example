import type { ApiRecord } from "./types";

const record = (value: unknown): ApiRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as ApiRecord : {};
const string = (value: unknown, max = 500) => typeof value === "string" ? value.slice(0, max) : undefined;

function address(value: unknown) {
  const input = record(value);
  return Object.fromEntries([
    "name", "email", "phone", "address_line_1", "address_line_2", "city", "state", "postal_code", "country_alpha2",
  ].flatMap(key => typeof input[key] === "string" ? [[key, string(input[key], 320)]] : []));
}

// Keep actionable customer errors, not arbitrary provider/debug response bodies.
export function publicApiError(payload: ApiRecord, status: number): ApiRecord {
  const code = typeof payload.error === "string" && /^[a-z][a-z0-9_]{0,99}$/.test(payload.error)
    ? payload.error : "request_failed";
  const requestId = typeof payload.request_id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(payload.request_id)
    ? payload.request_id : undefined;
  const output: ApiRecord = {
    error: code,
    message: status >= 500
      ? "This service is temporarily unavailable. Please retry."
      : string(payload.message) || "The request could not be completed.",
    ...(requestId ? { request_id: requestId } : {}),
  };
  if (code === "address_correction_required" && status < 500) {
    const details = record(payload.details);
    output.details = {
      submitted_address: address(details.submitted_address),
      recommended_address: address(details.recommended_address),
    };
  }
  if (code === "acceptance_exists" && status === 409) {
    const id = record(payload.details).acceptance_id;
    if (typeof id === "string" && /^[\da-f-]{36}$/i.test(id)) output.details = { acceptance_id: id };
  }
  return output;
}
