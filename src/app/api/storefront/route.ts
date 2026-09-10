import { apiErrorResponse } from "@/lib/dyli";
import { loadStorefront } from "@/lib/storefront-server";

export async function GET() {
  try {
    return Response.json(await loadStorefront());
  } catch (error) {
    return apiErrorResponse(error);
  }
}
