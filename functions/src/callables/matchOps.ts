/**
 * Admin-only callables for creating/editing matches and recalculating their
 * stroke allocations. Moved from index.ts; the deployed function names are
 * unchanged (index.ts re-exports these under the same export names).
 *
 * All writes go through the Admin SDK, which bypasses security rules — every
 * callable must start with requireAdmin().
 *
 * League mode (Putt Pirates): a round may have NO course — players pick their
 * course per match and set it (plus strokes) later through setupMatchCard in
 * matchSetupOps.ts. seedMatch/editMatch then write zero strokes and leave
 * courseHandicaps empty instead of failing.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "../helpers/adminAuth.js";
import { normalizeTeeTime } from "./teeTime.js";
import { computeTeamsWithStrokes, type CourseForStrokes, type ResolvedPlayer, type TeamsWithStrokes } from "../helpers/strokeCalculation.js";
import { zeros18 } from "../helpers/matchHelpers.js";
import { ensureTournamentTeamColors } from "../utils/teamColors.js";

function db() {
  return getFirestore();
}

interface PlayerPayload {
  playerId: string;
  handicapIndex?: unknown;
}

/** A course doc with the 18-hole invariant enforced. */
export async function fetchCourseById(courseId: string): Promise<{ courseId: string; course: CourseForStrokes }> {
  const courseDoc = await db().collection("courses").doc(courseId).get();
  if (!courseDoc.exists) {
    throw new HttpsError("not-found", "Course not found");
  }
  const course = courseDoc.data() as CourseForStrokes;
  if ((course.holes || []).length !== 18) {
    throw new HttpsError("failed-precondition", "Course must have 18 holes");
  }
  return { courseId, course };
}

/**
 * The round's course, or null when the round has none (league mode — the
 * course is chosen per match later). Throws only when the round itself is missing.
 */
async function fetchRoundCourse(roundId: string): Promise<{ courseId: string; course: CourseForStrokes } | null> {
  const roundDoc = await db().collection("rounds").doc(roundId).get();
  if (!roundDoc.exists) {
    throw new HttpsError("not-found", "Round not found");
  }
  const courseId = roundDoc.data()!.courseId;
  if (!courseId) return null;
  return fetchCourseById(courseId);
}

/** Cup behaviour: the round MUST have a course (recalculateMatchStrokes). */
async function fetchCourseForRound(roundId: string): Promise<{ courseId: string; course: CourseForStrokes }> {
  const found = await fetchRoundCourse(roundId);
  if (!found) {
    throw new HttpsError("failed-precondition", "Round does not have a courseId");
  }
  return found;
}

/** Zero-stroke sides for a match whose course isn't known yet. */
function sidesWithoutStrokes(teamAPlayers: PlayerPayload[], teamBPlayers: PlayerPayload[]): TeamsWithStrokes {
  const none = (p: PlayerPayload) => ({ playerId: p.playerId, strokesReceived: zeros18() });
  return {
    teamAPlayersWithStrokes: teamAPlayers.map(none),
    teamBPlayersWithStrokes: teamBPlayers.map(none),
    courseHandicaps: [],
  };
}

/**
 * Auth uids of the given players (for the security-rules `authorizedUids`
 * array) — one batched getAll round-trip instead of a getDoc per player.
 */
export async function authorizedUidsFor(playerIds: string[]): Promise<string[]> {
  const ids = playerIds.filter((pid) => typeof pid === "string" && pid);
  if (ids.length === 0) return [];
  const playerRefs = ids.map((pid) => db().collection("players").doc(pid));
  const playerSnaps = await db().getAll(...playerRefs);
  const authorizedUids: string[] = [];
  for (const pSnap of playerSnaps) {
    const authUid = pSnap.data()?.authUid;
    if (authUid) authorizedUids.push(authUid);
  }
  return authorizedUids;
}

/** Tournament handicap maps used as fallback when the caller omits handicapIndex. */
async function fetchTournamentHandicaps(tournamentId: string): Promise<{
  teamAHandicaps: Record<string, number>;
  teamBHandicaps: Record<string, number>;
}> {
  const tournamentDoc = await db().collection("tournaments").doc(tournamentId).get();
  const teamAHandicaps: Record<string, number> = {};
  const teamBHandicaps: Record<string, number> = {};
  if (tournamentDoc.exists) {
    const t = ensureTournamentTeamColors(tournamentDoc.data()! as any) as any;
    if (t.teamA?.handicapByPlayer) Object.assign(teamAHandicaps, t.teamA.handicapByPlayer);
    if (t.teamB?.handicapByPlayer) Object.assign(teamBHandicaps, t.teamB.handicapByPlayer);
  }
  return { teamAHandicaps, teamBHandicaps };
}

/** Caller-provided handicapIndex wins; otherwise either team map (seed/edit behavior). */
function resolveWithFallback(
  players: PlayerPayload[],
  teamAHandicaps: Record<string, number>,
  teamBHandicaps: Record<string, number>
): ResolvedPlayer[] {
  return players.map((p) => ({
    playerId: p.playerId,
    handicapIndex:
      p && typeof p.handicapIndex === "number"
        ? p.handicapIndex
        : (teamAHandicaps[p.playerId] ?? teamBHandicaps[p.playerId] ?? 0),
  }));
}

