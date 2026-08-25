import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";

function req(query = "") {
  return new NextRequest(`http://localhost/api/test${query ? `?${query}` : ""}`);
}

describe("parseListQuery", () => {
  it("applies defaults when no params are given", () => {
    const result = parseListQuery(req());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ page: 1, pageSize: 50, offset: 0, dir: "desc" });
      expect(result.data.sort).toBeUndefined();
    }
  });

  it("honors a custom defaultPageSize", () => {
    const result = parseListQuery(req(), { defaultPageSize: 30 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.pageSize).toBe(30);
  });

  it("computes offset from page and pageSize", () => {
    const result = parseListQuery(req("page=3&pageSize=20"));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.offset).toBe(40);
  });

  it("rejects pageSize above the 200 cap", () => {
    const result = parseListQuery(req("pageSize=201"));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.status).toBe(400);
  });

  it("rejects page below 1 and non-numeric values", () => {
    for (const q of ["page=0", "page=abc", "pageSize=-5"]) {
      const result = parseListQuery(req(q));
      expect(result.success, q).toBe(false);
    }
  });

  it("rejects sort when no allowlist is configured", () => {
    const result = parseListQuery(req("sort=createdAt"));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.status).toBe(400);
  });

  it("rejects sort fields outside the allowlist", () => {
    const result = parseListQuery(req("sort=password"), { sorts: ["createdAt"] });
    expect(result.success).toBe(false);
  });

  it("accepts allowlisted sort and defaults dir to desc", () => {
    const result = parseListQuery(req("sort=createdAt"), { sorts: ["createdAt", "lastName"] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe("createdAt");
      expect(result.data.dir).toBe("desc");
    }
  });

  it("accepts an explicit dir and rejects invalid ones", () => {
    const ok = parseListQuery(req("sort=createdAt&dir=asc"), { sorts: ["createdAt"] });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.dir).toBe("asc");

    const bad = parseListQuery(req("dir=upward"));
    expect(bad.success).toBe(false);
  });
});

describe("serviceOpts", () => {
  it("maps the parsed query to service options", () => {
    const result = parseListQuery(req("page=2&pageSize=10&sort=createdAt&dir=asc"), {
      sorts: ["createdAt"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(serviceOpts(result.data)).toEqual({
        limit: 10,
        offset: 10,
        sort: "createdAt",
        dir: "asc",
      });
    }
  });
});

describe("listEnvelope", () => {
  it("wraps rows with pagination meta", () => {
    const env = listEnvelope([{ id: 1 }], 123, 2, 50);
    expect(env).toEqual({
      data: [{ id: 1 }],
      meta: { page: 2, pageSize: 50, total: 123, totalPages: 3 },
    });
  });

  it("handles empty result sets", () => {
    const env = listEnvelope([], 0, 1, 50);
    expect(env.meta).toEqual({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  });

  it("computes totalPages for exact multiples", () => {
    expect(listEnvelope([], 100, 1, 50).meta.totalPages).toBe(2);
    expect(listEnvelope([], 101, 1, 50).meta.totalPages).toBe(3);
  });
});
