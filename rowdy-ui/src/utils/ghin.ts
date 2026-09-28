import type { CourseDoc, HoleInfo } from "../types";

/**
 * Calculate GHIN course handicap from handicap index (unrounded).
 * Formula: (Handicap Index × (Slope Rating ÷ 113)) + (Course Rating − Par)
 */
export function calculateCourseHandicap(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number
): number {
  return (handicapIndex * (slopeRating / 113)) + (courseRating - par);
}

/**
 * Rounded course handicap for these tees — the number setupMatchCard stores
 * (functions/src/ghin.ts). Null when the course is missing its rating, slope
 * or par, which the server refuses rather than guessing.
 */
export function courseHandicapForTees(
  handicapIndex: number,
  course: Pick<CourseDoc, "rating" | "slope" | "par">
): number | null {
  const { rating, slope, par } = course;
  if (typeof rating !== "number" || typeof slope !== "number" || typeof par !== "number") return null;
  return Math.round(calculateCourseHandicap(handicapIndex, slope, rating, par));
}

/** Same bounds as setupMatchCard (a plus handicap is negative). */
const MIN_HANDICAP_INDEX = -10;
const MAX_HANDICAP_INDEX = 54;

/**
 * A typed Handicap Index, rounded to one decimal, or null when blank, not a
 * number or out of range. Accepts GHIN's "+2.1" for a plus handicap (→ -2.1).
 */
export function parseHandicapIndex(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const magnitude = Number(t.replace(/^[+-]/, ""));
  const value = t.startsWith("+") || t.startsWith("-") ? -magnitude : magnitude;
  if (value < MIN_HANDICAP_INDEX || value > MAX_HANDICAP_INDEX) return null;
  return Math.round(value * 10) / 10;
}

/** An index the way GHIN shows it: "7.4", or "+2.1" for a plus handicap. */
export function formatHandicapIndex(handicapIndex: number): string {
  return handicapIndex < 0 ? `+${(-handicapIndex).toFixed(1)}` : handicapIndex.toFixed(1);
}

/**
 * Calculate which holes receive strokes for skins based on handicap index and percentage.
 * Uses GHIN formula: unrounded courseHandicap × percentage, THEN round.
 * Returns an 18-element array of 0 or 1.
 */
export function calculateSkinsStrokes(
  handicapIndex: number,
  handicapPercent: number,
  slopeRating: number,
  courseRating: number,
  par: number,
  courseHoles: HoleInfo[]
): number[] {
  const courseHandicap = calculateCourseHandicap(
    handicapIndex,
    slopeRating,
    courseRating,
    par
  );

  const adjustedHandicap = courseHandicap * (handicapPercent / 100);
  const numStrokesHoles = Math.round(adjustedHandicap);

  const sortedHoles = [...courseHoles]
    .sort((a, b) => a.hcpIndex - b.hcpIndex)
    .slice(0, Math.max(0, numStrokesHoles));

  const strokes = new Array(18).fill(0);
  sortedHoles.forEach(hole => {
    strokes[hole.number - 1] = 1;
  });

  return strokes;
}

/**
 * Handicap strokes on one hole from a player's FULL Course Handicap, the way
 * the WHS allocates them for score posting — independent of the match's
 * spun-down `strokesReceived`, which must never feed into this. One stroke per
 * hole in stroke-index order, wrapping past 18 (a 24 gets two on SI 1–6 and
 * one elsewhere). A plus handicap gives strokes back from the easiest hole
 * (SI 18) upward, so the result is negative there.
 */
export function handicapStrokesOnHole(courseHandicap: number, strokeIndex: number): number {
  const ch = Math.round(courseHandicap);
  if (ch >= 0) return Math.floor(ch / 18) + (strokeIndex <= ch % 18 ? 1 : 0);
  const plus = -ch;
  const givenBack = Math.floor(plus / 18) + (strokeIndex > 18 - (plus % 18) ? 1 : 0);
  return givenBack === 0 ? 0 : -givenBack;
}

/**
 * Maximum hole score for posting (WHS Rule 3.1): par + 2 + strokes received
 * (minus any a plus player gives back), with par + 5 once a Course Handicap
 * above 54 gets 4+ strokes on the hole.
 */
export function netDoubleBogey(par: number, strokeIndex: number, courseHandicap: number): number {
  const strokes = handicapStrokesOnHole(courseHandicap, strokeIndex);
  return strokes >= 4 ? par + 5 : par + 2 + strokes;
}

export type GhinHole = {
  gross: number;
  /** min(gross, max) — what the hole counts for when posting. */
  adjusted: number;
  /** Net double bogey on this hole. */
  max: number;
  capped: boolean;
};

export type GhinAdjustedCard = {
  /** One entry per hole; null where the player has no score yet. */
  holes: (GhinHole | null)[];
  /**
   * Strokes on each hole from the full Course Handicap, scored or not
   * (negative where a plus handicap gives one back; null with no stroke index).
   */
  strokes: (number | null)[];
  out: number | null;
  in: number | null;
  /** Running adjusted total over the holes scored so far (mirrors TOT). */
  total: number | null;
  /** The Adjusted Gross Score to post — only once all 18 holes are scored. */
  postable: number | null;
  /** Strokes taken off the gross total by the caps. */
  strokesRemoved: number;
};

const isStrokeIndex = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 18;

/**
 * A player's card with every hole capped at net double bogey, for posting to
 * GHIN. Null when there's no Course Handicap yet or a scored hole has no
 * stroke index to allocate against.
 */
export function ghinAdjustedCard(
  holes: ReadonlyArray<{ par: number; hcpIndex?: number }>,
  gross: ReadonlyArray<number | null | undefined>,
  courseHandicap: number | null | undefined
): GhinAdjustedCard | null {
  if (typeof courseHandicap !== "number" || !Number.isFinite(courseHandicap)) return null;

  const adjusted: (GhinHole | null)[] = [];
  for (let i = 0; i < holes.length; i++) {
    const g = gross[i];
    if (typeof g !== "number") {
      adjusted.push(null);
      continue;
    }
    const { par, hcpIndex } = holes[i];
    if (!isStrokeIndex(hcpIndex)) return null;
    const max = netDoubleBogey(par, hcpIndex, courseHandicap);
    adjusted.push({ gross: g, adjusted: Math.min(g, max), max, capped: g > max });
  }

  const sum = (from: number, to: number) => {
    const scored = adjusted.slice(from, to).filter((h): h is GhinHole => h !== null);
    return scored.length ? scored.reduce((s, h) => s + h.adjusted, 0) : null;
  };
  const total = sum(0, adjusted.length);
  const complete = adjusted.length === 18 && adjusted.every((h) => h !== null);

  return {
    holes: adjusted,
    strokes: holes.map(({ hcpIndex }) =>
      isStrokeIndex(hcpIndex) ? handicapStrokesOnHole(courseHandicap, hcpIndex) : null
    ),
    out: sum(0, 9),
    in: sum(9, 18),
    total,
    postable: complete ? total : null,
    strokesRemoved: adjusted.reduce((s, h) => s + (h ? h.gross - h.adjusted : 0), 0),
  };
}
