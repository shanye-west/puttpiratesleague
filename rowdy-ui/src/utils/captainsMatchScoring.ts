/**
 * Running-status math for the CAPTAINS' MATCH — the pre-draft, season-long
 * singles match between the two captains.
 *
 * It's match play where the margin carries from round to round: if A is 4 UP
 * after round 1, round 2 starts at A 4 UP. Every hole is decided exactly like a
 * Cup singles hole (net, one stroke max) by the shared decideHole, and all of
 * this is pure, so the season is computed client-side from the single match
 * doc — no Cloud Function, nothing that could ever touch Cup scoring.
 */

import { decideHole, type HoleResult } from "./matchScoring";
import type { CaptainsMatchDoc, CaptainsMatchRound, HoleInfo } from "../types";

export const HOLES_PER_ROUND = 18;

export type CaptainsSide = "A" | "B";

/** Who won a hole, "halved", or null when either score is missing. */
export type CaptainsHoleResult = CaptainsSide | "halved" | null;

export type CaptainsRoundSummary = {
  roundNumber: number;
  round: CaptainsMatchRound;
  holeResults: CaptainsHoleResult[];
  /**
   * Season margin after each hole (+ = A up). null where the hole wasn't
   * played, and on every hole after the match was decided.
   */
  marginAfterHole: (number | null)[];
  /** The card's own tally — every scored hole, including any after the match was decided. */
  holesWonA: number;
  holesWonB: number;
  halved: number;
  /** Holes with both scores entered. */
  thru: number;
  complete: boolean;
  /** Season margin before this round's first hole. */
  startMargin: number;
  /** Season margin after this round's last hole that counted. */
  endMargin: number;
  /** What this round did to the match: endMargin − startMargin. */
  delta: number;
  /** Played entirely after the match was already decided. */
  postMatch: boolean;
  /** 0-based hole where the match was decided, when that happened in this round. */
  clinchedAtHole: number | null;
  strokesGivenA: number;
  strokesGivenB: number;
};

export type CaptainsMatchState =
  | { kind: "notStarted" }
  | { kind: "live"; leader: CaptainsSide | null; margin: number; toPlay: number; dormie: boolean }
  | { kind: "won"; winner: CaptainsSide; margin: number; toPlay: number; roundNumber: number; hole: number }
  | { kind: "halved" };

type WonState = Extract<CaptainsMatchState, { kind: "won" }>;

export type CaptainsSeriesPoint = {
  /** Slot on the season axis: (roundNumber − 1) × 18 + hole. */
  x: number;
  margin: number;
  roundNumber: number;
  /** 1-based hole number. */
  hole: number;
};

export type CaptainsPeak = { margin: number; x: number };

export type CaptainsMatchSummary = {
  totalRounds: number;
  /** Entered cards, in round order. */
  rounds: CaptainsRoundSummary[];
  /** One point per hole that counted, in order — the season flow graph. */
  series: CaptainsSeriesPoint[];
  holesPlayed: number;
  holesRemaining: number;
  /** Rounds with at least one scored hole. */
  roundsPlayed: number;
  /** Signed season margin (+ = A up), frozen once the match is decided. */
  margin: number;
  state: CaptainsMatchState;
  /** Each side's biggest lead, where it was first reached. */
  peakA: CaptainsPeak | null;
  peakB: CaptainsPeak | null;
};

function toCaptainsResult(result: HoleResult): CaptainsHoleResult {
  if (result === "teamA") return "A";
  if (result === "teamB") return "B";
  return result === "AS" ? "halved" : null;
}

/**
 * Decide one hole of a card: lower net score wins (gross minus a 0/1 stroke),
 * via the same decideHole as Cup singles so score validation and strokes agree.
 */
export function decideCaptainsHole(round: CaptainsMatchRound, holeIndex: number): CaptainsHoleResult {
  const grossA = Array.isArray(round.grossA) ? round.grossA : [];
  const grossB = Array.isArray(round.grossB) ? round.grossB : [];
  const strokesA = Array.isArray(round.strokesA) ? round.strokesA : [];
  const strokesB = Array.isArray(round.strokesB) ? round.strokesB : [];
  return toCaptainsResult(
    decideHole(
      "singles",
      holeIndex,
      { teamAPlayerGross: grossA[holeIndex], teamBPlayerGross: grossB[holeIndex] },
      [{ playerId: "A", strokesReceived: strokesA }],
      [{ playerId: "B", strokesReceived: strokesB }]
    )
  );
}

