"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PriorityBadge } from "@/components/ui/status-badge";
import {
  ArrowRight,
  GitBranch,
  AlertCircle,
  Loader2,
  UserCheck,
  Archive,
  RefreshCw,
  CheckCircle2,
  Link2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

// Mirror of the server-side pipeline (src/lib/workflow.ts). Order is authority.
const STAGES = [
  { key: "referral", label: "Referral", color: "bg-slate-400" },
  { key: "appointment", label: "Appointment", color: "bg-brand" },
  { key: "arrival", label: "Patient Arrival", color: "bg-cyan-400" },
  { key: "study_created", label: "Study Created", color: "bg-brand" },
  { key: "sent_to_orthanc", label: "Sent to Orthanc", color: "bg-brand-hover" },
  { key: "assigned", label: "Radiologist Assigned", color: "bg-ai" },
  { key: "opened", label: "Study Opened", color: "bg-ai" },
  { key: "review", label: "AI Review", color: "bg-ai" },
  { key: "report_draft", label: "Report Draft", color: "bg-premium" },
  { key: "signed", label: "Report Signed", color: "bg-operational-hover" },
  { key: "released", label: "Report Released", color: "bg-operational" },
  { key: "archived", label: "Archive", color: "bg-slate-400" },
];

interface Study {
  id: string;
  accessionNumber: string | null;
  studyInstanceUid: string | null;
  modality: string;
  procedure: string;
  bodyPart: string | null;
  stage: string;
  stageLabel?: string;
  priority: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientMrn: string | null;
  radiologistId: string | null;
  radiologistFirstName: string | null;
  radiologistLastName: string | null;
}

interface Radiologist {
  id: string;
  firstName: string;
  lastName: string;
}

export default function WorkflowPage() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [radiologists, setRadiologists] = useState<Radiologist[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStudies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workflow?pageSize=200");
      const d = await res.json();
      if (Array.isArray(d.data)) setStudies(d.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRadiologists = useCallback(async () => {
    try {
      const res = await fetch("/api/worklist/facets");
      const d = await res.json();
      if (d?.radiologists) setRadiologists(d.radiologists);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchStudies();
    fetchRadiologists();
  }, [fetchStudies, fetchRadiologists]);

  const run = useCallback(
    async (studyId: string, body: Record<string, unknown>, successMessage: string) => {
      setBusy(studyId);
      setError(null);
      try {
        const res = await fetch(`/api/workflow/${studyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, changedBy: "workflow-board" }),
        });
        const d = await res.json();
        if (!res.ok || d.ok === false) {
          setError(d.error ?? "Transition rejected by the workflow state machine");
          return;
        }
        setError(null);
        fetchStudies();
      } catch {
        setError("Network error — transition not applied");
      } finally {
        setBusy(null);
      }
    },
    [fetchStudies]
  );

  const advance = (s: Study) => {
    const next = STAGES[STAGES.findIndex((x) => x.key === s.stage) + 1]?.key;
    if (!next) return;
    // Reaching `assigned` requires a radiologist — auto-assign the first
    // available one so the pipeline can flow (server validates everything).
    if (next === "assigned") {
      if (!radiologists[0]) {
        setError("No radiologist available to assign");
        return;
      }
      run(s.id, { action: "assign", radiologistId: radiologists[0].id }, "Assigned");
      return;
    }
    run(s.id, { action: "transition", to: next }, `Advanced to ${next}`);
  };

  const assign = (s: Study) => {
    const radio = radiologists[0];
    if (!radio) return;
    run(s.id, { action: "assign", radiologistId: radio.id }, "Assigned");
  };

  const archive = (s: Study) => run(s.id, { action: "transition", to: "archived" }, "Archived");

  const stageIndex = (key: string) => STAGES.findIndex((s) => s.key === key);

  const studiesByStage = useMemo(
    () =>
      STAGES.map((stage) => ({
        ...stage,
        studies: studies.filter((s) => s.stage === stage.key),
      })),
    [studies]
  );

  const isEnd = (s: Study) => s.stage === "archived";

  return (
    <Shell title="Radiology Workflow" description="Real state transitions — Referral to Archive">
      {/* Pipeline strip */}
      <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <GitBranch className="h-4 w-4 text-brand" /> Clinical pipeline
          </p>
          <div className="flex items-center gap-2">
            {error && (
              <span className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-950 dark:text-red-400">
                <AlertCircle className="h-3 w-3" /> {error}
              </span>
            )}
            <button
              onClick={fetchStudies}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand-soft dark:hover:bg-slate-800"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {STAGES.map((stage, i) => {
            const count = studies.filter((s) => s.stage === stage.key).length;
            return (
              <React.Fragment key={stage.key}>
                <div className="flex flex-col items-center gap-1">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-full text-white text-sm font-bold", stage.color)}>
                    {count}
                  </div>
                  <span className="whitespace-nowrap text-[10px] font-medium text-slate-500 dark:text-slate-400">{stage.label}</span>
                </div>
                {i < STAGES.length - 1 && <ArrowRight className="mx-1 h-3.5 w-3.5 flex-shrink-0 text-slate-300 dark:text-slate-600" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Horizontal kanban board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex h-[calc(100vh-24rem)] min-h-[30rem] items-stretch gap-4">
          {studiesByStage.map((stage) => (
            <div key={stage.key} className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", stage.color)} />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{stage.label}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{stage.studies.length}</Badge>
              </div>
              <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
                {stage.studies.length === 0 && (
                  <EmptyState padding="py-8" className="text-[11px]">No studies</EmptyState>
                )}
                {stage.studies.map((study) => {
                  const next = STAGES[stageIndex(study.stage) + 1]?.key;
                  const awaitingPacs = study.stage === "study_created" && !study.studyInstanceUid;
                  return (
                    <div
                      key={study.id}
                      className={cn(
                        "rounded-lg border p-3 shadow-sm",
                        study.priority === "stat"
                          ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30"
                          : study.priority === "urgent"
                          ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30"
                          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                            {study.patientLastName ?? ""}, {study.patientFirstName ?? ""}
                          </p>
                          <p className="font-mono text-[10px] text-slate-400">{study.patientMrn}</p>
                        </div>
                        <PriorityBadge priority={study.priority} />
                      </div>
                      <p className="mt-2 truncate text-xs font-medium text-slate-700 dark:text-slate-300">{study.procedure}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{study.modality}</Badge>
                        {study.bodyPart && <span className="text-[10px] text-slate-400">{study.bodyPart}</span>}
                        {study.accessionNumber && <span className="font-mono text-[9px] text-slate-400">{study.accessionNumber}</span>}
                      </div>

                      <div className="mt-2 space-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                        <p className="flex items-center gap-1">
                          <UserPlus className="h-3 w-3" />
                          {study.radiologistFirstName
                            ? `Dr. ${study.radiologistFirstName} ${study.radiologistLastName}`
                            : study.stage === "assigned" || study.stage === "opened" || study.stage === "review"
                            ? "Unassigned"
                            : "Not yet assigned"}
                        </p>
                        {study.studyInstanceUid ? (
                          <p className="flex items-center gap-1 truncate text-emerald-600 dark:text-emerald-400">
                            <Link2 className="h-3 w-3 shrink-0" />
                            <span className="truncate font-mono">{study.studyInstanceUid}</span>
                          </p>
                        ) : (
                          awaitingPacs && (
                            <p className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <AlertCircle className="h-3 w-3 shrink-0" /> Awaiting DICOM in Orthanc
                            </p>
                          )
                        )}
                        <p className="text-[9px] text-slate-400">
                          Created {formatDate(study.createdAt)}
                          {study.startedAt ? ` · started ${new Date(study.startedAt).toLocaleTimeString()}` : ""}
                        </p>
                      </div>

                      {/* Actions */}
                      {!isEnd(study) && (
                        <div className="mt-3 flex gap-1.5">
                          {study.stage === "assigned" && radiologists.length > 0 && !study.radiologistId && (
                            <Button variant="outline" size="sm" className="flex-1 text-[10px]" disabled={busy === study.id} onClick={() => assign(study)}>
                              <UserCheck className="h-3 w-3" /> Assign
                            </Button>
                          )}
                          {study.stage === "released" ? (
                            <Button variant="outline" size="sm" className="flex-1 text-[10px]" disabled={busy === study.id} onClick={() => archive(study)}>
                              <Archive className="h-3 w-3" /> Archive
                            </Button>
                          ) : next ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn("flex-1 justify-center gap-1 text-[10px]", study.stage === "sent_to_orthanc" ? "text-operational hover:bg-operational-soft" : "text-brand-text hover:bg-brand-soft")}
                              disabled={busy === study.id}
                              onClick={() => advance(study)}
                            >
                              {busy === study.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                              Advance to {STAGES[stageIndex(study.stage) + 1]?.label}
                            </Button>
                          ) : null}
                        </div>
                      )}
                      {isEnd(study) && (
                        <p className="mt-3 flex items-center gap-1 text-[10px] font-medium text-slate-400">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Case closed
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Guidance card */}
      <Card className="mt-4 border-dashed">
        <div className="flex items-start gap-3 p-4 text-xs text-slate-500 dark:text-slate-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div>
            <p className="font-medium text-slate-700 dark:text-slate-200">How the workflow state machine works</p>
            <p className="mt-1 leading-relaxed">
              Every transition is validated server-side: backward moves are rejected, <code className="rounded bg-slate-100 px-1 font-mono text-[10px] dark:bg-slate-800">Sent to Orthanc</code> requires a DICOM study UID,
              and <code className="rounded bg-slate-100 px-1 font-mono text-[10px] dark:bg-slate-800">Assigned</code> requires a radiologist. Each move writes an audit record, publishes the stage event plus{" "}
              <code className="rounded bg-slate-100 px-1 font-mono text-[10px] dark:bg-slate-800">worklist.updated</code>, and raises notifications. The worklist, command centre and workstation react automatically.
            </p>
          </div>
        </div>
      </Card>
    </Shell>
  );
}
