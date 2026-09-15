import { describe, expect, it } from "vitest";
import {
  highestRoundNumber,
  isCalendarDate,
  validateCaptainsMatchRound,
  validateCaptainsMatchSettings,
} from "./captainsMatch";

const zeros = () => Array<number>(18).fill(0);

/** A valid card: A shoots 4s, B shoots 5s and gets strokes on the first 3 holes. */
function validCard(overrides: Record<string, unknown> = {}) {
  return {
    roundNumber: 3,
    playedOn: "2026-10-03",
    courseId: null,
    courseName: "  Hawks Landing  ",
    grossA: Array<number>(18).fill(4),
    grossB: Array<number>(18).fill(5),
    strokesA: zeros(),
    strokesB: [1, 1, 1, ...Array<number>(15).fill(0)],
    ...overrides,
  };
}

describe("validateCaptainsMatchRound", () => {
  it("accepts a valid card and trims the course name", () => {
    const result = validateCaptainsMatchRound(validCard(), 20);
    expect(result.ok).toBe(true);
    expect(result.round?.roundNumber).toBe(3);
    expect(result.round?.courseName).toBe("Hawks Landing");
    expect(result.round?.strokesB.slice(0, 4)).toEqual([1, 1, 1, 0]);
  });

  it("allows blank scores so a card can be saved part-entered", () => {
    const grossA: (number | null)[] = Array<number>(18).fill(4);
    grossA[6] = null;
    const result = validateCaptainsMatchRound(validCard({ grossA }), 20);
    expect(result.ok).toBe(true);
    expect(result.round?.grossA[6]).toBeNull();
  });

  it("rejects arrays that aren't 18 long", () => {
    expect(validateCaptainsMatchRound(validCard({ grossA: [4, 4, 4] }), 20).ok).toBe(false);
    expect(validateCaptainsMatchRound(validCard({ strokesB: zeros().slice(1) }), 20).ok).toBe(false);
    expect(validateCaptainsMatchRound(validCard({ grossB: undefined }), 20).ok).toBe(false);
  });

  it.each([0, 31, 4.5, "4"])("rejects the gross score %s", (bad) => {
    const grossB: unknown[] = Array<number>(18).fill(5);
    grossB[9] = bad;
    const result = validateCaptainsMatchRound(validCard({ grossB }), 20);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("hole 10");
  });

  it("rejects stroke flags other than 0 or 1", () => {
    const strokesA = zeros();
    strokesA[0] = 2;
    expect(validateCaptainsMatchRound(validCard({ strokesA }), 20).ok).toBe(false);
  });

  it.each([0, 21, 1.5, "3"])("rejects round number %s", (roundNumber) => {
    expect(validateCaptainsMatchRound(validCard({ roundNumber }), 20).ok).toBe(false);
  });

  it("rejects dates that aren't real YYYY-MM-DD days, and allows none", () => {
    expect(validateCaptainsMatchRound(validCard({ playedOn: "2027-02-30" }), 20).ok).toBe(false);
    expect(validateCaptainsMatchRound(validCard({ playedOn: "10/3/2026" }), 20).ok).toBe(false);
    expect(validateCaptainsMatchRound(validCard({ playedOn: null }), 20).round?.playedOn).toBeNull();
  });

  it("stores a blank course name as null", () => {
    expect(validateCaptainsMatchRound(validCard({ courseName: "   " }), 20).round?.courseName).toBeNull();
  });

  it("rejects non-object payloads", () => {
    expect(validateCaptainsMatchRound(null, 20).ok).toBe(false);
    expect(validateCaptainsMatchRound("round", 20).ok).toBe(false);
  });
});

describe("validateCaptainsMatchSettings", () => {
  it("returns only the fields that were sent, trimmed", () => {
    expect(validateCaptainsMatchSettings({ name: " Captains' Match ", totalRounds: 20 }, 0)).toEqual({
      ok: true,
      errors: [],
      settings: { name: "Captains' Match", totalRounds: 20 },
    });
  });

  it("won't shrink the schedule below a round that has a card", () => {
    expect(validateCaptainsMatchSettings({ totalRounds: 4 }, 5).ok).toBe(false);
    expect(validateCaptainsMatchSettings({ totalRounds: 5 }, 5).ok).toBe(true);
  });

  it("rejects out-of-range round counts", () => {
    expect(validateCaptainsMatchSettings({ totalRounds: 0 }, 0).ok).toBe(false);
    expect(validateCaptainsMatchSettings({ totalRounds: 51 }, 0).ok).toBe(false);
    expect(validateCaptainsMatchSettings({ totalRounds: 2.5 }, 0).ok).toBe(false);
  });

  it("requires two different, non-empty players", () => {
    expect(validateCaptainsMatchSettings({ playerAId: "pA", playerBId: "pA" }, 0).ok).toBe(false);
    expect(validateCaptainsMatchSettings({ playerAId: "  " }, 0).ok).toBe(false);
    expect(validateCaptainsMatchSettings({ playerAId: "pA", playerBId: "pB" }, 0).ok).toBe(true);
  });

  it("rejects unknown keys and an empty name", () => {
    expect(validateCaptainsMatchSettings({ rounds: {} }, 0).ok).toBe(false);
    expect(validateCaptainsMatchSettings({ name: "  " }, 0).ok).toBe(false);
  });
});

describe("isCalendarDate", () => {
  it("accepts real days only", () => {
    expect(isCalendarDate("2027-02-28")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2027-02-29")).toBe(false);
    expect(isCalendarDate("2027-2-8")).toBe(false);
  });
});

describe("highestRoundNumber", () => {
  it("reads the largest numeric key", () => {
    expect(highestRoundNumber({ "1": {}, "12": {}, "3": {} })).toBe(12);
    expect(highestRoundNumber({})).toBe(0);
    expect(highestRoundNumber(undefined)).toBe(0);
  });
});
