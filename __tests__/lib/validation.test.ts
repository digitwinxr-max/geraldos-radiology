import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { z } from "zod";
import {
  adjustInventorySchema,
  createAnnotationSchema,
  createAppointmentSchema,
  createBookmarkSchema,
  createBranchSchema,
  createClaimSchema,
  createEquipmentSchema,
  createExpenseSchema,
  createInventoryItemSchema,
  createInvoiceSchema,
  createKnowledgeDocSchema,
  createNotificationSchema,
  createPatientSchema,
  createPaymentSchema,
  createReportSchema,
  createStaffSchema,
  createStudySchema,
  createTariffSchema,
  decisionActionSchema,
  paginationSchema,
  proposeDecisionSchema,
  reviewObservationSchema,
  validateBody,
  workflowTransitionSchema,
} from "@/lib/validation";

const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const OTHER_UUID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function accepts(schema: z.ZodType, input: unknown) {
  expect(schema.safeParse(input).success).toBe(true);
}
function rejects(schema: z.ZodType, input: unknown) {
  expect(schema.safeParse(input).success).toBe(false);
}

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function rawRequest(raw: string): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json" },
  });
}

describe("paginationSchema", () => {
  it("coerces string params to numbers", () => {
    const res = paginationSchema.safeParse({ page: "2", pageSize: "25" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data).toEqual({ page: 2, pageSize: 25 });
  });

  it("defaults to page 1, pageSize 50", () => {
    const res = paginationSchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) expect(res.data).toEqual({ page: 1, pageSize: 50 });
  });

  it("rejects pageSize above 200 and pages below 1", () => {
    rejects(paginationSchema, { pageSize: 201 });
    rejects(paginationSchema, { page: 0 });
    rejects(paginationSchema, { pageSize: "abc" });
  });
});

