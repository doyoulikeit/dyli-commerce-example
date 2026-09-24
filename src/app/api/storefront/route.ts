import { apiErrorResponse, commerce } from "@/lib/dyli";
import { loadStorefront } from "@/lib/storefront-server";
import { ensureCommunitySettings } from "@/lib/community-server";
import { publicStorefrontReadiness } from "@/lib/public-storefront";

export async function GET() {
  try {
    await ensureCommunitySettings();
    const [storefront, current] = await Promise.all([loadStorefront(), commerce("/")]);
    const readiness = publicStorefrontReadiness(current);
    return Response.json({ ...storefront, readiness, partner: readiness.partner }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
