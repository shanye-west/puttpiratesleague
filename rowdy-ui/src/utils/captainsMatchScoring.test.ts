import { describe, it, expect } from "vitest";
import {
  allocateStrokes,
  decideCaptainsHole,
  formatCaptainsMatchStatus,
  formatClinchChip,
  formatMarginChip,
  formatPlayedOn,
  formatRoundRanges,
  missingRoundNumbers,
  roundFlowHistory,
  summarizeCaptainsMatch,
} from "./captainsMatchScoring";
import type { CaptainsMatchRound, HoleInfo } from "../types";

const zeros = () => Array<number>(18).fill(0);
const H = (n: number) => "H".repeat(n);

/**
 * A card from an 18-character spec, one character per hole:
 * A = A wins (3 v 4), B = B wins (4 v 3), H = halved (4 v 4), . = not played.
 */
function card(roundNumber: number, spec: string, extra: Partial<CaptainsMatchRound> = {}): CaptainsMatchRound {
  if (spec.length !== 18) throw new Error(`spec must cover 18 holes, got ${spec.length}`);
  const holes = [...spec];
  return {
    roundNumber,
    playedOn: null,
    courseId: null,
    courseName: null,
    tees: null,
    grossA: holes.map((c) => (c === "A" ? 3 : c === "." ? null : 4)),
    grossB: holes.map((c) => (c === "B" ? 3 : c === "." ? null : 4)),
    strokesA: zeros(),
    strokesB: zeros(),
    ...extra,
  };
}

function season(totalRounds: number, ...cards: CaptainsMatchRound[]) {
  return summarizeCaptainsMatch({
    totalRounds,
    rounds: Object.fromEntries(cards.map((c) => [String(c.roundNumber), c])),
  });
}

describe("decideCaptainsHole", () => {
  const oneHole = (grossA: number | null, grossB: number | null, strokeA = 0, strokeB = 0) => {
    const c = card(1, H(18));
    c.grossA[0] = grossA;
    c.grossB[0] = grossB;
    c.strokesA[0] = strokeA;
    c.strokesB[0] = strokeB;
    return decideCaptainsHole(c, 0);
  };

  it("gives the hole to the lower score", () => {
    expect(oneHole(4, 5)).toBe("A");
    expect(oneHole(5, 4)).toBe("B");
    expect(oneHole(4, 4)).toBe("halved");
  });

  it("plays net: a stroke can halve or win a hole", () => {
    expect(oneHole(5, 4, 1, 0)).toBe("halved");
    expect(oneHole(5, 5, 1, 0)).toBe("A");
    // Both stroked on the same hole cancels out.
    expect(oneHole(5, 4, 1, 1)).toBe("B");
  });

  it("treats a missing or implausible score as not played", () => {
    expect(oneHole(null, 4)).toBeNull();
    expect(oneHole(0, 4)).toBeNull();
    expect(oneHole(31, 4)).toBeNull();
    expect(oneHole(4.5, 4)).toBeNull();
  });
});

