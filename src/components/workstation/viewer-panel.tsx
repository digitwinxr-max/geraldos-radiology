"use client";

/**
 * ViewerPanel — production OHIF Viewer embedded in the Radiologist Workstation.
 *
 * Architecture:
 *   - OHIF Viewer runs as a standalone app on port 3001
 *   - It connects to Orthanc DICOMweb at localhost:8042
 *   - We embed it via iframe and communicate via postMessage
 *   - Study selection from the worklist triggers OHIF to load the study
 *   - Loading, error, and empty states are handled with professional UI
 *
 * OHIF URL format:
 *   http://localhost:3001/viewer?StudyInstanceUIDs=<uid>&dataSources=dicomweb
 *
 * The viewer is connected to Orthanc via DICOMweb:
 *   QIDO-RS: /dicom-web/studies, /dicom-web/studies/{uid}/series
 *   WADO-RS: /dicom-web/studies/{uid}/instances/{iid}
 *   STOW-RS: /dicom-web/instances
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkstation, type Annotation, type StudyDetail } from "./workstation-context";
import { buildProtocols, gridCells, createCustomProtocol, saveCustomProtocol, type HangingProtocol } from "@/lib/hanging-protocols";
import { cn } from "@/lib/utils";
import { AiReviewOverlay } from "./ai-review-overlay";
import {
  Maximize,
  Minimize,
  Layers,
  Eye,
  ImageOff,
  Monitor,
  LayoutGrid,
  Plus,
  ScanLine,
  ChevronRight,
  Columns2,
  Crosshair,
  Play,
  Box,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
} from "lucide-react";

// ─── OHIF integration types ───
interface OhifMessage {
  type: string;
  StudyInstanceUID?: string;
  SeriesInstanceUID?: string;
  SOPInstanceUID?: string;
  viewportIndex?: number;
  StudyData?: Record<string, unknown>;
}

// ─── OHIF states ───
type OhifStatus = "idle" | "loading" | "ready" | "error";

export function ViewerPanel() {
  const { config, selected, studyDetail, contextData, pacsStudies, protocol, setProtocol,
    layout, updateLayout, fullscreen, toggleFullscreen, annotations,
  } = useWorkstation();

  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const [showProtocolPicker, setShowProtocolPicker] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customModality, setCustomModality] = useState("CT");
  const [customRows, setCustomRows] = useState(2);
  const [customCols, setCustomCols] = useState(2);
  const [customOpen, setCustomOpen] = useState(false);
  const [viewportTool, setViewportTool] = useState<string | null>(null);
  const [cinePlaying, setCinePlaying] = useState(false);

  // Comparison mode state
  const [comparisonMode, setComparisonMode] = useState(false);
  const [showPriorPicker, setShowPriorPicker] = useState(false);
  const [selectedPrior, setSelectedPrior] = useState<string | null>(null);
  const [syncScroll, setSyncScroll] = useState(true);
  const [linkWindowLevel, setLinkWindowLevel] = useState(true);
  const [scrollPosition, setScrollPosition] = useState(0);

  // OHIF integration state
  const [ohifStatus, setOhifStatus] = useState<OhifStatus>("idle");
  const [ohifError, setOhifError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // AI Review overlay state
  const [showAiOverlay, setShowAiOverlay] = useState(false);

  const modality = selected?.modality ?? studyDetail?.study.modalities?.split("/")[0]?.trim();

  const availableProtocols = useMemo(() => buildProtocols(modality), [modality]);

  // Reset states when study changes
  useEffect(() => {
    setActiveSeries(null);
    setViewportTool(null);
    setCinePlaying(false);
    setOhifStatus("idle");
    setOhifError(null);
  }, [selected?.id]);

  // Series data
  const series = useMemo(() => studyDetail?.study.series ?? [], [studyDetail?.study.series]);
  const effectiveSeries = activeSeries ? series.find((s) => s.orthancId === activeSeries) ?? series[0] : series[0];

  // Study UIDs
  const currentUid = selected?.studyInstanceUid ?? studyDetail?.study.studyInstanceUid ?? null;
  const priorUid = useMemo(() => {
    const studies = (contextData?.previousStudies ?? []) as { studyInstanceUid?: string; id?: string; procedure?: string; modality?: string; createdAt?: string }[];
    if (selectedPrior) return selectedPrior;
    return studies.find((x) => x.studyInstanceUid)?.studyInstanceUid ?? null;
  }, [contextData, selectedPrior]);

  const availablePriorStudies = useMemo(() => {
    return (contextData?.previousStudies ?? []) as { id?: string; studyInstanceUid?: string; procedure?: string; modality?: string; createdAt?: string }[];
  }, [contextData]);

  // ─── OHIF URL construction (stable reference) ───
  // OHIF is mounted on THIS origin at /viewer (same-origin iframe), so the
  // session cookie is sent on every DICOMweb call the viewer makes.
  const ohifBase = (config?.viewerBase ?? config?.ohifUrl ?? "").replace(/\/+$/, "");
  const buildOhifUrl = useCallback((uid: string, options?: { datasource?: string; priorUid?: string }) => {
    if (!ohifBase) return null;
    const params = new URLSearchParams({ StudyInstanceUIDs: uid });
    if (options?.datasource) params.set("dataSources", options.datasource);
    if (options?.priorUid) {
      params.set("StudyInstanceUIDs", `${uid},${options.priorUid}`);
    }
    return `${ohifBase}/viewer?${params.toString()}`;
  }, [ohifBase]);

  // ─── OHIF message listener ───
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // The viewer iframe is same-origin under the new topology — only accept
      // messages from this window's own origin.
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as OhifMessage;
      if (!data?.type) return;

      switch (data.type) {
        case "ohif-study-loaded":
        case "viewport-loaded":
          setOhifStatus("ready");
          setOhifError(null);
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          break;
        case "ohif-study-error":
          setOhifStatus("error");
          setOhifError("Failed to load study in OHIF Viewer");
          break;
        case "ohif-viewport-changed":
          // Viewport changed — update active series if available
          if (data.SeriesInstanceUID) {
            const matchingSeries = series.find((s) => s.seriesInstanceUid === data.SeriesInstanceUID);
            if (matchingSeries) setActiveSeries(matchingSeries.orthancId);
          }
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [config?.ohifUrl, series]);

  // ─── Loading timeout ───
  useEffect(() => {
    if (ohifStatus === "loading") {
      loadingTimeoutRef.current = setTimeout(() => {
        if (ohifStatus === "loading") {
          setOhifStatus("ready"); // Consider ready after timeout — OHIF may not send messages
        }
      }, 10000); // 10s timeout
    }
    return () => {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    };
  }, [ohifStatus]);

  // ─── When study changes, trigger OHIF loading ───
  useEffect(() => {
    if (currentUid && config?.ohifUrl) {
      setOhifStatus("loading");
      setOhifError(null);

      // Notify OHIF iframe to load the study
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: "ohif-load-study", StudyInstanceUID: currentUid },
          config.ohifUrl
        );
      }
    }
  }, [currentUid, config?.ohifUrl]);

  // ─── Thumbnail for series ───
  const orthancProxy = (p: string) => `${config?.orthancProxyBase ?? "/api/orthanc/proxy"}?p=${encodeURIComponent(p)}`;

  const thumbnailFor = (seriesId: string) => {
    const s = series.find((x) => x.orthancId === seriesId);
    const inst = s?.instances?.[0];
    return inst && studyDetail ? orthancProxy(`studies/${studyDetail.study.orthancId}/series/${seriesId}/instances/${inst}/preview`) : "";
  };

  // ─── Custom protocol ───
  const saveCustom = () => {
    const p = createCustomProtocol({ name: customName || `Custom ${customModality}`, modality: customModality, rows: customRows, cols: customCols });
    saveCustomProtocol(p);
    setProtocol(p);
    setCustomOpen(false);
    setCustomName("");
  };

  // ─── Empty state: no study selected ───
  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-950 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-800 bg-slate-900">
          <Eye className="h-10 w-10 text-slate-600" />
        </div>
        <div>
          <p className="text-base font-semibold text-slate-300">Radiologist Diagnostic Workstation</p>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            Select a study from the worklist to open the embedded OHIF Viewer. Hanging protocols, prior comparison,
            measurements, AI review and reporting all live in this workspace.
          </p>
        </div>
        <div className="mt-2 grid max-w-lg grid-cols-3 gap-2 text-[10px] text-slate-500">
          {["Alt+←/→ · prev/next study", "Alt+B · bookmark", "Alt+A · run AI review", "Ctrl+K · command palette", "Alt+Enter · sign report", "Alt+R · release study"].map((s) => (
            <div key={s} className="rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1.5 text-center">{s}</div>
          ))}
        </div>
      </div>
    );
  }

  const activeProtocol = protocol ?? availableProtocols[0] ?? null;
  const cells = activeProtocol ? gridCells(activeProtocol.rows, activeProtocol.cols) : [];
  const viewportFor = (row: number, col: number) => activeProtocol?.viewports.find((v) => v.row === row && v.col === col);

  // ─── OHIF URL for current study ───
  const ohifUrl = currentUid ? buildOhifUrl(currentUid) : null;

  // ─── Prior comparison URL ───
  const ohifComparisonUrl = currentUid && comparisonMode && priorUid
    ? buildOhifUrl(currentUid, { priorUid })
    : null;

  return (
    <div className="relative flex h-full flex-row bg-slate-950">
      {/* ── Main viewer column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
      {/* ── Viewer toolbar ── */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 bg-slate-900 px-2 py-1.5">
        {/* Protocol picker */}
        <button onClick={() => setShowProtocolPicker((s) => !s)} title="Hanging protocols" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-800">
          <LayoutGrid className="h-3.5 w-3.5 text-brand" />
          <span className="max-w-44 truncate">{activeProtocol?.name ?? "Protocol"}</span>
          <ChevronRight className={cn("h-3 w-3 text-slate-500 transition-transform", showProtocolPicker && "rotate-90")} />
        </button>

        <div className="mx-1 h-4 w-px bg-slate-800" />

        {/* Tool buttons — these work within OHIF's own toolbar, but we show them for UX */}
        <ToolButton active={viewportTool === "wl"} onClick={() => setViewportTool(viewportTool === "wl" ? null : "wl")} title="Window / Level" label="W/L" />
        <ToolButton active={viewportTool === "zoom"} onClick={() => setViewportTool(viewportTool === "zoom" ? null : "zoom")} title="Zoom" label="Zoom" />
        <ToolButton active={viewportTool === "pan"} onClick={() => setViewportTool(viewportTool === "pan" ? null : "pan")} title="Pan" label="Pan" />
        <ToolButton active={viewportTool === "crosshair"} onClick={() => setViewportTool(viewportTool === "crosshair" ? null : "crosshair")} title="Crosshair / reference lines" label={<Crosshair className="h-3.5 w-3.5" />} />
        <ToolButton active={cinePlaying} onClick={() => setCinePlaying((c) => !c)} title="Cine playback" label={<Play className="h-3 w-3" />} />
        <ToolButton title="MPR (where available)" label="MPR" />
        <ToolButton title="2D / 3D mode" label={<Box className="h-3.5 w-3.5" />} />

        <div className="mx-1 h-4 w-px bg-slate-800" />

        {/* Comparison mode toggle */}
        <div className="relative">
          <ToolButton
            active={comparisonMode}
            onClick={() => {
              if (!comparisonMode && priorUid) {
                setComparisonMode(true);
              } else if (comparisonMode) {
                setComparisonMode(false);
              } else {
                setShowPriorPicker((s) => !s);
              }
            }}
            title="Side-by-side comparison with prior study"
            label={<Columns2 className="h-3.5 w-3.5" />}
          />
          {showPriorPicker && !comparisonMode && (
            <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
              <p className="px-2 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Select prior study to compare</p>
              {availablePriorStudies.length === 0 ? (
                <p className="px-2 py-4 text-center text-[10px] text-slate-500">No prior studies found for this patient</p>
              ) : (
                availablePriorStudies.map((ps) => (
                  <button
                    key={ps.studyInstanceUid ?? ps.id}
                    onClick={() => {
                      setSelectedPrior(ps.studyInstanceUid ?? null);
                      setComparisonMode(true);
                      setShowPriorPicker(false);
                    }}
                    className="mb-1 w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-800"
                  >
                    <p className="text-[11px] font-medium text-slate-200">{ps.procedure ?? "Prior study"}</p>
                    <p className="text-[9px] text-slate-500">{ps.modality} · {ps.createdAt ? new Date(ps.createdAt).toLocaleDateString() : ""}</p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {comparisonMode && (
          <>
            <div className="mx-1 h-4 w-px bg-slate-800" />
            <ToolButton active={syncScroll} onClick={() => setSyncScroll((s) => !s)} title="Synchronized scrolling" label="Sync" />
            <ToolButton active={linkWindowLevel} onClick={() => setLinkWindowLevel((s) => !s)} title="Linked window/level" label="Link W/L" />
          </>
        )}

        <div className="mx-1 h-4 w-px bg-slate-800" />

        {/* AI Review overlay toggle */}
        <ToolButton
          active={showAiOverlay}
          onClick={() => setShowAiOverlay((s) => !s)}
          title="Toggle AI Review overlay"
          label={<Sparkles className="h-3.5 w-3.5" />}
        />

        <div className="mx-1 h-4 w-px bg-slate-800" />

        {/* Series navigator */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {series.map((s) => (
            <button
              key={s.orthancId}
              onClick={() => setActiveSeries(s.orthancId)}
              title={`${s.description ?? "Series"} · ${s.instanceCount} images`}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] transition-colors",
                effectiveSeries?.orthancId === s.orthancId
                  ? "border-brand bg-brand/20 text-brand"
                  : "border-slate-800 text-slate-400 hover:border-slate-600"
              )}
            >
              <Layers className="h-2.5 w-2.5" />
              {s.seriesNumber ? `S${s.seriesNumber}` : "S"} · {s.modality ?? "—"} · {s.instanceCount}
            </button>
          ))}
          {series.length === 0 && <span className="text-[10px] text-slate-600">Series load when Orthanc detail is available</span>}
        </div>

        <div className="mx-1 h-4 w-px bg-slate-800" />

        {/* OHIF connection status */}
        <span className={cn(
          "hidden items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] lg:flex",
          ohifStatus === "ready" ? "border-emerald-800 text-emerald-400" :
          ohifStatus === "loading" ? "border-amber-800 text-amber-400" :
          ohifStatus === "error" ? "border-red-800 text-red-400" :
          "border-slate-800 text-slate-500"
        )}>
          {ohifStatus === "loading" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : ohifStatus === "error" ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Monitor className="h-3 w-3" />
          )}
          {config?.ohifUrl ? (
            ohifStatus === "ready" ? "OHIF connected" :
            ohifStatus === "loading" ? "OHIF loading..." :
            ohifStatus === "error" ? "OHIF error" :
            "OHIF available"
          ) : "Standalone preview"}
        </span>

        {/* Fullscreen */}
        <button onClick={toggleFullscreen} title="Fullscreen (F11)" className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200">
          {fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* ── Protocol picker dropdown ── */}
      {showProtocolPicker && (
        <div className="absolute left-2 top-10 z-30 max-h-72 w-80 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
          <p className="px-2 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Hanging protocols · {modality ?? "all"}</p>
          {availableProtocols.map((p) => (
            <button
              key={p.id}
              onClick={() => { setProtocol(p); setShowProtocolPicker(false); }}
              className={cn(
                "mb-1 w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                activeProtocol?.id === p.id ? "bg-brand/20 ring-1 ring-brand/50" : "hover:bg-slate-800"
              )}
            >
              <p className="text-[11px] font-medium text-slate-200">{p.name}</p>
              <p className="text-[9px] text-slate-500">{p.rows}×{p.cols} · {p.viewports.filter((v) => v.role === "prior").length} prior viewport(s)</p>
            </button>
          ))}
          <div className="mt-1 border-t border-slate-800 pt-1">
            <button
              onClick={() => setCustomOpen((o) => !o)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-brand transition-colors hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" /> Create custom protocol
            </button>
            {customOpen && (
              <div className="mt-1 space-y-1.5 rounded-lg border border-slate-800 bg-slate-950 p-2">
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Protocol name" className="h-7 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-[11px] text-slate-200 placeholder:text-slate-500" />
                <div className="flex items-center gap-1.5">
                  <select value={customModality} onChange={(e) => setCustomModality(e.target.value)} className="h-7 flex-1 rounded-md border border-slate-700 bg-slate-900 px-1.5 text-[11px] text-slate-200">
                    {["CT", "X-Ray", "MRI", "Ultrasound", "Mammography"].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={customRows} onChange={(e) => setCustomRows(Number(e.target.value))} className="h-7 w-16 rounded-md border border-slate-700 bg-slate-900 px-1.5 text-[11px] text-slate-200">
                    {[1, 2, 3].map((r) => <option key={r} value={r}>{r} rows</option>)}
                  </select>
                  <select value={customCols} onChange={(e) => setCustomCols(Number(e.target.value))} className="h-7 w-16 rounded-md border border-slate-700 bg-slate-900 px-1.5 text-[11px] text-slate-200">
                    {[1, 2, 3].map((c) => <option key={c} value={c}>{c} cols</option>)}
                  </select>
                </div>
                <button onClick={saveCustom} className="h-7 w-full rounded-md bg-brand-hover text-[11px] font-medium text-white transition-colors hover:bg-brand-active">Save protocol</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main viewport area ── */}
      <div className="relative min-h-0 flex-1">
        {comparisonMode ? (
          /* ── Comparison mode: side-by-side OHIF viewports ── */
          <div className="flex h-full">
            {/* Current study */}
            <div className="relative flex-1 flex flex-col border-r border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-2 py-1">
                <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand">CURRENT</span>
                <span className="text-[9px] text-slate-500 font-mono">{currentUid ? currentUid.slice(0, 20) + "…" : "N/A"}</span>
              </div>
              <div className="relative min-h-0 flex-1">
                {ohifUrl ? (
                  <iframe
                    key={`current-${currentUid}`}
                    src={ohifUrl}
                    title="OHIF Viewer — Current Study"
                    className="h-full w-full border-0"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-700">
                    <ImageOff className="h-8 w-8" />
                    <span className="text-[10px]">No study loaded</span>
                  </div>
                )}
                {/* Loading overlay */}
                {ohifStatus === "loading" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-brand" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-slate-200">Loading study in OHIF Viewer...</p>
                        <p className="text-[10px] text-slate-500 mt-1">Connecting to DICOMweb endpoint</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Prior study */}
            <div className="relative flex-1 flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-2 py-1">
                <span className="rounded bg-amber-600/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">PRIOR</span>
                <span className="text-[9px] text-slate-500 font-mono">{priorUid ? priorUid.slice(0, 20) + "…" : "N/A"}</span>
              </div>
              <div className="relative min-h-0 flex-1">
                {priorUid && config?.ohifUrl ? (
                  <iframe
                    key={`prior-${priorUid}`}
                    src={buildOhifUrl(priorUid) ?? ""}
                    title="OHIF Viewer — Prior Study"
                    className="h-full w-full border-0"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-700">
                    <ImageOff className="h-8 w-8" />
                    <span className="text-[10px]">No prior study available</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── Single study mode: OHIF iframe or hanging protocol grid ── */
          <div className="relative h-full w-full">
            {config?.ohifUrl && currentUid ? (
              /* ── Production OHIF embedding ── */
              <div className="relative h-full w-full">
                <iframe
                  ref={iframeRef}
                  key={currentUid} // Force re-render when study changes
                  src={ohifUrl ?? ""}
                  title="OHIF Viewer"
                  className="h-full w-full border-0 bg-black"
                  allowFullScreen
                  onLoad={() => {
                    // OHIF iframe loaded — consider it ready after a short delay
                    if (ohifStatus === "loading") {
                      setTimeout(() => setOhifStatus("ready"), 2000);
                    }
                  }}
                  onError={() => {
                    setOhifStatus("error");
                    setOhifError("Failed to load OHIF Viewer");
                  }}
                />

                {/* Loading overlay */}
                {ohifStatus === "loading" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-brand" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-slate-200">Loading study in OHIF Viewer...</p>
                        <p className="text-[10px] text-slate-500 mt-1">Study Instance UID: {currentUid?.slice(0, 30)}…</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error overlay */}
                {ohifStatus === "error" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm z-10">
                    <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-800 bg-red-900/30">
                        <AlertTriangle className="h-8 w-8 text-red-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-red-300">OHIF Viewer Error</p>
                        <p className="text-[11px] text-slate-400 mt-1">{ohifError ?? "Failed to load the DICOM viewer"}</p>
                      </div>
                      <div className="text-[10px] text-slate-500 space-y-1">
                        <p>Check that the OHIF viewer is mounted at: {config?.viewerBase ?? "/viewer"}</p>
                        <p>Check that the Orthanc DICOMweb proxy is reachable at: {config?.orthancProxyBase}</p>
                      </div>
                      <button
                        onClick={() => {
                          setOhifStatus("loading");
                          setOhifError(null);
                          // Force iframe reload
                          if (iframeRef.current) {
                            iframeRef.current.src = ohifUrl ?? "";
                          }
                        }}
                        className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-red-500"
                      >
                        <RefreshCw className="h-3 w-3" /> Retry
                      </button>
                    </div>
                  </div>
                )}

                {/* OHIF toolbar overlay — shows OHIF's own toolbar is active */}
                <div className="pointer-events-none absolute top-0 left-0 right-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 py-2 z-5">
                  <span className="rounded bg-black/60 px-2 py-1 text-[9px] font-medium text-slate-300 backdrop-blur-sm">
                    OHIF Viewer · DICOMweb via Orthanc
                  </span>
                  <span className="rounded bg-black/60 px-2 py-1 text-[9px] font-medium text-emerald-400 backdrop-blur-sm">
                    ● Live
                  </span>
                </div>
              </div>
            ) : config?.ohifUrl ? (
              /* ── OHIF configured but no study selected ── */
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-600">
                <Monitor className="h-12 w-12" />
                <p className="text-sm font-medium">OHIF Viewer Ready</p>
                <p className="text-[11px]">Select a study from the worklist to begin</p>
              </div>
            ) : (
              /* ── OHIF not configured — fallback to placeholder ── */
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-600">
                <ImageOff className="h-12 w-12" />
                <p className="text-sm font-medium">OHIF Viewer Not Configured</p>
                <p className="text-[11px] max-w-sm text-center">
                  Set <code className="rounded bg-slate-800 px-1">OHIF_URL</code> in your environment to enable the embedded DICOM viewer.
                  Currently showing placeholder mode.
                </p>
              </div>
            )}

            {/* Hanging protocol overlay (when OHIF is not available) */}
            {!config?.ohifUrl && (
              <div
                className="absolute inset-0 grid gap-px bg-slate-800"
                style={{ gridTemplateColumns: `repeat(${activeProtocol?.cols ?? 1}, minmax(0,1fr))`, gridTemplateRows: `repeat(${activeProtocol?.rows ?? 1}, minmax(0,1fr))` }}
              >
                {cells.map(({ row, col }) => {
                  const vp = viewportFor(row, col);
                  return (
                    <div key={`${row}-${col}`} className="relative min-h-0 overflow-hidden bg-black">
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-700">
                        <ImageOff className="h-6 w-6" />
                        <span className="text-[10px]">{vp?.role === "prior" ? "No prior study" : "No image available"}</span>
                      </div>
                      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5">
                        <span className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-slate-200 backdrop-blur-sm">{vp?.label ?? `${row + 1}×${col + 1}`}</span>
                        {vp?.role === "prior" && (
                          <span className="rounded bg-amber-600/80 px-1.5 py-0.5 text-[9px] font-semibold text-white">PRIOR</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Study info strip ── */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-900/95 px-3 py-1.5 backdrop-blur z-10">
          <div className="flex min-w-0 items-center gap-3 text-[10px] text-slate-400">
            <span className="truncate font-semibold text-slate-200">{studyDetail?.study.patientName ?? `${selected?.patientLastName ?? ""} ${selected?.patientFirstName ?? ""}`.trim()}</span>
            {selected?.patientMrn && <span className="font-mono">{selected.patientMrn}</span>}
            {studyDetail?.study.patientSex && <span>{studyDetail.study.patientSex}</span>}
            {selected?.accessionNumber && <span className="font-mono">ACC {selected.accessionNumber}</span>}
            {selected?.procedure && <span className="hidden truncate xl:inline">{selected.procedure}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {priorUid && comparisonMode ? (
              <span className="flex items-center gap-1 rounded bg-amber-600/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
                <Columns2 className="h-3 w-3" /> Prior comparison loaded
              </span>
            ) : priorUid ? (
              <span className="text-[9px] text-slate-500">Prior available</span>
            ) : (
              <span className="text-[9px] text-slate-600">No prior on record</span>
            )}
            <span className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">
              <ScanLine className="h-3 w-3" /> {series.length} series
            </span>
          </div>
        </div>
      </div>
      </div>

      {/* ── AI Review overlay panel ── */}
      <AiReviewOverlay visible={showAiOverlay} onToggle={() => setShowAiOverlay(false)} />
    </div>
  );
}

// ─── ToolButton component ───
function ToolButton({ active, onClick, title, label }: { active?: boolean; onClick?: () => void; title: string; label: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors",
        active ? "bg-brand/25 text-brand ring-1 ring-brand/50" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      )}
    >
      {label}
    </button>
  );
}
