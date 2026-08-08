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
import { Package, Plus, AlertTriangle, TrendingDown } from "lucide-react";
import { INVENTORY_CATEGORIES } from "@/lib/utils";

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  sku: string | null;
  currentStock: number;
  minimumStock: number;
  maximumStock: number | null;
  unit: string;
  unitCost: string | null;
  supplier: string | null;
  location: string | null;
  expiryDate: string | null;
  status: string;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");

  const fetchData = useCallback(() => {
    fetch("/api/inventory")
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
      category: form.get("category") as string,
      sku: form.get("sku") as string,
      currentStock: parseInt(form.get("currentStock") as string) || 0,
      minimumStock: parseInt(form.get("minimumStock") as string) || 10,
      unit: form.get("unit") as string,
      unitCost: form.get("unitCost") as string,
      supplier: form.get("supplier") as string,
      location: form.get("location") as string,
    };
    await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setDialogOpen(false);
    fetchData();
  };

  const lowStock = items.filter((i) => i.currentStock <= i.minimumStock);
  const filtered = activeCategory === "all" ? items : items.filter((i) => i.category === activeCategory);

  const totalValue = items.reduce((sum, i) => {
    return sum + (i.unitCost ? parseFloat(i.unitCost) * i.currentStock : 0);
  }, 0);

  const categoryLabel = (c: string) => {
    const map: Record<string, string> = {
      contrast: "Contrast Media",
      gel: "Ultrasound Gel",
      ppe: "PPE",
      electrodes: "Electrodes",
      consumables: "Consumables",
    };
    return map[c] || c;
  };

  return (
    <Shell
      title="Inventory"
      description="Consumables, contrast media, and supply chain management"
      actions={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Add Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Inventory Item</DialogTitle>
              <DialogDescription>Register a new consumable or supply item.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Name *</label>
                <Input name="name" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Category *</label>
                <Select name="category" required>
                  <option value="">Select...</option>
                  {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">SKU</label>
                <Input name="sku" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Current Stock</label>
                <Input name="currentStock" type="number" defaultValue="0" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Min Stock</label>
                <Input name="minimumStock" type="number" defaultValue="10" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Unit</label>
                <Input name="unit" defaultValue="units" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Unit Cost (BWP)</label>
                <Input name="unitCost" type="number" step="0.01" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Supplier</label>
                <Input name="supplier" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Location</label>
                <Input name="location" />
              </div>
              <div className="col-span-2 flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit">Add Item</Button>
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
              <Package className="h-6 w-6 text-brand" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{items.length}</p>
              <p className="text-sm text-slate-500">Total Items</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{lowStock.length}</p>
              <p className="text-sm text-slate-500">Low Stock Alerts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-operational-soft">
              <TrendingDown className="h-6 w-6 text-operational" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">P{totalValue.toLocaleString()}</p>
              <p className="text-sm text-slate-500">Total Value</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-premium-soft">
              <Package className="h-6 w-6 text-premium" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{INVENTORY_CATEGORIES.length}</p>
              <p className="text-sm text-slate-500">Categories</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alerts */}
      {lowStock.length > 0 && (
        <Card className="mb-8 border-red-200 bg-red-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {lowStock.map((item) => (
                <div key={item.id} className="rounded-lg border border-red-200 bg-white p-4">
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-red-600">{item.currentStock}</span>
                    <span className="text-sm text-slate-500">/ {item.minimumStock} min ({item.unit})</span>
                  </div>
                  <Badge variant="destructive" className="mt-2">Reorder Required</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Filter */}
      <Tabs defaultValue="all" onValueChange={setActiveCategory}>
        <TabsList>
          <TabsTrigger value="all">All Items</TabsTrigger>
          {INVENTORY_CATEGORIES.map((c) => (
            <TabsTrigger key={c} value={c}>{categoryLabel(c)}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory}>
          <Card className="mt-2">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Min</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Unit Cost</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center text-slate-400">
                        No items in this category.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell><Badge variant="outline">{categoryLabel(item.category)}</Badge></TableCell>
                        <TableCell className="font-mono text-sm">{item.sku || "—"}</TableCell>
                        <TableCell>
                          <span className={item.currentStock <= item.minimumStock ? "font-bold text-red-600" : "text-slate-900"}>
                            {item.currentStock}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-500">{item.minimumStock}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell>{item.unitCost ? `P${parseFloat(item.unitCost).toFixed(2)}` : "—"}</TableCell>
                        <TableCell>{item.supplier || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={item.currentStock <= item.minimumStock ? "destructive" : "success"}>
                            {item.currentStock <= item.minimumStock ? "Low Stock" : "In Stock"}
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