describe("domain schemas", () => {
  it("createPatientSchema — required fields and length caps", () => {
    accepts(createPatientSchema, {
      mrn: "MRN-001",
      firstName: "Ann",
      lastName: "Lee",
      dateOfBirth: "1990-01-01",
      gender: "female",
    });
    rejects(createPatientSchema, {
      firstName: "Ann",
      lastName: "Lee",
      dateOfBirth: "1990-01-01",
      gender: "female",
    }); // mrn missing
    rejects(createPatientSchema, {
      mrn: "x".repeat(21),
      firstName: "Ann",
      lastName: "Lee",
      dateOfBirth: "1990-01-01",
      gender: "female",
    });
  });

  it("createStudySchema — UUID patientId and priority enum with default", () => {
    const res = createStudySchema.safeParse({ patientId: UUID, modality: "CT", procedure: "Chest CT" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.priority).toBe("routine");

    rejects(createStudySchema, { patientId: "not-a-uuid", modality: "CT", procedure: "Chest CT" });
    rejects(createStudySchema, { patientId: UUID, modality: "CT", procedure: "Chest CT", priority: "asap" });
  });

  it("createAppointmentSchema — required schedule fields and duration default", () => {
    const res = createAppointmentSchema.safeParse({
      patientId: UUID,
      scheduledDate: "2026-01-15",
      scheduledTime: "09:30:00",
      modality: "CT",
      procedure: "Chest CT",
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.duration).toBe(30);

    rejects(createAppointmentSchema, {
      patientId: UUID,
      scheduledTime: "09:30:00",
      modality: "CT",
      procedure: "Chest CT",
    }); // scheduledDate missing
    rejects(createAppointmentSchema, {
      patientId: UUID,
      scheduledDate: "2026-01-15",
      scheduledTime: "09:30:00",
      modality: "CT",
      procedure: "Chest CT",
      duration: 2,
    });
  });

  it("workflowTransitionSchema — all fields optional, UUID and enum guarded", () => {
    accepts(workflowTransitionSchema, {});
    accepts(workflowTransitionSchema, { action: "transition", to: "assigned", radiologistId: UUID });
    accepts(workflowTransitionSchema, { priority: "stat" });
    rejects(workflowTransitionSchema, { radiologistId: "not-a-uuid" });
    rejects(workflowTransitionSchema, { priority: "high" });
    rejects(workflowTransitionSchema, { action: "delete" });
  });

  it("createReportSchema — UUID patientId required", () => {
    accepts(createReportSchema, { patientId: UUID, studyId: UUID, findings: "Normal" });
    rejects(createReportSchema, { studyId: UUID });
    rejects(createReportSchema, { patientId: "nope" });
  });

  it("finance schemas — required identifiers and money fields", () => {
    accepts(createInvoiceSchema, { invoiceNumber: "INV-001", patientId: UUID, issueDate: "2026-01-10" });
    rejects(createInvoiceSchema, { invoiceNumber: "INV-001", patientId: "nope", issueDate: "2026-01-10" });
    rejects(createInvoiceSchema, { patientId: UUID, issueDate: "2026-01-10" });

    accepts(createPaymentSchema, {
      receiptNumber: "R-001",
      invoiceId: UUID,
      patientId: UUID,
      amount: "150.00",
      method: "card",
    });
    rejects(createPaymentSchema, { receiptNumber: "R-001", invoiceId: UUID, patientId: UUID, method: "card" });

    accepts(createClaimSchema, {
      claimNumber: "C-001",
      invoiceId: UUID,
      patientId: UUID,
      medicalAid: "Discovery",
      amountClaimed: "1200.00",
    });
    rejects(createClaimSchema, { claimNumber: "C-001", invoiceId: UUID, patientId: UUID, amountClaimed: "1" });

    accepts(createTariffSchema, {
      code: "70001",
      description: "CT head",
      modality: "CT",
      cashPrice: "950.00",
      medicalAidPrice: "1100.00",
    });
    rejects(createTariffSchema, { code: "70001", description: "CT head", modality: "CT" });

    accepts(createExpenseSchema, {
      category: "supplies",
      description: "Contrast media",
      amount: "420.00",
      incurredDate: "2026-01-05",
    });
    rejects(createExpenseSchema, { category: "supplies", description: "x", amount: "1.00" });
    rejects(createExpenseSchema, {
      category: "supplies",
      description: "x",
      amount: "1.00",
      incurredDate: "2026-01-05",
      branchId: "not-a-uuid",
    });
  });

  it("equipment and inventory schemas", () => {
    accepts(createEquipmentSchema, { name: "MRI 3T", modality: "MRI" });
    rejects(createEquipmentSchema, { name: "", modality: "MRI" });

    accepts(createInventoryItemSchema, { name: "Gloves", category: "consumables", currentStock: 5 });
    rejects(createInventoryItemSchema, { name: "Gloves", category: "consumables", currentStock: -1 });

    accepts(adjustInventorySchema, { quantity: -2, type: "usage" });
    rejects(adjustInventorySchema, { quantity: 1.5, type: "usage" });
    rejects(adjustInventorySchema, { quantity: 1, type: "" });
  });

  it("createKnowledgeDocSchema — content required", () => {
    accepts(createKnowledgeDocSchema, { title: "MRI Safety", category: "protocol", content: "..." });
    rejects(createKnowledgeDocSchema, { title: "MRI Safety", category: "protocol" });
    rejects(createKnowledgeDocSchema, { title: "", category: "protocol", content: "..." });
  });

  it("createNotificationSchema — title required, capped at 200", () => {
    accepts(createNotificationSchema, { title: "Study assigned" });
    rejects(createNotificationSchema, {});
    rejects(createNotificationSchema, { title: "x".repeat(201) });
  });

  it("proposeDecisionSchema — agent and recommendation required", () => {
    accepts(proposeDecisionSchema, { agent: "workflow-agent", recommendation: "Advance study" });
    rejects(proposeDecisionSchema, { recommendation: "Advance study" });
    rejects(proposeDecisionSchema, { agent: "", recommendation: "Advance study" });
  });

  it("reviewObservationSchema — status limited to accepted/rejected", () => {
    accepts(reviewObservationSchema, { status: "accepted", reviewedBy: "dr-naidoo" });
    accepts(reviewObservationSchema, { status: "rejected", reviewedBy: "dr-naidoo" });
    rejects(reviewObservationSchema, { status: "pending", reviewedBy: "dr-naidoo" });
    rejects(reviewObservationSchema, { status: "accepted" });
  });

  it("decisionActionSchema — action limited to approve/reject/execute", () => {
    accepts(decisionActionSchema, { action: "approve" });
    accepts(decisionActionSchema, { action: "reject", reason: "not justified" });
    accepts(decisionActionSchema, { action: "execute", approvedBy: "admin" });
    rejects(decisionActionSchema, { action: "cancel" });
  });

  it("staff and branch schemas", () => {
    accepts(createStaffSchema, { firstName: "Priya", lastName: "Naidoo", role: "radiologist" });
    rejects(createStaffSchema, { firstName: "Priya", lastName: "Naidoo" });

    accepts(createBranchSchema, { name: "Rosebank", code: "RBK" });
    rejects(createBranchSchema, { name: "Rosebank", code: "x".repeat(21) });
  });

  it("createAnnotationSchema — data payload required", () => {
    accepts(createAnnotationSchema, { studyId: UUID, tool: "measurement", data: { x: 1, y: 2 } });
    rejects(createAnnotationSchema, { studyId: UUID, tool: "measurement" });
    rejects(createAnnotationSchema, { studyId: OTHER_UUID, tool: "", data: {} });
  });

  it("createBookmarkSchema — everything optional, label capped", () => {
    accepts(createBookmarkSchema, {});
    accepts(createBookmarkSchema, { orthancStudyId: "abc", label: "Key slice" });
    rejects(createBookmarkSchema, { label: "x".repeat(201) });
  });
});

describe("validateBody", () => {
  it("returns a 400 VALIDATION_FAILED envelope for malformed JSON", async () => {
    const res = await validateBody(rawRequest("{not json"), createPatientSchema);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.status).toBe(400);
      const body = await res.error.json();
      expect(body.error.code).toBe("VALIDATION_FAILED");
      expect(body.error.details).toEqual({ message: "Request body is not valid JSON" });
    }
  });

  it("returns schema issues in the details field on validation failure", async () => {
    const res = await validateBody(jsonRequest({ firstName: "Ann" }), createPatientSchema);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.status).toBe(400);
      const body = await res.error.json();
      expect(body.error.code).toBe("VALIDATION_FAILED");
      expect(Array.isArray(body.error.details)).toBe(true);
      expect(body.error.details.length).toBeGreaterThan(0);
    }
  });

  it("returns the typed, defaulted data on success", async () => {
    const res = await validateBody(
      jsonRequest({ patientId: UUID, modality: "CT", procedure: "Chest CT" }),
      createStudySchema,
    );

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.patientId).toBe(UUID);
      expect(res.data.priority).toBe("routine");
    }
  });
});
