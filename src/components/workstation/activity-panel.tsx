"use client";

import React, { useState } from "react";
import { useWorkstation } from "./workstation-context";
import { cn } from "@/lib/utils";
import {
  History,
  Radio,
  Bell,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronUp,
  ChevronDown,
  Activity,
  Bot,
} from "lucide-react";

const TABS = [
  { id: "timeline", label: "Timeline", icon: History },
  { id: "workflow", label: "Study Workflow", icon: Activity },
  { id: "events", label: "Events", icon: Radio },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "ai", label: "AI Activity", icon: Bot },
  { id: "audit", label: "Audit Trail", icon: ShieldCheck },
] as const;

const EVENT_TONE: Record<string, string> = {
  "study.opened": "bg-brand",
  "study.started": "bg-cyan-400",
  "study.created": "bg-brand",
  "study.sent_to_orthanc": "bg-brand-hover",
  "study.assigned": "bg-ai",
  "study.completed": "bg-operational",
  "study.archived": "bg-slate-400",
  "worklist.updated": "bg-brand",
  "report.started": "bg-ai",
  "report.drafted": "bg-ai",
  "report.signed": "bg-operational-hover",
  "report.released": "bg-operational",
  "ai.observation_accepted": "bg-operational",
  "ai.observation_rejected": "bg-rose-500",
  "ai.review_completed": "bg-ai",
  "measurement.created": "bg-premium",
  "annotation.added": "bg-premium",
};

export function ActivityPanel() {
  const { layout, updateLayout, selected } = useWorkstation();
  const [tab, setTab] = useState<string>(layout.bottomTab || "timeline");

  const selectTab = (id: string) => {
    setTab(id);
    updateLayout({ bottomTab: id });
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-950">
      {/* Tab bar */}
      <div className="flex items-center border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-1 border-b-2 px-3 py-1.5 text-[10px] font-medium transition-colors",
                tab === t.id
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              )}
            >
              <t.icon className="h-3 w-3" /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 pr-2">
          {selected && <span className="truncate text-[9px] text-slate-400">Study: {selected.procedure}</span>}
          <button
            onClick={() => updateLayout({ bottomOpen: !layout.bottomOpen })}
            title="Toggle bottom panel"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {layout.bottomOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "timeline" && <TimelineTab />}
        {tab === "workflow" && <WorkflowTab />}
        {tab === "events" && <EventsTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "ai" && <AiActivityTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </div>
  );
}

