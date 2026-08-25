"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField } from "@/components/ui/form-field";
import { EmptyStateRow } from "@/components/ui/empty-state";
import { UtilizationBar } from "@/components/ui/utilization-bar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Wrench, Plus, CheckCircle, AlertTriangle, XCircle, Activity } from "lucide-react";
import { formatDate, MODALITIES } from "@/lib/utils";

interface EquipmentItem {
  id: string;
  name: string;
  modality: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  location: string | null;
  status: string;
  installDate: string | null;
  lastCalibration: string | null;
  nextCalibration: string | null;
  utilizationRate: string | null;
}

export default function EquipmentPage() {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchData = useCallback(() => {
    fetch("/api/equipment")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.data)) setItems(d.data); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get("name") as string,
      modality: form.get("modality") as string,
      manufacturer: form.get("manufacturer") as string,
      model: form.get("model") as string,
      serialNumber: form.get("serialNumber") as string,
      location: form.get("location") as string,
    };
    await fetch("/api/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setDialogOpen(false);
    fetchData();
  };

  const statusIcon = (s: string) => {
    if (s === "operational") return <CheckCircle className="h-4 w-4 text-operational" />;
    if (s === "maintenance") return <AlertTriangle className="h-4 w-4 text-premium" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const operational = items.filter((i) => i.status === "operational");
  const maintenance = items.filter((i) => i.status === "maintenance");
  const offline = items.filter((i) => i.status === "offline");

  return (
    <Shell
      title="Equipment Management"
      description="Equipment, maintenance, calibration, and utilisation tracking"
      actions={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Add Equipment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Equipment</DialogTitle>
              <DialogDescription>Register a new imaging machine or equipment unit.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <FormField label="Name" required className="col-span-2">
                <Input name="name" required placeholder="e.g. CT Scanner 3" />
              </FormField>
              <FormField label="Modality" required>
                <Select name="modality" required>
                  <option value="">Select...</option>
                  {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
              </FormField>
              <FormField label="Location">
                <Input name="location" placeholder="e.g. Room 103" />
              </FormField>
              <FormField label="Manufacturer">
                <Input name="manufacturer" />
              </FormField>
              <FormField label="Model">
                <Input name="model" />
              </FormField>
              <FormField label="Serial Number" className="col-span-2">
                <Input name="serialNumber" />
              </FormField>
              <div className="col-span-2 flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit">Add Equipment</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-4">
        <StatCard icon={Wrench} value={items.length} label="Total Units" tone="text-brand bg-brand-soft" />
        <StatCard icon={CheckCircle} value={operational.length} label="Operational" tone="text-operational bg-operational-soft" />
        <StatCard icon={AlertTriangle} value={maintenance.length} label="In Maintenance" tone="text-premium bg-premium-soft" />
        <StatCard icon={XCircle} value={offline.length} label="Offline" tone="text-red-600 bg-red-50" />
      </div>

      {/* Equipment Table */}
      <Card>
        <CardHeader>
          <CardTitle>Equipment Registry</CardTitle>
          <CardDescription>All imaging equipment and their current status</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Modality</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Serial #</TableHead>
                <TableHead>Last Calibration</TableHead>
                <TableHead>Next Calibration</TableHead>
                <TableHead>Utilisation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <EmptyStateRow colSpan={10}>No equipment registered.</EmptyStateRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell><StatusBadge status={item.status} /></TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell><Badge variant="outline">{item.modality}</Badge></TableCell>
                    <TableCell>{item.manufacturer || "—"}</TableCell>
                    <TableCell>{item.model || "—"}</TableCell>
                    <TableCell>{item.location || "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{item.serialNumber || "—"}</TableCell>
                    <TableCell>{item.lastCalibration ? formatDate(item.lastCalibration) : "—"}</TableCell>
                    <TableCell>
                      {item.nextCalibration ? (
                        <span className={new Date(item.nextCalibration) < new Date() ? "text-red-600 font-medium" : ""}>
                          {formatDate(item.nextCalibration)}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {item.utilizationRate ? (
                        <div className="flex items-center gap-2">
                          <UtilizationBar
                            value={parseFloat(item.utilizationRate)}
                            className="w-16"
                            colorFor={(v) => (v > 80 ? "bg-operational" : v > 50 ? "bg-brand" : "bg-premium")}
                          />
                          <span className="text-sm text-slate-600">{parseFloat(item.utilizationRate).toFixed(0)}%</span>
                        </div>
                      ) : "—"}
                    </TableCell>
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
