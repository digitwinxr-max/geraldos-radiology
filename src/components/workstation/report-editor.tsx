"use client";

/**
 * ReportEditor — Enhanced structured reporting workspace for the Radiologist Workstation.
 *
 * Features:
 * - Structured report editor with Findings, Impression, Recommendations
 * - Modality-specific templates with auto-selection
 * - Auto-save drafts with debounce
 * - Voice dictation (Web Speech API)
 * - AI-assisted drafting panel
 * - Previous reports comparison
 * - Version history with restore capability
 * - Audit log display
 * - Digital sign-off with explicit radiologist confirmation
 * - Release workflow
 * - Quality scoring visualization
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWorkstation, type ReportRow } from "./workstation-context";
import { cn } from "@/lib/utils";
import {
  FileText,
  Check,
  X,
  Sparkles,
  Mic,
  MicOff,
  ShieldCheck,
  AlertTriangle,
  Save,
  PenLine,
  Rocket,
  Loader2,
  History,
  Clock,
  User,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Eye,
  GitBranch,
  ClipboardList,
} from "lucide-react";

interface ReportVersion {
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

interface AuditEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  userId: string | null;
  occurredAt: string;
}

export function ReportEditor() {
  const { report, templates, assist, runAssist, saveDraft, signReport, releaseStudy, selected, contextData } = useWorkstation();
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [assisting, setAssisting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [dictationTarget, setDictationTarget] = useState<"findings" | "impression" | "recommendation">("findings");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Version history state
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Audit log state
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Previous reports state
  const [previousReports, setPreviousReports] = useState<ReportRow[]>([]);
  const [showPrevious, setShowPrevious] = useState(false);
  const [comparisonReport, setComparisonReport] = useState<ReportRow | null>(null);

  // Active sub-tab within the editor
  const [activeTab, setActiveTab] = useState<"editor" | "versions" | "audit" | "previous">("editor");

  // Hydrate local fields when a report is loaded
  useEffect(() => {
    setFindings(report?.findings ?? "");
    setImpression(report?.impression ?? "");
    setRecommendation(report?.recommendation ?? "");
    setTemplateName(report?.templateName ?? "");
    setDirty(false);
  }, [report]);

  // Auto-select template based on modality
  useEffect(() => {
    if (!templateName && selected?.modality && templates.length > 0) {
      const modalityTemplate = templates.find(
        (t) => t.modality.toLowerCase() === selected.modality.toLowerCase()
      );
      if (modalityTemplate) {
        setTemplateName(modalityTemplate.id);
      }
    }
  }, [selected?.modality, templates, templateName]);

  // Load version history
  const loadVersions = useCallback(async () => {
    if (!report?.id) return;
    setLoadingVersions(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/versions`);
      const data = await res.json();
      if (res.ok) setVersions(data.data ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingVersions(false);
    }
  }, [report]);

  // Load audit log
  const loadAudit = useCallback(async () => {
    if (!report?.id) return;
    setLoadingAudit(true);
    try {
      const res = await fetch(`/api/audit?entityType=report&entityId=${report.id}&limit=20`);
      const data = await res.json();
      if (data.ok) setAuditLog(data.entries ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingAudit(false);
    }
  }, [report]);

  // Load previous reports for comparison
  const loadPreviousReports = useCallback(async () => {
    if (!selected?.patientId) return;
    try {
      const res = await fetch(`/api/reports?patientId=${selected.patientId}`);
      const data = await res.json();
      if (Array.isArray(data.data)) {
        setPreviousReports(data.data.filter((r: ReportRow) => r.id !== report?.id && (r.status === "signed" || r.status === "released")));
      }
    } catch {
      /* ignore */
    }
  }, [selected, report]);

  // Load data when tabs change
  useEffect(() => {
    if (activeTab === "versions") loadVersions();
    if (activeTab === "audit") loadAudit();
    if (activeTab === "previous") loadPreviousReports();
  }, [activeTab, loadVersions, loadAudit, loadPreviousReports]);

  // Listen for AI findings insertion from the AI Review overlay
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (detail?.text) {
        setFindings((prev) => prev + detail.text);
        setDirty(true);
      }
    };
    window.addEventListener("ai-insert-finding", handler);
    return () => window.removeEventListener("ai-insert-finding", handler);
  }, []);

  // Auto-save with debounce
  const persist = useCallback(
    async (f: string, i: string, r: string, t: string) => {
      setSaving(true);
      await saveDraft({ findings: f, impression: i, recommendation: r, templateName: t });
      setSaving(false);
      setDirty(false);
    },
    [saveDraft]
  );

  const markDirty = (f: string, i: string, r: string, t: string) => {
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(f, i, r, t), 1500);
  };

  const doAssist = async () => {
    setAssisting(true);
    await runAssist();
    setAssisting(false);
  };

  const doSign = async () => {
    setSigning(true);
    await signReport();
    setSigning(false);
  };

  const doRelease = async () => {
    setReleasing(true);
    await releaseStudy();
    setReleasing(false);
  };

  // Voice dictation
  const speechSupported = typeof window !== "undefined" && Boolean((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  const startDictation = (target: "findings" | "impression" | "recommendation") => {
    if (!speechSupported) return;
    const SR = (window as unknown as { webkitSpeechRecognition: new () => {
      lang: string; continuous: boolean; interimResults: boolean;
      onresult: ((e: { results: { length: number; [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
      onerror: (() => void) | null; onend: (() => void) | null; start: () => void;
    } }).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript + " ";
      }
      const updater = target === "findings" ? setFindings : target === "impression" ? setImpression : setRecommendation;
      updater((prev) => (prev ? prev + " " : "") + text.trim());
      setDirty(true);
    };
    rec.onend = () => setDictating(false);
    rec.onerror = () => setDictating(false);
    setDictating(true);
    setDictationTarget(target);
    rec.start();
  };

  const stopDictation = () => {
    setDictating(false);
  };

  const template = templates.find((t) => t.id === (report?.templateName ?? templateName));
  const qualityScore = assist?.quality.score;

  return (
    <div className="flex h-full flex-col">
      {/* Sub-tab bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        {[
          { id: "editor" as const, label: "Editor", icon: PenLine },
          { id: "versions" as const, label: "Versions", icon: GitBranch, count: versions.length },
          { id: "previous" as const, label: "Prior Reports", icon: History, count: previousReports.length },
          { id: "audit" as const, label: "Audit", icon: ClipboardList },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-2 text-[10px] font-medium transition-colors",
              activeTab === tab.id
                ? "border-brand text-brand"
                : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            )}
          >
            <tab.icon className="h-3 w-3" />
            <span className="hidden sm:inline">{tab.label}</span>
            {"count" in tab && typeof tab.count === "number" && tab.count > 0 && (
              <span className="rounded-full bg-slate-200 px-1 py-px text-[8px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Editor Tab */}
        {activeTab === "editor" && (
          <div className="space-y-3 p-3">
            {/* Template selection */}
            <div className="flex items-center gap-2">
              <select
                value={templateName}
                onChange={(e) => { const v = e.target.value; setTemplateName(v); markDirty(findings, impression, recommendation, v); }}
                className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">Select structured template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button
                onClick={doAssist}
                disabled={assisting}
                className="flex h-8 items-center gap-1 rounded-md bg-ai-hover px-2 text-[10px] font-medium text-white transition-colors hover:bg-ai-active disabled:opacity-50"
              >
                {assisting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Assist
              </button>
            </div>

            {/* Template sections */}
            {template && (
              <div className="flex flex-wrap gap-1">
                {template.sections.map((s) => (
                  <span key={s.name} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {s.name}
                  </span>
                ))}
              </div>
            )}

            {/* Voice dictation controls */}
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
              <Mic className="h-4 w-4 text-slate-400" />
              <span className="text-[10px] text-slate-500">Voice Dictation:</span>
              {dictating ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 rounded-md bg-red-100 px-2 py-1 text-[10px] font-medium text-red-600 dark:bg-red-950 dark:text-red-400">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                    Recording to {dictationTarget}…
                  </span>
                  <button onClick={stopDictation} className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-500">
                    <MicOff className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  {(["findings", "impression", "recommendation"] as const).map((target) => (
                    <button
                      key={target}
                      onClick={() => startDictation(target)}
                      disabled={!speechSupported}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[9px] font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <Mic className="mr-1 inline h-2.5 w-2.5" />{target.charAt(0).toUpperCase() + target.slice(1)}
                    </button>
                  ))}
                </div>
              )}
              {!speechSupported && (
                <span className="text-[9px] text-amber-500">Requires Chrome/Edge</span>
              )}
            </div>

            {/* Findings */}
            <ReportField
              label="Findings"
              hint="Structured description of the examination"
              value={findings}
              onChange={(v) => { setFindings(v); markDirty(v, impression, recommendation, templateName); }}
              rows={6}
            />

            {/* Impression */}
            <ReportField
              label="Impression"
              hint="Concise summary of clinically relevant findings"
              value={impression}
              onChange={(v) => { setImpression(v); markDirty(findings, v, recommendation, templateName); }}
              rows={3}
            />

            {/* Recommendation */}
            <ReportField
              label="Recommendation"
              hint="Follow-up actions or additional imaging"
              value={recommendation}
              onChange={(v) => { setRecommendation(v); markDirty(findings, impression, v, templateName); }}
              rows={2}
            />

            {/* AI assist output */}
            {assist && (
              <div className="space-y-2 rounded-lg border border-ai/40 bg-ai-soft/50 p-2.5">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1 text-[10px] font-semibold text-ai-text">
                    <Sparkles className="h-3 w-3" /> AI Reporting Assistant
                  </p>
                  <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold", (qualityScore ?? 0) >= 70 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300")}>
                    Quality {qualityScore ?? "—"}%
                  </span>
                </div>
                {assist.criticalFindings.length > 0 && (
                  <div className="rounded-md border border-red-300 bg-red-50 p-2 dark:border-red-900 dark:bg-red-950/40">
                    <p className="flex items-center gap-1 text-[10px] font-semibold text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3" /> Critical finding terminology detected
                    </p>
                    <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">{assist.criticalFindings.join(", ")} — consider urgent result notification.</p>
                  </div>
                )}
                {assist.incomplete.length > 0 && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-ai">Incomplete report</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {assist.incomplete.map((i) => <li key={i} className="text-[10px] text-slate-600 dark:text-slate-300">• {i}</li>)}
                    </ul>
                  </div>
                )}
                {assist.measurements.length > 0 && (
                  <p className="text-[10px] text-slate-600 dark:text-slate-300">Measurements extracted: {assist.measurements.join(" · ")}</p>
                )}
                {assist.terminologyDrift.length > 0 && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400">
                    Terminology: {assist.terminologyDrift.map((d) => `${d.term} → ${d.suggested}`).join(" · ")}
                  </p>
                )}
                {assist.checklist.length > 0 && (
                  <details open>
                    <summary className="cursor-pointer text-[10px] font-semibold text-ai-text">Checklist reminders</summary>
                    <ul className="mt-1 space-y-0.5">
                      {assist.checklist.map((c) => <li key={c} className="text-[10px] text-slate-600 dark:text-slate-300">☐ {c}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {/* Status bar */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-800">
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className={cn("h-1.5 w-1.5 rounded-full", report?.status === "signed" ? "bg-emerald-500" : dirty || saving ? "bg-amber-500" : "bg-slate-300")} />
                {saving ? "Saving draft…" : dirty ? "Unsaved changes" : report?.status === "signed" ? "Signed" : "Draft"}
                {report?.signedAt && <span className="text-slate-400"> · {new Date(report.signedAt).toLocaleString()}</span>}
              </span>
              <button
                onClick={() => persist(findings, impression, recommendation, templateName)}
                disabled={saving}
                className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Save className="h-3 w-3" /> Save draft
              </button>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={doSign}
                disabled={signing || report?.status === "signed" || !findings.trim()}
                className="flex items-center justify-center gap-1 rounded-md bg-brand-hover px-2 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-brand-active disabled:opacity-40"
              >
                {signing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                {report?.status === "signed" ? "Signed" : "Sign Report"}
              </button>
              <button
                onClick={doRelease}
                disabled={releasing || report?.status !== "signed"}
                className="flex items-center justify-center gap-1 rounded-md bg-operational-hover px-2 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-operational-active disabled:opacity-40"
              >
                {releasing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                Release
              </button>
            </div>
            <p className="text-center text-[9px] leading-relaxed text-slate-400">
              Signing requires explicit radiologist confirmation and is audit-logged. The AI never finalises a report — you do.
            </p>
          </div>
        )}

        {/* Version History Tab */}
        {activeTab === "versions" && (
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Version History</p>
              <button onClick={loadVersions} disabled={loadingVersions} className="text-[10px] text-brand-text hover:underline">
                {loadingVersions ? "Loading…" : "Refresh"}
              </button>
            </div>
            {versions.length === 0 ? (
              <EmptyState text="No version history yet. Versions are created when you save changes." />
            ) : (
              <div className="space-y-2">
                {versions.slice().reverse().map((v) => (
                  <div key={v.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold text-brand-text">
                          v{v.version}
                        </span>
                        <span className={cn("rounded px-1.5 py-0.5 text-[8px] font-medium", v.status === "signed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>
                          {v.status}
                        </span>
                        {v.aiAssisted && (
                          <span className="rounded bg-ai-soft px-1 py-0.5 text-[8px] font-medium text-ai-text">
                            AI Assisted
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-400">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {v.findings && (
                      <p className="mt-1.5 line-clamp-2 text-[10px] text-slate-600 dark:text-slate-300">
                        <span className="font-medium">Findings:</span> {v.findings}
                      </p>
                    )}
                    {v.impression && (
                      <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="font-medium">Impression:</span> {v.impression}
                      </p>
                    )}
                    {v.qualityScore !== null && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <span className="text-[9px] text-slate-400">Quality:</span>
                        <div className="h-1.5 w-16 rounded-full bg-slate-200 dark:bg-slate-700">
                          <div
                            className={cn("h-1.5 rounded-full", v.qualityScore >= 70 ? "bg-emerald-500" : v.qualityScore >= 50 ? "bg-amber-500" : "bg-red-500")}
                            style={{ width: `${v.qualityScore}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400">{v.qualityScore}%</span>
                      </div>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={() => {
                          setFindings(v.findings ?? "");
                          setImpression(v.impression ?? "");
                          setRecommendation(v.version ? (v as unknown as { recommendation?: string }).recommendation ?? "" : "");
                          setActiveTab("editor");
                        }}
                        className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[9px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <RotateCcw className="h-2.5 w-2.5" /> Restore
                      </button>
                      <button
                        onClick={() => {
                          setComparisonReport({
                            id: v.id,
                            findings: v.findings,
                            impression: v.impression,
                            recommendation: null,
                            status: v.status,
                            signedAt: null,
                            createdAt: v.createdAt,
                          } as ReportRow);
                          setActiveTab("previous");
                        }}
                        className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[9px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Eye className="h-2.5 w-2.5" /> Compare
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Previous Reports Comparison Tab */}
        {activeTab === "previous" && (
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Previous Reports</p>
              <button onClick={loadPreviousReports} className="text-[10px] text-brand-text hover:underline">
                Refresh
              </button>
            </div>
            {previousReports.length === 0 ? (
              <EmptyState text="No previous reports found for this patient." />
            ) : (
              <div className="space-y-2">
                {previousReports.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                          {r.templateName ?? "Report"}
                        </span>
                        <span className={cn("rounded px-1 py-0.5 text-[8px] font-medium", r.status === "signed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>
                          {r.status}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400">
                        {r.signedAt ? new Date(r.signedAt).toLocaleDateString() : new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {r.impression && (
                      <p className="mt-1.5 text-[10px] text-slate-600 dark:text-slate-300">
                        <span className="font-medium">Impression:</span> {r.impression}
                      </p>
                    )}
                    {r.findings && (
                      <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500 dark:text-slate-400">
                        {r.findings}
                      </p>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={() => setComparisonReport(comparisonReport?.id === r.id ? null : r)}
                        className={cn(
                          "flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-medium transition-colors",
                          comparisonReport?.id === r.id
                            ? "border-brand bg-brand-soft text-brand-text"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        )}
                      >
                        <Eye className="h-2.5 w-2.5" /> {comparisonReport?.id === r.id ? "Selected" : "Compare"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Side-by-side comparison */}
            {comparisonReport && (
              <div className="mt-4 rounded-lg border border-brand/40 bg-brand-soft/40 p-3">
                <p className="mb-2 text-[10px] font-semibold text-brand-text">Comparison View</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Previous Report</p>
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                      <div>
                        <p className="text-[9px] font-medium text-slate-500">Impression</p>
                        <p className="text-[10px] text-slate-700 dark:text-slate-200">{comparisonReport.impression || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-medium text-slate-500">Findings</p>
                        <p className="text-[10px] text-slate-600 dark:text-slate-300 line-clamp-4">{comparisonReport.findings || "—"}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Current Report</p>
                    <div className="space-y-2 rounded-lg border border-brand/40 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                      <div>
                        <p className="text-[9px] font-medium text-slate-500">Impression</p>
                        <p className="text-[10px] text-slate-700 dark:text-slate-200">{impression || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-medium text-slate-500">Findings</p>
                        <p className="text-[10px] text-slate-600 dark:text-slate-300 line-clamp-4">{findings || "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === "audit" && (
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Audit Log</p>
              <button onClick={loadAudit} disabled={loadingAudit} className="text-[10px] text-brand-text hover:underline">
                {loadingAudit ? "Loading…" : "Refresh"}
              </button>
            </div>
            {auditLog.length === 0 ? (
              <EmptyState text="No audit entries found for this report." />
            ) : (
              <div className="space-y-1.5">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-800">
                    <div className={cn("mt-0.5 h-2 w-2 flex-shrink-0 rounded-full", entry.action.includes("signed") ? "bg-operational" : entry.action.includes("updated") ? "bg-brand" : entry.action.includes("created") ? "bg-ai" : "bg-slate-400")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-slate-700 dark:text-slate-200">
                          {entry.action.replace("report.", "").replace(".", " ")}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          {new Date(entry.occurredAt).toLocaleString()}
                        </span>
                      </div>
                      {entry.userId && (
                        <p className="text-[9px] text-slate-400">by {entry.userId}</p>
                      )}
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <p className="mt-0.5 text-[9px] text-slate-400">
                          {Object.entries(entry.details).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reusable Components ───

function ReportField({
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={hint}
        className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-brand focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-brand dark:focus:bg-slate-800"
      />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[10px] text-slate-400 dark:border-slate-800">{text}</p>;
}
