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
      .then((d) => { if (Array.isArray(d)) setPatients(d); })
      .catch(() => {});
  }, [search]);

  const fetchAppointments = useCallback(() => {
    fetch("/api/appointments")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setAppointments(d); })
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
  const priorityBadge = (p: string) => {
    if (p === "stat") return <Badge variant="destructive">STAT</Badge>;
    if (p === "urgent") return <Badge variant="warning">Urgent</Badge>;
    return <Badge variant="secondary">Routine</Badge>;
  };

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
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">First Name *</label>
                <Input name="firstName" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Last Name *</label>
                <Input name="lastName" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Date of Birth *</label>
                <Input name="dateOfBirth" type="date" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Gender *</label>
                <Select name="gender" required>
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                <Input name="phone" type="tel" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <Input name="email" type="email" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Insurance Provider</label>
                <Input name="insuranceProvider" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Policy Number</label>
                <Input name="insurancePolicyNumber" />
              </div>
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
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-soft">
              <Users className="h-6 w-6 text-brand" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{patients.length}</p>
              <p className="text-sm text-slate-500">Total Patients</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{todayAppointments.length}</p>
              <p className="text-sm text-slate-500">Today&apos;s Appointments</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{waitingQueue.length}</p>
              <p className="text-sm text-slate-500">In Waiting Queue</p>
            </div>
          </CardContent>
        </Card>
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
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                        No patients found. Register a new patient or seed the database.
                      </TableCell>
                    </TableRow>
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
                          <Badge variant={p.status === "active" ? "success" : "secondary"}>
                            {p.status}
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
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-slate-400">
                        No appointments scheduled for today.
                      </TableCell>
                    </TableRow>
                  ) : (
                    todayAppointments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono">{a.scheduledTime}</TableCell>
                        <TableCell className="font-medium">{a.patientFirstName} {a.patientLastName}</TableCell>
                        <TableCell className="font-mono text-sm">{a.patientMrn}</TableCell>
                        <TableCell>{a.procedure}</TableCell>
                        <TableCell><Badge variant="outline">{a.modality}</Badge></TableCell>
                        <TableCell>{priorityBadge(a.priority)}</TableCell>
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
