import { beforeEach, describe, expect, it, vi } from "vitest";

import { OHIF_MOUNT_PREFIX, normalizeServiceUrl } from "@/lib/integrations";

/**
 * Render injects Blueprint `fromService: { property: hostport }` references as
 * a bare `host:port` with no scheme (e.g. `geraldos-orthanc-ab1c:8042`), and
 * Blueprint files do not support variable interpolation, so the scheme cannot
 * be added in render.yaml. `fetch()` rejects such a target with
 * "unknown scheme", which silently killed every Orthanc/OHIF call in
 * production. Verified against Render's Blueprint reference and reproduced
 * with Node's fetch.
 */
describe("normalizeServiceUrl", () => {
  it("adds http:// to a Render private-network hostport", () => {
    expect(normalizeServiceUrl("geraldos-orthanc-ab1c:8042")).toBe(
      "http://geraldos-orthanc-ab1c:8042",
    );
    expect(normalizeServiceUrl("geraldos-ohif-xy9z:10000")).toBe(
      "http://geraldos-ohif-xy9z:10000",
    );
  });

  it("adds http:// to a bare compose hostname", () => {
    expect(normalizeServiceUrl("orthanc:8042")).toBe("http://orthanc:8042");
    expect(normalizeServiceUrl("localhost:3001")).toBe("http://localhost:3001");
  });

  it("leaves values that already carry a scheme untouched", () => {
    for (const value of [
      "http://orthanc:8042",
      "https://pacs.gerald.co.bw",
      "http://127.0.0.1:8042",
    ]) {
      expect(normalizeServiceUrl(value)).toBe(value);
    }
  });

  it("trims surrounding whitespace before normalising", () => {
    expect(normalizeServiceUrl("  geraldos-orthanc-ab1c:8042  ")).toBe(
      "http://geraldos-orthanc-ab1c:8042",
    );
  });

  it("maps missing/blank configuration to an empty string (not_configured)", () => {
    expect(normalizeServiceUrl(undefined)).toBe("");
    expect(normalizeServiceUrl("")).toBe("");
    expect(normalizeServiceUrl("   ")).toBe("");
  });

  it("produces a URL that fetch() can parse", () => {
    // The pre-fix value throws `TypeError: fetch failed` (cause: unknown
    // scheme); the normalised value parses as a normal http URL.
    const normalized = normalizeServiceUrl("geraldos-orthanc-ab1c:8042");
    const parsed = new URL(`${normalized}/system`);
    expect(parsed.protocol).toBe("http:");
    expect(parsed.hostname).toBe("geraldos-orthanc-ab1c");
    expect(parsed.port).toBe("8042");
  });
});

describe("integrationConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("normalises ORTHANC_URL / OHIF_URL as read from the environment", async () => {
    vi.stubEnv("ORTHANC_URL", "geraldos-orthanc-ab1c:8042");
    vi.stubEnv("OHIF_URL", "geraldos-ohif-xy9z:3001");

    const { integrationConfig } = await import("@/lib/integrations");
    expect(integrationConfig.orthanc.url).toBe("http://geraldos-orthanc-ab1c:8042");
    expect(integrationConfig.ohif.url).toBe("http://geraldos-ohif-xy9z:3001");
  });

  it("keeps docker-compose style absolute URLs working unchanged", async () => {
    vi.stubEnv("ORTHANC_URL", "http://orthanc:8042");
    vi.stubEnv("OHIF_URL", "http://ohif:80");

    const { integrationConfig } = await import("@/lib/integrations");
    expect(integrationConfig.orthanc.url).toBe("http://orthanc:8042");
    expect(integrationConfig.ohif.url).toBe("http://ohif:80");
  });

  it("has no browser-facing OHIF address at all (OHIF_PUBLIC_URL is dead)", async () => {
    // The viewer is mounted on the app's own origin, so there is nothing for an
    // operator to configure and no way for a stale value to leak into the UI.
    vi.stubEnv("OHIF_PUBLIC_URL", "https://geraldos-ohif.onrender.com");
    vi.stubEnv("OHIF_URL", "geraldos-ohif-xy9z:3001");

    const mod = await import("@/lib/integrations");
    expect(Object.keys(mod.integrationConfig.ohif)).toEqual(["url"]);
    expect(mod.integrationConfig.ohif.url).toBe("http://geraldos-ohif-xy9z:3001");
  });
});

/**
 * The viewer is same-origin by design: `onrender.com` is on the Public Suffix
 * List, so a viewer on its own Render subdomain is cross-SITE with the app and
 * could never receive the SameSite=Lax session cookie that authorises DICOMweb.
 * Clients therefore get a path prefix, not a host.
 */
describe("publicClientConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("publishes the viewer as a same-origin path prefix", async () => {
    const { publicClientConfig } = await import("@/lib/integrations");
    expect(OHIF_MOUNT_PREFIX).toBe("/viewer");
    expect(publicClientConfig()).toEqual({
      ohifUrl: "/viewer",
      orthancProxyBase: "/api/orthanc/proxy",
    });
  });

  it("never exposes an internal service address to the browser", async () => {
    vi.stubEnv("ORTHANC_URL", "geraldos-orthanc-ab1c:8042");
    vi.stubEnv("OHIF_URL", "geraldos-ohif-xy9z:3001");
    vi.stubEnv("ORTHANC_USERNAME", "orthanc");
    vi.stubEnv("ORTHANC_PASSWORD", "super-secret");

    const { publicClientConfig } = await import("@/lib/integrations");
    const payload = JSON.stringify(publicClientConfig());

    expect(payload).not.toContain("geraldos-orthanc-ab1c");
    expect(payload).not.toContain("geraldos-ohif-xy9z");
    expect(payload).not.toContain("8042");
    expect(payload).not.toContain("super-secret");
    expect(Object.keys(publicClientConfig())).not.toContain("orthancUrl");
  });

  it("yields a prefix that clients can build a deep link from", async () => {
    const { publicClientConfig } = await import("@/lib/integrations");
    const { ohifUrl } = publicClientConfig();
    // Mirrors src/app/imaging/page.tsx and workstation/viewer-panel.tsx.
    const deepLink = `${ohifUrl.replace(/\/$/, "")}/viewer?StudyInstanceUIDs=1.2.3`;
    expect(deepLink).toBe("/viewer/viewer?StudyInstanceUIDs=1.2.3");
    expect(deepLink.startsWith("/")).toBe(true);
    expect(deepLink).not.toMatch(/^https?:/);
  });
});
