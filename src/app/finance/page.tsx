"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyStateRow } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Receipt,
  Wallet,
  FileWarning,
  TrendingUp,
  Plus,
  DollarSign,
  ShieldCheck,
  Banknote,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { BILLING_TYPES, PAYMENT_METHODS } from "@/lib/finance";

interface Invoice {
  id: string;
  invoiceNumber: string;
  patientId: string;
  billingType: string;
  insuranceProvider: string | null;
  subtotal: string;
  totalAmount: string;
  amountPaid: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientMrn: string | null;
}

interface Payment {
  id: string;
  receiptNumber: string;
  amount: string;
  method: string;
  reference: string | null;
  receivedBy: string | null;
  receivedAt: string;
  invoiceNumber: string | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientMrn: string | null;
}

interface Claim {
  id: string;
  claimNumber: string;
  medicalAid: string;
  membershipNumber: string | null;
  amountClaimed: string;
  amountApproved: string | null;
  status: string;
  submittedAt: string;
  rejectionReason: string | null;
  invoiceNumber: string | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientMrn: string | null;
}

interface Tariff {
  id: string;
  code: string;
  description: string;
  modality: string;
  cashPrice: string;
  medicalAidPrice: string;
  active: boolean;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  mrn: string;
}

interface FinanceAnalytics {
  totalInvoiced: number;
  totalPaid: number;
  invoiceCount: number;
  outstanding: number;
  totalCollected: number;
  totalExpenses: number;
  invoicesByStatus: { status: string; count: number; total: number }[];
  paymentsByMethod: { method: string; count: number; total: number }[];
  claimsByStatus: { status: string; count: number; total: number }[];
}

