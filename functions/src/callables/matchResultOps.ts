/**
 * Result-only matches (Putt Pirates): an admin records the outcome of a match
 * that was played off-app (no hole-by-hole card). computeMatchOnWrite turns
 * `manualResult` into a normal closed status/result, so standings, points,
 * facts and bet settlement all follow. See helpers/manualResult.ts.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "../helpers/adminAuth.js";
import { countScoredHoles } from "../helpers/matchHelpers.js";
import { validateManualResult } from "../helpers/manualResult.js";
import { setMatchLockAndSyncRound } from "../helpers/matchLock.js";
import type { RoundFormat } from "../types.js";

function db() {
  return getFirestore();
}

function requireMatchId(data: unknown): string {
  const id = (data as { matchId?: unknown } | null)?.matchId;
  if (typeof id !== "string" || !id.trim()) {
    throw new HttpsError("invalid-argument", "matchId is required");
  }
  return id.trim();
}

/**
 * Data payload:
 * - matchId: string
 * - winner: "teamA" | "teamB" | "AS"
 * - margin?: number   (holes up; defaults to 1 for a win that went 18)
 * - thru?: number     (holes played at the close; defaults to 18)
 */
export const adminSetMatchResult = onCall(async (request) => {
  const { playerId } = await requireAdmin(request, "adminSetMatchResult", { maxCalls: 60, windowSeconds: 60 });

  const matchId = requireMatchId(request.data);
  let manual;
  try {
    manual = validateManualResult(request.data);
  } catch (err) {
    throw new HttpsError("invalid-argument", err instanceof Error ? err.message : "Invalid result");
  }

  const matchRef = db().collection("matches").doc(matchId);
  const snap = await matchRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Match not found");
  }
  const match = snap.data()!;

  const format = ((match._lastComputed?.format as RoundFormat) || null) ?? (await roundFormat(match.roundId));
  if (countScoredHoles(format, match.holes) > 0) {
    throw new HttpsError(
      "failed-precondition",
      "This match has hole scores — a manual result only applies to a match with no card. Clear the scores first."
    );
  }

  await matchRef.update({
    manualResult: { ...manual, setBy: playerId, setAt: FieldValue.serverTimestamp() },
    _computeSig: FieldValue.delete(),
  });

  return { success: true, matchId, manualResult: manual };
});

/**
 * Data payload: { matchId } — reopens the match (facts are deleted by the reopen
 * path). The result auto-locked the match (autoLockOnFinish), so unlock it — and
 * its month, when that was only locked because this match was — so it can be
 * scored or given a new result.
 */
export const adminClearMatchResult = onCall(async (request) => {
  await requireAdmin(request, "adminClearMatchResult", { maxCalls: 60, windowSeconds: 60 });

  const matchId = requireMatchId(request.data);
  const matchRef = db().collection("matches").doc(matchId);
  const snap = await matchRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Match not found");
  }

  await matchRef.update({
    manualResult: FieldValue.delete(),
    _computeSig: FieldValue.delete(),
  });
  if (snap.data()?.locked === true) {
    await setMatchLockAndSyncRound(matchRef, false, { _adminUpdatedAt: FieldValue.serverTimestamp() });
  }

  return { success: true, matchId };
});

async function roundFormat(roundId: unknown): Promise<RoundFormat> {
  if (typeof roundId !== "string" || !roundId) return "singles";
  const r = await db().collection("rounds").doc(roundId).get();
  return ((r.data()?.format as RoundFormat) || "singles");
}
