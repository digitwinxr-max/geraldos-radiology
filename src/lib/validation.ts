/**
 * GeraldOS — Zod Validation Utilities
 *
 * Shared schemas and a type-safe `validateBody` helper used by every
 * mutation API route. Keeps validation logic out of route handlers.
 */

import { z } from "zod";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validationFailed } from "@/lib/api-error";

// ─── Reusable primitive schemas ───

export const uuidSchema = z
  .string()
  .uuid("Invalid UUID format");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const searchSchema = z.object({
  search: z.string().max(200).default(""),
});

// ─── Domain schemas (top-5 mutation routes) ───

export const createPatientSchema = z.object({
  mrn: z.string().min(1).max(20),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().min(1),
  gender: z.string().min(1).max(20),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  address: z.string().optional().nullable(),
  insuranceProvider: z.string().max(200).optional().nullable(),
  insurancePolicyNumber: z.string().max(100).optional().nullable(),
  emergencyContactName: z.string().max(200).optional().nullable(),
  emergencyContactPhone: z.string().max(30).optional().nullable(),
  consentSigned: z.boolean().optional(),
  status: z.string().max(20).optional(),
});

export const createStudySchema = z.object({
  patientId: z.string().uuid("patientId must be a valid UUID"),
  appointmentId: z.string().uuid().optional().nullable(),
  modality: z.string().min(1).max(50),
  procedure: z.string().min(1).max(200),
  bodyPart: z.string().max(100).optional().nullable(),
  priority: z.enum(["stat", "urgent", "routine"]).default("routine"),
  changedBy: z.string().optional(),
});

export const createReportSchema = z.object({
  studyId: z.string().uuid().optional().nullable(),
  patientId: z.string().uuid("patientId must be a valid UUID"),
  radiologistId: z.string().uuid().optional().nullable(),
  templateName: z.string().max(200).optional().nullable(),
  findings: z.string().optional().nullable(),
  impression: z.string().optional().nullable(),
  recommendation: z.string().optional().nullable(),
  status: z.string().max(30).optional(),
});

export const createAppointmentSchema = z.object({
  patientId: z.string().uuid("patientId must be a valid UUID"),
  referralId: z.string().uuid().optional().nullable(),
  equipmentId: z.string().uuid().optional().nullable(),
  radiographerId: z.string().uuid().optional().nullable(),
  scheduledDate: z.string().min(1),
  scheduledTime: z.string().min(1),
  duration: z.number().int().min(5).default(30),
  modality: z.string().min(1).max(50),
  procedure: z.string().min(1).max(200),
  priority: z.enum(["stat", "urgent", "routine"]).default("routine"),
  status: z.string().max(30).optional(),
  notes: z.string().optional().nullable(),
});

export const workflowTransitionSchema = z.object({
  action: z.enum(["transition", "assign"]).optional(),
  to: z.string().optional(),
  stage: z.string().optional(),
  radiologistId: z.string().uuid().optional().nullable(),
  studyInstanceUid: z.string().optional().nullable(),
  changedBy: z.string().optional(),
  // Plain field updates
  priority: z.enum(["stat", "urgent", "routine"]).optional(),
  bodyPart: z.string().max(100).optional(),
  procedure: z.string().max(200).optional(),
  modality: z.string().max(50).optional(),
});

// ─── Equipment schemas ───

export const createEquipmentSchema = z.object({
  name: z.string().min(1).max(200),
  modality: z.string().min(1).max(50),
  manufacturer: z.string().max(200).optional().nullable(),
  model: z.string().max(200).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  status: z.string().max(30).optional(),
  installDate: z.string().optional().nullable(),
  lastCalibration: z.string().optional().nullable(),
  nextCalibration: z.string().optional().nullable(),
  utilizationRate: z.string().optional().nullable(),
});

export const updateEquipmentSchema = createEquipmentSchema.partial();

// ─── Inventory schemas ───

export const createInventoryItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(50),
  sku: z.string().max(50).optional().nullable(),
  currentStock: z.number().int().min(0).optional(),
  minimumStock: z.number().int().min(0).optional(),
  maximumStock: z.number().int().min(0).optional().nullable(),
  unit: z.string().max(30).optional(),
  unitCost: z.string().optional().nullable(),
  supplier: z.string().max(200).optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  status: z.string().max(20).optional(),
});

export const adjustInventorySchema = z.object({
  quantity: z.number().int(),
  type: z.string().min(1).max(30),
  performedBy: z.string().max(200).optional(),
});

// ─── Notification schema ───

export const createNotificationSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().optional().nullable(),
  type: z.string().max(30).optional(),
  severity: z.string().max(20).optional(),
  link: z.string().max(300).optional().nullable(),
  userId: z.string().max(100).optional(),
});

// ─── Knowledge schemas ───

export const createKnowledgeDocSchema = z.object({
  title: z.string().min(1).max(300),
  category: z.string().min(1).max(50),
  docType: z.string().max(50).optional(),
  summary: z.string().optional().nullable(),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  version: z.string().max(20).optional(),
  author: z.string().max(200).optional().nullable(),
  status: z.string().max(20).optional(),
  approvedBy: z.string().max(100).optional().nullable(),
});

