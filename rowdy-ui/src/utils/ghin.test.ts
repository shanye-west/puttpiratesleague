import { describe, it, expect } from "vitest";
import {
  courseHandicapForTees,
  formatHandicapIndex,
  ghinAdjustedCard,
  handicapStrokesOnHole,
  netDoubleBogey,
  parseHandicapIndex,
} from "./ghin";

describe("parseHandicapIndex", () => {
  it("reads a plain index to one decimal", () => {
    expect(parseHandicapIndex("12.4")).toBe(12.4);
    expect(parseHandicapIndex(" 7 ")).toBe(7);
    expect(parseHandicapIndex(".5")).toBe(0.5);
    expect(parseHandicapIndex("9,8")).toBe(9.8);
    expect(parseHandicapIndex("12.46")).toBe(12.5);
  });

  it("reads GHIN's +x.x (and -x.x) as a plus handicap", () => {
    expect(parseHandicapIndex("+2.1")).toBe(-2.1);
    expect(parseHandicapIndex("-2.1")).toBe(-2.1);
  });

  it("rejects blanks, junk and out-of-range values", () => {
    expect(parseHandicapIndex("")).toBeNull();
    expect(parseHandicapIndex("abc")).toBeNull();
    expect(parseHandicapIndex("1.2.3")).toBeNull();
    expect(parseHandicapIndex("54.1")).toBeNull();
    expect(parseHandicapIndex("+10.1")).toBeNull();
  });
});

describe("formatHandicapIndex", () => {
  it("shows a plus handicap with a plus sign, like GHIN", () => {
    expect(formatHandicapIndex(7.4)).toBe("7.4");
    expect(formatHandicapIndex(10)).toBe("10.0");
    expect(formatHandicapIndex(-2.1)).toBe("+2.1");
  });

  it("round-trips through parseHandicapIndex", () => {
    for (const hi of [0, 7.4, 12.1, -2.1, 36]) expect(parseHandicapIndex(formatHandicapIndex(hi))).toBe(hi);
  });
});

describe("courseHandicapForTees", () => {
  const angelesBlue = { rating: 72.4, slope: 137, par: 72 };

  it("applies the WHS formula and rounds (same numbers as setupMatchCard)", () => {
    expect(courseHandicapForTees(7.4, angelesBlue)).toBe(9);   // 9.37
    expect(courseHandicapForTees(12.1, angelesBlue)).toBe(15); // 15.07
    expect(courseHandicapForTees(-2.1, angelesBlue)).toBe(-2); // -2.15
    expect(courseHandicapForTees(7.4, { rating: 70, slope: 122, par: 72 })).toBe(6); // 5.99
  });

  it("returns null when the tees are missing rating, slope or par", () => {
    expect(courseHandicapForTees(10, { slope: 130, par: 72 })).toBeNull();
    expect(courseHandicapForTees(10, { rating: 71, par: 72 })).toBeNull();
    expect(courseHandicapForTees(10, { rating: 71, slope: 130 })).toBeNull();
  });
});

const SI = Array.from({ length: 18 }, (_, i) => i + 1);
const strokesBySI = (ch: number) => SI.map((si) => handicapStrokesOnHole(ch, si));

