import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiClientError, apiFetch, getList, getJson, mutate } from "@/lib/api-client";

function mockResponse(status: number, body: unknown, statusText = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
  } as unknown as Response;
}

describe("api-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getList", () => {
    it("returns the canonical list envelope", async () => {
      const envelope = {
        data: [{ id: "1" }],
        meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(200, envelope)));

      const result = await getList<{ id: string }>("/api/patients");
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it("preserves extra top-level keys such as unread", async () => {
      const envelope = {
        data: [],
        meta: { page: 1, pageSize: 30, total: 0, totalPages: 0 },
        unread: 4,
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(200, envelope)));

      const result = await getList<object, { unread: number }>("/api/notifications");
      expect(result.unread).toBe(4);
    });
  });

  describe("getJson", () => {
    it("returns non-envelope bodies untouched", async () => {
      const body = { ok: true, studies: [{ id: "s1" }] };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(200, body)));

      const result = await getJson<typeof body>("/api/orthanc/studies");
      expect(result.studies).toHaveLength(1);
    });
  });

  describe("error handling", () => {
    it("throws ApiClientError with the structured envelope fields", async () => {
      const errorBody = { error: { code: "VALIDATION_FAILED", message: "Request validation failed", details: [{ message: "bad" }] } };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(400, errorBody)));

      await expect(apiFetch("/api/patients")).rejects.toMatchObject({
        name: "ApiClientError",
        status: 400,
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
      });
    });

    it("falls back to HTTP_<status> code when the body is not an error envelope", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(502, undefined, "Bad Gateway")));

      const error = await apiFetch("/api/command-centre").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).code).toBe("HTTP_502");
      expect((error as ApiClientError).message).toBe("Bad Gateway");
    });

    it("raises NETWORK_ERROR when fetch rejects", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed to fetch")));

      await expect(getJson("/api/health")).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 });
    });
  });

  describe("mutate", () => {
    it("sends JSON bodies with the content-type header", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(201, { data: { id: "x" } }));
      vi.stubGlobal("fetch", fetchMock);

      await mutate("POST", "/api/patients", { firstName: "Ana" });
      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({ "Content-Type": "application/json" });
      expect(JSON.parse(init.body)).toEqual({ firstName: "Ana" });
    });

    it("omits the body entirely for DELETE without payload", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      await mutate("DELETE", "/api/bookmarks/1");
      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe("DELETE");
      expect(init.body).toBeUndefined();
    });

    it("passes FormData through without JSON headers", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      const form = new FormData();
      form.append("files", "dcm");
      await mutate("POST", "/api/orthanc/upload", form);
      const [, init] = fetchMock.mock.calls[0];
      expect(init.body).toBe(form);
      expect(init.headers).toBeUndefined();
    });
  });
});
