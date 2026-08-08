import { NextResponse } from "next/server";
import { publicClientConfig } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(publicClientConfig());
}