/**
 * Builds a ready-to-write match document with computed strokes, course
 * handicaps, and authorizedUids. Shared by `seedMatch` (writes the single
 * returned doc) and `finalizePairingDraft` (builds many and batch-writes).
 * Does not touch Firestore writes — the caller persists the returned object.
 */
export async function buildSeededMatchDoc(params: {
  id: string;
  tournamentId: string;
  roundId: string;
  teamAPlayers: PlayerPayload[];
  teamBPlayers: PlayerPayload[];
  teeTime?: unknown;
  /** Explicit ordering; when omitted the lowest free positive int is used. */
  matchNumber?: number;
}): Promise<Record<string, unknown>> {
  const { id, tournamentId, roundId, teamAPlayers, teamBPlayers, teeTime, matchNumber } = params;

  const roundCourse = await fetchRoundCourse(roundId);
  const { teamAHandicaps, teamBHandicaps } = await fetchTournamentHandicaps(tournamentId);

  const { teamAPlayersWithStrokes, teamBPlayersWithStrokes, courseHandicaps } = roundCourse
    ? computeTeamsWithStrokes(
        resolveWithFallback(teamAPlayers, teamAHandicaps, teamBHandicaps),
        resolveWithFallback(teamBPlayers, teamAHandicaps, teamBHandicaps),
        roundCourse.course
      )
    : sidesWithoutStrokes(teamAPlayers, teamBPlayers);

  const teeTimeTimestamp = normalizeTeeTime(teeTime);

  // Determine matchNumber: if caller provided `matchNumber` use it, otherwise
  // compute the lowest available positive integer for this round.
  let matchNumberToUse: number = matchNumber ?? 0;
  if (!matchNumberToUse || typeof matchNumberToUse !== "number" || matchNumberToUse <= 0) {
    const existingSnaps = await db().collection("matches").where("roundId", "==", roundId).get();
    const nums = existingSnaps.docs.map((d) => Number(d.data()?.matchNumber) || 0).filter((n) => n > 0);
    let candidate = 1;
    const numSet = new Set(nums);
    while (numSet.has(candidate)) candidate++;
    matchNumberToUse = candidate;
  }

  // Player auth UIDs for the security rules' authorizedUids array.
  const allPlayerIds = [...teamAPlayers, ...teamBPlayers].map((p: PlayerPayload) => p.playerId);
  const authorizedUids = await authorizedUidsFor(allPlayerIds);

  return {
    id,
    tournamentId,
    roundId,
    matchNumber: matchNumberToUse,
    teeTime: teeTimeTimestamp,
    teamAPlayers: teamAPlayersWithStrokes,
    teamBPlayers: teamBPlayersWithStrokes,
    courseHandicaps,
    playerIds: allPlayerIds.filter((pid) => typeof pid === "string" && pid),
    authorizedUids, // Store UIDs directly for efficient security rules
    holes: {},
    status: {
      leader: null,
      margin: 0,
      thru: 0,
      dormie: false,
      closed: false,
    },
    result: {},
  };
}

/**
 * Admin-only function to create a match with calculated strokesReceived.
 *
 * Data payload:
 * - id: string - Match document ID
 * - tournamentId: string
 * - roundId: string
 * - teeTime?: string | Timestamp
 * - teamAPlayers: Array<{ playerId: string, handicapIndex?: number }>
 * - teamBPlayers: Array<{ playerId: string, handicapIndex?: number }>
 * - matchNumber?: number
 */
export const seedMatch = onCall(async (request) => {
  await requireAdmin(request, "seedMatch", { maxCalls: 20, windowSeconds: 60 });

  const { id, tournamentId, roundId, teeTime, teamAPlayers, teamBPlayers } = request.data;

  if (!id || !tournamentId || !roundId || !teamAPlayers || !teamBPlayers) {
    throw new HttpsError("invalid-argument", "Missing required fields");
  }
  if (!Array.isArray(teamAPlayers) || !Array.isArray(teamBPlayers)) {
    throw new HttpsError("invalid-argument", "teamAPlayers and teamBPlayers must be arrays");
  }

  const matchDoc = await buildSeededMatchDoc({
    id,
    tournamentId,
    roundId,
    teamAPlayers,
    teamBPlayers,
    teeTime,
    matchNumber: request.data?.matchNumber,
  });

  await db().collection("matches").doc(id).set(matchDoc);

  return { success: true, matchId: id };
});

/**
 * Admin-only function to edit an existing match (players, round, tee time);
 * recalculates strokesReceived.
 *
 * Data payload:
 * - matchId: string
 * - tournamentId: string
 * - roundId: string
 * - teeTime?: string (ISO datetime format)
 * - teamAPlayers: Array<{ playerId: string, handicapIndex?: number }>
 * - teamBPlayers: Array<{ playerId: string, handicapIndex?: number }>
 */
