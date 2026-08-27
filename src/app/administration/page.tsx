"use client";

import React, { useState } from "react";
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
import { ErrorState } from "@/components/ui/error-state";
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
import { Users, Building2, ShieldCheck, Plus, Briefcase, MapPin } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { EMPLOYMENT_TYPES } from "@/lib/finance";
import { useEmployees, useBranches, useRoles, useStaff, useAdministrationMutation } from "@/hooks/use-administration";

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
  const employeesQuery = useEmployees<Employee>();
  const branchesQuery = useBranches<Branch>();
  const rolesQuery = useRoles<Role>();
  const staffQuery = useStaff<StaffMember>();
  const addEmployee = useAdministrationMutation("/api/employees");
  const addBranch = useAdministrationMutation("/api/branches");
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);

  const employees = employeesQuery.data ?? [];
  const branchesList = branchesQuery.data ?? [];
  const rolesList = rolesQuery.data ?? [];
  const staffList = staffQuery.data ?? [];

  const handleAddEmployee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      department: form.get("department"),
      employmentType: form.get("employmentType"),
      branchId: form.get("branchId") || null,
      startDate: form.get("startDate"),
      monthlySalary: form.get("monthlySalary") || null,
      hourlyRate: form.get("hourlyRate") || null,
    };
    if (staffMode === "new") {
      payload.newStaff = {
        firstName: form.get("newFirstName"),
        lastName: form.get("newLastName"),
        role: form.get("newRole"),
        specialization: form.get("newSpecialization") || null,
        email: form.get("newEmail") || null,
        phone: form.get("newPhone") || null,
      };
    } else {
      payload.staffId = form.get("staffId");
    }
    await addEmployee.mutateAsync(payload).catch(() => {});
    setEmployeeDialogOpen(false);
    setStaffMode("existing");
  };

  const handleAddBranch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await addBranch.mutateAsync({
      name: form.get("name"),
      code: form.get("code"),
      address: form.get("address"),
      phone: form.get("phone"),
      email: form.get("email"),
      managerName: form.get("managerName"),
    }).catch(() => {});
    setBranchDialogOpen(false);
  };

  const employedStaffIds = new Set(employees.map((e) => `${e.staffFirstName ?? ""}${e.staffLastName ?? ""}`));
  const unassignedStaff = staffList.filter((s) => !employedStaffIds.has(`${s.firstName}${s.lastName}`));
  const [staffMode, setStaffMode] = useState<"existing" | "new">("existing");

  return (
    <Shell title="Administration" description="Staff, branches, roles & permissions, and organisational management">
      {employeesQuery.isError && !employeesQuery.data && (
        <ErrorState message="Failed to load administration data." onRetry={() => employeesQuery.refetch()} />
      )}

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard icon={Users} value={employees.length} label="Employees" tone="text-brand bg-brand-soft" />
        <StatCard icon={Building2} value={branchesList.length} label="Branches" tone="text-emerald-600 bg-emerald-50" />
        <StatCard icon={ShieldCheck} value={rolesList.length} label="Roles Configured" tone="text-ai bg-ai-soft" />
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
                      <DialogTitle>Add Employee</DialogTitle>
                      <DialogDescription>Create a new staff member or link an existing one to an employee record.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddEmployee} className="space-y-4">
                      {/* Staff mode toggle */}
                      <FormField label="Staff Member">
                        <div className="flex gap-2 mb-2">
                          <Button
                            type="button"
                            variant={staffMode === "existing" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setStaffMode("existing")}
                          >
                            Existing Staff
                          </Button>
                          <Button
                            type="button"
                            variant={staffMode === "new" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setStaffMode("new")}
                          >
                            New Staff Member
                          </Button>
                        </div>
                        {staffMode === "existing" ? (
                          <Select name="staffId" required>
                            <option value="">Select staff...</option>
                            {unassignedStaff.length > 0 && (
                              <optgroup label="Unassigned Staff">
                                {unassignedStaff.map((s) => (
                                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.role})</option>
                                ))}
                              </optgroup>
                            )}
                            {employees.length > 0 && (
                              <optgroup label="Current Employees (already assigned)">
                                {employees.map((e) => (
                                  <option key={e.id} value="" disabled>
                                    {e.staffFirstName} {e.staffLastName} — {e.branchName ?? "No Branch"} ({e.staffRole})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </Select>
                        ) : (
                          <div className="space-y-3 rounded-lg border border-dashed border-slate-200 p-3">
                            <div className="grid grid-cols-2 gap-3">
                              <FormField label="First Name" required>
                                <Input name="newFirstName" required placeholder="e.g. Thato" />
                              </FormField>
                              <FormField label="Last Name" required>
                                <Input name="newLastName" required placeholder="e.g. Ramotswe" />
                              </FormField>
                            </div>
                            <FormField label="Role" required>
                              <Select name="newRole" required>
                                <option value="">Select role...</option>
                                <option value="radiologist">Radiologist</option>
                                <option value="radiographer">Radiographer</option>
                                <option value="receptionist">Receptionist</option>
                                <option value="administrator">Administrator</option>
                                <option value="manager">Manager</option>
                                <option value="finance_officer">Finance Officer</option>
                              </Select>
                            </FormField>
                            <div className="grid grid-cols-2 gap-3">
                              <FormField label="Specialization">
                                <Input name="newSpecialization" placeholder="e.g. Neuroradiology" />
                              </FormField>
                              <FormField label="Email">
                                <Input name="newEmail" type="email" placeholder="e.g. thato@gerald.co.bw" />
                              </FormField>
                            </div>
                            <FormField label="Phone">
                              <Input name="newPhone" placeholder="e.g. +267 71 100 101" />
                            </FormField>
                          </div>
                        )}
                      </FormField>
                      <FormField label="Department">
                        <Input name="department" placeholder="e.g. Radiology" />
                      </FormField>
                      <FormField label="Branch">
                        <Select name="branchId">
                          <option value="">Unassigned</option>
                          {branchesList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                      </FormField>
                      <FormField label="Employment Type">
                        <Select name="employmentType">
                          {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                        </Select>
                      </FormField>
                      <FormField label="Start Date">
                        <Input name="startDate" type="date" />
                      </FormField>
                      <FormField label="Monthly Salary (BWP)">
                        <Input name="monthlySalary" type="number" step="0.01" />
                      </FormField>
                      <FormField label="Hourly Rate (BWP)">
                        <Input name="hourlyRate" type="number" step="0.01" />
                      </FormField>
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
                    <EmptyStateRow colSpan={9}>No employee records.</EmptyStateRow>
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
                        <TableCell><StatusBadge status={emp.status} /></TableCell>
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
                      <FormField label="Name" required>
                        <Input name="name" required />
                      </FormField>
                      <FormField label="Code" required>
                        <Input name="code" required placeholder="e.g. BR-CPT" />
                      </FormField>
                      <FormField label="Address">
                        <Input name="address" />
                      </FormField>
                      <FormField label="Phone">
                        <Input name="phone" />
                      </FormField>
                      <FormField label="Email">
                        <Input name="email" type="email" />
                      </FormField>
                      <FormField label="Manager">
                        <Input name="managerName" />
                      </FormField>
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
                        <StatusBadge status={b.status} />
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
