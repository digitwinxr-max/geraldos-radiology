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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Users, Building2, ShieldCheck, Plus, Briefcase, MapPin } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { EMPLOYMENT_TYPES } from "@/lib/finance";

interface Employee {
  id: string;
  employeeNumber: string;
  department: string | null;
  employmentType: string;
  startDate: string | null;
  monthlySalary: string | null;
  hourlyRate: string | null;
  status: string;
  staffFirstName: string | null;
  staffLastName: string | null;
  staffRole: string | null;
  staffEmail: string | null;
  branchName: string | null;
}

interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  status: string;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string | null;
}

const money = (n: number | string | null) => (n ? `P${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—");

export default function AdministrationPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branchesList, setBranchesList] = useState<Branch[]>([]);
  const [rolesList, setRolesList] = useState<Role[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);

  const fetchAll = useCallback(() => {
    fetch("/api/employees").then((r) => r.json()).then((d) => Array.isArray(d) && setEmployees(d)).catch(() => {});
    fetch("/api/branches").then((r) => r.json()).then((d) => Array.isArray(d) && setBranchesList(d)).catch(() => {});
    fetch("/api/roles").then((r) => r.json()).then((d) => Array.isArray(d) && setRolesList(d)).catch(() => {});
    fetch("/api/staff").then((r) => r.json()).then((d) => Array.isArray(d) && setStaffList(d)).catch(() => {});
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAddEmployee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffId: form.get("staffId"),
        department: form.get("department"),
        employmentType: form.get("employmentType"),
        branchId: form.get("branchId") || null,
        startDate: form.get("startDate"),
        monthlySalary: form.get("monthlySalary") || null,
        hourlyRate: form.get("hourlyRate") || null,
      }),
    });
    setEmployeeDialogOpen(false);
    fetchAll();
  };

  const handleAddBranch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        code: form.get("code"),
        address: form.get("address"),
        phone: form.get("phone"),
        email: form.get("email"),
        managerName: form.get("managerName"),
      }),
    });
    setBranchDialogOpen(false);
    fetchAll();
  };

  const employedStaffIds = new Set(employees.map((e) => `${e.staffFirstName ?? ""}${e.staffLastName ?? ""}`));
  const unassignedStaff = staffList.filter((s) => !employedStaffIds.has(`${s.firstName}${s.lastName}`));

  return (
    <Shell title="Administration" description="Staff, branches, roles & permissions, and organisational management">
      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-soft">
              <Users className="h-6 w-6 text-brand" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{employees.length}</p>
              <p className="text-sm text-slate-500">Employees</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50">
              <Building2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{branchesList.length}</p>
              <p className="text-sm text-slate-500">Branches</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ai-soft">
              <ShieldCheck className="h-6 w-6 text-ai" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{rolesList.length}</p>
              <p className="text-sm text-slate-500">Roles Configured</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">Staff & HR</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
        </TabsList>

        {/* ── Staff / HR ── */}
        <TabsContent value="staff">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Employee Records</CardTitle>
                  <CardDescription>HR records, department, employment type and compensation</CardDescription>
                </div>
                <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="mr-2 h-4 w-4" />Add Employee Record</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Employee Record</DialogTitle>
                      <DialogDescription>Create an HR record for an existing staff member.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddEmployee} className="space-y-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Staff Member *</label>
                        <Select name="staffId" required>
                          <option value="">Select staff...</option>
                          {unassignedStaff.map((s) => (
                            <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.role})</option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Department</label>
                        <Input name="department" placeholder="e.g. Radiology" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Branch</label>
                        <Select name="branchId">
                          <option value="">Unassigned</option>
                          {branchesList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Employment Type</label>
                        <Select name="employmentType">
                          {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                        </Select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Start Date</label>
                        <Input name="startDate" type="date" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Monthly Salary (BWP)</label>
                        <Input name="monthlySalary" type="number" step="0.01" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Hourly Rate (BWP)</label>
                        <Input name="hourlyRate" type="number" step="0.01" />
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={() => setEmployeeDialogOpen(false)}>Cancel</Button>
                        <Button type="submit">Add Record</Button>
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
                    <TableHead>Emp #</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Compensation</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="py-12 text-center text-slate-400">No employee records.</TableCell></TableRow>
                  ) : (
                    employees.map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell className="font-mono text-sm">{emp.employeeNumber}</TableCell>
                        <TableCell className="font-medium">{emp.staffFirstName} {emp.staffLastName}</TableCell>
                        <TableCell><Badge variant="outline">{emp.staffRole}</Badge></TableCell>
                        <TableCell>{emp.department || "—"}</TableCell>
                        <TableCell>{emp.branchName || "—"}</TableCell>
                        <TableCell className="capitalize">{emp.employmentType.replace(/_/g, " ")}</TableCell>
                        <TableCell>
                          {emp.monthlySalary ? `${money(emp.monthlySalary)}/mo` : emp.hourlyRate ? `${money(emp.hourlyRate)}/hr` : "—"}
                        </TableCell>
                        <TableCell>{emp.startDate ? formatDate(emp.startDate) : "—"}</TableCell>
                        <TableCell><Badge variant={emp.status === "active" ? "success" : "secondary"}>{emp.status}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Branches ── */}
        <TabsContent value="branches">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Branch Locations</CardTitle>
                  <CardDescription>Gerald Holdings imaging centres</CardDescription>
                </div>
                <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="mr-2 h-4 w-4" />Add Branch</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Branch</DialogTitle>
                      <DialogDescription>Register a new imaging centre location.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddBranch} className="space-y-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Name *</label>
                        <Input name="name" required />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Code *</label>
                        <Input name="code" required placeholder="e.g. BR-CPT" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
                        <Input name="address" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                        <Input name="phone" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                        <Input name="email" type="email" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Manager</label>
                        <Input name="managerName" />
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={() => setBranchDialogOpen(false)}>Cancel</Button>
                        <Button type="submit">Add Branch</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {branchesList.length === 0 ? (
                  <p className="col-span-full py-12 text-center text-slate-400">No branches registered.</p>
                ) : (
                  branchesList.map((b) => (
                    <div key={b.id} className="rounded-lg border border-slate-100 p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                            <MapPin className="h-4 w-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{b.name}</p>
                            <p className="font-mono text-xs text-slate-400">{b.code}</p>
                          </div>
                        </div>
                        <Badge variant={b.status === "active" ? "success" : "secondary"}>{b.status}</Badge>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-slate-500">
                        {b.address && <p>{b.address}</p>}
                        {b.phone && <p>{b.phone}</p>}
                        {b.email && <p>{b.email}</p>}
                        {b.managerName && <p className="pt-1 text-slate-700">Manager: {b.managerName}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Roles & Permissions ── */}
        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Roles & Permissions</CardTitle>
              <CardDescription>RBAC roles sourced from Keycloak realm & platform-defined roles</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {rolesList.length === 0 ? (
                  <p className="py-12 text-center text-slate-400">No roles configured.</p>
                ) : (
                  rolesList.map((r) => (
                    <div key={r.id} className="flex items-start justify-between rounded-lg border border-slate-100 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ai-soft">
                          <Briefcase className="h-4 w-4 text-ai" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold capitalize text-slate-900">{r.name.replace(/_/g, " ")}</p>
                            {r.isSystem && <Badge variant="outline" className="text-xs">System</Badge>}
                          </div>
                          <p className="text-sm text-slate-500">{r.description}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(Array.isArray(r.permissions) ? r.permissions : []).map((p) => (
                              <Badge key={p} variant="secondary" className="font-mono text-xs">{p}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
