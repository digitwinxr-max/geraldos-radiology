/**
 * GeraldOS Decisions Service
 *
 * Thin wrapper around the decision engine (src/lib/decision-engine.ts).
 * Re-exports all engine functions for use by route handlers.
 */

export {
  proposeDecision,
  approveDecision,
  rejectDecision,
  executeDecision,
  listDecisions,
  evaluateRules,
  DECISION_STATUS,
} from "@/lib/decision-engine";

import { db } from "@/db";
import { aiRecommendations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getDecision(id: string) {
  const [row] = await db.select().from(aiRecommendations).where(eq(aiRecommendations.id, id));
  return row ?? null;
}
