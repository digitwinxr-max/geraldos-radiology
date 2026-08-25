"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyStateRow } from "@/components/ui/empty-state";
import { StatusBadge, PriorityBadge } from "@/components/ui/status-badge";
import { Calendar, Clock, Monitor, User } from "lucide-react";

interface Appointment {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  duration: number;
  modality: string;
  procedure: string;
  priority: string;
  status: string;
  checkedIn: boolean | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientMrn: string | null;
  equipmentName: string | null;
  radiographerFirstName: string | null;
  radiographerLastName: string | null;
}

interface Equipment {
  id: string;
  name: string;
  modality: string;
  status: string;
  location: string | null;
  utilizationRate: string | null;
}

export default function SchedulingPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);

  const fetchData = useCallback(() => {
    fetch("/api/appointments").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setAppointments(d); }).catch(() => {});
    fetch("/api/equipment").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setEquipmentList(d); }).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const today = new Date().toISOString().split("T")[0];
  const todayAppts = appointments.filter((a) => a.scheduledDate === today);

  const timeSlots = ["07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00"];

  const operationalEquipment = equipmentList.filter((e) => e.status === "operational");

  return (
    <Shell title="Scheduling" description="Machine allocation, radiographer allocation, and calendar management">
      {/* Calendar Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-4">
        <StatCard icon={Calendar} value={todayAppts.length} label="Today's Slots" tone="text-brand bg-brand-soft" />
        <StatCard icon={Monitor} value={operationalEquipment.length} label="Available Machines" tone="text-emerald-600 bg-emerald-50" />
        <StatCard
          icon={Clock}
          value={todayAppts.filter((a) => a.status === "scheduled").length}
          label="Pending"
          tone="text-amber-600 bg-amber-50"
        />
        <StatCard
          icon={User}
          value={todayAppts.filter((a) => a.priority === "stat" || a.priority === "urgent").length}
          label="Priority Cases"
          tone="text-ai bg-ai-soft"
        />
      </div>

      {/* Schedule Grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Daily Schedule</CardTitle>
              <CardDescription>{new Date().toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header */}
              <div className="grid gap-1" style={{ gridTemplateColumns: `80px repeat(${operationalEquipment.length || 1}, 1fr)` }}>
                <div className="p-2 text-xs font-medium text-slate-500">Time</div>
                {operationalEquipment.map((eq) => (
                  <div key={eq.id} className="rounded-t-md bg-slate-50 p-2 text-center">
                    <p className="text-sm font-semibold text-slate-700">{eq.name}</p>
                    <p className="text-xs text-slate-400">{eq.location}</p>
                  </div>
                ))}
              </div>

              {/* Time slots */}
              {timeSlots.map((slot) => (
                <div
                  key={slot}
                  className="grid gap-1 border-t border-slate-50"
                  style={{ gridTemplateColumns: `80px repeat(${operationalEquipment.length || 1}, 1fr)` }}
                >
                  <div className="flex items-center p-2 text-xs text-slate-400">{slot}</div>
                  {operationalEquipment.map((eq) => {
                    const appt = todayAppts.find(
                      (a) => a.scheduledTime?.substring(0, 5) === slot && a.equipmentName === eq.name
                    );
                    if (appt) {
                      return (
                        <div
                          key={eq.id}
                          className={`m-0.5 rounded-md p-2 text-xs ${
                            appt.priority === "stat"
                              ? "bg-red-50 border border-red-200"
                              : appt.priority === "urgent"
                              ? "bg-amber-50 border border-amber-200"
                              : "bg-brand-soft border border-brand/40"
                          }`}
                        >
                          <p className="font-semibold text-slate-800">{appt.patientFirstName} {appt.patientLastName}</p>
                          <p className="text-slate-500">{appt.procedure}</p>
                          <p className="mt-1 text-slate-400">{appt.duration}min • {appt.radiographerFirstName || "Unassigned"}</p>
                        </div>
                      );
                    }
                    return <div key={eq.id} className="m-0.5 min-h-[2.5rem] rounded-md bg-slate-25" />;
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Full Appointment List */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>All Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Procedure</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Radiographer</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.length === 0 ? (
                <EmptyStateRow colSpan={8}>
                  No appointments found.
                </EmptyStateRow>
              ) : (
                appointments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.scheduledDate}</TableCell>
                    <TableCell className="font-mono">{a.scheduledTime}</TableCell>
                    <TableCell className="font-medium">{a.patientFirstName} {a.patientLastName}</TableCell>
                    <TableCell>{a.procedure}</TableCell>
                    <TableCell>{a.equipmentName || "—"}</TableCell>
                    <TableCell>{a.radiographerFirstName ? `${a.radiographerFirstName} ${a.radiographerLastName}` : "—"}</TableCell>
                    <TableCell><PriorityBadge priority={a.priority} /></TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Shell>
  );
}
