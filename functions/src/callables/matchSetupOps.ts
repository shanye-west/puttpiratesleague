/**
 * League match setup (Putt Pirates): players pick their own course and date,
 * so the course + strokes for a match are set at play time by a participant
 * (or an admin) rather than at creation from the round's course.
 *
 * `setupMatchCard` is the ONLY non-admin write path onto a match besides the
 * `holes` map the security rules allow directly. It is gated to the two
 * players in the match (by player id, so a player who linked their account
 * after the match was created still qualifies) and to admins.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requirePlayer } from "../helpers/adminAuth.js";
import { matchPlayerIds } from "../helpers/roster.js";
import { countScoredHoles } from "../helpers/matchHelpers.js";
import { computeTeamsWithStrokesFromCourseHandicaps } from "../helpers/strokeCalculation.js";
import { authorizedUidsFor, fetchCourseById } from "./matchOps.js";
import type { RoundFormat } from "../types.js";

function db() {
  return getFirestore();
}

const MIN_COURSE_HANDICAP = -10;
const MAX_COURSE_HANDICAP = 54;

/**
 * Data payload:
 * - matchId: string
 * - courseId: string            (an existing 18-hole course)
 * - courseHandicaps: { [playerId]: integer }  — one entry per player in the match
 */
export const setupMatchCard = onCall(async (request) => {
  const { playerId: callerId, isAdmin } = await requirePlayer(request, "setupMatchCard", {
    maxCalls: 20,
    windowSeconds: 60,
  });

  const data = request.data ?? {};
  const matchId = typeof data.matchId === "string" ? data.matchId.trim() : "";
  const courseId = typeof data.courseId === "string" ? data.courseId.trim() : "";
  if (!matchId || !courseId) {
    throw new HttpsError("invalid-argument", "matchId and courseId are required");
  }
  const rawHandicaps = data.courseHandicaps;
  if (typeof rawHandicaps !== "object" || rawHandicaps === null || Array.isArray(rawHandicaps)) {
    throw new HttpsError("invalid-argument", "courseHandicaps must be a map of playerId → course handicap");
  }

  const matchRef = db().collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new HttpsError("not-found", "Match not found");
  }
  const match = matchSnap.data()!;

  const players = matchPlayerIds(match).filter((pid) => !!pid);
  if (players.length < 2) {
    throw new HttpsError("failed-precondition", "This match doesn't have its players yet");
  }
  if (!isAdmin && !players.includes(callerId)) {
    throw new HttpsError("permission-denied", "Only the players in this match (or an admin) can set it up");
  }
  if (match.locked === true) {
    throw new HttpsError("failed-precondition", "This match is locked");
  }
  if (match.manualResult) {
    throw new HttpsError("failed-precondition", "This match has an admin-entered result — ask an admin to clear it first");
  }

  const roundSnap = match.roundId ? await db().collection("rounds").doc(match.roundId).get() : null;
  if (!roundSnap || !roundSnap.exists) {
    throw new HttpsError("failed-precondition", "Match has no round");
  }
  const round = roundSnap.data()!;
  if (round.locked === true) {
    throw new HttpsError("failed-precondition", "This round is locked");
  }
  const format = (round.format as RoundFormat) || "singles";

  // Once scores are on the card, changing strokes changes the result under the
  // players' feet — leave that to an admin.
  if (!isAdmin && countScoredHoles(format, match.holes) > 0) {
    throw new HttpsError(
      "failed-precondition",
      "Scores have already been entered — ask an admin to change the course or strokes"
    );
  }

  // Every player in the match, and nobody else, needs an integer course handicap.
  const handicaps: Record<string, number> = {};
  for (const [pid, value] of Object.entries(rawHandicaps as Record<string, unknown>)) {
    if (!players.includes(pid)) {
      throw new HttpsError("invalid-argument", `courseHandicaps.${pid} is not a player in this match`);
    }
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < MIN_COURSE_HANDICAP ||
      value > MAX_COURSE_HANDICAP
    ) {
      throw new HttpsError(
        "invalid-argument",
        `courseHandicaps.${pid} must be a whole-number course handicap between ${MIN_COURSE_HANDICAP} and ${MAX_COURSE_HANDICAP}`
      );
    }
    handicaps[pid] = value;
  }
  const missing = players.filter((pid) => !(pid in handicaps));
  if (missing.length > 0) {
    throw new HttpsError("invalid-argument", `Missing course handicap for: ${missing.join(", ")}`);
  }

  const { course } = await fetchCourseById(courseId);

  const side = (team: unknown) =>
    (Array.isArray(team) ? team : [])
      .map((p) => (p as { playerId?: unknown })?.playerId)
      .filter((pid): pid is string => typeof pid === "string" && !!pid)
      .map((pid) => ({ playerId: pid, courseHandicap: handicaps[pid] }));

  const { teamAPlayersWithStrokes, teamBPlayersWithStrokes, courseHandicaps } =
    computeTeamsWithStrokesFromCourseHandicaps(side(match.teamAPlayers), side(match.teamBPlayers), course);

  // Refresh authorizedUids from the players' CURRENT authUid — this is what
  // lets a player who linked their account after the match was seeded score it.
  const authorizedUids = await authorizedUidsFor(players);

  await matchRef.update({
    courseId,
    courseHandicaps,
    teamAPlayers: teamAPlayersWithStrokes,
    teamBPlayers: teamBPlayersWithStrokes,
    playerIds: players,
    authorizedUids,
    strokesSetAt: FieldValue.serverTimestamp(),
    strokesSetBy: callerId,
    // Force computeMatchOnWrite to re-derive against the new strokes/course.
    _computeSig: FieldValue.delete(),
    _lastComputed: FieldValue.delete(),
  });

  const strokesReceived: Record<string, number[]> = {};
  for (const p of [...teamAPlayersWithStrokes, ...teamBPlayersWithStrokes]) {
    strokesReceived[p.playerId] = p.strokesReceived;
  }
  return { success: true, matchId, courseHandicaps, strokesReceived };
});
