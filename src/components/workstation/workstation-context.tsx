"use client";

/**
 * WorkstationContext — the stateful heart of the Radiologist Workstation.
 *
 * Owns the worklist, study selection, Orthanc detail, case intelligence,
 * annotations, AI observations, the in-flight report, hanging protocol,
 * persistent layout and all workstation actions. Panels read from this single
 * source of truth; every meaningful action publishes an event.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultProtocolFor, type HangingProtocol } from "@/lib/hanging-protocols";
import { getList, getJson, mutate } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";
import { useWorklist, useWorklistAll } from "@/hooks/use-worklist";
import { useWorklistFacets } from "@/hooks/use-workflow";
import { useNotifications, type NotificationsEnvelope } from "@/hooks/use-notifications";

// ─── Types (mirror API payloads) ───
export interface ClientConfig {
  ohifUrl: string;
  orthancUrl?: string | null;
  orthancProxyBase: string;
  keycloakEnabled?: boolean;
  fhirEnabled?: boolean;
  dicoogleEnabled?: boolean;
}

export interface WorklistEntry {
  id: string;
  accessionNumber: string | null;
  studyInstanceUid: string | null;
  modality: string;
  procedure: string;
  bodyPart: string | null;
  stage: string;
  priority: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  patientId: string | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientMrn: string | null;
  patientDob: string | null;
  patientGender: string | null;
  radiologistId: string | null;
  radiologistFirstName: string | null;
  radiologistLastName: string | null;
  machineId: string | null;
  machineName: string | null;
  machineModality: string | null;
  machineLocation: string | null;
  referringPhysician: string | null;
  referringFacility: string | null;
  clinicalIndication: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
}

export interface Facets {
  machines: { name: string | null; modality: string | null; location: string | null }[];
  radiologists: { id: string; firstName: string; lastName: string }[];
  physicians: string[];
  locations: string[];
}

export interface SeriesInfo {
  orthancId: string;
  seriesInstanceUid: string | null;
  description: string | null;
  modality: string | null;
  seriesNumber: string | null;
  bodyPart: string | null;
  instanceCount: number;
  instances: string[];
}

export interface StudyDetail {
  study: {
    orthancId: string;
    studyInstanceUid: string | null;
    patientName: string;
    patientId: string | null;
    patientBirthDate: string | null;
    patientSex: string | null;
    description: string | null;
    accessionNumber: string | null;
    studyDate: string | null;
    studyTime: string | null;
    modalities: string;
    referringPhysician: string | null;
    isStable: boolean;
    lastUpdate: string | null;
    series: SeriesInfo[];
  };
}

export interface CaseContext {
  patient: Record<string, unknown> | null;
  history: string | null;
  referral: Record<string, unknown> | null;
  previousStudies: Record<string, unknown>[];
  previousReports: Record<string, unknown>[];
  protocols: Record<string, unknown>[];
  similarCases: Record<string, unknown>[];
  teachingFiles: Record<string, unknown>[];
  fhirLabSummary: string | null;
}

export interface Annotation {
  id: string;
  studyId: string | null;
  orthancStudyId: string | null;
  seriesInstanceUid: string | null;
  tool: string;
  label: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface Observation {
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

export interface ReportRow {
  id: string;
  studyId: string | null;
  patientId: string | null;
  templateName: string | null;
  findings: string | null;
  impression: string | null;
  recommendation: string | null;
  status: string;
  signedAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Template {
  id: string;
  name: string;
  modality: string;
  description: string;
  sections: { name: string; hint?: string }[];
  checklist: string[];
  isSystem?: boolean;
}

export interface AssistResult {
  ok: boolean;
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
}

export interface EventItem {
  id: number;
  eventType: string;
  aggregate: string;
  aggregateId: string | null;
  payload: Record<string, unknown> | null;
  source: string;
  occurredAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string;
  severity: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  studyId: string | null;
  orthancStudyId: string | null;
  label: string;
  note: string | null;
  createdAt: string;
}

export interface WorklistFilters {
  q: string;
  modality: string;
  radiologist: string;
  machine: string;
  physician: string;
  location: string;
  priority: string;
}

export type WorklistView = "today" | "unread" | "stat" | "emergency" | "assigned" | "completed" | "all";

interface LayoutState {
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  bottomOpen: boolean;
  rightTab: string;
  bottomTab: string;
}

interface WorkstationValue {
  config: ClientConfig | null;
  // Worklist
  entries: WorklistEntry[];
  allEntries: WorklistEntry[];
  facets: Facets | null;
  view: WorklistView;
  setView: (v: WorklistView) => void;
  filters: WorklistFilters;
  setFilters: (f: Partial<WorklistFilters>) => void;
  worklistLoading: boolean;
  refreshWorklist: () => void;
  // Selection
  selected: WorklistEntry | null;
  studyDetail: StudyDetail | null;
  contextData: CaseContext | null;
  pacsStudies: { orthancId: string; studyInstanceUid: string | null; patientName: string; description: string | null; modalities: string; studyDate: string | null }[];
  openStudy: (entry: WorklistEntry) => void;
  prevStudy: () => void;
  nextStudy: () => void;
  // Annotations / bookmarks
  annotations: Annotation[];
  bookmarks: Bookmark[];
  addAnnotation: (tool: string, label: string, data?: Record<string, unknown>) => Promise<void>;
  removeAnnotation: (id: string) => void;
  isBookmarked: boolean;
  toggleBookmark: () => void;
  // AI review
  observations: Observation[];
  runAiReview: () => Promise<void>;
  reviewObservation: (id: string, status: "accepted" | "rejected") => Promise<void>;
  // Reporting
  report: ReportRow | null;
  templates: Template[];
  assist: AssistResult | null;
  saveDraft: (fields?: Partial<Pick<ReportRow, "findings" | "impression" | "recommendation" | "templateName">>) => Promise<void>;
  signReport: () => Promise<boolean>;
  releaseStudy: () => Promise<void>;
  runAssist: () => Promise<void>;
  // Timeline / activity
  events: EventItem[];
  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  // Hanging protocols
  protocol: HangingProtocol | null;
  setProtocol: (p: HangingProtocol) => void;
  // Layout
  layout: LayoutState;
  updateLayout: (patch: Partial<LayoutState>) => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
}

const WorkstationContext = createContext<WorkstationValue | null>(null);

const LAYOUT_KEY = "geraldos-ws-layout";
// Stable empty-array fallback so query-derived lists keep identity between renders.
const EMPTY_LIST: never[] = [];
const DEFAULT_LAYOUT: LayoutState = {
  leftWidth: 320,
  rightWidth: 380,
  bottomHeight: 220,
  bottomOpen: true,
  rightTab: "patient",
  bottomTab: "timeline",
};

function loadLayout(): LayoutState {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    return raw ? { ...DEFAULT_LAYOUT, ...(JSON.parse(raw) as Partial<LayoutState>) } : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

const VIEWS: WorklistView[] = ["today", "unread", "stat", "emergency", "assigned", "completed", "all"];

export function WorkstationProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [view, setViewState] = useState<WorklistView>("today");
  const [filters, setFiltersState] = useState<WorklistFilters>({
    q: "",
    modality: "",
    radiologist: "",
    machine: "",
    physician: "",
    location: "",
    priority: "",
  });
  const [selected, setSelected] = useState<WorklistEntry | null>(null);
  const [studyDetail, setStudyDetail] = useState<StudyDetail | null>(null);
  const [contextData, setContextData] = useState<CaseContext | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [protocol, setProtocol] = useState<HangingProtocol | null>(null);
  const [layout, setLayout] = useState<LayoutState>(DEFAULT_LAYOUT);
  const [fullscreen, setFullscreen] = useState(false);
  const openGen = useRef(0);

  // Hydrate persisted layout after mount to avoid SSR hydration mismatch.
  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  // ── Query-backed data (replaces the manual loadX callbacks) ──
  // Shared key with useIntegrationsClientConfig — one cache entry for all consumers.
  const configQuery = useQuery({
    queryKey: qk.integrationsClientConfig(),
    queryFn: () => getJson<ClientConfig>("/api/integrations/client-config"),
    retry: false, // parity: failures were swallowed silently before
  });
  const config = configQuery.data ?? null;

  const templatesQuery = useQuery({
    queryKey: qk.reportTemplates(),
    queryFn: async () => (await getList<Template>("/api/reports/templates")).data,
  });
  const templates = templatesQuery.data ?? EMPTY_LIST;

  const eventsQuery = useQuery({
    queryKey: qk.events(60),
    queryFn: async () => (await getList<EventItem>("/api/events?pageSize=60")).data,
  });
  const events = eventsQuery.data ?? EMPTY_LIST;

  const notificationsQuery = useNotifications<NotificationItem>(40, 30_000);
  const notifications = notificationsQuery.data?.data ?? EMPTY_LIST;

  const bookmarksQuery = useQuery({
    queryKey: qk.bookmarks(),
    queryFn: async () => (await getList<Bookmark>("/api/bookmarks")).data,
  });
  const bookmarks = bookmarksQuery.data ?? EMPTY_LIST;

  const facetsQuery = useWorklistFacets<Facets & { ok?: boolean }>();
  const facets = facetsQuery.data && facetsQuery.data.ok ? facetsQuery.data : null;

  // ── Worklist — keyed by view + filters, polled every 30 s inside the hooks ──
  const entriesQuery = useWorklist<WorklistEntry>(view, filters);
  const allEntriesQuery = useWorklistAll<WorklistEntry>();
  const entries = entriesQuery.data ?? EMPTY_LIST;
  const allEntries = allEntriesQuery.data ?? EMPTY_LIST;
  const worklistLoading = entriesQuery.isFetching;

  const refreshWorklist = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["worklist"] });
  }, [qc]);

  // ── PACS studies (for UID → orthanc id resolution) ──
  const pacsStudiesQuery = useQuery({
    queryKey: ["orthanc", "studies"] as const,
    queryFn: async () =>
      (await getJson<{ studies?: WorkstationValue["pacsStudies"] }>("/api/orthanc/studies")).studies ?? [],
  });
  const pacsStudies = pacsStudiesQuery.data ?? EMPTY_LIST;

  // ── Open a study ──
  const publish = useCallback(async (type: string, aggregate: string, aggregateId: string | null, payload: Record<string, unknown> = {}) => {
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, aggregate, aggregateId, payload }),
      });
    } catch {
      /* best effort */
    }
  }, []);

  const openStudy = useCallback(
    async (entry: WorklistEntry) => {
      const gen = ++openGen.current;
      const fresh = () => gen === openGen.current; // guard against stale async responses

      setSelected(entry);
      setStudyDetail(null);
      setContextData(null);
      setAnnotations([]);
      setObservations([]);
      setReport(null);
      setAssist(null);
      // Default hanging protocol from modality + procedure (keep custom selection).
      setProtocol((prev) => prev ?? defaultProtocolFor(entry.modality, entry.procedure));

      // Resolve orthanc id from UID if present.
      const orthanc = entry.studyInstanceUid
        ? pacsStudies.find((p) => p.studyInstanceUid === entry.studyInstanceUid)
        : null;

      publish("study.opened", "study", entry.id, {
        accessionNumber: entry.accessionNumber,
        modality: entry.modality,
        procedure: entry.procedure,
        patientName: `${entry.patientFirstName ?? ""} ${entry.patientLastName ?? ""}`.trim(),
      });

      // Real state transition: opening an assigned study moves it to `opened`.
      // Fire-and-forget — the server validates (forward-only, radiologist required).
      if (entry.stage === "assigned") {
        mutate("PATCH", `/api/workflow/${entry.id}`, {
          action: "transition",
          to: "opened",
          changedBy: "radiologist",
        }).catch(() => {});
      }

      if (orthanc?.orthancId) {
        try {
          const d = await getJson<StudyDetail & { ok?: boolean }>(`/api/orthanc/studies/${orthanc.orthancId}`);
          if (d.ok && fresh()) setStudyDetail(d);
        } catch {
          /* ignore */
        }
      }

      // Case intelligence.
      try {
        const cq = new URLSearchParams();
        if (entry.id) cq.set("studyId", entry.id);
        if (entry.patientId) cq.set("patientId", entry.patientId);
        if (orthanc?.orthancId) cq.set("orthancStudyId", orthanc.orthancId);
        if (entry.modality) cq.set("modality", entry.modality);
        const d = await getJson<CaseContext & { ok?: boolean }>(`/api/workstation/context?${cq.toString()}`);
        if (d.ok && fresh()) {
          setContextData(d);
          // First previous study with a UID becomes the comparison target.
          const prevs = (d.previousStudies ?? []) as { studyInstanceUid?: string }[];
          const prior = prevs.find((s) => s.studyInstanceUid);
          if (prior) setProtocol((prev) => prev ?? defaultProtocolFor(entry.modality, entry.procedure));
        }
      } catch {
        /* ignore */
      }

      // Annotations + observations.
      try {
        const [ar, or] = await Promise.all([
          getList<Annotation>(`/api/annotations?studyId=${entry.id}`),
          getList<Observation>(`/api/ai-review?studyId=${entry.id}`),
        ]);
        if (fresh()) {
          setAnnotations(ar.data);
          setObservations(or.data);
        }
      } catch {
        /* ignore */
      }

      // Report: find existing for this study, otherwise create a draft.
      try {
        const rr = await getList<ReportRow>("/api/reports?pageSize=200");
        const existing = rr.data.find((r) => r.studyId === entry.id);
        if (fresh()) {
          if (existing) {
            setReport(existing);
          } else if (entry.patientId) {
            const created = await mutate<ReportRow>("POST", "/api/reports", {
              studyId: entry.id,
              patientId: entry.patientId,
              status: "draft",
            });
            if (fresh()) {
              setReport(created);
              publish("report.started", "report", created.id, { studyId: entry.id, procedure: entry.procedure });
            }
          }
        }
      } catch {
        /* ignore */
      }

      // Refresh the activity streams.
      qc.invalidateQueries({ queryKey: qk.events(60) });
      qc.invalidateQueries({ queryKey: qk.notifications(40) });
    },
    [pacsStudies, publish, qc]
  );

  const navigate = useCallback(
    (dir: 1 | -1) => {
      if (entries.length === 0 || !selected) return;
      const idx = entries.findIndex((e) => e.id === selected.id);
      const next = (idx + dir + entries.length) % entries.length;
      openStudy(entries[next]);
    },
    [entries, selected, openStudy]
  );
  const prevStudy = useCallback(() => navigate(-1), [navigate]);
  const nextStudy = useCallback(() => navigate(1), [navigate]);

  // ── Annotations ──
  const addAnnotation = useCallback(
    async (tool: string, label: string, data: Record<string, unknown> = {}) => {
      if (!selected) return;
      await mutate("POST", "/api/annotations", {
        studyId: selected.id,
        orthancStudyId: studyDetail?.study.orthancId ?? null,
        seriesInstanceUid: null,
        tool,
        label,
        data: { value: 0, units: "mm", note: label, tool, ...data },
        createdBy: "radiologist",
      }).catch(() => {});
      publish(tool === "length" ? "measurement.created" : "annotation.added", "study", selected.id, { tool, label });
      const res = await getList<Annotation>(`/api/annotations?studyId=${selected.id}`).catch(() => null);
      if (res) setAnnotations(res.data);
    },
    [selected, studyDetail, publish]
  );

  const removeAnnotation = useCallback(async (id: string) => {
    await mutate("DELETE", `/api/annotations/${id}`).catch(() => {});
    setAnnotations((a) => a.filter((x) => x.id !== id));
  }, []);

  const isBookmarked = bookmarks.some((b) => b.studyId === selected?.id);

  const toggleBookmark = useCallback(async () => {
    if (!selected) return;
    if (isBookmarked) {
      const b = bookmarks.find((x) => x.studyId === selected.id);
      if (b) await mutate("DELETE", `/api/bookmarks/${b.id}`).catch(() => {});
    } else {
      await mutate("POST", "/api/bookmarks", {
        studyId: selected.id,
        orthancStudyId: studyDetail?.study.orthancId ?? null,
        label: `${selected.procedure} — ${selected.patientLastName ?? ""} ${selected.accessionNumber ?? ""}`.trim(),
        userId: "radiologist",
      }).catch(() => {});
    }
    qc.invalidateQueries({ queryKey: qk.bookmarks() });
  }, [selected, isBookmarked, bookmarks, studyDetail, qc]);

  // ── AI review ──
  const runAiReview = useCallback(async () => {
    if (!selected) return;
    await mutate("POST", "/api/ai-review", {
      studyId: selected.id,
      orthancStudyId: studyDetail?.study.orthancId ?? null,
      modality: selected.modality,
      bodyPart: selected.bodyPart,
      procedure: selected.procedure,
    }).catch(() => {});
    publish("ai.review_completed", "study", selected.id, { modality: selected.modality });
    const res = await getList<Observation>(`/api/ai-review?studyId=${selected.id}`).catch(() => null);
    if (res) setObservations(res.data);
  }, [selected, studyDetail, publish]);

  const reviewObservation = useCallback(
    async (id: string, status: "accepted" | "rejected") => {
      await mutate("PATCH", `/api/ai-review/${id}`, { status, reviewedBy: "radiologist" }).catch(() => {});
      setObservations((obs) => obs.map((o) => (o.id === id ? { ...o, status, reviewedBy: "radiologist", reviewedAt: new Date().toISOString() } : o)));
      publish(status === "accepted" ? "ai.observation_accepted" : "ai.observation_rejected", "ai-review", id, { studyId: selected?.id });
    },
    [selected, publish]
  );

  // ── Reporting ──
  const saveDraft = useCallback(
    async (fields: Partial<Pick<ReportRow, "findings" | "impression" | "recommendation" | "templateName">> = {}) => {
      if (!report) return;
      const merged = { ...report, ...fields };
      await mutate("PATCH", `/api/reports/${report.id}`, {
        findings: merged.findings,
        impression: merged.impression,
        recommendation: merged.recommendation,
        templateName: merged.templateName,
        changedBy: "radiologist",
      }).catch(() => {});
      setReport(merged);
      publish("report.drafted", "report", report.id, { studyId: selected?.id });
    },
    [report, selected, publish]
  );

  const signReport = useCallback(async (): Promise<boolean> => {
    if (!report) return false;
    // Guard: never sign an empty report (matches the button-level guard).
    if (!report.findings?.trim()) return false;
    let d: { ok?: boolean };
    try {
      d = await mutate<{ ok?: boolean }>("PATCH", `/api/reports/${report.id}`, {
        status: "signed",
        approvedBy: "Dr. Radiologist",
      });
    } catch {
      return false;
    }
    if (d.ok) {
      setReport((r) => (r ? { ...r, status: "signed", signedAt: new Date().toISOString() } : r));
      // Real state transition: signed report moves the study to `signed`.
      // Awaited so releaseStudy (which follows) never races it.
      if (selected?.id) {
        try {
          await mutate("PATCH", `/api/workflow/${selected.id}`, {
            action: "transition",
            to: "signed",
            changedBy: "radiologist",
          });
        } catch {
          /* best effort */
        }
      }
    }
    return true;
  }, [report, selected]);

  const releaseStudy = useCallback(async () => {
    if (!selected) return;
    let ok = report?.status === "signed";
    if (!ok) ok = await signReport();
    if (!ok) return;
    await mutate("PATCH", `/api/workflow/${selected.id}`, {
      stage: "released",
      completedAt: new Date().toISOString(),
    }).catch(() => {});
    publish("report.released", "report", report?.id ?? null, { studyId: selected.id });
    publish("study.completed", "study", selected.id, { procedure: selected.procedure });
    refreshWorklist();
  }, [selected, report, signReport, publish, refreshWorklist]);

  const runAssist = useCallback(async () => {
    if (!selected) return;
    const d = await mutate<AssistResult & { ok?: boolean }>("POST", "/api/reports/assist", {
      studyId: selected.id,
      patientId: selected.patientId,
      reportId: report?.id,
      modality: selected.modality,
      procedure: selected.procedure,
      clinicalIndication: selected.clinicalIndication,
      findings: report?.findings,
      impression: report?.impression,
      recommendation: report?.recommendation,
    }).catch(() => null);
    if (d?.ok) setAssist(d);
  }, [selected, report]);

  // ── Notifications ──
  const markNotificationRead = useCallback(async (id: string) => {
    await mutate("PATCH", `/api/notifications/${id}`, { read: true }).catch(() => {});
    qc.setQueryData<NotificationsEnvelope<NotificationItem> | undefined>(qk.notifications(40), (prev) =>
      prev ? { ...prev, data: prev.data.map((x) => (x.id === id ? { ...x, read: true } : x)) } : prev
    );
  }, [qc]);

  // ── Layout ──
  const updateLayout = useCallback((patch: Partial<LayoutState>) => {
    setLayout((l) => {
      const next = { ...l, ...patch };
      try {
        window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // ── SSE event streaming (replaces polling for real-time updates) ──
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Open SSE connection for real-time events
    const sse = new EventSource("/api/events/stream");
    eventSourceRef.current = sse;

    // New events land straight in the events query cache (dedup by id).
    const pushEvent = (data: EventItem) => {
      qc.setQueryData<EventItem[] | undefined>(qk.events(60), (prev) => {
        const list = prev ?? [];
        if (list.some((e) => e.id === data.id)) return list;
        return [data, ...list].slice(0, 100);
      });
    };

    // Generic message handler — pushes new events into the activity panel
    sse.onmessage = (ev) => {
      try {
        pushEvent(JSON.parse(ev.data));
      } catch { /* malformed data */ }
    };

    // Typed event handlers for specific workflows
    const typedEvents = [
      "study.opened", "study.started", "study.completed",
      "report.started", "report.drafted", "report.signed", "report.released",
      "ai.observation_accepted", "ai.observation_rejected", "ai.review_completed",
      "measurement.created", "annotation.added",
    ];
    for (const eventType of typedEvents) {
      sse.addEventListener(eventType, (ev) => {
        try {
          pushEvent(JSON.parse(ev.data));
        } catch { /* malformed */ }
      });
    }

    sse.onerror = () => {
      // SSE auto-reconnects; meanwhile fall back to polling
      sse.close();
      eventSourceRef.current = null;
    };

    // Worklist + notifications keep their 30 s poll via the queries'
    // refetchInterval — no manual setInterval anymore.

    return () => {
      sse.close();
      eventSourceRef.current = null;
    };
  }, [qc]);

  const value = useMemo<WorkstationValue>(
    () => ({
      config,
      entries,
      allEntries,
      facets,
      view,
      setView: setViewState,
      filters,
      setFilters: (f) => setFiltersState((prev) => ({ ...prev, ...f })),
      worklistLoading,
      refreshWorklist,
      selected,
      studyDetail,
      contextData,
      pacsStudies,
      openStudy,
      prevStudy,
      nextStudy,
      annotations,
      bookmarks,
      addAnnotation,
      removeAnnotation,
      isBookmarked,
      toggleBookmark,
      observations,
      runAiReview,
      reviewObservation,
      report,
      templates,
      assist,
      saveDraft,
      signReport,
      releaseStudy,
      runAssist,
      events,
      notifications,
      markNotificationRead,
      protocol,
      setProtocol,
      layout,
      updateLayout,
      fullscreen,
      toggleFullscreen,
    }),
    [
      config, entries, allEntries, facets, view, filters, worklistLoading, refreshWorklist, selected, studyDetail,
      contextData, pacsStudies, openStudy, prevStudy, nextStudy, annotations, bookmarks, addAnnotation,
      removeAnnotation, isBookmarked, toggleBookmark, observations, runAiReview, reviewObservation,
      report, templates, assist, saveDraft, signReport, releaseStudy, runAssist, events, notifications,
      markNotificationRead, protocol, layout, updateLayout, fullscreen, toggleFullscreen,
    ]
  );

  return <WorkstationContext.Provider value={value}>{children}</WorkstationContext.Provider>;
}

export function useWorkstation(): WorkstationValue {
  const ctx = useContext(WorkstationContext);
  if (!ctx) throw new Error("useWorkstation must be used within WorkstationProvider");
  return ctx;
}

export { VIEWS };
