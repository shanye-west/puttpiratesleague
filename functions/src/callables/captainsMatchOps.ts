/**
 * Admin-only callables for the CAPTAINS' MATCH — the pre-draft, season-long
 * running singles match between the two captains (2027: 20 rounds; the winner
 * chooses to draft 1st overall or defer).
 *
 * Rounds are played off the app and an admin enters each whole card here. Like
 * side events, the match lives in its own collection (captainsMatches, keyed by
 * tournament id) and never writes `rounds`/`matches`, so no scoring, stats,
 * skins, betting or notification trigger can see it. The running status is
 * computed client-side (rowdy-ui/src/utils/captainsMatchScoring.ts).
 *
 * Everything here is written via the Admin SDK, which bypasses rules — so every
 * callable starts with requireAdmin().
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldPath, FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "../helpers/adminAuth.js";
import {
  DEFAULT_TOTAL_ROUNDS,
  highestRoundNumber,
  validateCaptainsMatchRound,
  validateCaptainsMatchSettings,
} from "../helpers/captainsMatch.js";
import type { CaptainsMatchRound } from "../types.js";

const DEFAULT_NAME = "Captains' Match";

function db() {
  return getFirestore();
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${field} is required`);
  }
  return value.trim();
}

async function assertPlayersExist(playerIds: string[]): Promise<void> {
  const snaps = await db().getAll(...playerIds.map((pid) => db().collection("players").doc(pid)));
  const missing = snaps.filter((snap) => !snap.exists).map((snap) => snap.id);
  if (missing.length > 0) {
    throw new HttpsError("not-found", `Player not found: ${missing.join(", ")}`);
  }
}

/**
 * Create the tournament's captains' match, or update its settings.
 *
 * On create the players default to the two team captains, and the tournament
 * gets `hasCaptainsMatch: true` — the flag Home and the tournament page check
 * before opening a listener on the match.
 *
 * Data payload:
 * - tournamentId: string
 * - name?, subtitle?, stakes?, playerAId?, playerBId?, totalRounds?
 */
