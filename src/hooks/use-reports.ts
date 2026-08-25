import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, getJson, mutate } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

/** Report list; optionally filtered by patient (report-editor history tab). */
export function useReports<T>(patientId?: string, pageSize = 200, enabled = true) {
  return useQuery({
    queryKey: qk.reports(patientId),
    queryFn: async () => {
      const params = patientId
        ? `?patientId=${encodeURIComponent(patientId)}&pageSize=${pageSize}`
        : `?pageSize=${pageSize}`;
      return (await getList<T>(`/api/reports${params}`)).data;
    },
    enabled,
  });
}

/** Built-in + custom templates merged server-side. */
export function useReportTemplates<T>() {
  return useQuery({
    queryKey: qk.reportTemplates(),
    queryFn: async () => (await getList<T>("/api/reports/templates")).data,
  });
}

/** Version history for one report (enabled only when the panel is open). */
export function useReportVersions<T>(reportId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.reportVersions(reportId ?? ""),
    queryFn: async () => (await getList<T>(`/api/reports/${reportId}/versions`)).data,
    enabled: enabled && Boolean(reportId),
  });
}

/** Fully-joined report detail (patient + radiologist context). */
export function useReportDetail<T>(reportId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.reportDetail(reportId ?? ""),
    queryFn: () => getJson<T>(`/api/reports/${reportId}`),
    enabled: enabled && Boolean(reportId),
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => mutate("POST", "/api/reports", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });
}

export function useUpdateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      mutate("PATCH", `/api/reports/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });
}

/** AI assistance payload (non-envelope `{ ok, ... }` response). */
export function useReportAssist() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => mutate("POST", "/api/reports/assist", body),
  });
}