export const editMatch = onCall(async (request) => {
  await requireAdmin(request, "editMatch", { maxCalls: 30, windowSeconds: 60 });

  const { matchId, tournamentId, roundId, teeTime, teamAPlayers, teamBPlayers } = request.data;

  if (!matchId || !tournamentId || !roundId || !teamAPlayers || !teamBPlayers) {
    throw new HttpsError("invalid-argument", "Missing required fields");
  }
  if (!Array.isArray(teamAPlayers) || !Array.isArray(teamBPlayers)) {
    throw new HttpsError("invalid-argument", "teamAPlayers and teamBPlayers must be arrays");
  }

  const matchDoc = await db().collection("matches").doc(matchId).get();
  if (!matchDoc.exists) {
    throw new HttpsError("not-found", "Match not found");
  }

  const roundCourse = await fetchRoundCourse(roundId);
  const { teamAHandicaps, teamBHandicaps } = await fetchTournamentHandicaps(tournamentId);

  const { teamAPlayersWithStrokes, teamBPlayersWithStrokes, courseHandicaps } = roundCourse
    ? computeTeamsWithStrokes(
        resolveWithFallback(teamAPlayers, teamAHandicaps, teamBHandicaps),
        resolveWithFallback(teamBPlayers, teamAHandicaps, teamBHandicaps),
        roundCourse.course
      )
    : sidesWithoutStrokes(teamAPlayers, teamBPlayers);

  const allPlayerIds = [...teamAPlayers, ...teamBPlayers]
    .map((p: PlayerPayload) => p.playerId)
    .filter((pid) => typeof pid === "string" && pid);

  const updates: Record<string, unknown> = {
    tournamentId,
    roundId,
    teamAPlayers: teamAPlayersWithStrokes,
    teamBPlayers: teamBPlayersWithStrokes,
    courseHandicaps,
    playerIds: allPlayerIds,
    authorizedUids: await authorizedUidsFor(allPlayerIds),
  };
  if (!roundCourse) {
    // League: the players re-run "Set up match" for the new pairing; a stale
    // per-match course/strokes must not survive a roster edit.
    updates.courseId = FieldValue.delete();
    updates.strokesSetAt = FieldValue.delete();
    updates.strokesSetBy = FieldValue.delete();
    updates._computeSig = FieldValue.delete();
    updates._lastComputed = FieldValue.delete();
  }

  // Only update teeTime if provided
  const teeTimeTimestamp = normalizeTeeTime(teeTime);
  if (teeTimeTimestamp) {
    updates.teeTime = teeTimeTimestamp;
  }

  await db().collection("matches").doc(matchId).update(updates);

  return { success: true, matchId };
});

/**
 * Admin-only function to recalculate strokesReceived for an existing match
 * using the tournament's *current* handicap indexes (no caller overrides —
 * the point is to re-sync the match with the tournament map).
 *
 * Data payload:
 * - matchId: string
 */
export const recalculateMatchStrokes = onCall(async (request) => {
  await requireAdmin(request, "recalculateMatchStrokes", { maxCalls: 10, windowSeconds: 60 });

  const { matchId } = request.data;
  if (!matchId) {
    throw new HttpsError("invalid-argument", "Missing matchId");
  }

  const matchDoc = await db().collection("matches").doc(matchId).get();
  if (!matchDoc.exists) {
    throw new HttpsError("not-found", "Match not found");
  }

  const match = matchDoc.data()!;
  const tournamentId = match.tournamentId;
  const roundId = match.roundId;
  if (!tournamentId || !roundId) {
    throw new HttpsError("failed-precondition", "Match missing tournamentId or roundId");
  }

  const tournamentDoc = await db().collection("tournaments").doc(tournamentId).get();
  if (!tournamentDoc.exists) {
    throw new HttpsError("not-found", "Tournament not found");
  }
  const tournament = tournamentDoc.data()!;
  const teamAHandicaps: Record<string, number> = tournament.teamA?.handicapByPlayer || {};
  const teamBHandicaps: Record<string, number> = tournament.teamB?.handicapByPlayer || {};

  const { course } = await fetchCourseForRound(roundId);

  // Per-team maps only — unlike seed/edit there is no cross-team fallback
  const teamAPlayers: PlayerPayload[] = match.teamAPlayers || [];
  const teamBPlayers: PlayerPayload[] = match.teamBPlayers || [];
  const { teamAPlayersWithStrokes, teamBPlayersWithStrokes, courseHandicaps } = computeTeamsWithStrokes(
    teamAPlayers.map((p) => ({ playerId: p.playerId, handicapIndex: teamAHandicaps[p.playerId] ?? 0 })),
    teamBPlayers.map((p) => ({ playerId: p.playerId, handicapIndex: teamBHandicaps[p.playerId] ?? 0 })),
    course
  );

  await db().collection("matches").doc(matchId).update({
    teamAPlayers: teamAPlayersWithStrokes,
    teamBPlayers: teamBPlayersWithStrokes,
    courseHandicaps,
  });

  return { success: true, matchId, courseHandicaps };
});
