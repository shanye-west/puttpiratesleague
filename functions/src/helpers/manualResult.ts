/**
 * Result-only matches (Putt Pirates backfill).
 *
 * A league match played off-app can be recorded by an admin as a bare result
 * ("Marrero won 3&2", "halved") with no hole-by-hole card. The result lives on
 * the match doc as `manualResult`; computeMatchOnWrite turns it into the same
 * `status`/`result` shape a scored match produces, so standings, points,
 * facts and bet settlement all see a normal closed match.
 *
 * Pure module (no Firestore) so the rules are unit-tested; the callables and
 * triggers only call in here.
 */

import type { MatchStatus, MatchResult } from "../types.js";

export type ManualWinner = "teamA" | "teamB" | "AS";

export interface ManualResult {
  winner: ManualWinner;
  /** Holes up at the close. 0 for a halved match. */
  margin: number;
  /** Holes played when the match closed (18 for a halve or a 1-up win). */
  thru: number;
}

/** Loose shape read from a match doc / callable payload. */
export interface ManualResultLike {
  winner?: unknown;
  margin?: unknown;
  thru?: unknown;
}

/**
 * Validates and normalizes a manual result. Throws a plain Error with a
 * player-readable message; callables wrap it in an HttpsError.
 *
 *  - "AS" → margin 0, thru 18 (a halve always goes the distance).
 *  - a win → thru defaults to 18, margin defaults to 1 when thru is 18; the
 *    pair must describe a real match-play close: margin ≥ 1, margin ≤ thru,
 *    and either the match went 18 or the lead exceeded the holes left.
 */
export function validateManualResult(input: unknown): ManualResult {
  const raw = (input ?? {}) as ManualResultLike;
  const winner = raw.winner;
  if (winner !== "teamA" && winner !== "teamB" && winner !== "AS") {
    throw new Error('winner must be "teamA", "teamB", or "AS"');
  }
  if (winner === "AS") {
    if (raw.margin !== undefined && raw.margin !== null && raw.margin !== 0) {
      throw new Error("A halved match has no margin");
    }
    return { winner, margin: 0, thru: 18 };
  }

  const thru = raw.thru === undefined || raw.thru === null ? 18 : raw.thru;
  if (typeof thru !== "number" || !Number.isInteger(thru) || thru < 1 || thru > 18) {
    throw new Error("thru must be a whole number of holes from 1 to 18");
  }
  const margin = raw.margin === undefined || raw.margin === null ? (thru === 18 ? 1 : NaN) : raw.margin;
  if (typeof margin !== "number" || !Number.isInteger(margin) || margin < 1) {
    throw new Error("margin must be a whole number of holes, at least 1");
  }
  if (margin > thru) {
    throw new Error(`A ${margin}-hole margin is impossible after ${thru} holes`);
  }
  const holesLeft = 18 - thru;
  if (holesLeft > 0 && margin <= holesLeft) {
    throw new Error(
      `${margin}&${holesLeft} isn't a finished match — the lead must beat the holes remaining`
    );
  }
  return { winner, margin, thru };
}

/** Whether a match should be scored from its manual result rather than its holes. */
export function usesManualResult(match: { manualResult?: unknown }, scoredHoles: number): boolean {
  const mr = match.manualResult as ManualResultLike | undefined;
  return !!mr && typeof mr === "object" && scoredHoles === 0;
}

/**
 * The status/result a manual result stands in for. `marginHistory` is empty:
 * nothing hole-by-hole is known, and consumers already treat a missing history
 * as "no data" (the same as a match that closed before any hole was entered).
 */
export function buildManualStatusAndResult(mr: ManualResult): { status: MatchStatus; result: MatchResult } {
  const leader = mr.winner === "AS" ? null : mr.winner;
  const status: MatchStatus = {
    leader,
    margin: mr.margin,
    thru: mr.thru,
    dormie: false,
    closed: true,
    wasTeamADown3PlusBack9: false,
    wasTeamAUp3PlusBack9: false,
    marginHistory: [],
  };
  const result: MatchResult = {
    winner: mr.winner,
    holesWonA: mr.winner === "teamA" ? mr.margin : 0,
    holesWonB: mr.winner === "teamB" ? mr.margin : 0,
  };
  return { status, result };
}

/**
 * The write-skip signature for computeMatchOnWrite. It used to be the holes
 * JSON alone; a manual result must be part of it or setting/clearing one on a
 * match with unchanged holes would never recompute. Only the three scoring
 * fields of the manual result count — audit fields (setBy/setAt) don't.
 */
export function computeSig(match: { holes?: unknown; manualResult?: unknown }): string {
  const mr = match.manualResult as ManualResultLike | undefined;
  const manual =
    mr && typeof mr === "object"
      ? { w: mr.winner ?? null, m: mr.margin ?? null, t: mr.thru ?? null }
      : null;
  return JSON.stringify({ h: match.holes ?? {}, m: manual });
}
