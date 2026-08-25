"use client";

import React, { useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/ui/stat-card";
import { FormField } from "@/components/ui/form-field";
import { EmptyStateRow } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
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
import { useInventory, useCreateInventoryItem } from "@/hooks/use-inventory";

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
  const itemsQuery = useInventory<InventoryItem>();
  const createItem = useCreateInventoryItem();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");

  const items = itemsQuery.data ?? [];

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
    await createItem.mutateAsync(body).catch(() => {});
    setDialogOpen(false);
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
              <FormField label="Name" required className="col-span-2">
                <Input name="name" required />
              </FormField>
              <FormField label="Category" required>
                <Select name="category" required>
                  <option value="">Select...</option>
                  {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                </Select>
              </FormField>
              <FormField label="SKU">
                <Input name="sku" />
              </FormField>
              <FormField label="Current Stock">
                <Input name="currentStock" type="number" defaultValue="0" />
              </FormField>
              <FormField label="Min Stock">
                <Input name="minimumStock" type="number" defaultValue="10" />
              </FormField>
              <FormField label="Unit">
                <Input name="unit" defaultValue="units" />
              </FormField>
              <FormField label="Unit Cost (BWP)">
                <Input name="unitCost" type="number" step="0.01" />
              </FormField>
              <FormField label="Supplier">
                <Input name="supplier" />
              </FormField>
              <FormField label="Location">
                <Input name="location" />
              </FormField>
              <div className="col-span-2 flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit">Add Item</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {itemsQuery.isError && !itemsQuery.data && (
        <ErrorState message="Failed to load inventory." onRetry={() => itemsQuery.refetch()} />
      )}

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-4">
        <StatCard icon={Package} value={items.length} label="Total Items" tone="text-brand bg-brand-soft" />
        <StatCard icon={AlertTriangle} value={lowStock.length} label="Low Stock Alerts" tone="text-red-600 bg-red-50" />
        <StatCard icon={TrendingDown} value={`P${totalValue.toLocaleString()}`} label="Total Value" tone="text-operational bg-operational-soft" />
        <StatCard icon={Package} value={INVENTORY_CATEGORIES.length} label="Categories" tone="text-premium bg-premium-soft" />
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
                    <EmptyStateRow colSpan={9}>No items in this category.</EmptyStateRow>
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
