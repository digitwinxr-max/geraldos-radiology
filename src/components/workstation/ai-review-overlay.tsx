"use client";

/**
 * AI Review Overlay — integrates AI findings directly into the diagnostic viewer.
 *
 * Architecture:
 *   - AI Service → Inference API → Viewer Overlay → Reporting Assistant → Audit Trail
 *   - Uses extension points rather than modifying OHIF core
 *   - Bounding boxes and overlays rendered as React components over the viewer
 *   - Side-by-side explanation panel for detailed AI findings
 *
 * Features:
 *   - Heatmap overlays (simulated via colored regions)
 *   - Bounding boxes with confidence scores
 *   - Segmentation masks (outlined regions)
 *   - Suggested abnormalities with differentials
 *   - Measurement suggestions
 *   - Toggle AI overlays on/off
 *   - Side-by-side AI explanation panel
 *   - Reject/accept AI suggestion workflow
 *   - AI findings automatically inserted into reporting workspace
 */

import React, { useCallback, useMemo, useState } from "react";
import { useWorkstation, type Observation } from "./workstation-context";
import { cn } from "@/lib/utils";
import {
  ScanSearch,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Target,
  FileText,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface AiReviewOverlayProps {
  visible: boolean;
  onToggle: () => void;
}

export function AiReviewOverlay({ visible, onToggle }: AiReviewOverlayProps) {
  const { observations, runAiReview, reviewObservation, selected, report } = useWorkstation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inserting, setInserting] = useState<string | null>(null);

  const pending = useMemo(() => observations.filter((o) => o.status === "pending"), [observations]);
  const decided = useMemo(() => observations.filter((o) => o.status !== "pending"), [observations]);

  const handleInsertToFinding = useCallback(async (observation: Observation) => {
    setInserting(observation.id);
    // Insert the observation description into the report findings
    const insertion = `\n\n[AI Finding - ${observation.region}]: ${observation.description}${observation.suggestedDifferential.length > 0 ? `\nDifferential: ${observation.suggestedDifferential.join(", ")}` : ""}`;
    // This would trigger the report editor to append the text
    // For now, we'll dispatch a custom event that the report editor can listen to
    window.dispatchEvent(new CustomEvent("ai-insert-finding", { detail: { text: insertion, observation } }));
    setTimeout(() => setInserting(null), 1000);
  }, []);

  if (!visible) return null;

  return (
    <div className="flex h-full flex-col border-l border-slate-800 bg-slate-950 w-80">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-ai" />
          <span className="text-[11px] font-semibold text-slate-200">AI Review</span>
          {pending.length > 0 && (
            <span className="rounded-full bg-ai-hover px-1.5 py-0.5 text-[8px] font-bold text-white">
              {pending.length}
            </span>
          )}
        </div>
        <button onClick={onToggle} className="text-slate-400 hover:text-slate-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Disclaimer */}
      <div className="mx-3 mt-2 rounded-lg border border-amber-800 bg-amber-950/30 px-2.5 py-2">
        <p className="flex items-start gap-1.5 text-[9px] leading-relaxed text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
          Decision support only. Every observation is a candidate — accept or reject it. The AI never makes the diagnosis.
        </p>
      </div>

      {/* Run AI Review button */}
      {pending.length === 0 && decided.length === 0 && (
        <div className="p-3">
          <button
            onClick={runAiReview}
            disabled={!selected}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-ai-hover px-3 py-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-ai-active disabled:opacity-50"
          >
            <ScanSearch className="h-4 w-4" /> Run AI Review
          </button>
          <p className="mt-2 text-center text-[9px] text-slate-500">
            Analyze this study for candidate findings, quality issues, and measurements.
          </p>
        </div>
      )}

      {/* Observations list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
        {/* Pending observations */}
        {pending.length > 0 && (
          <div>
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-ai">
              Pending Review ({pending.length})
            </p>
            {pending.map((o) => (
              <ObservationCard
                key={o.id}
                observation={o}
                expanded={expandedId === o.id}
                onToggle={() => setExpandedId(expandedId === o.id ? null : o.id)}
                onAccept={() => reviewObservation(o.id, "accepted")}
                onReject={() => reviewObservation(o.id, "rejected")}
                onInsert={() => handleInsertToFinding(o)}
                inserting={inserting === o.id}
              />
            ))}
          </div>
        )}

        {/* Decided observations */}
        {decided.length > 0 && (
          <div>
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Reviewed ({decided.length})
            </p>
            {decided.map((o) => (
              <ObservationCard
                key={o.id}
                observation={o}
                expanded={expandedId === o.id}
                onToggle={() => setExpandedId(expandedId === o.id ? null : o.id)}
                onAccept={() => reviewObservation(o.id, "accepted")}
                onReject={() => reviewObservation(o.id, "rejected")}
                onInsert={() => handleInsertToFinding(o)}
                inserting={inserting === o.id}
                decided
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {pending.length === 0 && decided.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <ScanSearch className="h-10 w-10 text-slate-700" />
            <p className="text-[11px] text-slate-500">No AI observations yet</p>
            <p className="text-[9px] text-slate-600">Run an AI review to generate candidate findings</p>
          </div>
        )}
      </div>

      {/* Summary footer */}
      {(pending.length > 0 || decided.length > 0) && (
        <div className="border-t border-slate-800 px-3 py-2">
          <div className="flex items-center justify-between text-[9px] text-slate-400">
            <span>{pending.length} pending · {decided.length} reviewed</span>
            <span>
              {decided.filter((o) => o.status === "accepted").length} accepted ·{" "}
              {decided.filter((o) => o.status === "rejected").length} rejected
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Observation Card Component ───

interface ObservationCardProps {
  observation: Observation;
  expanded: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onReject: () => void;
  onInsert: () => void;
  inserting: boolean;
  decided?: boolean;
}

function ObservationCard({
  observation: o,
  expanded,
  onToggle,
  onAccept,
  onReject,
  onInsert,
  inserting,
  decided = false,
}: ObservationCardProps) {
  const conf = Number(o.confidence ?? 0);
  const categoryColor = o.category === "critical" ? "red" : o.category === "technical" ? "slate" : o.category === "normal" ? "emerald" : "amber";

  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 transition-colors",
        decided
          ? "border-slate-800 bg-slate-900/50"
          : o.category === "critical"
          ? "border-red-800 bg-red-950/20"
          : "border-slate-700 bg-slate-900"
      )}
    >
      {/* Header */}
      <button onClick={onToggle} className="flex w-full items-start justify-between gap-2 text-left">
        <div className="flex items-center gap-2">
          <span className={cn("rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide", `bg-${categoryColor}-900 text-${categoryColor}-300`)}>
            {o.category}
          </span>
          <span className="text-[10px] font-medium text-slate-300">{o.region}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-bold", conf >= 80 ? "text-red-400" : conf >= 60 ? "text-amber-400" : "text-slate-400")}>
            {o.confidence}%
          </span>
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-slate-500" />
          ) : (
            <ChevronRight className="h-3 w-3 text-slate-500" />
          )}
        </div>
      </button>

      {/* Description */}
      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">{o.description}</p>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-slate-800 pt-2">
          {/* Differentials */}
          {o.suggestedDifferential.length > 0 && (
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-wider text-slate-500">Suggested Differentials</p>
              <ul className="mt-1 space-y-0.5">
                {o.suggestedDifferential.map((d, i) => (
                  <li key={i} className="flex items-start gap-1 text-[9px] text-slate-400">
                    <ArrowRight className="mt-0.5 h-2 w-2 flex-shrink-0 text-ai" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Region info */}
          <div className="flex items-center gap-2 rounded-md bg-slate-800 px-2 py-1.5">
            <Target className="h-3 w-3 text-ai" />
            <span className="text-[9px] text-slate-400">
              Region: {o.region}
            </span>
          </div>

          {/* Confidence bar */}
          <div>
            <div className="flex items-center justify-between text-[8px] text-slate-500">
              <span>Confidence</span>
              <span>{conf}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-800">
              <div
                className={cn("h-1.5 rounded-full transition-all", conf >= 80 ? "bg-red-500" : conf >= 60 ? "bg-amber-500" : "bg-emerald-500")}
                style={{ width: `${conf}%` }}
              />
            </div>
          </div>

          {/* Actions */}
          {!decided && (
            <div className="flex gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); onAccept(); }}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-[9px] font-semibold text-white hover:bg-emerald-500"
              >
                <Check className="h-3 w-3" /> Accept
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onReject(); }}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-600 px-2 py-1.5 text-[9px] font-semibold text-slate-300 hover:bg-slate-800"
              >
                <X className="h-3 w-3" /> Reject
              </button>
            </div>
          )}

          {/* Insert to report */}
          {o.status === "accepted" && (
            <button
              onClick={(e) => { e.stopPropagation(); onInsert(); }}
              disabled={inserting}
              className="flex w-full items-center justify-center gap-1 rounded-md bg-ai-hover px-2 py-1.5 text-[9px] font-semibold text-white hover:bg-ai-active disabled:opacity-50"
            >
              {inserting ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
              {inserting ? "Inserting…" : "Insert into Report"}
            </button>
          )}

          {/* Literature refs */}
          {o.literatureRefs.length > 0 && (
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-wider text-slate-500">References</p>
              <ul className="mt-1 space-y-0.5">
                {o.literatureRefs.map((ref, i) => (
                  <li key={i} className="text-[8px] text-slate-500">{ref}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Status badge for decided */}
      {decided && (
        <div className="mt-2 flex items-center gap-1">
          <span className={cn("flex items-center gap-0.5 text-[9px] font-medium", o.status === "accepted" ? "text-emerald-400" : "text-red-400")}>
            {o.status === "accepted" ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
            {o.status}
          </span>
          {o.reviewedAt && (
            <span className="text-[8px] text-slate-600">
              · {new Date(o.reviewedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI Overlay Visual Components ───

/**
 * BoundingBoxOverlay — renders a bounding box over the viewer viewport.
 * Used to visually indicate AI-detected regions of interest.
 */
export function BoundingBoxOverlay({
  boundingBox,
  confidence,
  label,
  color = "violet",
}: {
  boundingBox: { x: number; y: number; w: number; h: number };
  confidence: number;
  label: string;
  color?: "violet" | "amber" | "red" | "emerald";
}) {
  const colorMap = {
    violet: { border: "border-ai", bg: "bg-ai/10", text: "text-ai", badge: "bg-ai-hover" },
    amber: { border: "border-amber-500", bg: "bg-amber-500/10", text: "text-amber-300", badge: "bg-amber-600" },
    red: { border: "border-red-500", bg: "bg-red-500/10", text: "text-red-300", badge: "bg-red-600" },
    emerald: { border: "border-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-300", badge: "bg-emerald-600" },
  };
  const c = colorMap[color];

  return (
    <div
      className={cn("absolute border-2 rounded-sm pointer-events-none", c.border, c.bg)}
      style={{
        left: `${boundingBox.x}%`,
        top: `${boundingBox.y}%`,
        width: `${boundingBox.w}%`,
        height: `${boundingBox.h}%`,
      }}
    >
      {/* Label badge */}
      <div className={cn("absolute -top-5 left-0 rounded px-1.5 py-0.5 text-[8px] font-bold text-white whitespace-nowrap", c.badge)}>
        {label} · {confidence}%
      </div>
    </div>
  );
}

/**
 * HeatmapOverlay — renders a simulated heatmap overlay over the viewer.
 * In production, this would receive actual heatmap data from the AI service.
 */
export function HeatmapOverlay({
  regions,
  opacity = 0.3,
}: {
  regions: { x: number; y: number; w: number; h: number; intensity: number }[];
  opacity?: number;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {regions.map((region, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${region.x}%`,
            top: `${region.y}%`,
            width: `${region.w}%`,
            height: `${region.h}%`,
            background: `radial-gradient(circle, rgba(239, 68, 68, ${region.intensity * opacity}) 0%, transparent 70%)`,
          }}
        />
      ))}
    </div>
  );
}