export const updateKnowledgeDocSchema = createKnowledgeDocSchema.partial();

// ─── Decision schema ───

export const proposeDecisionSchema = z.object({
  agent: z.string().min(1).max(50),
  recommendation: z.string().min(1),
  rationale: z.string().optional().nullable(),
  priority: z.enum(["stat", "urgent", "routine"]).optional(),
  targetModule: z.string().max(50).optional().nullable(),
  targetAction: z.string().max(100).optional().nullable(),
  targetPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  requestedBy: z.string().max(100).optional(),
});

// ─── Finance schemas ───

export const createInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1).max(30),
  patientId: z.string().uuid(),
  studyId: z.string().uuid().optional().nullable(),
  appointmentId: z.string().uuid().optional().nullable(),
  billingType: z.string().max(20).optional(),
  insuranceProvider: z.string().max(200).optional().nullable(),
  insurancePolicyNumber: z.string().max(100).optional().nullable(),
  subtotal: z.string().optional(),
  taxAmount: z.string().optional(),
  totalAmount: z.string().optional(),
  status: z.string().max(20).optional(),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createPaymentSchema = z.object({
  receiptNumber: z.string().min(1).max(30),
  invoiceId: z.string().uuid(),
  patientId: z.string().uuid(),
  amount: z.string().min(1),
  method: z.string().min(1).max(20),
  reference: z.string().max(100).optional().nullable(),
  receivedBy: z.string().max(200).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createClaimSchema = z.object({
  claimNumber: z.string().min(1).max(30),
  invoiceId: z.string().uuid(),
  patientId: z.string().uuid(),
  medicalAid: z.string().min(1).max(200),
  membershipNumber: z.string().max(100).optional().nullable(),
  amountClaimed: z.string().min(1),
  notes: z.string().optional().nullable(),
});

export const createTariffSchema = z.object({
  code: z.string().min(1).max(30),
  description: z.string().min(1).max(300),
  modality: z.string().min(1).max(50),
  cashPrice: z.string().min(1),
  medicalAidPrice: z.string().min(1),
  nappiCode: z.string().max(30).optional().nullable(),
  active: z.boolean().optional(),
});

export const createExpenseSchema = z.object({
  category: z.string().min(1).max(50),
  description: z.string().min(1).max(300),
  amount: z.string().min(1),
  vendor: z.string().max(200).optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  status: z.string().max(20).optional(),
  incurredDate: z.string().min(1),
  approvedBy: z.string().max(200).optional().nullable(),
});

// ─── AI review schemas ───

export const createAiReviewSchema = z.object({
  studyId: z.string().uuid().optional().nullable(),
  orthancStudyId: z.string().max(128).optional().nullable(),
  modality: z.string().min(1).max(50),
  bodyPart: z.string().max(100).optional().nullable(),
  procedure: z.string().max(200).optional().nullable(),
});

export const reviewObservationSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
  // Deprecated: reviewers are attributed from the authenticated session.
  reviewedBy: z.string().min(1).max(200).optional(),
});

// ─── Decision action schema ───

export const decisionActionSchema = z.object({
  action: z.enum(["approve", "reject", "execute"]),
  approvedBy: z.string().max(200).optional().nullable(),
  reason: z.string().optional().nullable(),
});

// ─── Staff / Admin schemas ───

export const createStaffSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.string().min(1).max(50),
  specialization: z.string().max(100).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  status: z.string().max(20).optional(),
});

export const createBranchSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20),
  address: z.string().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  managerName: z.string().max(200).optional().nullable(),
  status: z.string().max(20).optional(),
});

export const createAnnotationSchema = z.object({
  studyId: z.string().uuid().optional().nullable(),
  orthancStudyId: z.string().max(128).optional().nullable(),
  seriesInstanceUid: z.string().max(128).optional().nullable(),
  tool: z.string().min(1).max(50),
  label: z.string().max(200).optional().nullable(),
  data: z.record(z.string(), z.unknown()),
  createdBy: z.string().max(100).optional().nullable(),
});

export const createBookmarkSchema = z.object({
  studyId: z.string().uuid().optional().nullable(),
  orthancStudyId: z.string().max(128).optional().nullable(),
  label: z.string().max(200).optional().nullable(),
  note: z.string().optional().nullable(),
});

export const updateSystemSettingsSchema = z.object({
  value: z.unknown(),
});

// ─── Validation helper ───

type ValidateSuccess<T> = { success: true; data: T };
type ValidateFailure = { success: false; error: NextResponse };
type ValidateResult<T> = ValidateSuccess<T> | ValidateFailure;

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns either the typed data or a structured 400 error response.
 */
export async function validateBody<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
): Promise<ValidateResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      error: validationFailed({ message: "Request body is not valid JSON" }),
    };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: validationFailed(result.error.issues),
    };
  }

  return { success: true, data: result.data };
}
