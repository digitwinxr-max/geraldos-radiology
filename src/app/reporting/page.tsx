"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  FileText,
  Mic,
  MicOff,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  BookOpenCheck,
  History,
  Sparkles,
  PenLine,
  ShieldCheck,
  Search,
  ClipboardList,
  Ruler,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Study {
  id: string;
  accessionNumber: string | null;
  modality: string;
  procedure: string;
  bodyPart: string | null;
  stage: string;
  patientId: string;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientMrn: string | null;
}

interface Template {
  id: string;
  name: string;
  modality: string;
  description: string;
  sections: { name: string; hint?: string }[];
  checklist: string[];
  isSystem?: boolean;
}

interface Report {
  id: string;
  studyId: string | null;
  templateName: string | null;
  findings: string | null;
  impression: string | null;
  recommendation: string | null;
  status: string;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  patientId: string;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientMrn: string | null;
}

interface AssistResult {
  template: Template | null;
  suggestedSections: { name: string; hint?: string }[];
  checklist: string[];
  bodyPartHints: string[];
  reminder: string;
  quality: { score: number; checks: { label: string; passed: boolean; weight: number }[] };
  incomplete: string[];
  criticalFindings: string[];
  terminologyDrift: { term: string; suggested: string }[];
  measurements: string[];
  priorStudies: { id: string; procedure: string; modality: string; createdAt: string }[];
  sources: string[];
}

interface Version {
  id: string;
  version: number;
  findings: string | null;
  impression: string | null;
  recommendation: string | null;
  status: string;
  qualityScore: number | null;
  aiAssisted: boolean;
  changedBy: string | null;
  createdAt: string;
}

