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
import { defaultProtocolFor, type HangingProtocol } from "@/lib/hanging-protocols";

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
  bookmarks: { id: string; studyId: string | null; orthancStudyId: string | null; label: string; note: string | null; createdAt: string }[];
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
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const [entries, setEntries] = useState<WorklistEntry[]>([]);
  const [allEntries, setAllEntries] = useState<WorklistEntry[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
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
  const [worklistLoading, setWorklistLoading] = useState(false);
  const [pacsStudies, setPacsStudies] = useState<WorkstationValue["pacsStudies"]>([]);
  const [selected, setSelected] = useState<WorklistEntry | null>(null);
  const [studyDetail, setStudyDetail] = useState<StudyDetail | null>(null);
  const [contextData, setContextData] = useState<CaseContext | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [bookmarks, setBookmarks] = useState<WorkstationValue["bookmarks"]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [protocol, setProtocol] = useState<HangingProtocol | null>(null);
  const [layout, setLayout] = useState<LayoutState>(DEFAULT_LAYOUT);
  const [fullscreen, setFullscreen] = useState(false);
  const openGen = useRef(0);

  // Hydrate persisted layout after mount to avoid SSR hydration mismatch.
  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  // ── Config + static data ──
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/client-config");
      setConfig(await res.json());
    } catch {
      /* offline */
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/reports/templates");
      const d = await res.json();
      if (res.ok) setTemplates(d.data ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events?pageSize=60");
      const d = await res.json();
      if (res.ok) setEvents(d.data ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?pageSize=40");
      const d = await res.json();
      if (res.ok) setNotifications(d.data ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadFacets = useCallback(async () => {
    try {
      const res = await fetch("/api/worklist/facets");
      const d = await res.json();
      if (d.ok) setFacets(d);
    } catch {
      /* ignore */
    }
  }, []);

  const loadBookmarks = useCallback(async () => {
    try {
      const res = await fetch("/api/bookmarks");
      const d = await res.json();
      if (res.ok) setBookmarks(d.data ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  // ── Worklist ──
  const refreshWorklist = useCallback(async () => {
    setWorklistLoading(true);
    try {
      const params = new URLSearchParams({ view });
      if (filters.q) params.set("q", filters.q);
      if (filters.modality) params.set("modality", filters.modality);
      if (filters.radiologist) params.set("radiologist", filters.radiologist);
      if (filters.machine) params.set("machine", filters.machine);
      if (filters.physician) params.set("physician", filters.physician);
      if (filters.location) params.set("location", filters.location);
      if (filters.priority) params.set("priority", filters.priority);
      const [res, allRes] = await Promise.all([
        fetch(`/api/worklist?${params.toString()}&pageSize=200`),
        // Unfiltered dataset powers the view counters (stable across view switches).
        fetch("/api/worklist?view=all&pageSize=200"),
      ]);
      const d = await res.json();
      const da = await allRes.json();
      if (res.ok) setEntries(d.data ?? []);
      if (allRes.ok) setAllEntries(da.data ?? []);
    } catch {
      /* offline */
    } finally {
      setWorklistLoading(false);
    }
  }, [view, filters]);

  useEffect(() => { refreshWorklist(); }, [refreshWorklist]);

  // ── PACS studies (for UID → orthanc id resolution) ──
  const loadPacs = useCallback(async () => {
    try {
      const res = await fetch("/api/orthanc/studies");
      const d = await res.json();
      setPacsStudies(d.studies ?? []);
    } catch {
      /* ignore */
    }
  }, []);

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
        fetch(`/api/workflow/${entry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "transition", to: "opened", changedBy: "radiologist" }),
        }).catch(() => {});
      }

      if (orthanc?.orthancId) {
        try {
          const res = await fetch(`/api/orthanc/studies/${orthanc.orthancId}`);
          const d = await res.json();
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
        const res = await fetch(`/api/workstation/context?${cq.toString()}`);
        const d = await res.json();
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
          fetch(`/api/annotations?studyId=${entry.id}`).then((r) => r.json()),
          fetch(`/api/ai-review?studyId=${entry.id}`).then((r) => r.json()),
        ]);
        if (fresh()) {
          setAnnotations(ar.data ?? []);
          setObservations(or.data ?? []);
        }
      } catch {
        /* ignore */
      }

      // Report: find existing for this study, otherwise create a draft.
      try {
        const rr = await fetch("/api/reports?pageSize=200").then((r) => r.json());
        const list = Array.isArray(rr.data) ? rr.data : [];
        const existing = list.find((r: ReportRow) => r.studyId === entry.id);
        if (fresh()) {
          if (existing) {
            setReport(existing);
          } else if (entry.patientId) {
            const cr = await fetch("/api/reports", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ studyId: entry.id, patientId: entry.patientId, status: "draft" }),
            });
            const created = await cr.json();
            if (cr.ok && fresh()) {
              setReport(created);
              publish("report.started", "report", created.id, { studyId: entry.id, procedure: entry.procedure });
            }
          }
        }
      } catch {
        /* ignore */
      }

      // Refresh the activity streams.
      loadEvents();
      loadNotifications();
    },
    [pacsStudies, publish, loadEvents, loadNotifications]
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
      await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studyId: selected.id,
          orthancStudyId: studyDetail?.study.orthancId ?? null,
          seriesInstanceUid: null,
          tool,
          label,
          data: { value: 0, units: "mm", note: label, tool, ...data },
          createdBy: "radiologist",
        }),
      });
      publish(tool === "length" ? "measurement.created" : "annotation.added", "study", selected.id, { tool, label });
      const res = await fetch(`/api/annotations?studyId=${selected.id}`).then((r) => r.json());
      setAnnotations(res.data ?? []);
    },
    [selected, studyDetail, publish]
  );

  const removeAnnotation = useCallback(async (id: string) => {
    await fetch(`/api/annotations/${id}`, { method: "DELETE" });
    setAnnotations((a) => a.filter((x) => x.id !== id));
  }, []);

  const isBookmarked = bookmarks.some((b) => b.studyId === selected?.id);

  const toggleBookmark = useCallback(async () => {
    if (!selected) return;
    if (isBookmarked) {
      const b = bookmarks.find((x) => x.studyId === selected.id);
      if (b) await fetch(`/api/bookmarks/${b.id}`, { method: "DELETE" });
    } else {
      await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studyId: selected.id,
          orthancStudyId: studyDetail?.study.orthancId ?? null,
          label: `${selected.procedure} — ${selected.patientLastName ?? ""} ${selected.accessionNumber ?? ""}`.trim(),
          userId: "radiologist",
        }),
      });
    }
    loadBookmarks();
  }, [selected, isBookmarked, bookmarks, studyDetail, loadBookmarks]);

  // ── AI review ──
  const runAiReview = useCallback(async () => {
    if (!selected) return;
    await fetch("/api/ai-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studyId: selected.id,
        orthancStudyId: studyDetail?.study.orthancId ?? null,
        modality: selected.modality,
        bodyPart: selected.bodyPart,
        procedure: selected.procedure,
      }),
    });
    publish("ai.review_completed", "study", selected.id, { modality: selected.modality });
    const res = await fetch(`/api/ai-review?studyId=${selected.id}`).then((r) => r.json());
    setObservations(res.data ?? []);
  }, [selected, studyDetail, publish]);

  const reviewObservation = useCallback(
    async (id: string, status: "accepted" | "rejected") => {
      await fetch(`/api/ai-review/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewedBy: "radiologist" }),
      });
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
      await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findings: merged.findings,
          impression: merged.impression,
          recommendation: merged.recommendation,
          templateName: merged.templateName,
          changedBy: "radiologist",
        }),
      });
      setReport(merged);
      publish("report.drafted", "report", report.id, { studyId: selected?.id });
    },
    [report, selected, publish]
  );

  const signReport = useCallback(async (): Promise<boolean> => {
    if (!report) return false;
    // Guard: never sign an empty report (matches the button-level guard).
    if (!report.findings?.trim()) return false;
    const res = await fetch(`/api/reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "signed", approvedBy: "Dr. Radiologist" }),
    });
    if (!res.ok) return false;
    const d = await res.json();
    if (d.ok) {
      setReport((r) => (r ? { ...r, status: "signed", signedAt: new Date().toISOString() } : r));
      // Real state transition: signed report moves the study to `signed`.
      // Awaited so releaseStudy (which follows) never races it.
      if (selected?.id) {
        try {
          await fetch(`/api/workflow/${selected.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "transition", to: "signed", changedBy: "radiologist" }),
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
    await fetch(`/api/workflow/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "released", completedAt: new Date().toISOString() }),
    });
    publish("report.released", "report", report?.id ?? null, { studyId: selected.id });
    publish("study.completed", "study", selected.id, { procedure: selected.procedure });
    refreshWorklist();
  }, [selected, report, signReport, publish, refreshWorklist]);

  const runAssist = useCallback(async () => {
    if (!selected) return;
    const res = await fetch("/api/reports/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studyId: selected.id,
        patientId: selected.patientId,
        reportId: report?.id,
        modality: selected.modality,
        procedure: selected.procedure,
        clinicalIndication: selected.clinicalIndication,
        findings: report?.findings,
        impression: report?.impression,
        recommendation: report?.recommendation,
      }),
    });
    const d = await res.json();
    if (d.ok) setAssist(d);
  }, [selected, report]);

  // ── Notifications ──
  const markNotificationRead = useCallback(async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read: true }) });
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, read: true } : x)));
  }, []);

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
    loadConfig();
    loadFacets();
    loadBookmarks();
    loadTemplates();
    loadEvents();
    loadNotifications();
    loadPacs();

    // Open SSE connection for real-time events
    const sse = new EventSource("/api/events/stream");
    eventSourceRef.current = sse;

    // Generic message handler — pushes new events into the activity panel
    sse.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        setEvents((prev) => {
          // Deduplicate by id
          if (prev.some((e) => e.id === data.id)) return prev;
          return [data, ...prev].slice(0, 100);
        });
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
          const data = JSON.parse(ev.data);
          setEvents((prev) => {
            if (prev.some((e) => e.id === data.id)) return prev;
            return [data, ...prev].slice(0, 100);
          });
        } catch { /* malformed */ }
      });
    }

    sse.onerror = () => {
      // SSE auto-reconnects; meanwhile fall back to polling
      sse.close();
      eventSourceRef.current = null;
    };

    // Still poll worklist + notifications every 30s (they aren't SSE-backed yet)
    const timer = setInterval(() => {
      refreshWorklist();
      loadNotifications();
    }, 30_000);

    return () => {
      clearInterval(timer);
      sse.close();
      eventSourceRef.current = null;
    };
  }, [loadConfig, loadFacets, loadBookmarks, loadTemplates, loadEvents, loadNotifications, loadPacs, refreshWorklist]);

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
