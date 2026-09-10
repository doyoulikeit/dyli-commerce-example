import { apiErrorResponse, readApi } from "@/lib/dyli";
import { boxIsIncluded } from "@/lib/storefront-policy";

export async function GET(_request: Request, { params }: RouteContext<"/api/boxes/[id]">) {
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) return Response.json({ error: "Invalid box ID" }, { status: 400 });
    if (!boxIsIncluded(id)) return Response.json({ error: "Box not available" }, { status: 404 });
    const [box, ranges, history] = await Promise.all([
      readApi(`/boxes/${id}`),
      readApi(`/boxes/${id}/ranges?includeItems=true&pageSize=100`),
      readApi(`/boxes/${id}/history?include_box=false&pageSize=12`).catch(() => ({ pulls: [] })),
    ]);
    return Response.json({ box: box.box || box, ranges, history });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
