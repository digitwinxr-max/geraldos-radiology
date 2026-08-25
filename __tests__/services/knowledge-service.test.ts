import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { dbMock } = await import("../helpers/db-mock");
  return { db: dbMock.db };
});
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/events")>();
  return { ...actual, publishEvent: vi.fn().mockResolvedValue(undefined) };
});

import { dbMock } from "../helpers/db-mock";
import { recordAudit } from "@/lib/audit";
import { EVENT_TYPES, publishEvent } from "@/lib/events";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listAllDocuments,
  updateDocument,
} from "@/services/knowledge-service";

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

describe("knowledge service", () => {
  it("listAllDocuments returns the scripted documents", async () => {
    dbMock.result([{ id: "doc-1", title: "CT Chest Protocol" }]);

    await expect(listAllDocuments()).resolves.toEqual([
      { id: "doc-1", title: "CT Chest Protocol" },
    ]);
  });

  describe("createDocument", () => {
    const input = { title: "MRI Safety", category: "protocol", content: "..." };

    it("always records an audit entry", async () => {
      dbMock.result([{ id: "doc-1", status: "draft", ...input }]);

      await createDocument(input);

      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "knowledge.document_created",
          module: "knowledge",
          entityType: "knowledge_document",
          entityId: "doc-1",
          details: { title: "MRI Safety", category: "protocol" },
        }),
      );
    });

    it("publishes knowledge.published only when the document is published", async () => {
      dbMock.result([{ id: "doc-1", status: "draft", ...input }]);
      await createDocument(input);
      expect(publishEvent).not.toHaveBeenCalled();

      dbMock.reset();
      vi.clearAllMocks();
      dbMock.result([{ id: "doc-2", status: "published", ...input }]);
      await createDocument(input);
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EVENT_TYPES.KNOWLEDGE_PUBLISHED,
          aggregate: "knowledge",
          aggregateId: "doc-2",
          payload: { title: "MRI Safety" },
        }),
      );
    });
  });

  it("getDocument returns the row or null", async () => {
    dbMock.result([{ id: "doc-1" }]);
    await expect(getDocument("doc-1")).resolves.toMatchObject({ id: "doc-1" });

    dbMock.reset();
    dbMock.result([]);
    await expect(getDocument("missing")).resolves.toBeNull();
  });

  it("updateDocument applies updates and returns null when missing", async () => {
    dbMock.result([{ id: "doc-1", title: "Updated" }]);
    const updated = await updateDocument("doc-1", { title: "Updated" });
    expect(updated).toMatchObject({ title: "Updated" });
    const setArgs = dbMock.callsFor("set")[0].args[0] as Record<string, unknown>;
    expect(setArgs.title).toBe("Updated");
    expect(setArgs.updatedAt).toBeInstanceOf(Date);

    dbMock.reset();
    dbMock.result([]);
    await expect(updateDocument("missing", { title: "x" })).resolves.toBeNull();
  });

  it("deleteDocument deletes with returning and yields the row or null", async () => {
    dbMock.result([{ id: "doc-1" }]);
    await expect(deleteDocument("doc-1")).resolves.toMatchObject({ id: "doc-1" });
    expect(dbMock.callsFor("delete")).toHaveLength(1);
    expect(dbMock.callsFor("returning")).toHaveLength(1);

    dbMock.reset();
    dbMock.result([]);
    await expect(deleteDocument("missing")).resolves.toBeNull();
  });
});
