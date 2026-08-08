import { NextResponse } from "next/server";
import { db } from "@/db";
import { equipment, staff, referrals } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/worklist/facets — distinct machines, radiologists, physicians, locations. */
export async function GET() {
  try {
    const machines = await db
      .selectDistinct({ name: equipment.name, modality: equipment.modality, location: equipment.location })
      .from(equipment);
    const radiologists = await db
      .selectDistinct({ id: staff.id, firstName: staff.firstName, lastName: staff.lastName })
      .from(staff)
      .where(sql`lower(${staff.role}) IN ('radiologist','senior radiologist','consultant radiologist')`);
    const physicians = await db.selectDistinct({ name: referrals.referringPhysician }).from(referrals);
    const locations = await db.selectDistinct({ location: equipment.location }).from(equipment);
    return NextResponse.json({
      ok: true,
      machines,
      radiologists,
      physicians: physicians.map((p) => p.name).filter(Boolean),
      locations: locations.map((l) => l.location).filter(Boolean),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "failed to load facets", detail: String(error) }, { status: 500 });
  }
}
