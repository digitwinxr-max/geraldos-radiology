"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  ScanSearch,
  Check,
  X,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Eye,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { REVIEW_MODALITIES, TECHNICAL_CHECKS } from "@/lib/ai-review";

interface Observation {
  id: string;
  studyId: string | null;
  orthancStudyId: string | null;
  modality: string;
  region: string;
  category: string;
  description: string;
  confidence: string | null;
  suggestedDifferential: string[];
  literatureRefs: string[];
  similarCaseIds: string[];
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const CATEGORY_STYLE: Record<string, { badge: "destructive" | "warning" | "outline" | "success"; label: string }> = {
  critical: { badge: "destructive", label: "Critical candidate" },
  finding: { badge: "warning", label: "Finding candidate" },
  technical: { badge: "outline", label: "Technical quality" },
  normal: { badge: "success", label: "Normal region" },
};

export default function AiReviewPage() {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "accepted" | "rejected">("pending");
  const [modality, setModality] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [reviewer, setReviewer] = useState("Dr. Radiologist");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    const res = await fetch(`/api/ai-review?${params.toString()}`);
    const data = await res.json();
    if (data.ok) setObservations(data.observations ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = modality === "all" ? observations : observations.filter((o) => o.modality === modality);

  const review = async (id: string, status: "accepted" | "rejected") => {
    await fetch(`/api/ai-review/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewedBy: reviewer }),
    });
    setObservations((obs) => obs.map((o) => (o.id === id ? { ...o, status, reviewedBy: reviewer, reviewedAt: new Date().toISOString() } : o)));
  };

  const pending = observations.filter((o) => o.status === "pending").length;
  const accepted = observations.filter((o) => o.status === "accepted").length;
  const rejected = observations.filter((o) => o.status === "rejected").length;

  return (
    <Shell title="Multi-Modal AI Review" description="X-Ray · CT · MRI · Ultrasound · Mammography · DEXA · Dental · Nuclear Medicine">
      {/* Guardrail banner */}
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900 dark:bg-amber-950/40">
        <ShieldCheck className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">The AI does not make the diagnosis</p>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Every observation below is a candidate for your review. Accept or reject each one — all decisions are audit-logged and versioned.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950"><Loader2 className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">{pending}</p><p className="text-xs text-slate-500 dark:text-slate-400">Pending Review</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950"><Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">{accepted}</p><p className="text-xs text-slate-500 dark:text-slate-400">Accepted</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950"><X className="h-5 w-5 text-red-600 dark:text-red-400" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">{rejected}</p><p className="text-xs text-slate-500 dark:text-slate-400">Rejected</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ai-soft"><Sparkles className="h-5 w-5 text-ai" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">{observations.length}</p><p className="text-xs text-slate-500 dark:text-slate-400">Total Candidates</p></div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(["pending", "all", "accepted", "rejected"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  filter === f ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <Select value={modality} onChange={(e) => setModality(e.target.value)} className="max-w-48">
            <option value="all">All modalities</option>
            {REVIEW_MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Reviewer</span>
            <input
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </CardContent>
      </Card>

      {/* Observation cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtered.length === 0 && (
          <Card className="lg:col-span-2">
            <CardContent className="p-12 text-center">
              <ScanSearch className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">No observations in this view</p>
              <p className="mt-1 text-xs text-slate-400">Run an AI review from the Imaging workspace to generate candidates.</p>
            </CardContent>
          </Card>
        )}
        {filtered.map((o) => {
          const cat = CATEGORY_STYLE[o.category] ?? CATEGORY_STYLE.normal;
          const conf = Number(o.confidence ?? 0);
          return (
            <Card key={o.id} className={cn(o.category === "critical" && "border-red-300 dark:border-red-900")}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={cat.badge} className="text-[9px] uppercase">{cat.label}</Badge>
                    <Badge variant="outline" className="text-[9px]">{o.modality}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold", conf >= 80 ? "text-red-600 dark:text-red-400" : conf >= 60 ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400")}>
                      {o.confidence ? `${o.confidence}%` : "—"}
                    </span>
                    <Badge variant={o.status === "accepted" ? "success" : o.status === "rejected" ? "secondary" : "warning"} className="text-[9px]">
                      {o.status}
                    </Badge>
                  </div>
                </div>
                <CardTitle className="mt-2 text-base capitalize">{o.region}</CardTitle>
                <CardDescription className="mt-0.5 line-clamp-3">{o.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="mb-2 flex items-center gap-1 text-xs font-medium text-brand-text hover:text-brand-active">
                  <Eye className="h-3 w-3" /> {expanded === o.id ? "Hide context" : "Show differentials & references"}
                </button>
                {expanded === o.id && (
                  <div className="animate-fade-in space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                    {o.suggestedDifferential.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Suggested differential considerations</p>
                        <ul className="mt-1 space-y-0.5">
                          {o.suggestedDifferential.map((d) => <li key={d} className="text-xs text-slate-600 dark:text-slate-400">• {d}</li>)}
                        </ul>
                      </div>
                    )}
                    {o.literatureRefs.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Reference literature</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{o.literatureRefs.join("; ")}</p>
                      </div>
                    )}
                    {o.similarCaseIds.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Previous similar cases</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {o.similarCaseIds.map((c) => <Badge key={c} variant="outline" className="font-mono text-[9px]">{c}</Badge>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400">
                    {o.reviewedAt
                      ? `Reviewed by ${o.reviewedBy} · ${new Date(o.reviewedAt).toLocaleString()}`
                      : `Generated ${new Date(o.createdAt).toLocaleString()} · v1`}
                  </span>
                  {o.status === "pending" ? (
                    <div className="flex gap-2">
                      <Button size="sm" className="h-8 gap-1 bg-emerald-600 text-[11px] hover:bg-emerald-500" onClick={() => review(o.id, "accepted")}>
                        <Check className="h-3 w-3" /> Accept
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={() => review(o.id, "rejected")}>
                        <X className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <ShieldCheck className="h-3 w-3 text-emerald-500" /> Audited
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Technical quality reference */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Technical Quality Criteria by Modality
          </CardTitle>
          <CardDescription>Checks the AI review assistant applies before any candidate is surfaced</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(Object.entries(TECHNICAL_CHECKS) as [string, { label: string; weight: number }[]][]).map(([m, checks]) => (
            <div key={m} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <p className="mb-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">{m}</p>
              <ul className="space-y-0.5">
                {checks.map((c) => (
                  <li key={c.label} className="text-[11px] text-slate-500 dark:text-slate-400">• {c.label}</li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </Shell>
  );
}