function countStrokes(strokes: number[] | undefined): number {
  return Array.isArray(strokes) ? strokes.filter((s) => Number(s) === 1).length : 0;
}

/**
 * Play the whole season from the match doc.
 *
 * Cards apply in round-number order and the margin carries across them. Holes
 * remaining = every hole of every round minus the holes played, so a blank hole
 * or a round nobody has entered still counts as "to play" and the match can
 * never be closed early by a gap. The first moment the lead is bigger than the
 * holes remaining decides it; anything entered after that still shows on its
 * card but no longer moves the match (the Match page's post-match holes).
 */
export function summarizeCaptainsMatch(
  match: Pick<CaptainsMatchDoc, "totalRounds" | "rounds">
): CaptainsMatchSummary {
  const totalRounds = Number.isInteger(match.totalRounds) && match.totalRounds > 0 ? match.totalRounds : 1;
  const totalHoles = totalRounds * HOLES_PER_ROUND;

  // The key places a card — it's what the callable writes and the URL uses.
  const cards = Object.entries(match.rounds ?? {})
    .map(([key, round]) => ({ roundNumber: Number(key), round }))
    .filter(
      ({ roundNumber, round }) =>
        Number.isInteger(roundNumber) &&
        roundNumber >= 1 &&
        roundNumber <= totalRounds &&
        typeof round === "object" &&
        round !== null
    )
    .sort((a, b) => a.roundNumber - b.roundNumber);

  let margin = 0;
  let holesPlayed = 0;
  let won: WonState | null = null;
  let peakA: CaptainsPeak | null = null;
  let peakB: CaptainsPeak | null = null;
  const series: CaptainsSeriesPoint[] = [];
  const rounds: CaptainsRoundSummary[] = [];

  for (const { roundNumber, round } of cards) {
    const startMargin = margin;
    const postMatch = won !== null;
    const holeResults: CaptainsHoleResult[] = [];
    const marginAfterHole: (number | null)[] = [];
    let holesWonA = 0;
    let holesWonB = 0;
    let halved = 0;
    let thru = 0;
    let clinchedAtHole: number | null = null;

    for (let i = 0; i < HOLES_PER_ROUND; i++) {
      const result = decideCaptainsHole(round, i);
      holeResults.push(result);
      if (result === null) {
        marginAfterHole.push(null);
        continue;
      }
      thru++;
      if (result === "A") holesWonA++;
      else if (result === "B") holesWonB++;
      else halved++;

      if (won !== null) {
        marginAfterHole.push(null);
        continue;
      }

      holesPlayed++;
      if (result === "A") margin++;
      else if (result === "B") margin--;
      marginAfterHole.push(margin);

      const x = (roundNumber - 1) * HOLES_PER_ROUND + i + 1;
      series.push({ x, margin, roundNumber, hole: i + 1 });
      if (margin > 0 && (peakA === null || margin > peakA.margin)) peakA = { margin, x };
      if (margin < 0 && (peakB === null || -margin > peakB.margin)) peakB = { margin: -margin, x };

      const toPlay = totalHoles - holesPlayed;
      if (Math.abs(margin) > toPlay) {
        won = { kind: "won", winner: margin > 0 ? "A" : "B", margin: Math.abs(margin), toPlay, roundNumber, hole: i + 1 };
        clinchedAtHole = i;
      }
    }

    rounds.push({
      roundNumber,
      round,
      holeResults,
      marginAfterHole,
      holesWonA,
      holesWonB,
      halved,
      thru,
      complete: thru === HOLES_PER_ROUND,
      startMargin,
      endMargin: margin,
      delta: margin - startMargin,
      postMatch,
      clinchedAtHole,
      strokesGivenA: countStrokes(round.strokesA),
      strokesGivenB: countStrokes(round.strokesB),
    });
  }

  let state: CaptainsMatchState;
  if (won !== null) {
    state = won;
  } else if (holesPlayed === 0) {
    state = { kind: "notStarted" };
  } else if (holesPlayed === totalHoles) {
    // Every hole played without a close means it finished all square.
    state = { kind: "halved" };
  } else {
    const lead = Math.abs(margin);
    const toPlay = totalHoles - holesPlayed;
    state = {
      kind: "live",
      leader: margin > 0 ? "A" : margin < 0 ? "B" : null,
      margin: lead,
      toPlay,
      dormie: lead > 0 && lead === toPlay,
    };
  }

  return {
    totalRounds,
    rounds,
    series,
    holesPlayed,
    holesRemaining: totalHoles - holesPlayed,
    roundsPlayed: rounds.filter((r) => r.thru > 0).length,
    margin,
    state,
    peakA,
    peakB,
  };
}

