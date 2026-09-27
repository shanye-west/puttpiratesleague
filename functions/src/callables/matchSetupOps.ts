/**
 * League match setup (Putt Pirates): players pick their own course and date,
 * so the course + strokes for a match are set at play time by a participant
 * (or an admin) rather than at creation from the round's course.
 *
 * Players enter their GHIN Handicap Index; the course handicap for the day is
 * computed here from the chosen tees' rating, slope and par (WHS formula), and
 * the higher course handicap gets the difference on the hardest holes.
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
import { computeTeamsWithStrokes } from "../helpers/strokeCalculation.js";
import { authorizedUidsFor, fetchCourseById } from "./matchOps.js";
import type { RoundFormat } from "../types.js";

function db() {
  return getFirestore();
}

// Same bounds as the tournament handicap map (a plus handicap is negative).
const MIN_HANDICAP_INDEX = -10;
const MAX_HANDICAP_INDEX = 54;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Data payload:
 * - matchId: string
 * - courseId: string            (an existing 18-hole course with rating/slope/par)
 * - handicapIndexes: { [playerId]: number }  — GHIN Handicap Index, one entry per
 *   player in the match (a plus handicap is sent negative: +2.1 → -2.1)
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
  const rawIndexes = data.handicapIndexes;
  if (rawIndexes === undefined && data.courseHandicaps !== undefined) {
    // A cached copy of the app from before the switch to handicap indexes.
    throw new HttpsError(
      "failed-precondition",
      "The app has been updated — refresh the page and enter each player's handicap index"
    );
  }
  if (typeof rawIndexes !== "object" || rawIndexes === null || Array.isArray(rawIndexes)) {
    throw new HttpsError("invalid-argument", "handicapIndexes must be a map of playerId → handicap index");
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

  // Every player in the match, and nobody else, needs a handicap index.
  const indexes: Record<string, number> = {};
  for (const [pid, value] of Object.entries(rawIndexes as Record<string, unknown>)) {
    if (!players.includes(pid)) {
      throw new HttpsError("invalid-argument", `handicapIndexes.${pid} is not a player in this match`);
    }
    if (!isFiniteNumber(value) || value < MIN_HANDICAP_INDEX || value > MAX_HANDICAP_INDEX) {
      throw new HttpsError(
        "invalid-argument",
        `handicapIndexes.${pid} must be a handicap index between ${MIN_HANDICAP_INDEX} and ${MAX_HANDICAP_INDEX}`
      );
    }
    // Indexes are published to one decimal place.
    indexes[pid] = Math.round(value * 10) / 10;
  }
  const missing = players.filter((pid) => !(pid in indexes));
  if (missing.length > 0) {
    throw new HttpsError("invalid-argument", `Missing handicap index for: ${missing.join(", ")}`);
  }

  const { course } = await fetchCourseById(courseId);
  // The strokes hinge on these — never fall back to a guessed slope/rating.
  if (!isFiniteNumber(course.rating) || !isFiniteNumber(course.slope) || !isFiniteNumber(course.par)) {
    throw new HttpsError(
      "failed-precondition",
      "This course is missing its rating, slope or par — ask an admin to fill them in"
    );
  }

  const side = (team: unknown) =>
    (Array.isArray(team) ? team : [])
      .map((p) => (p as { playerId?: unknown })?.playerId)
      .filter((pid): pid is string => typeof pid === "string" && !!pid)
      .map((pid) => ({ playerId: pid, handicapIndex: indexes[pid] }));
  const teamA = side(match.teamAPlayers);
  const teamB = side(match.teamBPlayers);

  // WHS course handicap per player, then the lower plays off scratch.
  const { teamAPlayersWithStrokes, teamBPlayersWithStrokes, courseHandicaps } =
    computeTeamsWithStrokes(teamA, teamB, course);
  // Positional like courseHandicaps: [teamA..., teamB...].
  const handicapIndexes = [...teamA, ...teamB].map((p) => p.handicapIndex);

  // Refresh authorizedUids from the players' CURRENT authUid — this is what
  // lets a player who linked their account after the match was seeded score it.
  const authorizedUids = await authorizedUidsFor(players);

  await matchRef.update({
    courseId,
    handicapIndexes,
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
  return { success: true, matchId, handicapIndexes, courseHandicaps, strokesReceived };
});
