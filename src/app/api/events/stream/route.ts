/**
 * GET /api/events/stream — Server-Sent Events stream for real-time workstation updates.
 *
 * Clients open an EventSource against this endpoint. Every ~5 seconds the server
 * polls the durable event_log table for new events since the last
 * `Last-Event-ID` and pushes them. The stream reads the durable record directly
 * (PostgreSQL is the event bus — there is no separate fan-out channel).
 *
 * The endpoint keeps a connection alive until the client disconnects.
 *
 * Exempt from withAuth (SSE streams return raw Response objects), but the
 * session is verified explicitly here so the stream never depends on the
 * edge proxy's mode: unauthenticated clients receive a 401.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eventLog } from "@/db/schema";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { asc, desc, gt, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 5000;

export async function GET(request: NextRequest) {
  // Explicit session gate — independent of the proxy's configuration mode.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 },
    );
  }

  const lastIdHeader = request.headers.get("Last-Event-ID") ?? request.nextUrl.searchParams.get("lastId");
  let lastId = lastIdHeader ? parseInt(lastIdHeader, 10) : 0;
  if (isNaN(lastId)) lastId = 0;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial comment to confirm connection
      controller.enqueue(encoder.encode(`:connected\n\n`));

      let closed = false;
      request.signal.addEventListener("abort", () => {
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      });

      while (!closed) {
        try {
          // First poll (no cursor): show the most recent events. Once a cursor
          // exists, walk forward in insertion order so no event is skipped
          // even when more than one page arrives between polls.
          const rows = await db
            .select({
              id: eventLog.id,
              eventType: eventLog.eventType,
              aggregate: eventLog.aggregate,
              aggregateId: eventLog.aggregateId,
              payload: eventLog.payload,
              source: eventLog.source,
              occurredAt: eventLog.occurredAt,
            })
            .from(eventLog)
            .where(lastId > 0 ? gt(eventLog.id, lastId) : sql`true`)
            .orderBy(lastId > 0 ? asc(eventLog.id) : desc(eventLog.id))
            .limit(20);

          if (rows.length > 0) {
            // Reverse so oldest first (SSE order matters for UI)
            rows.reverse();
            for (const row of rows) {
              const data = JSON.stringify({
                id: row.id,
                eventType: row.eventType,
                aggregate: row.aggregate,
                aggregateId: row.aggregateId,
                payload: row.payload,
                source: row.source,
                occurredAt: row.occurredAt,
              });
              controller.enqueue(
                encoder.encode(`id: ${row.id}\nevent: ${row.eventType}\ndata: ${data}\n\n`)
              );
              lastId = row.id;
            }
          }
        } catch {
          // Database temporarily unavailable — send keepalive comment
          controller.enqueue(encoder.encode(`:keepalive ${Date.now()}\n\n`));
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