/**
 * A round's hole-by-hole season margins for the 18-hole flow graph: blank holes
 * carry the previous margin, and the line ends at the last hole that counted
 * (the one that decided the match, or simply the last one played).
 */
export function roundFlowHistory(round: CaptainsRoundSummary): number[] {
  let lastCounted = -1;
  round.marginAfterHole.forEach((m, i) => {
    if (m !== null) lastCounted = i;
  });
  const history: number[] = [];
  let current = round.startMargin;
  for (let i = 0; i <= lastCounted; i++) {
    const m = round.marginAfterHole[i];
    if (m !== null) current = m;
    history.push(current);
  }
  return history;
}

/** Round numbers with no card yet, in order. */
export function missingRoundNumbers(summary: CaptainsMatchSummary): number[] {
  const entered = new Set(summary.rounds.map((r) => r.roundNumber));
  return Array.from({ length: summary.totalRounds }, (_, i) => i + 1).filter((n) => !entered.has(n));
}

/** Compact ranges, e.g. [2, 4, 5, 6] → "2, 4–6". */
export function formatRoundRanges(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | undefined = sorted[0];
  let prev = sorted[0] ?? 0;
  for (let i = 1; i <= sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    if (start !== undefined) parts.push(start === prev ? String(start) : `${start}–${prev}`);
    start = n;
    prev = n;
  }
  return parts.join(", ");
}

/**
 * Place `count` handicap strokes on a course's hardest holes — a stroke on every
 * hole whose handicap index is ≤ count. Returns null when the course has no
 * usable index set (each of 1–18 exactly once), so the admin ticks holes by hand.
 */
export function allocateStrokes(count: number, holes: HoleInfo[] | undefined): number[] | null {
  if (!holes || holes.length !== HOLES_PER_ROUND) return null;
  const indexByHole = new Map<number, number>();
  for (const h of holes) {
    if (Number.isInteger(h.number) && h.number >= 1 && h.number <= HOLES_PER_ROUND) {
      indexByHole.set(h.number, h.hcpIndex);
    }
  }
  const indexes = new Set(indexByHole.values());
  const usable =
    indexByHole.size === HOLES_PER_ROUND &&
    indexes.size === HOLES_PER_ROUND &&
    [...indexes].every((n) => Number.isInteger(n) && n >= 1 && n <= HOLES_PER_ROUND);
  if (!usable) return null;

  const strokes = Number.isFinite(count) ? Math.max(0, Math.min(HOLES_PER_ROUND, Math.floor(count))) : 0;
  return Array.from({ length: HOLES_PER_ROUND }, (_, i) =>
    (indexByHole.get(i + 1) ?? Infinity) <= strokes ? 1 : 0
  );
}

/** "Jared 4 UP", "All Square", "Jared wins 5 & 4", … */
export function formatCaptainsMatchStatus(state: CaptainsMatchState, nameA: string, nameB: string): string {
  const name = (side: CaptainsSide) => (side === "A" ? nameA : nameB);
  switch (state.kind) {
    case "notStarted":
      return "Not started";
    case "halved":
      return "Match halved";
    case "won":
      return state.toPlay > 0
        ? `${name(state.winner)} wins ${state.margin} & ${state.toPlay}`
        : `${name(state.winner)} wins ${state.margin} UP`;
    case "live":
      if (state.leader === null) return "All Square";
      return `${name(state.leader)} ${state.margin} UP${state.dormie ? " · Dormie" : ""}`;
  }
}

/** Scorecard status chip: "AS" / "4UP". */
export function formatMarginChip(margin: number): string {
  return margin === 0 ? "AS" : `${Math.abs(margin)}UP`;
}

/** The chip on the hole that decided it: "5&4", or "1UP" on the very last hole. */
export function formatClinchChip(margin: number, toPlay: number): string {
  return toPlay > 0 ? `${margin}&${toPlay}` : `${margin}UP`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-10-03" → "Oct 3, 2026". Formatted from the string's own parts — no Date
 * object, so a wall-clock date can't shift a day in another timezone.
 */
export function formatPlayedOn(date: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  return `${month} ${Number(match[3])}, ${match[1]}`;
}