const money = (n: number | string) => `P${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FinancePage() {
  const [analytics, setAnalytics] = useState<FinanceAnalytics | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentsList, setPaymentsList] = useState<Payment[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [tariffList, setTariffList] = useState<Tariff[]>([]);
  const [patientsList, setPatientsList] = useState<Patient[]>([]);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);

  const fetchAll = useCallback(() => {
    fetch("/api/finance/analytics").then((r) => r.json()).then(setAnalytics).catch(() => {});
    fetch("/api/invoices").then((r) => r.json()).then((d) => setInvoices(d.data ?? [])).catch(() => {});
    fetch("/api/payments").then((r) => r.json()).then((d) => setPaymentsList(d.data ?? [])).catch(() => {});
    fetch("/api/claims").then((r) => r.json()).then((d) => setClaims(d.data ?? [])).catch(() => {});
    fetch("/api/tariffs").then((r) => r.json()).then((d) => setTariffList(d.data ?? [])).catch(() => {});
    fetch("/api/patients").then((r) => r.json()).then((d) => setPatientsList(d.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreateInvoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const tariffId = form.get("tariffId") as string;
    const tariff = tariffList.find((t) => t.id === tariffId);
    const billingType = form.get("billingType") as string;
    if (!tariff) return;
    const unitPrice = billingType === "medical_aid" ? parseFloat(tariff.medicalAidPrice) : parseFloat(tariff.cashPrice);
    await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: form.get("patientId"),
        billingType,
        insuranceProvider: form.get("insuranceProvider") || null,
        insurancePolicyNumber: form.get("insurancePolicyNumber") || null,
        lineItems: [{ description: tariff.description, quantity: 1, unitPrice, tariffId: tariff.id }],
      }),
    });
    setInvoiceDialogOpen(false);
    fetchAll();
  };

  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const invoiceId = form.get("invoiceId") as string;
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice) return;
    await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId,
        patientId: invoice.patientId,
        amount: form.get("amount"),
        method: form.get("method"),
        reference: form.get("reference"),
        receivedBy: "Gerald Holdings Admin",
      }),
    });
    setPaymentDialogOpen(false);
    fetchAll();
  };

  const handleSubmitClaim = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const invoiceId = form.get("invoiceId") as string;
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice) return;
    await fetch("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId,
        patientId: invoice.patientId,
        medicalAid: form.get("medicalAid"),
        membershipNumber: form.get("membershipNumber"),
        amountClaimed: invoice.totalAmount,
      }),
    });
    setClaimDialogOpen(false);
    fetchAll();
  };

  const unpaidInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "written_off");

  return (
    <Shell title="Finance" description="Billing, receipting, insurance claims and revenue management">
      {/* KPI Row */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={TrendingUp} value={analytics ? money(analytics.totalInvoiced) : "—"} label="Total Invoiced" tone="text-premium bg-premium-soft" />
        <StatCard icon={Wallet} value={analytics ? money(analytics.totalCollected) : "—"} label="Total Collected" tone="text-operational bg-operational-soft" />
        <StatCard icon={FileWarning} value={analytics ? money(analytics.outstanding) : "—"} label="Outstanding" tone="text-premium bg-premium-soft" />
        <StatCard icon={Banknote} value={analytics ? money(analytics.totalExpenses) : "—"} label="Total Expenses" tone="text-red-600 bg-red-50" />
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Billing / Invoices</TabsTrigger>
          <TabsTrigger value="payments">Receipting</TabsTrigger>
          <TabsTrigger value="claims">Insurance Claims</TabsTrigger>
          <TabsTrigger value="tariffs">Price List</TabsTrigger>
        </TabsList>

        {/* ── Invoices / Billing ── */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Invoices</CardTitle>
                  <CardDescription>Patient billing across cash and medical aid</CardDescription>
                </div>
                <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="mr-2 h-4 w-4" />New Invoice</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Invoice</DialogTitle>
                      <DialogDescription>Bill a patient for a procedure from the price list.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateInvoice} className="space-y-4">
                      <FormField label="Patient" required>
                        <Select name="patientId" required>
                          <option value="">Select patient...</option>
                          {patientsList.map((p) => (
                            <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.mrn})</option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label="Procedure (Tariff)" required>
                        <Select name="tariffId" required>
                          <option value="">Select procedure...</option>
                          {tariffList.map((t) => (
                            <option key={t.id} value={t.id}>{t.code} — {t.description}</option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label="Billing Type" required>
                        <Select name="billingType" required>
                          {BILLING_TYPES.map((b) => <option key={b} value={b}>{b.replace(/_/g, " ")}</option>)}
                        </Select>
                      </FormField>
                      <FormField label="Insurance Provider">
                        <Input name="insuranceProvider" placeholder="e.g. Discovery Health" />
                      </FormField>
                      <FormField label="Policy Number">
                        <Input name="insurancePolicyNumber" />
                      </FormField>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={() => setInvoiceDialogOpen(false)}>Cancel</Button>
                        <Button type="submit">Create Invoice</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issued</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <EmptyStateRow colSpan={8}>No invoices yet.</EmptyStateRow>
                  ) : (
                    invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                        <TableCell className="font-medium">{inv.patientFirstName} {inv.patientLastName}</TableCell>
                        <TableCell><Badge variant="outline">{inv.billingType.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell>{money(inv.totalAmount)}</TableCell>
                        <TableCell>{money(inv.amountPaid)}</TableCell>
                        <TableCell className={parseFloat(inv.totalAmount) - parseFloat(inv.amountPaid) > 0 ? "font-semibold text-red-600" : ""}>
                          {money(parseFloat(inv.totalAmount) - parseFloat(inv.amountPaid))}
                        </TableCell>
                        <TableCell><StatusBadge status={inv.status} /></TableCell>
                        <TableCell>{formatDate(inv.issueDate)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payments / Receipting ── */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Receipting</CardTitle>
                  <CardDescription>Payments received against invoices</CardDescription>
                </div>
                <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="mr-2 h-4 w-4" />Record Payment</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Record Payment</DialogTitle>
                      <DialogDescription>Issue a receipt against an outstanding invoice.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleRecordPayment} className="space-y-4">
                      <FormField label="Invoice" required>
                        <Select name="invoiceId" required>
                          <option value="">Select invoice...</option>
                          {unpaidInvoices.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.invoiceNumber} — {i.patientFirstName} {i.patientLastName} (Balance: {money(parseFloat(i.totalAmount) - parseFloat(i.amountPaid))})
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label="Amount (BWP)" required>
                        <Input name="amount" type="number" step="0.01" required />
                      </FormField>
                      <FormField label="Method" required>
                        <Select name="method" required>
                          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
                        </Select>
                      </FormField>
                      <FormField label="Reference">
                        <Input name="reference" placeholder="Transaction / auth reference" />
                      </FormField>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
                        <Button type="submit">Record Payment</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Received By</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsList.length === 0 ? (
                    <EmptyStateRow colSpan={8}>No payments recorded.</EmptyStateRow>
                  ) : (
                    paymentsList.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm">{p.receiptNumber}</TableCell>
                        <TableCell className="font-medium">{p.patientFirstName} {p.patientLastName}</TableCell>
                        <TableCell className="font-mono text-sm">{p.invoiceNumber}</TableCell>
                        <TableCell className="font-semibold text-operational">{money(p.amount)}</TableCell>
                        <TableCell><Badge variant="outline">{p.method.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="text-sm text-slate-500">{p.reference || "—"}</TableCell>
                        <TableCell>{p.receivedBy || "—"}</TableCell>
                        <TableCell>{formatDate(p.receivedAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Insurance Claims ── */}
        <TabsContent value="claims">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Insurance Claims</CardTitle>
                  <CardDescription>Medical aid claim submissions and status tracking</CardDescription>
                </div>
                <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="mr-2 h-4 w-4" />Submit Claim</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Submit Insurance Claim</DialogTitle>
                      <DialogDescription>File a claim with the patient&apos;s medical aid.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmitClaim} className="space-y-4">
                      <FormField label="Invoice" required>
                        <Select name="invoiceId" required>
                          <option value="">Select invoice...</option>
                          {invoices.filter((i) => i.billingType === "medical_aid").map((i) => (
                            <option key={i.id} value={i.id}>{i.invoiceNumber} — {i.patientFirstName} {i.patientLastName}</option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label="Medical Aid" required>
                        <Input name="medicalAid" required placeholder="e.g. Discovery Health" />
                      </FormField>
                      <FormField label="Membership Number">
                        <Input name="membershipNumber" />
                      </FormField>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={() => setClaimDialogOpen(false)}>Cancel</Button>
                        <Button type="submit">Submit Claim</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Medical Aid</TableHead>
                    <TableHead>Claimed</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.length === 0 ? (
                    <EmptyStateRow colSpan={7}>No claims submitted.</EmptyStateRow>
                  ) : (
                    claims.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-sm">{c.claimNumber}</TableCell>
                        <TableCell className="font-medium">{c.patientFirstName} {c.patientLastName}</TableCell>
                        <TableCell>{c.medicalAid}</TableCell>
                        <TableCell>{money(c.amountClaimed)}</TableCell>
                        <TableCell>{c.amountApproved ? money(c.amountApproved) : "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} />
                          {c.rejectionReason && <p className="mt-1 text-xs text-red-500">{c.rejectionReason}</p>}
                        </TableCell>
                        <TableCell>{formatDate(c.submittedAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tariffs / Price List ── */}
        <TabsContent value="tariffs">
          <Card>
            <CardHeader>
              <CardTitle>Procedure Price List</CardTitle>
              <CardDescription>Cash and medical aid tariffs by procedure code</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Modality</TableHead>
                    <TableHead>Cash Price</TableHead>
                    <TableHead>Medical Aid Price</TableHead>
                    <TableHead>NAPPI Code</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tariffList.length === 0 ? (
                    <EmptyStateRow colSpan={7}>No tariffs configured.</EmptyStateRow>
                  ) : (
                    tariffList.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-sm">{t.code}</TableCell>
                        <TableCell className="font-medium">{t.description}</TableCell>
                        <TableCell><Badge variant="outline">{t.modality}</Badge></TableCell>
                        <TableCell>{money(t.cashPrice)}</TableCell>
                        <TableCell>{money(t.medicalAidPrice)}</TableCell>
                        <TableCell className="font-mono text-sm text-slate-500">—</TableCell>
                        <TableCell><Badge variant={t.active ? "success" : "secondary"}>{t.active ? "Active" : "Inactive"}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
