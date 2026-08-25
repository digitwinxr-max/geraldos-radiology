/**
 * GeraldOS Staff Service
 *
 * Encapsulates staff, employee records, roles, and branches.
 */

import { db } from "@/db";
import { staff, employeeRecords, roles, branches } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

// ─── Staff ───

export async function listStaff() {
  return db.select().from(staff).orderBy(staff.lastName, staff.firstName);
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

export async function listEmployees() {
  return db.select().from(employeeRecords).orderBy(desc(employeeRecords.createdAt));
}

export async function createEmployee(input: typeof employeeRecords.$inferInsert) {
  const [row] = await db.insert(employeeRecords).values(input).returning();
  return row;
}

// ─── Roles ───

export async function listRoles() {
  return db.select().from(roles).orderBy(roles.name);
}

export async function createRole(input: typeof roles.$inferInsert) {
  const [row] = await db.insert(roles).values(input).returning();
  return row;
}

// ─── Branches ───

export async function listBranches() {
  return db.select().from(branches).orderBy(branches.name);
}

export async function createBranch(input: typeof branches.$inferInsert) {
  const [row] = await db.insert(branches).values(input).returning();
  return row;
}
