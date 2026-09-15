/**
 * Pure validation for the captains' match callables (captainsMatchOps.ts). No
 * firebase imports, so it's unit-tested directly — the same split as
 * adminValidation.ts.
 *
 * The captains' match is the pre-draft running singles match between the two
 * captains. An admin enters each round's card whole once the round is played,
 * so a card is validated as a unit: 18 gross scores and 18 stroke flags a side.
 */

import { isValidGross } from "../scoring/matchScoring.js";

export const HOLES_PER_ROUND = 18;
export const DEFAULT_TOTAL_ROUNDS = 20;
export const MAX_TOTAL_ROUNDS = 50;
const MAX_NAME_LENGTH = 60;
const MAX_STAKES_LENGTH = 140;
const MAX_COURSE_NAME_LENGTH = 60;

export interface CaptainsMatchSettingsInput {
  name?: string;
  stakes?: string;
  playerAId?: string;
  playerBId?: string;
  totalRounds?: number;
}

export interface CaptainsMatchSettingsResult {
  ok: boolean;
  errors: string[];
  settings?: CaptainsMatchSettingsInput;
}

/** A validated card, before the callable fills in `tees` from the course. */
export interface CaptainsMatchRoundInput {
  roundNumber: number;
  playedOn: string | null;
  courseId: string | null;
  courseName: string | null;
  grossA: (number | null)[];
  grossB: (number | null)[];
  strokesA: number[];
  strokesB: number[];
}

export interface CaptainsMatchRoundResult {
  ok: boolean;
  errors: string[];
  round?: CaptainsMatchRoundInput;
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** True for a real calendar date written as YYYY-MM-DD (so 2027-02-30 fails). */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Largest round number with a card (0 when none) — the keys of `rounds`. */
export function highestRoundNumber(rounds: unknown): number {
  if (typeof rounds !== "object" || rounds === null) return 0;
  return Object.keys(rounds).reduce((max, key) => {
    const n = Number(key);
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
}

/**
 * Validate the settings in a create/update payload. Only the keys present are
 * checked and returned — an update sends just what changed — and an unknown
 * key is an error rather than something silently written.
 *
 * @param highestRound the largest round number that already has a card; the
 *   schedule can't shrink below it
 */
export function validateCaptainsMatchSettings(
  data: unknown,
  highestRound: number
): CaptainsMatchSettingsResult {
  if (typeof data !== "object" || data === null) {
    return { ok: false, errors: ["settings must be an object"] };
  }
  const errors: string[] = [];
  const settings: CaptainsMatchSettingsInput = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (key === "name") {
      const name = typeof value === "string" ? value.trim() : "";
      if (!name || name.length > MAX_NAME_LENGTH) errors.push(`name must be 1-${MAX_NAME_LENGTH} characters`);
      else settings.name = name;
    } else if (key === "stakes") {
      if (typeof value !== "string" || value.trim().length > MAX_STAKES_LENGTH) {
        errors.push(`stakes must be text of at most ${MAX_STAKES_LENGTH} characters`);
      } else {
        settings.stakes = value.trim();
      }
    } else if (key === "playerAId" || key === "playerBId") {
      const id = typeof value === "string" ? value.trim() : "";
      if (!id) errors.push(`${key} is required`);
      else settings[key] = id;
    } else if (key === "totalRounds") {
      if (!isInt(value) || value < 1 || value > MAX_TOTAL_ROUNDS) {
        errors.push(`totalRounds must be an integer 1-${MAX_TOTAL_ROUNDS}`);
      } else if (value < highestRound) {
        errors.push(`totalRounds can't be less than ${highestRound} — round ${highestRound} already has a card`);
      } else {
        settings.totalRounds = value;
      }
    } else {
      errors.push(`${key} is not an editable captains' match field`);
    }
  }

  if (settings.playerAId && settings.playerAId === settings.playerBId) {
    errors.push("playerAId and playerBId must be different players");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, errors: [], settings };
}

function validateGross(value: unknown, label: string, errors: string[]): (number | null)[] {
  if (!Array.isArray(value) || value.length !== HOLES_PER_ROUND) {
    errors.push(`${label} must be an array of ${HOLES_PER_ROUND} scores`);
    return [];
  }
  return value.map((gross, i) => {
    if (gross === null) return null;
    if (!isValidGross(gross)) {
      errors.push(`${label} hole ${i + 1} must be a whole-number score or blank`);
      return null;
    }
    return gross;
  });
}

function validateStrokes(value: unknown, label: string, errors: string[]): number[] {
  if (!Array.isArray(value) || value.length !== HOLES_PER_ROUND) {
    errors.push(`${label} must be an array of ${HOLES_PER_ROUND} stroke flags`);
    return [];
  }
  return value.map((stroke, i) => {
    if (stroke !== 0 && stroke !== 1) {
      errors.push(`${label} hole ${i + 1} must be 0 or 1`);
      return 0;
    }
    return stroke;
  });
}

/**
 * Validate one round's card. Scores may be blank (null) so a card can be saved
 * part-entered, but anything present must be a plausible gross score, and a
 * stroke is 0 or 1 per hole (one stroke max, like strokesReceived).
 */
export function validateCaptainsMatchRound(data: unknown, totalRounds: number): CaptainsMatchRoundResult {
  if (typeof data !== "object" || data === null) {
    return { ok: false, errors: ["round must be an object"] };
  }
  const d = data as Record<string, unknown>;
  const errors: string[] = [];

  if (!isInt(d.roundNumber) || d.roundNumber < 1 || d.roundNumber > totalRounds) {
    errors.push(`roundNumber must be an integer 1-${totalRounds}`);
  }

  let playedOn: string | null = null;
  if (d.playedOn !== null && d.playedOn !== undefined && d.playedOn !== "") {
    if (typeof d.playedOn === "string" && isCalendarDate(d.playedOn)) playedOn = d.playedOn;
    else errors.push("playedOn must be a YYYY-MM-DD date");
  }

  let courseId: string | null = null;
  if (d.courseId !== null && d.courseId !== undefined && d.courseId !== "") {
    if (typeof d.courseId === "string" && d.courseId.trim()) courseId = d.courseId.trim();
    else errors.push("courseId must be a course id or null");
  }

  let courseName: string | null = null;
  if (d.courseName !== null && d.courseName !== undefined) {
    if (typeof d.courseName === "string" && d.courseName.trim().length <= MAX_COURSE_NAME_LENGTH) {
      courseName = d.courseName.trim() || null;
    } else {
      errors.push(`courseName must be at most ${MAX_COURSE_NAME_LENGTH} characters`);
    }
  }

  const grossA = validateGross(d.grossA, "grossA", errors);
  const grossB = validateGross(d.grossB, "grossB", errors);
  const strokesA = validateStrokes(d.strokesA, "strokesA", errors);
  const strokesB = validateStrokes(d.strokesB, "strokesB", errors);

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    round: {
      roundNumber: d.roundNumber as number,
      playedOn,
      courseId,
      courseName,
      grossA,
      grossB,
      strokesA,
      strokesB,
    },
  };
}
