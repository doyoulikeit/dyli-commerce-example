import { apiErrorResponse, readApi } from "@/lib/dyli";
import { boxIsIncluded } from "@/lib/storefront-policy";

export async function GET(_request: Request, { params }: RouteContext<"/api/packs/[id]">) {
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) return Response.json({ error: "Invalid pack ID" }, { status: 400 });
    if (!boxIsIncluded(id)) return Response.json({ error: "Pack not available" }, { status: 404 });
    const [box, ranges, history] = await Promise.all([
      readApi(`/packs/${id}`),
      readApi(`/packs/${id}/ranges?includeItems=true&pageSize=100`),
      readApi(`/packs/${id}/history?include_box=false&pageSize=12`).catch(() => ({ pulls: [] })),
    ]);
    const pack = box.pack || box.box || box;
    return Response.json({ pack, box: pack, ranges, history });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
