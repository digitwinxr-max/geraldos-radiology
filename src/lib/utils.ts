import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-BW", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format an amount in Botswana Pula (BWP), abbreviated with the "P" symbol.
 * Example: 1250.5 → "P1,250.50".
 */
export function formatPula(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "P0.00";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(n)) return "P0.00";
  return `P${n.toLocaleString("en-BW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export function generateMRN(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `GH-${num}`;
}

export function generateAccessionNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `ACC${y}${m}${d}-${seq}`;
}

export const MODALITIES = [
  "CT",
  "MRI",
  "X-Ray",
  "Ultrasound",
  "Mammography",
  "Fluoroscopy",
  "Nuclear Medicine",
  "PET-CT",
] as const;

export const PRIORITIES = ["stat", "urgent", "routine"] as const;


export const INVENTORY_CATEGORIES = [
  "contrast",
  "gel",
  "ppe",
  "electrodes",
  "consumables",
] as const;