describe("summarizeCaptainsMatch", () => {
  it("carries the margin from one round into the next", () => {
    const s = season(20, card(1, "AAH" + H(15)), card(2, "B" + H(17)));
    const [r1, r2] = s.rounds;
    expect([r1.startMargin, r1.endMargin, r1.delta]).toEqual([0, 2, 2]);
    expect(r2.startMargin).toBe(2);
    expect(r2.marginAfterHole[0]).toBe(1);
    expect([r2.endMargin, r2.delta]).toEqual([1, -1]);
    expect(s.margin).toBe(1);
    expect(s.state).toEqual({ kind: "live", leader: "A", margin: 1, toPlay: 360 - 36, dormie: false });
  });

  it("tallies each round's holes", () => {
    const [r] = season(20, card(1, "AABH" + H(14))).rounds;
    expect([r.holesWonA, r.holesWonB, r.halved, r.thru, r.complete]).toEqual([2, 1, 15, 18, true]);
  });

  it("skips a blank hole but still counts it as to play", () => {
    const s = season(20, card(1, "A.A" + H(15)));
    const [r] = s.rounds;
    expect(r.thru).toBe(17);
    expect(r.complete).toBe(false);
    expect(r.marginAfterHole.slice(0, 3)).toEqual([1, null, 2]);
    expect(s.holesPlayed).toBe(17);
    expect(s.holesRemaining).toBe(360 - 17);
  });

  it("applies rounds in round-number order, skipping gaps", () => {
    const rounds = { "3": card(3, "B" + H(17)), "1": card(1, "AA" + H(16)) };
    const s = summarizeCaptainsMatch({ totalRounds: 20, rounds });
    expect(s.rounds.map((r) => r.roundNumber)).toEqual([1, 3]);
    expect(s.rounds[1].startMargin).toBe(2);
    expect(s.roundsPlayed).toBe(2);
  });

  it("places each hole on the season axis by round and hole", () => {
    const s = season(20, card(1, "A" + H(17)), card(3, "B" + H(17)));
    expect(s.series[0]).toEqual({ x: 1, margin: 1, roundNumber: 1, hole: 1 });
    expect(s.series[18]).toEqual({ x: 37, margin: 0, roundNumber: 3, hole: 1 });
    expect(s.series).toHaveLength(36);
  });

  it("is not started until a hole has both scores", () => {
    expect(season(20).state).toEqual({ kind: "notStarted" });
    const blank = season(20, card(1, ".".repeat(18)));
    expect(blank.state).toEqual({ kind: "notStarted" });
    expect(blank.roundsPlayed).toBe(0);
  });

  it("flags dormie when the lead equals the holes left", () => {
    const s = season(1, card(1, "AAA" + H(12) + "..."));
    expect(s.state).toEqual({ kind: "live", leader: "A", margin: 3, toPlay: 3, dormie: true });
  });

  it("closes the match once the lead is bigger than the holes left", () => {
    const s = season(1, card(1, "AAAAA" + H(9) + "BBBB"));
    expect(s.state).toEqual({ kind: "won", winner: "A", margin: 5, toPlay: 4, roundNumber: 1, hole: 14 });
    const [r] = s.rounds;
    expect(r.clinchedAtHole).toBe(13);
    // Holes after the close still count on the day's card, but not in the match.
    expect(r.holesWonB).toBe(4);
    expect(r.marginAfterHole.slice(13)).toEqual([5, null, null, null, null]);
    expect(r.endMargin).toBe(5);
    expect(s.series).toHaveLength(14);
  });

  it("can close in a later round: 18 UP dormie, then wins 19 & 17", () => {
    expect(season(2, card(1, "A".repeat(18))).state).toMatchObject({
      kind: "live",
      margin: 18,
      toPlay: 18,
      dormie: true,
    });
    const s = season(2, card(1, "A".repeat(18)), card(2, "A" + H(17)));
    expect(s.state).toEqual({ kind: "won", winner: "A", margin: 19, toPlay: 17, roundNumber: 2, hole: 1 });
  });

  it("marks rounds played after the match was decided", () => {
    // Round 2 closes it at hole 10 (28 & 26); round 3 can't change anything.
    const s = season(3, card(1, "A".repeat(18)), card(2, "A".repeat(18)), card(3, "B".repeat(18)));
    expect(s.state).toEqual({ kind: "won", winner: "A", margin: 28, toPlay: 26, roundNumber: 2, hole: 10 });
    const r3 = s.rounds[2];
    expect(r3.postMatch).toBe(true);
    expect([r3.startMargin, r3.endMargin, r3.delta]).toEqual([28, 28, 0]);
    expect(r3.holesWonB).toBe(18);
  });

  it("never closes early over a round that hasn't been entered", () => {
    expect(season(2, card(2, "A".repeat(18))).state).toMatchObject({
      kind: "live",
      margin: 18,
      toPlay: 18,
      dormie: true,
    });
    const s = season(2, card(1, H(18)), card(2, "A".repeat(18)));
    expect(s.state).toEqual({ kind: "won", winner: "A", margin: 10, toPlay: 8, roundNumber: 2, hole: 10 });
  });

  it("wins 1 UP when it's decided on the last hole", () => {
    expect(season(1, card(1, "A" + H(17))).state).toEqual({
      kind: "won",
      winner: "A",
      margin: 1,
      toPlay: 0,
      roundNumber: 1,
      hole: 18,
    });
  });

  it("is halved when every hole is played and it's all square", () => {
    expect(season(1, card(1, H(18))).state).toEqual({ kind: "halved" });
    expect(season(2, card(1, H(18))).state).toEqual({
      kind: "live",
      leader: null,
      margin: 0,
      toPlay: 18,
      dormie: false,
    });
  });

  it("ignores bad round keys and tolerates short arrays", () => {
    const short: CaptainsMatchRound = { ...card(5, H(18)), grossA: [3], grossB: [4] };
    const s = summarizeCaptainsMatch({
      totalRounds: 20,
      rounds: {
        "0": card(0, "A".repeat(18)),
        "21": card(21, "A".repeat(18)),
        x: card(1, "A".repeat(18)),
        "5": short,
      },
    });
    expect(s.rounds.map((r) => r.roundNumber)).toEqual([5]);
    expect(s.holesPlayed).toBe(1);
    expect(s.margin).toBe(1);
  });

  it("records each side's biggest lead where it was first reached", () => {
    const s = season(20, card(1, "AAAHBBBBB" + H(9)));
    expect(s.peakA).toEqual({ margin: 3, x: 3 });
    expect(s.peakB).toEqual({ margin: 2, x: 9 });
  });

  it("counts the strokes each side received", () => {
    const strokesB = zeros();
    strokesB[0] = 1;
    strokesB[5] = 1;
    const [r] = season(20, card(1, H(18), { strokesB })).rounds;
    expect([r.strokesGivenA, r.strokesGivenB]).toEqual([0, 2]);
  });
});

