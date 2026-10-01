import { NextResponse } from "next/server";
import { getDestinationWeather } from "@/lib/weather/service";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const result = await getDestinationWeather(slug);

  const headers: HeadersInit =
    result.status === "available"
      ? { "Cache-Control": "public, max-age=600" }
      : { "Cache-Control": "public, max-age=300" };

  const status =
    result.status === "unavailable" && result.reason === "unknown-destination"
      ? 404
      : 200;

  return NextResponse.json(result, { status, headers });
}