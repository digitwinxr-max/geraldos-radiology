/**
 * Gate 1 — RBAC matrix tests.
 *
 * `hasPermission` is the single server-side authorisation decision point used
 * by every `withAuth` route. This matrix asserts each of the seven roles
 * grants exactly its documented surface and leaks nothing beyond it.
 */

import { describe, expect, it } from "vitest";

import { hasPermission } from "@/lib/rbac";

const ALL_ROLES = [
  "administrator",
  "radiologist",
  "radiographer",
  "receptionist",
  "manager",
  "finance",
  "referring_doctor",
];

describe("hasPermission — role matrix", () => {
  it("administrator is unrestricted", () => {
    for (const permission of [
      "patients.read",
      "finance.write",
      "administration.write",
      "anything.at.all",
    ]) {
      expect(hasPermission(["administrator"], permission)).toBe(true);
    }
  });

  it("radiologist covers clinical reading/reporting but not front-desk or finance", () => {
    expect(hasPermission(["radiologist"], "patients.read")).toBe(true);
    expect(hasPermission(["radiologist"], "workflow.update")).toBe(true);
    expect(hasPermission(["radiologist"], "reports.write")).toBe(true);
    expect(hasPermission(["radiologist"], "imaging.read")).toBe(true);
    expect(hasPermission(["radiologist"], "ai-review.read")).toBe(true);
    expect(hasPermission(["radiologist"], "integrations.read")).toBe(true);
    expect(hasPermission(["radiologist"], "knowledge.read")).toBe(true);

    expect(hasPermission(["radiologist"], "patients.write")).toBe(false);
    expect(hasPermission(["radiologist"], "finance.read")).toBe(false);
    expect(hasPermission(["radiologist"], "administration.read")).toBe(false);
    expect(hasPermission(["radiologist"], "appointments.write")).toBe(false);
  });

  it("radiographer covers imaging/workflow execution but not reporting or admin", () => {
    expect(hasPermission(["radiographer"], "patients.read")).toBe(true);
    expect(hasPermission(["radiographer"], "workflow.read")).toBe(true);
    expect(hasPermission(["radiographer"], "workflow.update")).toBe(true);
    expect(hasPermission(["radiographer"], "imaging.write")).toBe(true);
    expect(hasPermission(["radiographer"], "integrations.read")).toBe(true);

    expect(hasPermission(["radiographer"], "reports.write")).toBe(false);
    expect(hasPermission(["radiographer"], "ai-review.read")).toBe(false);
    expect(hasPermission(["radiographer"], "finance.read")).toBe(false);
  });

  it("receptionist covers the front door but nothing clinical or financial", () => {
    expect(hasPermission(["receptionist"], "patients.write")).toBe(true);
    expect(hasPermission(["receptionist"], "referrals.write")).toBe(true);
    expect(hasPermission(["receptionist"], "appointments.write")).toBe(true);
    expect(hasPermission(["receptionist"], "scheduling.read")).toBe(true);

    expect(hasPermission(["receptionist"], "finance.read")).toBe(false);
    expect(hasPermission(["receptionist"], "reports.write")).toBe(false);
    expect(hasPermission(["receptionist"], "workflow.update")).toBe(false);
    expect(hasPermission(["receptionist"], "administration.read")).toBe(false);
  });

  it("manager reads everything and administers operations, but cannot write clinical records", () => {
    expect(hasPermission(["manager"], "patients.read")).toBe(true);
    expect(hasPermission(["manager"], "reports.read")).toBe(true);
    expect(hasPermission(["manager"], "finance.write")).toBe(true);
    expect(hasPermission(["manager"], "equipment.write")).toBe(true);
    expect(hasPermission(["manager"], "inventory.write")).toBe(true);
    expect(hasPermission(["manager"], "administration.write")).toBe(true);

    // "*.read" grants reads only — never mutations on clinical domains.
    expect(hasPermission(["manager"], "patients.write")).toBe(false);
    expect(hasPermission(["manager"], "reports.write")).toBe(false);
    expect(hasPermission(["manager"], "workflow.update")).toBe(false);
  });

  it("finance is confined to finance plus patient lookup", () => {
    expect(hasPermission(["finance"], "finance.read")).toBe(true);
    expect(hasPermission(["finance"], "finance.write")).toBe(true);
    expect(hasPermission(["finance"], "patients.read")).toBe(true);

    expect(hasPermission(["finance"], "patients.write")).toBe(false);
    expect(hasPermission(["finance"], "reports.read")).toBe(false);
    expect(hasPermission(["finance"], "administration.read")).toBe(false);
  });

  it("referring_doctor sees their referrals and reports only", () => {
    expect(hasPermission(["referring_doctor"], "patients.read")).toBe(true);
    expect(hasPermission(["referring_doctor"], "referrals.write")).toBe(true);
    expect(hasPermission(["referring_doctor"], "reports.read")).toBe(true);

    expect(hasPermission(["referring_doctor"], "finance.read")).toBe(false);
    expect(hasPermission(["referring_doctor"], "workflow.update")).toBe(false);
    expect(hasPermission(["referring_doctor"], "imaging.read")).toBe(false);
  });

  it("unknown roles and empty role sets deny everything", () => {
    for (const permission of ["patients.read", "finance.write", "administration.read"]) {
      expect(hasPermission(["ghost-role"], permission)).toBe(false);
      expect(hasPermission([], permission)).toBe(false);
    }
  });

  it("no role outside finance/manager/administrator can touch finance", () => {
    for (const role of ALL_ROLES) {
      const expected = ["administrator", "manager", "finance"].includes(role);
      expect(hasPermission([role], "finance.write")).toBe(expected);
    }
  });

  it("only administrator and manager hold administration permissions", () => {
    for (const role of ALL_ROLES) {
      const expected = ["administrator", "manager"].includes(role);
      expect(hasPermission([role], "administration.write")).toBe(expected);
    }
  });

  it("wildcard grants cover the domain itself and its sub-permissions", () => {
    // receptionist holds "patients.*"
    expect(hasPermission(["receptionist"], "patients")).toBe(true);
    expect(hasPermission(["receptionist"], "patients.deep.nested")).toBe(true);
  });
});
