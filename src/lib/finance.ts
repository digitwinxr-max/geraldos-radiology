export function generateInvoiceNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `INV-${y}${m}-${seq}`;
}

export function generateReceiptNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `RCT-${y}${m}-${seq}`;
}

export function generateClaimNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const seq = Math.floor(10000 + Math.random() * 90000);
  return `CLM-${y}-${seq}`;
}

export function generateEmployeeNumber(): string {
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `EMP-${seq}`;
}

export const BILLING_TYPES = ["cash", "medical_aid", "corporate"] as const;
export const PAYMENT_METHODS = ["cash", "card", "eft", "medical_aid"] as const;
export const INVOICE_STATUSES = ["draft", "sent", "partial", "paid", "overdue", "written_off"] as const;
export const CLAIM_STATUSES = ["submitted", "pending", "approved", "partially_approved", "rejected", "paid"] as const;
export const EXPENSE_CATEGORIES = ["supplies", "utilities", "maintenance", "salaries", "rent", "marketing", "other"] as const;
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "locum"] as const;
