// Explicit mapping: never pass arbitrary error payload fields back as an address.
export function suggestedShippingAddress(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const fields = { name: "name", address1: "address_line_1", address2: "address_line_2", city: "city", state: "state", postal_code: "postal_code", country: "country_alpha2", phone: "phone" };
  const address = Object.fromEntries(Object.entries(fields).map(([key, sourceKey]) => [key, typeof source[sourceKey] === "string" ? source[sourceKey].trim() : ""]));
  return ["address1", "city", "state", "postal_code", "country"].every(key => address[key]) ? address : null;
}
