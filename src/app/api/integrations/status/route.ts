import { NextResponse } from "next/server";
import { checkAllIntegrations } from "@/lib/integrations";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  let dbHealth;
  try {
    await db.execute(sql`SELECT 1`);
    dbHealth = {
      key: "postgres",
      name: "PostgreSQL",
      purpose: "Primary database",
      status: "connected" as const,
      latencyMs: Date.now() - start,
      detail: "query ok",
    };
  } catch (error) {
    dbHealth = {
      key: "postgres",
      name: "PostgreSQL",
      purpose: "Primary database",
      status: "unreachable" as const,
      latencyMs: Date.now() - start,
      detail: error instanceof Error ? error.message : "connection failed",
    };
  }

  const integrations = await checkAllIntegrations();
  const all = [dbHealth, ...integrations];
  const summary = {
    total: all.length,
    connected: all.filter((i) => i.status === "connected").length,
    unreachable: all.filter((i) => i.status === "unreachable").length,
    notConfigured: all.filter((i) => i.status === "not_configured").length,
  };

  return NextResponse.json({ summary, integrations: all });
}