export const saveCaptainsMatch = onCall(async (request) => {
  await requireAdmin(request, "saveCaptainsMatch", { maxCalls: 20, windowSeconds: 60 });

  const tournamentId = requireString(request.data?.tournamentId, "tournamentId");
  const { tournamentId: _ignored, ...rest } = request.data ?? {};
  void _ignored;

  const tRef = db().collection("tournaments").doc(tournamentId);
  const ref = db().collection("captainsMatches").doc(tournamentId);
  const [tSnap, snap] = await Promise.all([tRef.get(), ref.get()]);
  if (!tSnap.exists) {
    throw new HttpsError("not-found", "Tournament not found");
  }

  const existing = snap.exists ? snap.data() : undefined;
  const highestRound = highestRoundNumber(existing?.rounds);
  const result = validateCaptainsMatchSettings(rest, highestRound);
  if (!result.ok || !result.settings) {
    throw new HttpsError("invalid-argument", result.errors.join("; "));
  }
  const settings = result.settings;

  if (!existing) {
    const tournament = tSnap.data() ?? {};
    const playerAId = settings.playerAId ?? tournament.teamA?.captainId;
    const playerBId = settings.playerBId ?? tournament.teamB?.captainId;
    if (typeof playerAId !== "string" || !playerAId || typeof playerBId !== "string" || !playerBId) {
      throw new HttpsError("invalid-argument", "Pick both players (or set the team captains first)");
    }
    if (playerAId === playerBId) {
      throw new HttpsError("invalid-argument", "The two players must be different");
    }
    await assertPlayersExist([playerAId, playerBId]);

    const batch = db().batch();
    batch.set(ref, {
      tournamentId,
      name: settings.name ?? DEFAULT_NAME,
      subtitle: settings.subtitle ?? "",
      stakes: settings.stakes ?? "",
      playerAId,
      playerBId,
      totalRounds: settings.totalRounds ?? DEFAULT_TOTAL_ROUNDS,
      rounds: {},
      _adminCreatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(tRef, { hasCaptainsMatch: true }, { merge: true });
    await batch.commit();
    return { success: true, created: true };
  }

  const playerAId = settings.playerAId ?? existing.playerAId;
  const playerBId = settings.playerBId ?? existing.playerBId;
  if (playerAId !== existing.playerAId || playerBId !== existing.playerBId) {
    // Every card's A/B columns belong to these two — swapping a player would
    // silently hand one captain the other's scores.
    if (highestRound > 0) {
      throw new HttpsError("failed-precondition", "Players can't change once a round has been entered");
    }
    if (playerAId === playerBId) {
      throw new HttpsError("invalid-argument", "The two players must be different");
    }
    await assertPlayersExist([playerAId, playerBId]);
  }

  await ref.set({ ...settings, _adminUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  // Re-assert the Home flag in case the tournament doc ever lost it.
  if (tSnap.data()?.hasCaptainsMatch !== true) {
    await tRef.set({ hasCaptainsMatch: true }, { merge: true });
  }
  return { success: true, created: false };
});

/**
 * Save one round's whole card. When the round was played on an app course the
 * course's name and tees are copied onto the card, so lists never read courses.
 *
 * Data payload: SaveCaptainsMatchRoundRequest (tournamentId, roundNumber,
 * playedOn, courseId, courseName, grossA, grossB, strokesA, strokesB)
 */
export const saveCaptainsMatchRound = onCall(async (request) => {
  await requireAdmin(request, "saveCaptainsMatchRound", { maxCalls: 60, windowSeconds: 60 });

  const tournamentId = requireString(request.data?.tournamentId, "tournamentId");
  const ref = db().collection("captainsMatches").doc(tournamentId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "This tournament has no captains' match");
  }

  const totalRounds = Number(snap.data()?.totalRounds) || DEFAULT_TOTAL_ROUNDS;
  const result = validateCaptainsMatchRound(request.data, totalRounds);
  if (!result.ok || !result.round) {
    throw new HttpsError("invalid-argument", result.errors.join("; "));
  }
  const input = result.round;

  let courseName = input.courseName;
  let tees: string | null = null;
  if (input.courseId) {
    const course = await db().collection("courses").doc(input.courseId).get();
    if (!course.exists) {
      throw new HttpsError("not-found", "Course not found");
    }
    const data = course.data() ?? {};
    courseName = typeof data.name === "string" && data.name ? data.name : input.courseId;
    tees = typeof data.tees === "string" && data.tees ? data.tees : null;
  }

  const round: CaptainsMatchRound = { ...input, courseName, tees };
  // A field-path update swaps rounds.{n} wholesale, so a corrected card never
  // keeps stale values from the version it replaces.
  await ref.update(
    new FieldPath("rounds", String(round.roundNumber)),
    round,
    "_adminUpdatedAt",
    FieldValue.serverTimestamp()
  );
  return { success: true };
});

/**
 * Remove one round's card.
 *
 * Data payload:
 * - tournamentId: string
 * - roundNumber: number
 */
export const deleteCaptainsMatchRound = onCall(async (request) => {
  await requireAdmin(request, "deleteCaptainsMatchRound", { maxCalls: 30, windowSeconds: 60 });

  const tournamentId = requireString(request.data?.tournamentId, "tournamentId");
  const roundNumber = request.data?.roundNumber;
  if (typeof roundNumber !== "number" || !Number.isInteger(roundNumber) || roundNumber < 1) {
    throw new HttpsError("invalid-argument", "roundNumber must be a positive integer");
  }

  const ref = db().collection("captainsMatches").doc(tournamentId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "This tournament has no captains' match");
  }

  await ref.update(
    new FieldPath("rounds", String(roundNumber)),
    FieldValue.delete(),
    "_adminUpdatedAt",
    FieldValue.serverTimestamp()
  );
  return { success: true };
});

/** Delete the tournament's captains' match and every card, and clear the Home flag. */
export const deleteCaptainsMatch = onCall(async (request) => {
  await requireAdmin(request, "deleteCaptainsMatch", { maxCalls: 10, windowSeconds: 60 });

  const tournamentId = requireString(request.data?.tournamentId, "tournamentId");
  const tRef = db().collection("tournaments").doc(tournamentId);
  const ref = db().collection("captainsMatches").doc(tournamentId);
  const [tSnap, snap] = await Promise.all([tRef.get(), ref.get()]);
  if (!snap.exists) {
    throw new HttpsError("not-found", "This tournament has no captains' match");
  }

  const batch = db().batch();
  batch.delete(ref);
  if (tSnap.exists) {
    batch.update(tRef, { hasCaptainsMatch: FieldValue.delete() });
  }
  await batch.commit();
  return { success: true };
});
