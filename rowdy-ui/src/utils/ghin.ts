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
