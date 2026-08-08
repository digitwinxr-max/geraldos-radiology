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
      .then((d) => { if (Array.isArray(d)) setItems(d); })
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

  const statusBadge = (s: string) => {
    const map: Record<string, "success" | "warning" | "destructive"> = {
      operational: "success",
      maintenance: "warning",
      offline: "destructive",
    };
    return <Badge variant={map[s] || "secondary"}>{s}</Badge>;
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
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Name *</label>
                <Input name="name" required placeholder="e.g. CT Scanner 3" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Modality *</label>
                <Select name="modality" required>
                  <option value="">Select...</option>
                  {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Location</label>
                <Input name="location" placeholder="e.g. Room 103" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Manufacturer</label>
                <Input name="manufacturer" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Model</label>
                <Input name="model" />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Serial Number</label>
                <Input name="serialNumber" />
              </div>
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
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-soft">
              <Wrench className="h-6 w-6 text-brand" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{items.length}</p>
              <p className="text-sm text-slate-500">Total Units</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-operational-soft">
              <CheckCircle className="h-6 w-6 text-operational" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{operational.length}</p>
              <p className="text-sm text-slate-500">Operational</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-premium-soft">
              <AlertTriangle className="h-6 w-6 text-premium" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{maintenance.length}</p>
              <p className="text-sm text-slate-500">In Maintenance</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{offline.length}</p>
              <p className="text-sm text-slate-500">Offline</p>
            </div>
          </CardContent>
        </Card>
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
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-slate-400">
                    No equipment registered.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{statusBadge(item.status)}</TableCell>
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
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${
                                parseFloat(item.utilizationRate) > 80
                                  ? "bg-operational"
                                  : parseFloat(item.utilizationRate) > 50
                                  ? "bg-brand"
                                  : "bg-premium"
                              }`}
                              style={{ width: `${Math.min(100, parseFloat(item.utilizationRate))}%` }}
                            />
                          </div>
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
