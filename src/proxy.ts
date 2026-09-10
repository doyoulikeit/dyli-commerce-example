import { NextResponse, type NextRequest } from "next/server";
import { limitRequest, rateLimitResponse } from "@/lib/rate-limit";

export async function proxy(request: NextRequest) {
  try {
    await limitRequest(request);
    return NextResponse.next();
  } catch (error) {
    const response = rateLimitResponse(error);
    if (response) return response;
    throw error;
  }
}

export const config = { matcher: ["/api/:path*"] };