describe("handicapStrokesOnHole", () => {
  it("gives one stroke on the CH hardest holes (a 10 strokes SI 1–10, not the match's spun-down 3)", () => {
    expect(strokesBySI(10)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(strokesBySI(0).every((s) => s === 0)).toBe(true);
    expect(strokesBySI(18).every((s) => s === 1)).toBe(true);
  });

  it("wraps past 18: a second stroke on the hardest holes", () => {
    // 24 = 18 + 6 → two strokes on SI 1–6, one on SI 7–18
    expect(strokesBySI(24)).toEqual([2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(strokesBySI(36).every((s) => s === 2)).toBe(true);
    // 40 = 36 + 4 → three strokes on SI 1–4, two on SI 5–18
    expect(handicapStrokesOnHole(40, 4)).toBe(3);
    expect(handicapStrokesOnHole(40, 5)).toBe(2);
  });

  it("has a plus handicap give strokes back from the easiest hole (SI 18) up", () => {
    // +4 gives back on SI 15–18
    expect(strokesBySI(-4)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1]);
    expect(strokesBySI(-2).filter((s) => s === -1)).toHaveLength(2);
    expect(handicapStrokesOnHole(-2, 17)).toBe(-1);
    expect(handicapStrokesOnHole(-2, 16)).toBe(0);
  });
});

describe("netDoubleBogey", () => {
  it("is par + 2 + strokes from the full Course Handicap", () => {
    expect(netDoubleBogey(4, 6, 11)).toBe(7); // USGA example: CH 11, par 4, SI 6
    expect(netDoubleBogey(4, 12, 11)).toBe(6);
    expect(netDoubleBogey(3, 18, 0)).toBe(5);
  });

  it("caps a 25 at quadruple bogey on the 7 hardest holes, triple bogey elsewhere", () => {
    const overPar = SI.map((si) => netDoubleBogey(4, si, 25) - 4);
    expect(overPar.filter((o) => o === 4)).toHaveLength(7);
    expect(overPar.filter((o) => o === 3)).toHaveLength(11);
  });

  it("is par + 1 where a plus handicap gives a stroke back", () => {
    expect(netDoubleBogey(4, 18, -1)).toBe(5);
    expect(netDoubleBogey(4, 17, -1)).toBe(6);
  });

  it("tops out at par + 5 when a Course Handicap over 54 gets 4+ strokes", () => {
    expect(handicapStrokesOnHole(60, 1)).toBe(4);
    expect(netDoubleBogey(4, 1, 60)).toBe(9);
    expect(netDoubleBogey(4, 7, 60)).toBe(9); // 3 strokes: par + 2 + 3
  });
});

describe("ghinAdjustedCard", () => {
  // Par 72, stroke index = hole number (hole 1 hardest)
  const holes = SI.map((si) => ({ par: si % 3 === 0 ? 3 : si % 3 === 1 ? 4 : 5, hcpIndex: si }));
  const bogeys = holes.map((h) => h.par + 1);

  it("leaves a card with no blow-ups alone", () => {
    const card = ghinAdjustedCard(holes, bogeys, 10)!;
    expect(card.total).toBe(90);
    expect(card.postable).toBe(90);
    expect(card.strokesRemoved).toBe(0);
    expect(card.holes.every((h) => h && !h.capped)).toBe(true);
  });

  it("lists strokes on every hole, scored or not", () => {
    const card = ghinAdjustedCard(holes, bogeys.map((g, i) => (i < 3 ? g : null)), 20)!;
    expect(card.strokes).toEqual([2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const noSI = holes.map((h, i) => (i === 17 ? { par: h.par } : h));
    expect(ghinAdjustedCard(noSI, [], 20)!.strokes[17]).toBeNull();
  });

  it("caps blow-ups at net double bogey and totals the adjusted scores", () => {
    const gross = [...bogeys];
    gross[0] = 9; // par 4, SI 1, CH 10 gets a stroke → max 7
    gross[14] = 8; // par 3, SI 15, no stroke → max 5
    gross[15] = 6; // par 4, SI 16, max 6 — not over
    const card = ghinAdjustedCard(holes, gross, 10)!;
    expect(card.holes[0]).toEqual({ gross: 9, adjusted: 7, max: 7, capped: true });
    expect(card.holes[14]).toEqual({ gross: 8, adjusted: 5, max: 5, capped: true });
    expect(card.holes[15]?.capped).toBe(false);
    expect(card.strokesRemoved).toBe(5);
    const grossTotal = gross.reduce((s, g) => s + g, 0);
    expect(card.postable).toBe(grossTotal - 5);
    expect(card.out! + card.in!).toBe(card.total);
  });

  it("uses the full Course Handicap — a 10 can post a 7 on SI 10 where the match gave no stroke", () => {
    const gross = [...bogeys];
    gross[9] = 7; // par 4, SI 10
    expect(ghinAdjustedCard(holes, gross, 10)!.holes[9]?.capped).toBe(false);
    expect(ghinAdjustedCard(holes, gross, 3)!.holes[9]).toMatchObject({ adjusted: 6, capped: true });
  });

  it("keeps a running total but only a postable score once all 18 are in", () => {
    const partial = bogeys.map((g, i) => (i < 12 ? g : null));
    const card = ghinAdjustedCard(holes, partial, 10)!;
    expect(card.out).toBe(bogeys.slice(0, 9).reduce((s, g) => s + g, 0));
    expect(card.total).toBe(bogeys.slice(0, 12).reduce((s, g) => s + g, 0));
    expect(card.postable).toBeNull();
    expect(card.holes[12]).toBeNull();
  });

  it("returns null without a Course Handicap or a stroke index on a scored hole", () => {
    expect(ghinAdjustedCard(holes, bogeys, null)).toBeNull();
    expect(ghinAdjustedCard(holes, bogeys, undefined)).toBeNull();
    const noSI = holes.map((h, i) => (i === 4 ? { par: h.par } : h));
    expect(ghinAdjustedCard(noSI, bogeys, 10)).toBeNull();
    // ...but an unscored hole without one is fine
    expect(ghinAdjustedCard(noSI, bogeys.map((g, i) => (i === 4 ? null : g)), 10)).not.toBeNull();
  });
});
