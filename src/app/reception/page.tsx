"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyStateRow } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { StatusBadge, PriorityBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { UserPlus, Search, Users, Clock, CheckCircle } from "lucide-react";
import { formatDate, generateMRN } from "@/lib/utils";

interface Patient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string | null;
  email: string | null;
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  consentSigned: boolean | null;
  status: string;
  createdAt: string;
}

interface Appointment {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  modality: string;
  procedure: string;
  priority: string;
  status: string;
  checkedIn: boolean | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientMrn: string | null;
}

export default function ReceptionPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchPatients = useCallback(() => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/patients${params}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.data)) setPatients(d.data); })
      .catch(() => {});
  }, [search]);

  const fetchAppointments = useCallback(() => {
    fetch("/api/appointments")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.data)) setAppointments(d.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchPatients();
    fetchAppointments();
  }, [fetchPatients, fetchAppointments]);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      mrn: generateMRN(),
      firstName: form.get("firstName") as string,
      lastName: form.get("lastName") as string,
      dateOfBirth: form.get("dateOfBirth") as string,
      gender: form.get("gender") as string,
      phone: form.get("phone") as string,
      email: form.get("email") as string,
      insuranceProvider: form.get("insuranceProvider") as string,
      insurancePolicyNumber: form.get("insurancePolicyNumber") as string,
    };
    await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setDialogOpen(false);
    fetchPatients();
  };

  const todayAppointments = appointments.filter((a) => {
    const today = new Date().toISOString().split("T")[0];
    return a.scheduledDate === today;
  });

  const waitingQueue = todayAppointments.filter((a) => a.checkedIn && a.status !== "completed" && a.status !== "in_progress");

  return (
    <Shell
      title="Reception"
      description="Patient registration, check-in, and queue management"
      actions={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Register Patient
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Register New Patient</DialogTitle>
              <DialogDescription>Enter patient demographic and insurance details.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleRegister} className="grid grid-cols-2 gap-4">
              <FormField label="First Name" required>
                <Input name="firstName" required />
              </FormField>
              <FormField label="Last Name" required>
                <Input name="lastName" required />
              </FormField>
              <FormField label="Date of Birth" required>
                <Input name="dateOfBirth" type="date" required />
              </FormField>
              <FormField label="Gender" required>
                <Select name="gender" required>
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </Select>
              </FormField>
              <FormField label="Phone">
                <Input name="phone" type="tel" />
              </FormField>
              <FormField label="Email">
                <Input name="email" type="email" />
              </FormField>
              <FormField label="Insurance Provider">
                <Input name="insuranceProvider" />
              </FormField>
              <FormField label="Policy Number">
                <Input name="insurancePolicyNumber" />
              </FormField>
              <div className="col-span-2 flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit">Register Patient</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard icon={Users} value={patients.length} label="Total Patients" tone="text-brand bg-brand-soft" />
        <StatCard icon={CheckCircle} value={todayAppointments.length} label="Today's Appointments" tone="text-emerald-600 bg-emerald-50" />
        <StatCard icon={Clock} value={waitingQueue.length} label="In Waiting Queue" tone="text-amber-600 bg-amber-50" />
      </div>

      <Tabs defaultValue="patients">
        <TabsList>
          <TabsTrigger value="patients">Patient Registry</TabsTrigger>
          <TabsTrigger value="queue">Today&apos;s Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="patients">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Patient Registry</CardTitle>
                <div className="relative w-80">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search by name or MRN..."
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") fetchPatients(); }}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>MRN</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Insurance</TableHead>
                    <TableHead>Consent</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patients.length === 0 ? (
                    <EmptyStateRow colSpan={8}>
                      No patients found. Register a new patient or seed the database.
                    </EmptyStateRow>
                  ) : (
                    patients.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm">{p.mrn}</TableCell>
                        <TableCell className="font-medium">{p.firstName} {p.lastName}</TableCell>
                        <TableCell>{formatDate(p.dateOfBirth)}</TableCell>
                        <TableCell>{p.gender}</TableCell>
                        <TableCell>{p.phone || "—"}</TableCell>
                        <TableCell>{p.insuranceProvider || "—"}</TableCell>
                        <TableCell>
                          {p.consentSigned ? (
                            <Badge variant="success">Signed</Badge>
                          ) : (
                            <Badge variant="warning">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Appointment Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>MRN</TableHead>
                    <TableHead>Procedure</TableHead>
                    <TableHead>Modality</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayAppointments.length === 0 ? (
                    <EmptyStateRow colSpan={7}>
                      No appointments scheduled for today.
                    </EmptyStateRow>
                  ) : (
                    todayAppointments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono">{a.scheduledTime}</TableCell>
                        <TableCell className="font-medium">{a.patientFirstName} {a.patientLastName}</TableCell>
                        <TableCell className="font-mono text-sm">{a.patientMrn}</TableCell>
                        <TableCell>{a.procedure}</TableCell>
                        <TableCell><Badge variant="outline">{a.modality}</Badge></TableCell>
                        <TableCell><PriorityBadge priority={a.priority} /></TableCell>
                        <TableCell>
                          <Badge variant={
                            a.status === "completed" ? "success" :
                            a.status === "in_progress" ? "default" :
                            a.checkedIn ? "warning" : "secondary"
                          }>
                            {a.checkedIn && a.status === "checked_in" ? "Checked In" : a.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
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
