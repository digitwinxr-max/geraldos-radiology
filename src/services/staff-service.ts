/**
 * GeraldOS Staff Service
 *
 * Encapsulates staff, employee records, roles, and branches.
 */

import { db } from "@/db";
import { staff, employeeRecords, roles, branches } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import type { ServiceListOpts } from "@/lib/list-query";

// ─── Staff ───

export async function listStaff(opts: ServiceListOpts) {
  const [rows, totalRow] = await Promise.all([
    db.select().from(staff).orderBy(staff.lastName, staff.firstName).limit(opts.limit).offset(opts.offset),
    db.select({ count: count() }).from(staff),
  ]);
  return { rows, total: totalRow[0]?.count ?? 0 };
}

export async function createStaff(input: typeof staff.$inferInsert) {
  const [row] = await db.insert(staff).values(input).returning();
  return row;
}

export async function getStaff(id: string) {
  const [row] = await db.select().from(staff).where(eq(staff.id, id));
  return row ?? null;
}

// ─── Employee Records ───

export async function listEmployees(opts: ServiceListOpts) {
  const base = db
    .select({
      id: employeeRecords.id,
      employeeNumber: employeeRecords.employeeNumber,
      department: employeeRecords.department,
      employmentType: employeeRecords.employmentType,
      startDate: employeeRecords.startDate,
      monthlySalary: employeeRecords.monthlySalary,
      hourlyRate: employeeRecords.hourlyRate,
      status: employeeRecords.status,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      staffRole: staff.role,
      staffEmail: staff.email,
      branchName: branches.name,
    })
    .from(employeeRecords)
    .leftJoin(staff, eq(employeeRecords.staffId, staff.id))
    .leftJoin(branches, eq(employeeRecords.branchId, branches.id));
  const [rows, totalRow] = await Promise.all([
    base.orderBy(desc(employeeRecords.createdAt)).limit(opts.limit).offset(opts.offset),
    db.select({ count: count() }).from(employeeRecords),
  ]);
  return { rows, total: totalRow[0]?.count ?? 0 };
}

export async function createEmployee(input: typeof employeeRecords.$inferInsert) {
  const [row] = await db.insert(employeeRecords).values(input).returning();
  return row;
}

// ─── Roles ───

export async function listRoles(opts: ServiceListOpts) {
  const [rows, totalRow] = await Promise.all([
    db.select().from(roles).orderBy(roles.name).limit(opts.limit).offset(opts.offset),
    db.select({ count: count() }).from(roles),
  ]);
  return { rows, total: totalRow[0]?.count ?? 0 };
}

export async function createRole(input: typeof roles.$inferInsert) {
  const [row] = await db.insert(roles).values(input).returning();
  return row;
}

// ─── Branches ───

export async function listBranches(opts: ServiceListOpts) {
  const [rows, totalRow] = await Promise.all([
    db.select().from(branches).orderBy(branches.name).limit(opts.limit).offset(opts.offset),
    db.select({ count: count() }).from(branches),
  ]);
  return { rows, total: totalRow[0]?.count ?? 0 };
}

export async function createBranch(input: typeof branches.$inferInsert) {
  const [row] = await db.insert(branches).values(input).returning();
  return row;
}
