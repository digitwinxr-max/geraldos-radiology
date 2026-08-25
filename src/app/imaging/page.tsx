"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Search,
  Maximize,
  Minimize,
  Bookmark,
  BookmarkCheck,
  Layers,
  Ruler,
  ScanSearch,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileText,
  RefreshCw,
  ImageOff,
  Star,
  Check,
  X,
  Eye,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───
interface ClientConfig { ohifUrl: string; orthancProxyBase: string; }

interface OrthancStudy {
  orthancId: string;
  studyInstanceUid: string | null;
  patientName: string;
  patientId: string | null;
  description: string | null;
  accessionNumber: string | null;
  modalities: string;
  seriesCount: number;
  studyDate: string | null;
}

interface LocalStudy {
  id: string;
  accessionNumber: string | null;
  studyInstanceUid: string | null;
  modality: string;
  procedure: string;
  bodyPart: string | null;
  stage: string;
  priority: string;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientMrn: string | null;
}

interface SeriesInfo {
  orthancId: string;
  seriesInstanceUid: string | null;
  description: string | null;
  modality: string | null;
  seriesNumber: string | null;
  bodyPart: string | null;
  instanceCount: number;
  instances: string[];
}

interface Annotation {
  id: string;
  studyId: string | null;
  orthancStudyId: string | null;
  seriesInstanceUid: string | null;
  tool: string;
  label: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

interface Bookmark {
  id: string;
  studyId: string | null;
  orthancStudyId: string | null;
  label: string;
  note: string | null;
  createdAt: string;
}

interface Observation {
  id: string;
  category: string;
  region: string;
  description: string;
  confidence: string | null;
  suggestedDifferential: string[];
  status: string;
}

const CONFIDENCE_TONE = (c: number) => (c >= 80 ? "text-red-600 dark:text-red-400" : c >= 60 ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400");

export default function ImagingPage() {
  // ── State ──
  const [clientConfig, setClientConfig] = useState<ClientConfig | null>(null);
  const [pacsStudies, setPacsStudies] = useState<OrthancStudy[]>([]);
  const [localStudies, setLocalStudies] = useState<LocalStudy[]>([]);
  const [pacsOk, setPacsOk] = useState(false);
  const [pacsLoading, setPacsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedStudy, setSelectedStudy] = useState<{ orthancId: string; studyInstanceUid: string | null; patientName?: string } | null>(null);
  const [studyDetail, setStudyDetail] = useState<{ study: { series: SeriesInfo[]; patientName: string; description: string | null; modalities: string; accessionNumber: string | null; referringPhysician: string | null; patientId: string | null } } | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<SeriesInfo | null>(null);
  const [comparison, setComparison] = useState<{ orthancId: string; studyInstanceUid: string | null } | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<string | null>(null);
  const [newAnnotation, setNewAnnotation] = useState("");
  const [patientStudies, setPatientStudies] = useState<OrthancStudy[]>([]);
  const [rightWidth, setRightWidth] = useState(340);
  const [leftWidth, setLeftWidth] = useState(300);
  const rightDrag = useRef<{ startX: number; startW: number } | null>(null);
  const leftDrag = useRef<{ startX: number; startW: number } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // ── Data ──
  const fetchAll = useCallback(() => {
    fetch("/api/integrations/client-config").then((r) => r.json()).then(setClientConfig).catch(() => {});
    fetch("/api/workflow").then((r) => r.json()).then((d) => { if (Array.isArray(d.data)) setLocalStudies(d.data); }).catch(() => {});
  }, []);

  const fetchPacs = useCallback(() => {
    setPacsLoading(true);
    fetch("/api/orthanc/studies")
      .then((r) => r.json())
      .then((d) => { setPacsOk(Boolean(d.ok)); setPacsStudies(d.studies ?? []); })
      .catch(() => setPacsOk(false))
      .finally(() => setPacsLoading(false));
  }, []);

  useEffect(() => { fetchAll(); fetchPacs(); }, [fetchAll, fetchPacs]);

  const orthancProxy = (p: string) => `${clientConfig?.orthancProxyBase ?? "/api/orthanc/proxy"}?p=${encodeURIComponent(p)}`;

  const loadStudy = useCallback(async (study: OrthancStudy) => {
    setSelectedStudy({ orthancId: study.orthancId, studyInstanceUid: study.studyInstanceUid, patientName: study.patientName });
    setComparison(null);
    try {
      const res = await fetch(`/api/orthanc/studies/${study.orthancId}`);
      const data = await res.json();
      if (data.ok) setStudyDetail(data);
    } catch { /* ignore */ }
  }, []);

  const loadSeries = useCallback(async (seriesId: string) => {
    try {
      const res = await fetch(`/api/orthanc/series/${seriesId}`);
      const data = await res.json();
      if (data.ok) {
        setStudyDetail((d) => {
          if (!d) return d;
          const idx = d.study.series.findIndex((s) => s.orthancId === seriesId);
          if (idx < 0) return d;
          const series = [...d.study.series];
          series[idx] = { ...series[idx], instanceCount: data.series.instanceCount };
          return { ...d, study: { ...d.study, series } };
        });
      }
    } catch { /* ignore */ }
  }, []);

  // Load detail + dependent data when study changes
  useEffect(() => {
    if (!selectedStudy) return;
    setAnnotations([]);
    setObservations([]);
    // Patient timeline: same patient's studies from PACS
    const patientId = studyDetail?.study.patientId;
    if (patientId) {
      fetch(`/api/orthanc/studies`)
        .then((r) => r.json())
        .then((d) => setPatientStudies((d.studies ?? []).filter((s: OrthancStudy) => s.patientId === patientId)))
        .catch(() => {});
    }
    // Bookmarks + annotations + observations for this study
    fetch(`/api/annotations?orthancStudyId=${selectedStudy.orthancId}`).then((r) => r.json()).then((d) => setAnnotations(d.data ?? [])).catch(() => {});
    fetch(`/api/bookmarks`).then((r) => r.json()).then((d) => setBookmarks(d.data ?? [])).catch(() => {});
    fetch(`/api/ai-review?orthancStudyId=${selectedStudy.orthancId}`)
      .then((r) => r.json())
      .then((d) => setObservations(d.data ?? []))
      .catch(() => {});
  }, [selectedStudy?.orthancId, studyDetail?.study.patientId]);

  // ── Derived ──
  const allStudies = useMemo(() => {
    const q = search.toLowerCase();
    const local: { key: string; kind: "local"; orthancId?: string; studyInstanceUid: string | null; title: string; subtitle: string; modalities: string; seriesCount?: number; date: string | null }[] = localStudies
      .filter((s) => !q || ((s.patientFirstName ?? "") + (s.patientLastName ?? "") + (s.patientMrn ?? "") + (s.accessionNumber ?? "")).toLowerCase().includes(q))
      .map((s) => ({
        key: `local-${s.id}`,
        kind: "local" as const,
        studyInstanceUid: s.studyInstanceUid,
        title: `${s.patientFirstName ?? ""} ${s.patientLastName ?? ""}`.trim() || "Unnamed",
        subtitle: `${s.procedure} · ${s.stage}`,
        modalities: s.modality,
        date: s.accessionNumber,
      }));
    const pacs: { key: string; kind: "pacs"; orthancId: string; studyInstanceUid: string | null; title: string; subtitle: string; modalities: string; seriesCount?: number; date: string | null }[] = pacsStudies
      .filter((s) => !q || (s.patientName + s.accessionNumber + s.description).toLowerCase().includes(q))
      .map((s) => ({
        key: `pacs-${s.orthancId}`,
        kind: "pacs" as const,
        orthancId: s.orthancId,
        studyInstanceUid: s.studyInstanceUid,
        title: s.patientName,
        subtitle: s.description ?? s.accessionNumber ?? "PACS study",
        modalities: s.modalities,
        seriesCount: s.seriesCount,
        date: s.studyDate,
      }));
    return [...pacs, ...local];
  }, [localStudies, pacsStudies, search]);

  const selectedPacsStudy = allStudies.find((s) => s.kind === "pacs" && s.orthancId === selectedStudy?.orthancId);
  const viewerUrl = selectedStudy?.studyInstanceUid && clientConfig?.ohifUrl
    ? `${clientConfig.ohifUrl.replace(/\/$/, "")}/viewer?StudyInstanceUIDs=${encodeURIComponent(selectedStudy.studyInstanceUid)}`
    : null;
  const comparisonUrl = comparison?.studyInstanceUid && clientConfig?.ohifUrl
    ? `${clientConfig.ohifUrl.replace(/\/$/, "")}/viewer?StudyInstanceUIDs=${encodeURIComponent(comparison.studyInstanceUid)}`
    : null;

  const isBookmarked = bookmarks.some((b) => b.orthancStudyId === selectedStudy?.orthancId);

  // ── Actions ──
  const toggleBookmark = async () => {
    if (!selectedStudy) return;
    if (isBookmarked) {
      const b = bookmarks.find((x) => x.orthancStudyId === selectedStudy.orthancId);
      if (b) { await fetch(`/api/bookmarks/${b.id}`, { method: "DELETE" }); }
    } else {
      await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orthancStudyId: selectedStudy.orthancId, label: `Bookmarked ${selectedStudy.patientName ?? "study"}`, userId: "local-user" }),
      });
    }
    fetch("/api/bookmarks").then((r) => r.json()).then((d) => setBookmarks(d.data ?? [])).catch(() => {});
  };

  const saveAnnotation = async () => {
    if (!selectedStudy || !annotationTool) return;
    await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orthancStudyId: selectedStudy.orthancId,
        seriesInstanceUid: selectedSeries?.seriesInstanceUid ?? null,
        tool: annotationTool,
        label: newAnnotation || `${annotationTool} measurement`,
        data: { value: 0, units: "mm", note: newAnnotation, tool: annotationTool },
        createdBy: "radiologist",
      }),
    });
    setNewAnnotation("");
    setAnnotationTool(null);
    fetch(`/api/annotations?orthancStudyId=${selectedStudy.orthancId}`).then((r) => r.json()).then((d) => setAnnotations(d.data ?? [])).catch(() => {});
  };

  const deleteAnnotation = async (id: string) => {
    await fetch(`/api/annotations/${id}`, { method: "DELETE" });
    setAnnotations((a) => a.filter((x) => x.id !== id));
  };

  const runAiReview = async () => {
    if (!selectedStudy || !studyDetail) return;
    await fetch("/api/ai-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orthancStudyId: selectedStudy.orthancId, modality: studyDetail.study.modalities.split("/")[0].trim() || "X-Ray" }),
    });
    fetch(`/api/ai-review?orthancStudyId=${selectedStudy.orthancId}`).then((r) => r.json()).then((d) => setObservations(d.data ?? [])).catch(() => {});
  };

  const reviewObservation = async (id: string, status: "accepted" | "rejected") => {
    await fetch(`/api/ai-review/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewedBy: "radiologist" }),
    });
    setObservations((obs) => obs.map((o) => (o.id === id ? { ...o, status } : o)));
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await workspaceRef.current?.requestFullscreen?.();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  };

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Keyboard shortcuts for the workspace
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreen) return; // browser handles
      if (e.altKey && e.key.toLowerCase() === "b") toggleBookmark();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, toggleBookmark]);

  const pacsStudyList = pacsStudies;
  const navigateStudy = (dir: 1 | -1) => {
    if (pacsStudyList.length === 0 || !selectedStudy) return;
    const idx = pacsStudyList.findIndex((s) => s.orthancId === selectedStudy.orthancId);
    const next = (idx + dir + pacsStudyList.length) % pacsStudyList.length;
    loadStudy(pacsStudyList[next]);
  };

  const startRightDrag = (e: React.PointerEvent) => {
    rightDrag.current = { startX: e.clientX, startW: rightWidth };
    const onMove = (ev: PointerEvent) => setRightWidth(Math.min(520, Math.max(260, rightDrag.current!.startW + (rightDrag.current!.startX - ev.clientX))));
    const onUp = () => { rightDrag.current = null; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startLeftDrag = (e: React.PointerEvent) => {
    leftDrag.current = { startX: e.clientX, startW: leftWidth };
    const onMove = (ev: PointerEvent) => setLeftWidth(Math.min(420, Math.max(220, leftDrag.current!.startW + (ev.clientX - leftDrag.current!.startX))));
    const onUp = () => { leftDrag.current = null; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const thumbnailFor = (series: SeriesInfo) => {
    const instanceId = series.instances?.[0];
    if (!selectedStudy || !instanceId) return "";
    return orthancProxy(`studies/${selectedStudy.orthancId}/series/${series.orthancId}/instances/${instanceId}/preview`);
  };

  return (
    <Shell title="Imaging Workspace" description="Embedded OHIF viewer · DICOMweb via Orthanc · AI-assisted review">
      {/* ── Workspace toolbar ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigateStudy(-1)} title="Previous study (Alt+←)">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigateStudy(1)} title="Next study (Alt+→)">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Badge variant={pacsOk ? "success" : "secondary"} className="ml-1">
            {pacsLoading ? "Syncing…" : pacsOk ? "Orthanc Online" : "PACS Standby"}
          </Badge>
          {selectedStudy && (
            <>
              <Badge variant="outline">{studyDetail?.study.modalities ?? selectedPacsStudy?.modalities ?? "—"}</Badge>
              {selectedPacsStudy?.seriesCount !== undefined && <Badge variant="outline">{selectedPacsStudy.seriesCount} series</Badge>}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPacs} className="gap-1">
            <RefreshCw className={cn("h-3.5 w-3.5", pacsLoading && "animate-spin")} /> Sync PACS
          </Button>
          <Button variant={isBookmarked ? "secondary" : "outline"} size="sm" onClick={toggleBookmark} className="gap-1">
            {isBookmarked ? <BookmarkCheck className="h-3.5 w-3.5 text-amber-500" /> : <Bookmark className="h-3.5 w-3.5" />}
            {isBookmarked ? "Bookmarked" : "Bookmark"}
          </Button>
          {selectedStudy?.orthancId && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setComparison(comparison ? null : { orthancId: selectedStudy.orthancId, studyInstanceUid: selectedStudy.studyInstanceUid })}>
              <Columns2 className="h-3.5 w-3.5" />
              {comparison ? "Single View" : "Compare"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={toggleFullscreen} className="gap-1">
            {fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
            {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </Button>
        </div>
      </div>

      <div ref={workspaceRef} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-800">
        {/* ── Left: study browser ── */}
        <div className="absolute bottom-0 left-0 top-0 z-20 border-r border-slate-800 bg-slate-900">
          <div style={{ width: leftWidth }} className="flex h-full flex-col">
            <div className="border-b border-slate-800 p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="Search patient, accession…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 border-slate-700 bg-slate-800 pl-8 text-xs text-slate-200 placeholder:text-slate-500 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">PACS Studies ({pacsStudies.length})</p>
              {allStudies.filter((s) => s.kind === "pacs").map((s) => (
                <button
                  key={s.key}
                  onClick={() => s.kind === "pacs" && s.orthancId && loadStudy(pacsStudies.find((p) => p.orthancId === s.orthancId)!)}
                  className={cn(
                    "mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors",
                    selectedStudy?.orthancId === s.orthancId ? "bg-brand/20 ring-1 ring-brand/50" : "hover:bg-slate-800"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-slate-200">{s.title}</p>
                    <Badge variant="outline" className="shrink-0 text-[9px]">{s.modalities}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{s.subtitle}</p>
                  <p className="text-[9px] text-slate-600">{s.date ?? ""}</p>
                </button>
              ))}
              <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Workflow Studies ({localStudies.length})</p>
              {allStudies.filter((s) => s.kind === "local").map((s) => (
                <button
                  key={s.key}
                  onClick={() => {
                    const l = localStudies.find((x) => x.id === s.key.replace("local-", ""));
                    if (l?.studyInstanceUid) setSelectedStudy({ orthancId: `local-${l.id}`, studyInstanceUid: l.studyInstanceUid });
                  }}
                  className="mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-slate-200">{s.title}</p>
                    <Badge variant="outline" className="shrink-0 text-[9px]">{s.modalities}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{s.subtitle}</p>
                </button>
              ))}
              {allStudies.length === 0 && <EmptyState className="px-3 text-xs text-slate-500">No studies found</EmptyState>}
            </div>
          </div>
          <div
            onPointerDown={startLeftDrag}
            className="absolute bottom-0 right-0 top-0 w-1 cursor-col-resize bg-slate-700/50 transition-colors hover:bg-brand"
            title="Drag to resize"
          />
        </div>

        {/* ── Centre: viewer ── */}
        <div className="ml-[300px] flex h-[calc(100vh-16rem)] min-h-[480px] flex-col" style={{ marginLeft: leftWidth, marginRight: rightWidth }}>
          <div className="flex flex-1 flex-col bg-slate-950">
            {!selectedStudy && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
                  <Eye className="h-8 w-8 text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-400">Select a study from the PACS browser to open the viewer</p>
                <p className="max-w-md text-xs text-slate-600">
                  The OHIF viewer is embedded via DICOMweb against Orthanc. Measurement tools, window/level, zoom, pan,
                  cine and MPR are available inside the viewer.
                </p>
              </div>
            )}
            {selectedStudy && viewerUrl && (
              <iframe
                key={viewerUrl + (comparison ? "-c" : "")}
                src={viewerUrl}
                className="h-full w-full border-0 bg-black"
                title="OHIF Viewer"
                allowFullScreen
              />
            )}
            {selectedStudy && !viewerUrl && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-slate-900 p-8 text-center">
                <ImageOff className="h-10 w-10 text-slate-600" />
                <p className="text-sm font-medium text-slate-300">No OHIF viewer configured</p>
                <p className="max-w-md text-xs text-slate-500">
                  Set <code className="rounded bg-slate-800 px-1">OHIF_URL</code> (e.g. http://localhost:3001) to embed the
                  viewer. DICOMweb is served through <code className="rounded bg-slate-800 px-1">{orthancProxy("dicom-web")}</code>.
                </p>
              </div>
            )}
          </div>

          {/* Study info strip */}
          {selectedStudy && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-900 px-4 py-2">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="font-medium text-slate-200">{studyDetail?.study.patientName ?? selectedPacsStudy?.title}</span>
                {studyDetail?.study.patientId && <span className="font-mono text-slate-500">{studyDetail.study.patientId}</span>}
                {studyDetail?.study.accessionNumber && <span className="font-mono text-slate-500">ACC: {studyDetail.study.accessionNumber}</span>}
                {studyDetail?.study.referringPhysician && <span>Ref: {studyDetail.study.referringPhysician}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-600">W/L · Zoom · Pan · Cine · MPR</span>
                <Link href="/reporting">
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]">
                    <FileText className="h-3 w-3" /> Open Report
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: series / AI review / measurements / bookmarks ── */}
        <div className="absolute bottom-0 right-0 top-0 z-20 border-l border-slate-800 bg-slate-900">
          <div style={{ width: rightWidth }} className="flex h-full flex-col">
            <Tabs defaultValue="series" className="flex h-full flex-col">
              <TabsList className="mx-3 mt-3 h-8 bg-slate-800 dark:bg-slate-800">
                <TabsTrigger value="series" className="h-7 gap-1 text-[11px]"><Layers className="h-3 w-3" /> Series</TabsTrigger>
                <TabsTrigger value="ai" className="h-7 gap-1 text-[11px]"><ScanSearch className="h-3 w-3" /> AI Review</TabsTrigger>
                <TabsTrigger value="measure" className="h-7 gap-1 text-[11px]"><Ruler className="h-3 w-3" /> Measure</TabsTrigger>
                <TabsTrigger value="book" className="h-7 gap-1 text-[11px]"><Bookmark className="h-3 w-3" /> Saved</TabsTrigger>
              </TabsList>

              <TabsContent value="series" className="flex-1 overflow-y-auto p-3">
                {(studyDetail?.study.series ?? []).map((series) => (
                  <div
                    key={series.orthancId}
                    className={cn(
                      "mb-2 rounded-lg border p-2 transition-colors",
                      selectedSeries?.orthancId === series.orthancId
                        ? "border-brand/60 bg-brand/10"
                        : "border-slate-800 hover:border-slate-600"
                    )}
                  >
                    <button className="flex w-full items-center gap-3 text-left" onClick={() => { setSelectedSeries(series); loadSeries(series.orthancId); }}>
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-slate-800">
                        {thumbnailFor(series) ? (
                          <img
                            src={thumbnailFor(series)}
                            alt={series.description ?? "series"}
                            className="h-full w-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <ImageOff className="h-5 w-5 text-slate-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="truncate text-xs font-medium text-slate-200">
                            {series.seriesNumber ? `S${series.seriesNumber}` : "Series"} · {series.modality ?? "—"}
                          </p>
                          <Badge variant="outline" className="text-[9px]">{series.instanceCount}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500">{series.description ?? series.bodyPart ?? "No description"}</p>
                        {series.seriesInstanceUid && <p className="mt-0.5 truncate font-mono text-[9px] text-slate-600">{series.seriesInstanceUid}</p>}
                      </div>
                    </button>
                  </div>
                ))}
                {studyDetail && studyDetail.study.series.length === 0 && (
                  <EmptyState padding="py-8" className="text-xs text-slate-500">No series on the PACS for this study</EmptyState>
                )}
                {!studyDetail && <EmptyState padding="py-8" className="text-xs text-slate-500">Select a PACS study to list series</EmptyState>}
              </TabsContent>

              <TabsContent value="ai" className="flex-1 overflow-y-auto p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-300">Candidate observations</p>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={runAiReview}>
                    <ScanSearch className="h-3 w-3" /> Run AI Review
                  </Button>
                </div>
                <p className="mb-3 rounded-md border border-slate-800 bg-slate-800/50 px-2 py-1.5 text-[10px] text-slate-500">
                  Decision support only — candidates require your explicit accept/reject. Never a diagnosis.
                </p>
                {observations.map((o) => (
                  <div key={o.id} className="mb-2 rounded-lg border border-slate-800 p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={o.category === "critical" ? "destructive" : o.category === "technical" ? "warning" : "outline"} className="text-[9px] uppercase">
                        {o.category}
                      </Badge>
                      <span className={cn("text-[10px] font-semibold", CONFIDENCE_TONE(Number(o.confidence ?? 0)))}>
                        {o.confidence ? `${o.confidence}%` : "—"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-300">{o.description}</p>
                    {o.suggestedDifferential.length > 0 && (
                      <p className="mt-1.5 text-[10px] text-slate-500">Differentials: {o.suggestedDifferential.join(" · ")}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {o.status === "pending" ? (
                        <>
                          <Button size="sm" className="h-7 gap-1 bg-emerald-600 text-[11px] hover:bg-emerald-500" onClick={() => reviewObservation(o.id, "accepted")}>
                            <Check className="h-3 w-3" /> Accept
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 gap-1 border-slate-700 text-[11px] text-slate-300" onClick={() => reviewObservation(o.id, "rejected")}>
                            <X className="h-3 w-3" /> Reject
                          </Button>
                        </>
                      ) : (
                        <Badge variant={o.status === "accepted" ? "success" : "secondary"}>{o.status}</Badge>
                      )}
                    </div>
                  </div>
                ))}
                {observations.length === 0 && (
                  <EmptyState padding="py-8" className="text-xs text-slate-500">Run an AI review to generate candidate observations</EmptyState>
                )}
              </TabsContent>

              <TabsContent value="measure" className="flex-1 overflow-y-auto p-3">
                <p className="mb-2 text-xs font-medium text-slate-300">Measurement persistence</p>
                <div className="mb-3 space-y-1.5">
                  {(["length", "angle", "area", "arrow", "text"] as const).map((tool) => (
                    <button
                      key={tool}
                      onClick={() => setAnnotationTool(annotationTool === tool ? null : tool)}
                      className={cn(
                        "w-full rounded-md border px-3 py-1.5 text-left text-[11px] capitalize transition-colors",
                        annotationTool === tool
                          ? "border-brand bg-brand/15 text-brand"
                          : "border-slate-800 text-slate-400 hover:border-slate-600"
                      )}
                    >
                      {tool} tool
                    </button>
                  ))}
                </div>
                {annotationTool && (
                  <div className="mb-3 space-y-2 rounded-lg border border-brand/40 bg-brand/5 p-2">
                    <p className="text-[10px] text-brand">Adding a {annotationTool} measurement for {selectedSeries?.description ?? "current series"}</p>
                    <Input value={newAnnotation} onChange={(e) => setNewAnnotation(e.target.value)} placeholder="Measurement note (e.g. 12 mm nodule)" className="h-8 border-slate-700 bg-slate-800 text-xs dark:border-slate-700 dark:bg-slate-800" />
                    <Button size="sm" className="h-7 w-full text-[11px]" onClick={saveAnnotation}>Save Measurement</Button>
                  </div>
                )}
                {annotations.map((a) => (
                  <div key={a.id} className="mb-2 flex items-center justify-between rounded-lg border border-slate-800 p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-200">{a.label}</p>
                      <p className="text-[10px] text-slate-500">{a.tool} · {new Date(a.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => deleteAnnotation(a.id)} className="text-slate-600 hover:text-red-400">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {annotations.length === 0 && <EmptyState className="text-xs text-slate-500">No saved measurements yet</EmptyState>}
              </TabsContent>

              <TabsContent value="book" className="flex-1 overflow-y-auto p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-300">Study bookmarks</p>
                  <Star className="h-3.5 w-3.5 text-amber-400" />
                </div>
                {bookmarks.map((b) => (
                  <div key={b.id} className="mb-2 rounded-lg border border-slate-800 p-2.5">
                    <p className="text-xs font-medium text-slate-200">{b.label}</p>
                    {b.note && <p className="text-[10px] text-slate-500">{b.note}</p>}
                    <p className="mt-0.5 text-[9px] text-slate-600">{new Date(b.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
                {bookmarks.length === 0 && <EmptyState className="text-xs text-slate-500">Bookmark studies to build a worklist</EmptyState>}
              </TabsContent>
            </Tabs>
          </div>
          <div
            onPointerDown={startRightDrag}
            className="absolute bottom-0 left-0 top-0 w-1 cursor-col-resize bg-slate-700/50 transition-colors hover:bg-brand"
            title="Drag to resize"
          />
        </div>

        {/* ── Patient timeline overlay (bottom-left) ── */}
        {selectedStudy && patientStudies.length > 1 && (
          <div className="absolute bottom-3 left-3 z-10 max-w-xs rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-xl backdrop-blur">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <History className="h-3 w-3" /> Patient Study Timeline
            </p>
            <div className="space-y-1.5">
              {patientStudies.slice(0, 4).map((s) => (
                <button
                  key={s.orthancId}
                  onClick={() => loadStudy(s)}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1 text-left transition-colors",
                    s.orthancId === selectedStudy?.orthancId ? "bg-brand/20 text-brand" : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  <span className="text-[11px]">{s.description ?? s.studyDate ?? "Study"}</span>
                  <span className="text-[9px] text-slate-500">{s.studyDate ?? ""}</span>
                </button>
              ))}
            </div>
            {patientStudies.length > 4 && <p className="mt-1 text-[9px] text-slate-500">+{patientStudies.length - 4} more on PACS</p>}
          </div>
        )}
      </div>

      {/* Comparison strip */}
      {comparison && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Comparison Mode</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Compare the current study against another study on the PACS — pick from the list to swap.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={comparison.orthancId}
                  onChange={(e) => {
                    const target = pacsStudies.find((p) => p.orthancId === e.target.value);
                    if (target) setComparison({ orthancId: target.orthancId, studyInstanceUid: target.studyInstanceUid });
                  }}
                  className="h-9 max-w-64 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {pacsStudies.map((p) => (
                    <option key={p.orthancId} value={p.orthancId}>
                      {p.patientName} — {p.description ?? p.studyDate ?? "Study"}
                    </option>
                  ))}
                </select>
                <Button variant="ghost" size="sm" onClick={() => setComparison(null)}>Close</Button>
              </div>
            </div>
            {comparisonUrl ? (
              <iframe key={comparisonUrl} src={comparisonUrl} className="mt-3 h-96 w-full rounded-lg border-0 bg-black" title="OHIF Viewer (Comparison)" allowFullScreen />
            ) : (
              <p className="mt-3 rounded-md border border-slate-200 px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
                Configure <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">OHIF_URL</code> to render the comparison viewer.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Keyboard shortcuts hint */}
      <p className="mt-4 text-center text-[10px] text-slate-400 dark:text-slate-500">
        Shortcuts: <kbd className="rounded border border-slate-300 px-1 dark:border-slate-700">Alt+B</kbd> bookmark ·
        <kbd className="ml-1 rounded border border-slate-300 px-1 dark:border-slate-700">F11</kbd> fullscreen ·
        <kbd className="ml-1 rounded border border-slate-300 px-1 dark:border-slate-700">Ctrl+K</kbd> command palette
      </p>
    </Shell>
  );
}