describe("roundFlowHistory", () => {
  it("starts from the round's opening margin and carries over blank holes", () => {
    const s = season(20, card(1, "AA" + H(16)), card(2, "A.B" + ".".repeat(15)));
    expect(roundFlowHistory(s.rounds[1])).toEqual([3, 3, 2]);
  });

  it("stops at the hole that decided the match", () => {
    const s = season(1, card(1, "AAAAA" + H(9) + "BBBB"));
    expect(roundFlowHistory(s.rounds[0])).toHaveLength(14);
  });
});

describe("missingRoundNumbers / formatRoundRanges", () => {
  it("lists rounds without a card as compact ranges", () => {
    const missing = missingRoundNumbers(season(20, card(1, H(18)), card(3, H(18))));
    expect(missing).toHaveLength(18);
    expect(formatRoundRanges(missing)).toBe("2, 4–20");
    expect(formatRoundRanges([7])).toBe("7");
    expect(formatRoundRanges([])).toBe("");
  });
});

describe("allocateStrokes", () => {
  // Hole n gets handicap index ((n - 1) * 7 % 18) + 1 — a permutation of 1-18.
  const course: HoleInfo[] = Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    hcpIndex: ((i * 7) % 18) + 1,
  }));

  it("puts strokes on the hardest holes", () => {
    const strokes = allocateStrokes(7, course) ?? [];
    expect(strokes.reduce((sum, s) => sum + s, 0)).toBe(7);
    course.forEach((h, i) => expect(strokes[i]).toBe(h.hcpIndex <= 7 ? 1 : 0));
  });

  it("clamps the count to 0-18", () => {
    expect(allocateStrokes(0, course)).toEqual(zeros());
    expect(allocateStrokes(25, course)).toEqual(Array(18).fill(1));
  });

  it("returns null when the course can't place strokes", () => {
    expect(allocateStrokes(5, undefined)).toBeNull();
    expect(allocateStrokes(5, course.map((h) => ({ ...h, hcpIndex: 0 })))).toBeNull();
    expect(allocateStrokes(5, course.map((h) => ({ ...h, hcpIndex: 1 })))).toBeNull();
  });
});

describe("formatters", () => {
  const fmt = (state: Parameters<typeof formatCaptainsMatchStatus>[0]) =>
    formatCaptainsMatchStatus(state, "Jared", "Adam");

  it("describes the match state", () => {
    expect(fmt({ kind: "notStarted" })).toBe("Not started");
    expect(fmt({ kind: "live", leader: null, margin: 0, toPlay: 300, dormie: false })).toBe("All Square");
    expect(fmt({ kind: "live", leader: "B", margin: 4, toPlay: 300, dormie: false })).toBe("Adam 4 UP");
    expect(fmt({ kind: "live", leader: "A", margin: 3, toPlay: 3, dormie: true })).toBe("Jared 3 UP · Dormie");
    expect(fmt({ kind: "won", winner: "A", margin: 5, toPlay: 4, roundNumber: 20, hole: 14 })).toBe(
      "Jared wins 5 & 4"
    );
    expect(fmt({ kind: "won", winner: "B", margin: 1, toPlay: 0, roundNumber: 20, hole: 18 })).toBe(
      "Adam wins 1 UP"
    );
    expect(fmt({ kind: "halved" })).toBe("Match halved");
  });

  it("formats chips and dates", () => {
    expect(formatMarginChip(0)).toBe("AS");
    expect(formatMarginChip(-4)).toBe("4UP");
    expect(formatClinchChip(5, 4)).toBe("5&4");
    expect(formatClinchChip(1, 0)).toBe("1UP");
    expect(formatPlayedOn("2026-10-03")).toBe("Oct 3, 2026");
    expect(formatPlayedOn(null)).toBe("");
    expect(formatPlayedOn("2026-13-01")).toBe("");
  });
});
