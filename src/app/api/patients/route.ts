import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { patients } from "@/db/schema";
import { ilike, or, desc, sql } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createPatientSchema, paginationSchema, searchSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "patients.read", async () => {
    try {
      const rawSearch = request.nextUrl.searchParams.get("search") ?? "";
      const parsed = searchSchema.safeParse({ search: rawSearch });
      const search = parsed.success ? parsed.data.search : "";

      const pagination = paginationSchema.safeParse({
        page: request.nextUrl.searchParams.get("page") ?? "1",
        pageSize: request.nextUrl.searchParams.get("pageSize") ?? "50",
      });
      const { page, pageSize } = pagination.success
        ? pagination.data
        : { page: 1, pageSize: 50 };

      const conditions = search
        ? or(
            ilike(patients.firstName, `%${search}%`),
            ilike(patients.lastName, `%${search}%`),
            ilike(patients.mrn, `%${search}%`),
          )
        : undefined;

      const offset = (page - 1) * pageSize;

      const [result, countResult] = await Promise.all([
        conditions
          ? db
              .select()
              .from(patients)
              .where(conditions)
              .orderBy(desc(patients.createdAt))
              .limit(pageSize)
              .offset(offset)
          : db
              .select()
              .from(patients)
              .orderBy(desc(patients.createdAt))
              .limit(pageSize)
              .offset(offset),
        conditions
          ? db.select({ count: sql<number>`count(*)` }).from(patients).where(conditions)
          : db.select({ count: sql<number>`count(*)` }).from(patients),
      ]);

      const total = Number(countResult[0]?.count ?? 0);

      return NextResponse.json({
        data: result,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      console.error("patients GET failed", error);
      return internalError();
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "patients.write", async () => {
    const parsed = await validateBody(request, createPatientSchema);
    if (!parsed.success) return parsed.error;

    try {
      const result = await db.insert(patients).values(parsed.data).returning();
      return NextResponse.json(result[0], { status: 201 });
    } catch (error) {
      console.error("patients POST failed", error);
      return internalError();
    }
  });
}