function TimelineTab() {
  const { contextData } = useWorkstation();
  const studies = (contextData?.previousStudies ?? []) as Record<string, unknown>[];
  const rows = [...studies].sort((a, b) => String((b.studyDate ?? b.createdAt ?? "")).localeCompare(String(a.studyDate ?? a.createdAt ?? "")));

  return (
    <div className="p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Patient examination timeline</p>
      {rows.length === 0 && <p className="py-4 text-center text-xs text-slate-400">No timeline available for this patient.</p>}
      <div className="relative space-y-0 pl-4">
        <div className="absolute bottom-1 left-[5px] top-1 w-px bg-slate-200 dark:bg-slate-800" />
        {rows.map((s, i) => (
          <div key={i} className="relative pb-2.5 pl-3">
            <span className={cn("absolute -left-[13px] top-1 h-2 w-2 rounded-full border-2 border-white dark:border-slate-950", i === 0 ? "bg-brand" : "bg-slate-300 dark:bg-slate-600")} />
            <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
              {(s.description as string) ?? (s.procedure as string) ?? "Study"}
            </p>
            <p className="text-[9px] text-slate-400">
              {(s.modalities as string) ?? (s.modality as string) ?? "—"} · {(s.studyDate as string) ?? (s.createdAt as string)?.slice(0, 10) ?? "—"}
              {(s as { source?: string }).source === "ris" && " · RIS"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowTab() {
  const { selected, studyDetail } = useWorkstation();
  const stages = ["referral", "appointment", "arrival", "study_created", "sent_to_orthanc", "assigned", "opened", "review", "report_draft", "signed", "released", "archived"];
  const currentIdx = selected ? stages.indexOf(selected.stage) : -1;

  return (
    <div className="p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Study lifecycle</p>
      <div className="flex items-center">
        {stages.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold transition-colors",
                  i <= currentIdx ? "bg-brand-hover text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                )}
              >
                {i < currentIdx ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("text-[9px] capitalize", i <= currentIdx ? "font-semibold text-brand-text" : "text-slate-400")}>{s}</span>
            </div>
            {i < stages.length - 1 && (
              <div className={cn("mx-1 h-0.5 flex-1 rounded", i < currentIdx ? "bg-brand" : "bg-slate-200 dark:bg-slate-800")} />
            )}
          </React.Fragment>
        ))}
      </div>
      {selected && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
          <Stat label="Priority" value={selected.priority} />
          <Stat label="Modality" value={selected.modality} />
          <Stat label="Machine" value={selected.machineName ?? "—"} />
          <Stat label="Radiologist" value={`${selected.radiologistFirstName ?? ""} ${selected.radiologistLastName ?? ""}`.trim() || "Unassigned"} />
          <Stat label="Referring" value={selected.referringPhysician ?? "—"} />
          <Stat label="Location" value={selected.machineLocation ?? "—"} />
          <Stat label="Scheduled" value={selected.scheduledTime ?? "—"} />
          <Stat label="Accession" value={selected.accessionNumber ?? "—"} />
        </div>
      )}
      {studyDetail && (
        <p className="mt-3 text-[9px] text-slate-400">
          Orthanc status: {studyDetail.study.isStable ? "stable" : "incoming"} · updated {studyDetail.study.lastUpdate ?? "—"}
        </p>
      )}
    </div>
  );
}

function EventsTab() {
  const { events, selected } = useWorkstation();
  const filtered = selected ? events.filter((e) => e.aggregateId === selected.id || e.aggregate === "study") : events;

  return (
    <div className="p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Platform event stream (Redis Streams + event_log)</p>
      {filtered.length === 0 && <p className="py-4 text-center text-xs text-slate-400">No events recorded yet.</p>}
      <div className="space-y-0.5">
        {filtered.slice(0, 30).map((e) => (
          <div key={e.id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-900">
            <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", EVENT_TONE[e.eventType] ?? "bg-slate-300 dark:bg-slate-600")} />
            <span className="w-40 shrink-0 truncate font-mono text-[9px] text-slate-500">{e.eventType}</span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-slate-600 dark:text-slate-300">
              {Object.entries(e.payload ?? {}).slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") || e.aggregate}
            </span>
            <span className="shrink-0 text-[9px] text-slate-400">{new Date(e.occurredAt).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificationsTab() {
  const { notifications, markNotificationRead } = useWorkstation();
  return (
    <div className="p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Notifications</p>
      {notifications.length === 0 && <p className="py-4 text-center text-xs text-slate-400">No notifications.</p>}
      <div className="space-y-1">
        {notifications.slice(0, 20).map((n) => (
          <div
            key={n.id}
            onClick={() => markNotificationRead(n.id)}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-lg border p-2 transition-colors",
              n.read ? "border-slate-100 opacity-60 dark:border-slate-800" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            )}
          >
            {n.type === "alert" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" /> : n.type === "warning" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-premium" /> : <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand" />}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-800 dark:text-slate-200">{n.title}</p>
              {n.body && <p className="text-[10px] text-slate-500 dark:text-slate-400">{n.body}</p>}
            </div>
            <span className="shrink-0 text-[9px] text-slate-400">{new Date(n.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AiActivityTab() {
  const { observations } = useWorkstation();
  return (
    <div className="p-3">
      <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Sparkles className="h-3 w-3" /> AI activity for this study — all interactions audited
      </p>
      {observations.length === 0 && <p className="py-4 text-center text-xs text-slate-400">Run an AI review to populate the activity trail.</p>}
      <div className="space-y-0.5">
        {observations.map((o) => (
          <div key={o.id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-900">
            <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", o.status === "accepted" ? "bg-emerald-500" : o.status === "rejected" ? "bg-rose-500" : "bg-amber-400")} />
            <span className="w-24 shrink-0 text-[9px] font-medium text-slate-500">{o.category}</span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-slate-600 dark:text-slate-300">{o.description}</span>
            <span className="shrink-0 text-[9px] text-slate-400">{o.confidence ? `${o.confidence}%` : ""} · {o.status}{o.reviewedAt ? ` · ${new Date(o.reviewedAt).toLocaleTimeString()}` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditTab() {
  const { events } = useWorkstation();
  return (
    <div className="p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Audit trail (event_log · immutable append)</p>
      <div className="space-y-0.5">
        {events.slice(0, 25).map((e) => (
          <div key={e.id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-900">
            <ShieldCheck className="h-3 w-3 flex-shrink-0 text-emerald-500" />
            <span className="w-44 shrink-0 truncate font-mono text-[9px] text-slate-500">{e.eventType}</span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-slate-600 dark:text-slate-300">{e.aggregate} · {e.aggregateId ?? "—"}</span>
            <span className="shrink-0 text-[9px] text-slate-400">{new Date(e.occurredAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 px-2 py-1.5 dark:border-slate-800">
      <p className="text-[8px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  );
}
