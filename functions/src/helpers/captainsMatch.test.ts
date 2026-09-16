import { describe, expect, it } from "vitest";
import {
  highestRoundNumber,
  isCalendarDate,
  summarizeCaptainsSeason,
  validateCaptainsMatchRound,
  validateCaptainsMatchSettings,
} from "./captainsMatch";
import type { CaptainsMatchRound } from "../types.js";

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

  it("accepts a trimmed subtitle and caps its length", () => {
    expect(validateCaptainsMatchSettings({ subtitle: "  Year-long battle  " }, 0).settings).toEqual({
      subtitle: "Year-long battle",
    });
    expect(validateCaptainsMatchSettings({ subtitle: "" }, 0).ok).toBe(true);
    expect(validateCaptainsMatchSettings({ subtitle: "x".repeat(81) }, 0).ok).toBe(false);
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

// ============================================================================
// summarizeCaptainsSeason — the settlement math
// ============================================================================
//
// These cases deliberately mirror the client suite's "full handicaps (the real
// cards)" describe in rowdy-ui/src/utils/captainsMatchScoring.test.ts. The two
// packages keep separate copies of the season walk, so asserting the SAME
// expected values on the SAME cards is what catches drift between them.

const blank = () => Array<number | null>(18).fill(null);

function card(roundNumber: number, over: Partial<CaptainsMatchRound> = {}): CaptainsMatchRound {
  return {
    roundNumber,
    playedOn: null,
    courseId: null,
    courseName: null,
    tees: null,
    grossA: blank(),
    grossB: blank(),
    strokesA: zeros(),
    strokesB: zeros(),
    ...over,
  };
}

/** Build a doc from cards, keyed the way the callable writes them. */
function season(totalRounds: number, ...cards: CaptainsMatchRound[]) {
  const rounds: Record<string, CaptainsMatchRound> = {};
  cards.forEach((c) => (rounds[String(c.roundNumber)] = c));
  return summarizeCaptainsSeason({ totalRounds, rounds });
}

// Seven Hills (Blue), 2026-09-07 — Jared off 6, Adam off 10 (full handicaps).
const round1 = card(1, {
  playedOn: "2026-09-07",
  courseName: "Seven Hills Golf Club",
  grossA: [4, 3, 6, 4, 3, 5, 4, 4, 4, 5, 6, 4, 5, 5, 5, 4, 5, 7],
  grossB: [5, 4, 6, 7, 4, 5, 4, 5, 6, 5, 6, 5, 4, 7, 6, 3, 5, 7],
  strokesA: [1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0],
  strokesB: [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0],
});

// Temecula Creek Creek/Stonehouse (Black), 2026-09-15 — Jared off 8, Adam off 13.
const round2 = card(2, {
  playedOn: "2026-09-15",
  courseName: "TCI Creek/Stonehouse",
  grossA: [4, 5, 5, 5, 4, 5, 4, 5, 4, 5, 5, 5, 3, 4, 6, 4, 3, 6],
  grossB: [5, 3, 5, 5, 5, 5, 2, 5, 5, 4, 4, 5, 5, 4, 5, 4, 5, 6],
  strokesA: [1, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1],
  strokesB: [1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1],
});

describe("summarizeCaptainsSeason — the real cards", () => {
  it("tallies round 1 as Jared 8–4 and leaves him 4 UP", () => {
    const s = season(20, round1);
    expect(s.roundTallies[1]).toEqual({ holesWonA: 8, holesWonB: 4, thru: 18 });
    expect(s.state).toMatchObject({ kind: "live", leader: "A", margin: 4 });
    expect([s.roundsWonA, s.roundsWonB]).toEqual([1, 0]);
  });

  it("carries into round 2: Adam wins it 10–5 and leads 1 UP with 324 to play", () => {
    const s = season(20, round1, round2);
    expect(s.roundTallies[2]).toEqual({ holesWonA: 5, holesWonB: 10, thru: 18 });
    expect(s.state).toMatchObject({ kind: "live", leader: "B", margin: 1, toPlay: 324 });
    expect([s.roundsWonA, s.roundsWonB]).toEqual([1, 1]);
  });

  it("reports the clinch round as totalRounds while it is still undecided", () => {
    expect(season(20, round1, round2).clinchRound).toBe(20);
  });
});

describe("summarizeCaptainsSeason — states and settlement inputs", () => {
  const sweep = (letter: "A" | "B") =>
    letter === "A"
      ? { grossA: Array<number>(18).fill(3), grossB: Array<number>(18).fill(5) }
      : { grossA: Array<number>(18).fill(5), grossB: Array<number>(18).fill(3) };

  it("is notStarted with no cards", () => {
    expect(season(20).state).toEqual({ kind: "notStarted" });
  });

  it("clinches once the lead exceeds the holes left, and records the round", () => {
    // A 1-round match: A wins the first 10 holes, which is 10 UP with 8 to play.
    const c = card(1, {
      grossA: [...Array<number>(10).fill(3), ...Array<number | null>(8).fill(null)] as (number | null)[],
      grossB: [...Array<number>(10).fill(5), ...Array<number | null>(8).fill(null)] as (number | null)[],
    });
    const s = season(1, c);
    expect(s.state).toMatchObject({ kind: "won", winner: "A", roundNumber: 1, hole: 10 });
    expect(s.clinchRound).toBe(1);
  });

  it("halves a season where every hole is played all square", () => {
    const c = card(1, { grossA: Array<number>(18).fill(4), grossB: Array<number>(18).fill(4) });
    const s = season(1, c);
    expect(s.state).toEqual({ kind: "halved" });
    // Going the distance settles the clinch line at totalRounds.
    expect(s.clinchRound).toBe(1);
    expect([s.roundsWonA, s.roundsWonB]).toEqual([0, 0]);
  });

  it("counts post-clinch holes on their own card but never moves the match", () => {
    // 36 holes total. A sweeps round 1 (18 UP with 18 to play — dormie, not yet
    // won), then takes hole 1 of round 2: 19 UP with 17 left, so it is decided
    // there. B takes the remaining 17 holes, which count on the card only.
    const r2: CaptainsMatchRound = card(2, {
      grossA: [3, ...Array<number>(17).fill(5)],
      grossB: [5, ...Array<number>(17).fill(3)],
    });
    const s = season(2, card(1, sweep("A")), r2);
    expect(s.state).toMatchObject({ kind: "won", winner: "A", roundNumber: 2, hole: 1 });
    expect(s.roundTallies[2]).toEqual({ holesWonA: 1, holesWonB: 17, thru: 18 });
    // B still won round 2 outright, even though it came after the clinch.
    expect([s.roundsWonA, s.roundsWonB]).toEqual([1, 1]);
  });

  it("does not count a halved round for either captain", () => {
    const s = season(20, card(1, { grossA: Array<number>(18).fill(4), grossB: Array<number>(18).fill(4) }));
    expect([s.roundsWonA, s.roundsWonB]).toEqual([0, 0]);
    expect(s.roundTallies[1]).toEqual({ holesWonA: 0, holesWonB: 0, thru: 18 });
  });

  it("keeps un-entered rounds as holes remaining so a gap can't close it early", () => {
    // 18 UP after one round of a 20-round match is nowhere near decisive.
    const s = season(20, card(1, sweep("A")));
    expect(s.state).toMatchObject({ kind: "live", margin: 18, toPlay: 342 });
  });
});

describe("validateCaptainsMatchSettings — bettingOpen", () => {
  it("accepts a boolean", () => {
    expect(validateCaptainsMatchSettings({ bettingOpen: true }, 0)).toMatchObject({
      ok: true,
      settings: { bettingOpen: true },
    });
  });

  it("rejects a non-boolean", () => {
    const res = validateCaptainsMatchSettings({ bettingOpen: "yes" }, 0);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/bettingOpen/);
  });
});
