import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, getJson } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";

const DASHBOARD_POLL_MS = 10_000;

/** Operational snapshot — non-envelope JSON ({ ok: true, ...snapshot }). */
export function useCommandCentreSnapshot<T>() {
  return useQuery({
    queryKey: qk.commandCentre(),
    queryFn: () => getJson<T & { ok: boolean }>("/api/command-centre"),
    refetchInterval: DASHBOARD_POLL_MS,
  });
}

/** Dashboard pairs the snapshot with the 40 most recent events, polled on the same interval. */
export function useCommandCentreEvents<T>() {
  return useQuery({
    queryKey: qk.events(40),
    queryFn: async () => (await getList<T>("/api/events?pageSize=40")).data,
    refetchInterval: DASHBOARD_POLL_MS,
  });
}

/** Seed button — manual refresh of both queries after POST /api/seed. */
export function useCommandCentreInvalidator() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.commandCentre() }),
      qc.invalidateQueries({ queryKey: ["events"] }),
    ]);
}