export default function ReportingPage() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(null);
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [assisting, setAssisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"reports" | "templates">("reports");
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const fetchAll = useCallback(() => {
    fetch("/api/workflow").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setStudies(d); }).catch(() => {});
    fetch("/api/reports").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setReports(d); }).catch(() => {});
    fetch("/api/reports/templates").then((r) => r.json()).then((d) => { if (d.ok) setTemplates(d.templates ?? []); }).catch(() => {});
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Report selection ──
  const selectReport = useCallback((report: Report) => {
    setActiveReport(report);
    setFindings(report.findings ?? "");
    setImpression(report.impression ?? "");
    setRecommendation(report.recommendation ?? "");
    setTemplateId("");
    setAssist(null);
    setShowVersionHistory(false);
    fetch(`/api/reports/${report.id}/versions`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setVersions(d.versions ?? []); })
      .catch(() => {});
  }, []);

  /** Load the fully-joined report (patient + radiologist context) for the active editor. */
  const loadJoinedReport = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/reports/${id}`);
      const data = await res.json();
      if (data.ok) selectReport(data.report);
    } catch { /* ignore */ }
  }, [selectReport]);

  // ── New report from a study ──
  const createReport = async (study: Study) => {
    setSaving(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: study.patientId, studyId: study.id, templateName: study.procedure, status: "draft" }),
      });
      const created = await res.json();
      if (created?.id) {
        await fetchAll();
        loadJoinedReport(created.id);
        notify("Draft report created — the AI assistant is ready.");
      }
    } catch { notify("Failed to create report"); }
    setSaving(false);
  };

  // ── AI assistance ──
  const runAssist = async () => {
    if (!activeReport) return;
    setAssisting(true);
    try {
      const res = await fetch("/api/reports/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: activeReport.id,
          studyId: activeReport.studyId,
          patientId: activeReport.patientId,
          templateId: templateId || undefined,
          findings,
          impression,
          recommendation,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setAssist(data);
        if (data.template?.id) setTemplateId(data.template.id);
        notify("AI assistance updated — review and confirm before saving.");
      }
    } catch { notify("AI assistant unavailable"); }
    setAssisting(false);
  };

  // ── Save (draft snapshot) ──
  const saveReport = async (status?: string, approvedBy?: string) => {
    if (!activeReport) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${activeReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findings,
          impression,
          recommendation,
          templateName: templates.find((t) => t.id === templateId)?.name ?? activeReport.templateName,
          status,
          approvedBy,
          aiAssisted: Boolean(assist),
          qualityScore: assist?.quality.score,
          changedBy: "radiologist",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchAll();
        loadJoinedReport(activeReport.id);
        notify(status === "signed" ? "Report signed by radiologist — logged to audit." : status ? `Report moved to ${status}.` : "Draft saved.");
      } else {
        notify(data.error ?? "Save failed");
      }
    } catch { notify("Save failed"); }
    setSaving(false);
  };

  // ── Voice dictation hook ──
  const toggleVoice = () => {
    const w = window as unknown as { webkitSpeechRecognition?: new () => { continuous: boolean; lang: string; onresult: (e: { results: { [k: number]: { [j: number]: { transcript: string } } } }) => void; start: () => void; stop: () => void } };
    if (voiceOn) {
      recognitionRef.current?.stop();
      setVoiceOn(false);
      return;
    }
    if (!w.webkitSpeechRecognition) { notify("Speech recognition not supported in this browser"); return; }
    const rec = new w.webkitSpeechRecognition();
    rec.continuous = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < Object.keys(e.results).length; i++) text += e.results[i][0].transcript + " ";
      setFindings((f) => (f ? f + " " : "") + text.trim());
    };
    rec.start();
    recognitionRef.current = rec;
    setVoiceOn(true);
  };

  // ── Derived ──
  const filteredStudies = studies.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return ((s.patientFirstName ?? "") + (s.patientLastName ?? "") + (s.patientMrn ?? "") + (s.accessionNumber ?? "") + s.procedure).toLowerCase().includes(q);
  });

  const reportCounts = useMemo(() => ({
    total: reports.length,
    signed: reports.filter((r) => r.status === "signed").length,
    drafts: reports.filter((r) => r.status === "draft").length,
    pending: reports.filter((r) => r.status === "pending_review").length,
  }), [reports]);

  const currentTemplate = templates.find((t) => t.id === templateId) ?? assist?.template ?? null;
  const activeSections = assist?.suggestedSections ?? currentTemplate?.sections ?? [];
  const activeChecklist = assist?.checklist ?? currentTemplate?.checklist ?? [];

  const qualityTone = (score: number) => (score >= 80 ? "text-emerald-600 dark:text-emerald-400" : score >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400");

  const highlightCritical = (text: string) => {
    const terms = assist?.criticalFindings ?? [];
    if (terms.length === 0) return text;
    let out = text;
    for (const t of terms) {
      out = out.replace(new RegExp(`(${t})`, "gi"), "[[crit:$1]]");
    }
    return out;
  };

  return (
    <Shell title="Radiologist Reporting Assistant" description="Decision support only — the radiologist always makes the final diagnosis">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {toast}
        </div>
      )}

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft"><FileText className="h-5 w-5 text-brand" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">{reportCounts.total}</p><p className="text-xs text-slate-500 dark:text-slate-400">Total Reports</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-operational-soft"><CheckCircle2 className="h-5 w-5 text-operational" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">{reportCounts.signed}</p><p className="text-xs text-slate-500 dark:text-slate-400">Signed</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-premium-soft"><PenLine className="h-5 w-5 text-premium" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">{reportCounts.drafts}</p><p className="text-xs text-slate-500 dark:text-slate-400">Drafts</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ai-soft"><BookOpenCheck className="h-5 w-5 text-ai" /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-slate-100">{reportCounts.pending}</p><p className="text-xs text-slate-500 dark:text-slate-400">Pending Review</p></div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
        {/* ── Left: study & report lists ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4 text-brand" /> Studies awaiting reports</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input placeholder="Search studies…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-8 text-sm" />
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {filteredStudies.map((s) => {
                  const existing = reports.find((r) => r.studyId === s.id);
                  return (
                    <div key={s.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{s.patientFirstName} {s.patientLastName}</p>
                        <Badge variant="outline" className="text-[9px]">{s.modality}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{s.procedure}</p>
                      <p className="font-mono text-[10px] text-slate-400">{s.accessionNumber ?? s.patientMrn}</p>
                      <Button size="sm" className="mt-2 h-7 w-full text-[11px]" disabled={Boolean(existing) || saving} onClick={() => createReport(s)}>
                        {existing ? "Report exists" : "New Report"}
                      </Button>
                    </div>
                  );
                })}
                {filteredStudies.length === 0 && <EmptyState>No studies found</EmptyState>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Report History</CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 space-y-2 overflow-y-auto pt-0">
              {reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => selectReport(r)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    activeReport?.id === r.id
                      ? "border-brand bg-brand-soft/60"
                      : "border-slate-100 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-600"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{r.patientFirstName} {r.patientLastName}</p>
                    <StatusBadge status={r.status} className="text-[9px]" />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{r.templateName ?? "Untitled report"}</p>
                  <p className="text-[10px] text-slate-400">{new Date(r.updatedAt ?? r.createdAt).toLocaleDateString()}</p>
                </button>
              ))}
              {reports.length === 0 && <EmptyState>No reports yet</EmptyState>}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: reporting workspace ── */}
        <div className="space-y-6">
          {!activeReport ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 p-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ai-soft"><Wand2 className="h-7 w-7 text-ai" /></div>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Open a report to start dictating</p>
                <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
                  Select a study on the left to create a draft, then use the AI assistant to structure findings, score quality and catch critical terms.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Report header + actions */}
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {activeReport.patientFirstName} {activeReport.patientLastName}
                      </h2>
                      <Badge variant="outline" className="font-mono text-[10px]">{activeReport.patientMrn}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{activeReport.templateName ?? "Untitled"} · {new Date(activeReport.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant={voiceOn ? "default" : "outline"} size="sm" onClick={toggleVoice} className="gap-1">
                      {voiceOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                      {voiceOn ? "Listening…" : "Dictate"}
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowVersionHistory((v) => !v)}>
                      <History className="h-3.5 w-3.5" /> Versions ({versions.length})
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1" onClick={runAssist} disabled={assisting}>
                      {assisting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-ai" />}
                      AI Assist
                    </Button>
                    <Button size="sm" onClick={() => saveReport()} disabled={saving}>Save Draft</Button>
                    <Button size="sm" variant="secondary" onClick={() => saveReport("pending_review")} disabled={saving}>Submit Review</Button>
                    <Button
                      size="sm"
                      className="gap-1 bg-emerald-600 hover:bg-emerald-500"
                      disabled={saving || activeReport.status === "signed"}
                      onClick={() => {
                        if (window.confirm("Sign this report? The radiologist confirms this is the final version.")) {
                          saveReport("signed", "Dr. Radiologist");
                        }
                      }}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" /> Sign Report
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Version history */}
              {showVersionHistory && (
                <Card className="animate-fade-in">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Version History</CardTitle>
                    <CardDescription>Every save snapshots the previous version — fully auditable</CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-72 space-y-2 overflow-y-auto">
                    {versions.length === 0 && <EmptyState padding="py-4">No versions recorded yet — save a draft to snapshot v1.</EmptyState>}
                    {versions.slice().reverse().map((v) => (
                      <div key={v.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Version {v.version}</p>
                          <div className="flex items-center gap-2">
                            {v.qualityScore !== null && (
                              <span className={cn("text-xs font-semibold", qualityTone(v.qualityScore))}>Quality {v.qualityScore}</span>
                            )}
                            {v.aiAssisted && <Badge variant="outline" className="text-[9px]"><Sparkles className="mr-0.5 h-2.5 w-2.5" /> AI-assisted</Badge>}
                            <Badge variant="secondary" className="text-[9px]">{v.status}</Badge>
                          </div>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">{v.changedBy} · {new Date(v.createdAt).toLocaleString()}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{v.impression || "—"}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Template selector */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Template</label>
                    <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="max-w-md">
                      <option value="">Auto-recommend (modality match)</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} · {t.modality}</option>
                      ))}
                    </Select>
                    {currentTemplate && <Badge variant="success" className="text-[10px]">{currentTemplate.name}</Badge>}
                  </div>
                  {assist?.reminder && (
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                      {assist.reminder}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Findings editor */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PenLine className="h-4 w-4 text-brand" />
                    Report Content
                  </CardTitle>
                  <CardDescription>Structured sections — every AI suggestion requires your confirmation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeSections.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {activeSections.map((s) => (
                        <span key={s.name} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-400">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {activeChecklist.length > 0 && (
                    <div className="rounded-lg border border-brand/40 bg-brand-soft/50 p-3">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-brand-text">
                        <BookOpenCheck className="h-3.5 w-3.5" /> Checklist reminders
                      </p>
                      <ul className="space-y-1">
                        {activeChecklist.map((c) => (
                          <li key={c} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                            <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-brand" /> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Findings</label>
                      <Badge variant="outline" className="text-[9px]"><Ruler className="mr-0.5 h-2.5 w-2.5" />{assist?.measurements.length ?? 0} measurements</Badge>
                    </div>
                    <textarea
                      value={findings}
                      onChange={(e) => setFindings(e.target.value)}
                      placeholder="Describe findings organised by region…"
                      className="min-h-40 w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Impression</label>
                    <textarea
                      value={impression}
                      onChange={(e) => setImpression(e.target.value)}
                      placeholder="Concise clinical summary…"
                      className="min-h-24 w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Recommendation</label>
                    <textarea
                      value={recommendation}
                      onChange={(e) => setRecommendation(e.target.value)}
                      placeholder="Follow-up or management suggestions…"
                      className="min-h-20 w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* ── AI assistance panel ── */}
      {activeReport && assist && (
        <Card className="mt-6 animate-fade-in">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-ai" />
              AI Assistance — decision support
            </CardTitle>
            <CardDescription>Source: {assist.sources.join(", ")} · reviewed by the radiologist before signing</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            {/* Quality score */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Quality Score</p>
              <div className="flex items-center gap-3">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" className="stroke-slate-100 dark:stroke-slate-800" />
                    <circle
                      cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round"
                      className={assist.quality.score >= 80 ? "stroke-emerald-500" : assist.quality.score >= 60 ? "stroke-amber-500" : "stroke-red-500"}
                      strokeDasharray={`${(assist.quality.score / 100) * 264} 264`}
                    />
                  </svg>
                  <span className={cn("absolute text-2xl font-bold", qualityTone(assist.quality.score))}>{assist.quality.score}</span>
                </div>
                <div className="flex-1 space-y-1">
                  {assist.quality.checks.map((c) => (
                    <div key={c.label} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className={cn("truncate", c.passed ? "text-slate-500 dark:text-slate-400" : "text-red-600 dark:text-red-400")}>{c.label}</span>
                      {c.passed ? <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-emerald-500" /> : <AlertTriangle className="h-3 w-3 flex-shrink-0 text-red-500" />}
                    </div>
                  ))}
                </div>
              </div>
              {assist.incomplete.length > 0 && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                  <p className="text-xs font-semibold text-red-800 dark:text-red-300">Incomplete report detected</p>
                  <ul className="mt-1 space-y-0.5">
                    {assist.incomplete.map((i) => <li key={i} className="text-[11px] text-red-700 dark:text-red-400">• {i}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* Critical findings */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Critical Findings Terms</p>
              {assist.criticalFindings.length > 0 ? (
                <div className="space-y-1.5">
                  {assist.criticalFindings.map((t) => (
                    <div key={t} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                      {t}
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-400">Verify these terms visually before signing.</p>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No critical-finding terminology detected in the draft.</p>
              )}

              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Terminology Consistency</p>
              {assist.terminologyDrift.length > 0 ? (
                <div className="space-y-1">
                  {assist.terminologyDrift.map((d) => (
                    <p key={d.term} className="text-[11px] text-amber-700 dark:text-amber-400">“{d.term}” → use “{d.suggested}”</p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Terminology consistent.</p>
              )}
            </div>

            {/* Prior studies */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Prior Examinations</p>
              {assist.priorStudies.length > 0 ? (
                <div className="space-y-1.5">
                  {assist.priorStudies.map((p) => (
                    <div key={p.id} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{p.procedure}</p>
                      <p className="text-[10px] text-slate-400">{p.modality} · {new Date(p.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No prior studies on record for comparison.</p>
              )}
            </div>

            {/* Body part hints */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Review Hints</p>
              {assist.bodyPartHints.length > 0 ? (
                <ul className="space-y-1.5">
                  {assist.bodyPartHints.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                      <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-ai" /> {h}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">Select a template and run AI Assist for procedure-specific hints.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates tab (bottom) */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setTab("reports")}
            className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", tab === "reports" ? "bg-brand-hover text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}
          >
            Workspace
          </button>
          <button
            onClick={() => setTab("templates")}
            className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", tab === "templates" ? "bg-brand-hover text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}
          >
            Template Library ({templates.length})
          </button>
        </div>
        {tab === "templates" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{t.name}</CardTitle>
                    <Badge variant="outline" className="text-[9px]">{t.modality}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.sections.slice(0, 5).map((s) => (
                      <span key={s.name} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">{s.name}</span>
                    ))}
                    {t.sections.length > 5 && <span className="text-[9px] text-slate-400">+{t.sections.length - 5}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Critical highlight legend */}
      {activeReport && (
        <p className="mt-4 text-center text-[10px] text-slate-400 dark:text-slate-500">
          {highlightCritical("Critical terms are flagged in red in the assistance panel — verify before signing. Reports are never finalised automatically.")}
        </p>
      )}
    </Shell>
  );
}
