import {
  pgTable,
  pgSchema,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  time,
  integer,
  boolean,
  numeric,
  jsonb,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── PATIENT SCHEMA ───
export const patients = pgTable("patients", {
  id: uuid("id").defaultRandom().primaryKey(),
  mrn: varchar("mrn", { length: 20 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  gender: varchar("gender", { length: 20 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  insuranceProvider: varchar("insurance_provider", { length: 200 }),
  insurancePolicyNumber: varchar("insurance_policy_number", { length: 100 }),
  emergencyContactName: varchar("emergency_contact_name", { length: 200 }),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 30 }),
  consentSigned: boolean("consent_signed").default(false),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id").references(() => patients.id).notNull(),
    referringPhysician: varchar("referring_physician", { length: 200 }).notNull(),
    referringFacility: varchar("referring_facility", { length: 200 }),
    clinicalIndication: text("clinical_indication").notNull(),
    requestedProcedure: varchar("requested_procedure", { length: 200 }).notNull(),
    priority: varchar("priority", { length: 20 }).default("routine").notNull(),
    status: varchar("status", { length: 30 }).default("pending").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("referrals_patient_idx").on(t.patientId)],
);

// ─── SCHEDULING SCHEMA ───
export const equipment = pgTable("equipment", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  modality: varchar("modality", { length: 50 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 200 }),
  model: varchar("model", { length: 200 }),
  serialNumber: varchar("serial_number", { length: 100 }),
  location: varchar("location", { length: 200 }),
  status: varchar("status", { length: 30 }).default("operational").notNull(),
  installDate: date("install_date"),
  lastCalibration: date("last_calibration"),
  nextCalibration: date("next_calibration"),
  utilizationRate: numeric("utilization_rate", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const staff = pgTable("staff", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  specialization: varchar("specialization", { length: 100 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 30 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id").references(() => patients.id).notNull(),
    referralId: uuid("referral_id").references(() => referrals.id),
    equipmentId: uuid("equipment_id").references(() => equipment.id),
    radiographerId: uuid("radiographer_id").references(() => staff.id),
    scheduledDate: date("scheduled_date").notNull(),
    scheduledTime: time("scheduled_time").notNull(),
    duration: integer("duration").default(30).notNull(),
    modality: varchar("modality", { length: 50 }).notNull(),
    procedure: varchar("procedure", { length: 200 }).notNull(),
    priority: varchar("priority", { length: 20 }).default("routine").notNull(),
    status: varchar("status", { length: 30 }).default("scheduled").notNull(),
    notes: text("notes"),
    checkedIn: boolean("checked_in").default(false),
    checkedInAt: timestamp("checked_in_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // Daily modality worklist filters scheduled_date + active statuses.
    index("appointments_schedule_date_idx").on(t.scheduledDate, t.scheduledTime),
    index("appointments_patient_idx").on(t.patientId),
    index("appointments_equipment_idx").on(t.equipmentId),
    index("appointments_radiographer_idx").on(t.radiographerId),
  ],
);

// ─── WORKFLOW SCHEMA ───
export const workflowStudies = pgTable(
  "workflow_studies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appointmentId: uuid("appointment_id").references(() => appointments.id),
    patientId: uuid("patient_id").references(() => patients.id).notNull(),
    accessionNumber: varchar("accession_number", { length: 50 }).unique(),
    studyInstanceUid: varchar("study_instance_uid", { length: 128 }),
    modality: varchar("modality", { length: 50 }).notNull(),
    procedure: varchar("procedure", { length: 200 }).notNull(),
    bodyPart: varchar("body_part", { length: 100 }),
    stage: varchar("stage", { length: 30 }).default("referral").notNull(),
    radiologistId: uuid("radiologist_id").references(() => staff.id),
    priority: varchar("priority", { length: 20 }).default("routine").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // Kanban boards + command centre group by stage; worklist joins patient.
    index("workflow_studies_stage_idx").on(t.stage),
    index("workflow_studies_patient_idx").on(t.patientId),
    index("workflow_studies_radiologist_idx").on(t.radiologistId),
    index("workflow_studies_uidx_study_instance").on(t.studyInstanceUid),
  ],
);

// ─── EQUIPMENT MAINTENANCE SCHEMA ───
export const maintenanceRecords = pgTable(
  "maintenance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    equipmentId: uuid("equipment_id").references(() => equipment.id).notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    description: text("description").notNull(),
    performedBy: varchar("performed_by", { length: 200 }),
    scheduledDate: date("scheduled_date"),
    completedDate: date("completed_date"),
    status: varchar("status", { length: 30 }).default("scheduled").notNull(),
    cost: numeric("cost", { precision: 10, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("maintenance_records_equipment_idx").on(t.equipmentId)],
);

// ─── INVENTORY SCHEMA ───
export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  sku: varchar("sku", { length: 50 }),
  currentStock: integer("current_stock").default(0).notNull(),
  minimumStock: integer("minimum_stock").default(10).notNull(),
  maximumStock: integer("maximum_stock").default(100),
  unit: varchar("unit", { length: 30 }).default("units").notNull(),
  unitCost: numeric("unit_cost", { precision: 10, scale: 2 }),
  supplier: varchar("supplier", { length: 200 }),
  lastOrderDate: date("last_order_date"),
  expiryDate: date("expiry_date"),
  location: varchar("location", { length: 200 }),
  status: varchar("status", { length: 20 }).default("in_stock").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id").references(() => inventoryItems.id).notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    quantity: integer("quantity").notNull(),
    performedBy: varchar("performed_by", { length: 200 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("inventory_transactions_item_idx").on(t.itemId)],
);

// ─── REPORTING SCHEMA ───
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studyId: uuid("study_id").references(() => workflowStudies.id),
    patientId: uuid("patient_id").references(() => patients.id).notNull(),
    radiologistId: uuid("radiologist_id").references(() => staff.id),
    templateName: varchar("template_name", { length: 200 }),
    findings: text("findings"),
    impression: text("impression"),
    recommendation: text("recommendation"),
    status: varchar("status", { length: 30 }).default("draft").notNull(),
    signedAt: timestamp("signed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // Workflow sign/release guards look up the report by study on every transition.
    index("reports_study_idx").on(t.studyId),
    index("reports_patient_idx").on(t.patientId),
    index("reports_status_idx").on(t.status),
  ],
);

// ─── ANALYTICS / AUDIT SCHEMA ───
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 100 }),
    action: varchar("action", { length: 100 }).notNull(),
    module: varchar("module", { length: 50 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }),
    entityId: varchar("entity_id", { length: 100 }),
    details: jsonb("details"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // "What happened to this entity?" investigations filter by entity identity.
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_idx").on(t.createdAt),
    index("audit_log_user_idx").on(t.userId),
  ],
);

// ─── FINANCE SCHEMA ───
export const tariffs = pgTable("tariffs", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  description: varchar("description", { length: 300 }).notNull(),
  modality: varchar("modality", { length: 50 }).notNull(),
  cashPrice: numeric("cash_price", { precision: 10, scale: 2 }).notNull(),
  medicalAidPrice: numeric("medical_aid_price", { precision: 10, scale: 2 }).notNull(),
  nappiCode: varchar("nappi_code", { length: 30 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceNumber: varchar("invoice_number", { length: 30 }).notNull().unique(),
    patientId: uuid("patient_id").references(() => patients.id).notNull(),
    studyId: uuid("study_id").references(() => workflowStudies.id),
    appointmentId: uuid("appointment_id").references(() => appointments.id),
    billingType: varchar("billing_type", { length: 20 }).default("cash").notNull(),
    insuranceProvider: varchar("insurance_provider", { length: 200 }),
    insurancePolicyNumber: varchar("insurance_policy_number", { length: 100 }),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).default("0").notNull(),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).default("0").notNull(),
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("invoices_patient_idx").on(t.patientId),
    index("invoices_status_idx").on(t.status),
    // Revenue-by-day analytics groups by issue_date.
    index("invoices_issue_date_idx").on(t.issueDate),
  ],
);

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id).notNull(),
  tariffId: uuid("tariff_id").references(() => tariffs.id),
  description: varchar("description", { length: 300 }).notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptNumber: varchar("receipt_number", { length: 30 }).notNull().unique(),
  invoiceId: uuid("invoice_id").references(() => invoices.id).notNull(),
  patientId: uuid("patient_id").references(() => patients.id).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  method: varchar("method", { length: 20 }).notNull(),
  reference: varchar("reference", { length: 100 }),
  receivedBy: varchar("received_by", { length: 200 }),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insuranceClaims = pgTable("insurance_claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimNumber: varchar("claim_number", { length: 30 }).notNull().unique(),
  invoiceId: uuid("invoice_id").references(() => invoices.id).notNull(),
  patientId: uuid("patient_id").references(() => patients.id).notNull(),
  medicalAid: varchar("medical_aid", { length: 200 }).notNull(),
  membershipNumber: varchar("membership_number", { length: 100 }),
  amountClaimed: numeric("amount_claimed", { precision: 12, scale: 2 }).notNull(),
  amountApproved: numeric("amount_approved", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 20 }).default("submitted").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  respondedAt: timestamp("responded_at"),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: varchar("category", { length: 50 }).notNull(),
  description: varchar("description", { length: 300 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  vendor: varchar("vendor", { length: 200 }),
  branchId: uuid("branch_id"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  incurredDate: date("incurred_date").notNull(),
  approvedBy: varchar("approved_by", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── ADMINISTRATION SCHEMA ───
export const branches = pgTable("branches", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  address: text("address"),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 255 }),
  managerName: varchar("manager_name", { length: 200 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const employeeRecords = pgTable(
  "employee_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    staffId: uuid("staff_id").references(() => staff.id).notNull(),
    employeeNumber: varchar("employee_number", { length: 30 }).notNull().unique(),
    department: varchar("department", { length: 100 }),
    employmentType: varchar("employment_type", { length: 30 }).default("full_time").notNull(),
    branchId: uuid("branch_id").references(() => branches.id),
    startDate: date("start_date"),
    endDate: date("end_date"),
    hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
    monthlySalary: numeric("monthly_salary", { precision: 12, scale: 2 }),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("employee_records_staff_idx").on(t.staffId),
    index("employee_records_branch_idx").on(t.branchId),
  ],
);

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: varchar("description", { length: 300 }),
  permissions: jsonb("permissions").default([]).notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: varchar("updated_by", { length: 100 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── AI-ASSISTED REPORTING SCHEMA ───
export const reportTemplates = pgTable("report_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  modality: varchar("modality", { length: 50 }).notNull(),
  description: varchar("description", { length: 300 }),
  sections: jsonb("sections").default([]).notNull(),
  checklist: jsonb("checklist").default([]).notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const reportVersions = pgTable("report_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id").references(() => reports.id).notNull(),
  version: integer("version").notNull(),
  findings: text("findings"),
  impression: text("impression"),
  recommendation: text("recommendation"),
  status: varchar("status", { length: 30 }).default("draft").notNull(),
  qualityScore: integer("quality_score"),
  aiAssisted: boolean("ai_assisted").default(false).notNull(),
  changedBy: varchar("changed_by", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── MULTI-MODAL AI REVIEW SCHEMA ───
// Candidate observations surfaced by the AI review assistant.
// The radiologist must ACCEPT or REJECT each candidate — nothing is a diagnosis.
export const aiObservations = pgTable(
  "ai_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studyId: uuid("study_id").references(() => workflowStudies.id),
    orthancStudyId: varchar("orthanc_study_id", { length: 128 }),
    modality: varchar("modality", { length: 50 }).notNull(),
    region: varchar("region", { length: 100 }),
    category: varchar("category", { length: 50 }).notNull(), // finding | normal | technical | critical
    description: text("description").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 2 }),
    boundingBox: jsonb("bounding_box"),
    heatmapRef: varchar("heatmap_ref", { length: 300 }),
    suggestedDifferential: jsonb("suggested_differential").default([]).notNull(),
    literatureRefs: jsonb("literature_refs").default([]).notNull(),
    similarCaseIds: jsonb("similar_case_ids").default([]).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(), // pending | accepted | rejected
    reviewedBy: varchar("reviewed_by", { length: 100 }),
    reviewedAt: timestamp("reviewed_at"),
    modelVersion: varchar("model_version", { length: 100 }).default("geraldos-review-1"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // Workstation AI overlay loads observations per study; review queues filter by status.
    index("ai_observations_study_idx").on(t.studyId),
    index("ai_observations_status_idx").on(t.status),
  ],
);

// ─── DECISION ENGINE SCHEMA ───
// Every AI action flows: recommendation → business rules → validation → approval → execution → audit.
export const aiRecommendations = pgTable(
  "ai_recommendations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agent: varchar("agent", { length: 50 }).notNull(),
    recommendation: text("recommendation").notNull(),
    rationale: text("rationale"),
    priority: varchar("priority", { length: 20 }).default("routine").notNull(),
    status: varchar("status", { length: 30 }).default("proposed").notNull(),
    // proposed | validated | approved | rejected | executed | failed
    ruleResults: jsonb("rule_results").default([]).notNull(),
    validationResults: jsonb("validation_results").default([]).notNull(),
    targetModule: varchar("target_module", { length: 50 }),
    targetAction: varchar("target_action", { length: 100 }),
    targetPayload: jsonb("target_payload"),
    requestedBy: varchar("requested_by", { length: 100 }),
    approvedBy: varchar("approved_by", { length: 100 }),
    approvedAt: timestamp("approved_at"),
    executedAt: timestamp("executed_at"),
    auditRef: varchar("audit_ref", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // Decision inbox lists by status; agent history filters by originator.
    index("ai_recommendations_status_idx").on(t.status),
    index("ai_recommendations_agent_idx").on(t.agent),
  ],
);

// ─── KNOWLEDGE PLATFORM SCHEMA ───
export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  docType: varchar("doc_type", { length: 50 }).default("guide").notNull(),
  summary: text("summary"),
  content: text("content").notNull(),
  tags: jsonb("tags").default([]).notNull(),
  version: varchar("version", { length: 20 }).default("1.0").notNull(),
  author: varchar("author", { length: 200 }),
  status: varchar("status", { length: 20 }).default("published").notNull(), // draft | published | archived
  approvedBy: varchar("approved_by", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── RADIOLOGIST WORKSPACE SCHEMA ───
export const studyBookmarks = pgTable(
  "study_bookmarks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 100 }).notNull(),
    studyId: uuid("study_id").references(() => workflowStudies.id),
    orthancStudyId: varchar("orthanc_study_id", { length: 128 }),
    label: varchar("label", { length: 200 }),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("study_bookmarks_user_idx").on(t.userId), index("study_bookmarks_study_idx").on(t.studyId)],
);

export const studyAnnotations = pgTable(
  "study_annotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studyId: uuid("study_id").references(() => workflowStudies.id),
    orthancStudyId: varchar("orthanc_study_id", { length: 128 }),
    seriesInstanceUid: varchar("series_instance_uid", { length: 128 }),
    tool: varchar("tool", { length: 50 }).notNull(), // length | angle | area | arrow | text
    label: varchar("label", { length: 200 }),
    data: jsonb("data").notNull(),
    createdBy: varchar("created_by", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("study_annotations_study_idx").on(t.studyId)],
);

// ─── EVENT-DRIVEN ARCHITECTURE SCHEMA ───
//
// `event_log` doubles as the durable record AND the transactional outbox:
// domain mutations insert their events inside the same database transaction
// with `publishedAt = null`; the relay (src/lib/events.ts) fans pending rows
// out to Redis Streams and stamps `publishedAt`. Replay = reset `publishedAt`.
// Historical rows are backfilled to `occurredAt` so upgrades never replay.
export const eventLog = pgTable(
  "event_log",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    aggregate: varchar("aggregate", { length: 50 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 128 }),
    payload: jsonb("payload"),
    source: varchar("source", { length: 100 }).default("app").notNull(),
    /** Request-scoped trace id (from the AsyncLocalStorage request context). */
    correlationId: varchar("correlation_id", { length: 64 }),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    // ── Transactional outbox bookkeeping ──
    /** Null = pending Redis fan-out; set once delivered (or not applicable). */
    publishedAt: timestamp("published_at"),
    publishAttempts: integer("publish_attempts").default(0).notNull(),
    lastPublishError: text("last_publish_error"),
  },
  (t) => [
    // Relay cursor: SELECT ... WHERE published_at IS NULL ORDER BY id.
    index("event_log_pending_idx").on(t.id).where(sql`published_at IS NULL`),
    index("event_log_type_idx").on(t.eventType),
    index("event_log_aggregate_idx").on(t.aggregateId),
    index("event_log_correlation_idx").on(t.correlationId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 100 }).default("all").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    type: varchar("type", { length: 30 }).default("info").notNull(), // info | alert | warning | success
    severity: varchar("severity", { length: 20 }).default("normal").notNull(),
    link: varchar("link", { length: 300 }),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // Bell/polling queries fetch unread notifications per user, newest first.
    index("notifications_user_unread_idx").on(t.userId, t.read),
  ],
);
