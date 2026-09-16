import { describe, expect, it } from "vitest";
import { captainNet, computeLeagueStandings, formatGridCell, monthBonus } from "./leagueStandings";
import type { LeagueTeam, MatchDoc, RoundDoc } from "../types";

const teams: LeagueTeam[] = [
  { id: "wir", name: "Wreck It Ralph", captainId: "mo", playerIds: ["mo", "buhl", "pete", "neal"] },
  { id: "rw", name: "Rhino Wranglers", captainId: "berg", playerIds: ["berg", "chase", "josh", "g"] },
  { id: "bcb", name: "Beer Cart Bandits", captainId: "guinny", playerIds: ["guinny", "nigel", "pork", "roberts"] },
  { id: "cq", name: "Crackers & Queso", captainId: "phil", playerIds: ["phil", "costello", "craig", "hertz"] },
];
const teamOf: Record<string, string> = {};
for (const t of teams) for (const p of t.playerIds) teamOf[p] = t.id;

const round = (id: string, day: number, extra: Partial<RoundDoc> = {}): RoundDoc =>
  ({ id, tournamentId: "t", day, format: "singles", pointsValue: 1, ...extra }) as RoundDoc;

function match(
  id: string,
  a: string,
  b: string,
  winner: "teamA" | "teamB" | "AS" | null,
  opts: { closed?: boolean; thru?: number; roundId?: string; holes?: MatchDoc["holes"]; strokesA?: number[]; strokesB?: number[]; manual?: boolean } = {}
): MatchDoc {
  const closed = opts.closed ?? winner !== null;
  return {
    id,
    roundId: opts.roundId ?? "r1",
    teamAPlayers: [{ playerId: a, strokesReceived: opts.strokesA ?? Array(18).fill(0) }],
    teamBPlayers: [{ playerId: b, strokesReceived: opts.strokesB ?? Array(18).fill(0) }],
    status: { leader: winner === "AS" || winner === null ? null : winner, margin: 0, thru: opts.thru ?? (closed ? 18 : 0), dormie: false, closed },
    result: winner ? { winner } : {},
    holes: opts.holes,
    ...(opts.manual ? { manualResult: { winner: winner ?? "AS" } } : {}),
  } as MatchDoc;
}

const fullCard = (grossA: number, grossB: number): MatchDoc["holes"] => {
  const holes: Record<string, { input: { teamAPlayerGross: number; teamBPlayerGross: number } }> = {};
  for (let h = 1; h <= 18; h++) holes[String(h)] = { input: { teamAPlayerGross: grossA, teamBPlayerGross: grossB } };
  return holes as unknown as MatchDoc["holes"];
};

describe("computeLeagueStandings — individual", () => {
  it("counts MP/W/L/T/points from closed matches and projects in-progress ones", () => {
    const rounds = [round("r1", 1)];
    const matchesByRound = {
      r1: [
        match("m1", "mo", "berg", "teamA"),
        match("m2", "buhl", "chase", "AS"),
        match("m3", "pete", "josh", "teamB", { closed: false, thru: 9 }), // in progress, B leading
        match("m4", "neal", "g", null, { closed: false, thru: 0 }), // not started
      ],
    };
    const { individual } = computeLeagueStandings({ rounds, matchesByRound, leagueTeams: teams });
    const row = (pid: string) => individual.find((r) => r.playerId === pid)!;
    expect(row("mo")).toMatchObject({ mp: 1, w: 1, l: 0, t: 0, points: 1, projectedPoints: 1, rank: 1, teamId: "wir" });
    expect(row("berg")).toMatchObject({ mp: 1, w: 0, l: 1, t: 0, points: 0 });
    expect(row("buhl")).toMatchObject({ mp: 1, t: 1, points: 0.5 });
    expect(row("chase")).toMatchObject({ mp: 1, t: 1, points: 0.5 });
    expect(row("josh")).toMatchObject({ mp: 0, points: 0, projectedPoints: 1 });
    expect(row("pete")).toMatchObject({ mp: 0, points: 0, projectedPoints: 0 });
    expect(row("neal")).toMatchObject({ mp: 0, points: 0, projectedPoints: 0 });
    // every rostered player is listed even before playing
    expect(individual).toHaveLength(16);
  });

  it("sorts by points, then wins, then name, and draws the playoff cut incl. ties for 4th", () => {
    const rounds = [round("r1", 1), round("r2", 2)];
    const matchesByRound = {
      r1: [
        match("a", "phil", "mo", "teamA"),
        match("b", "pete", "berg", "teamA"),
        match("c", "chase", "guinny", "teamA"),
        match("d", "buhl", "nigel", "AS"),
        match("e", "roberts", "hertz", "AS"),
      ],
      r2: [
        match("f", "phil", "berg", "teamA", { roundId: "r2" }),
        match("g", "pete", "mo", "AS", { roundId: "r2" }),
      ],
    };
    const { individual } = computeLeagueStandings({ rounds, matchesByRound, leagueTeams: teams, names: { buhl: "Travis Buhl", nigel: "Nigel Orozco", roberts: "Matt Roberts", hertz: "Chris Hertz" } });
    const top = individual.slice(0, 8).map((r) => [r.playerId, r.points, r.inPlayoffCut]);
    expect(top).toEqual([
      ["phil", 2, true],
      ["pete", 1.5, true],
      ["chase", 1, true],
      // four players tied on 0.5 for 4th → all in the cut, alphabetical by name
      ["hertz", 0.5, true],
      ["roberts", 0.5, true],
      ["nigel", 0.5, true],
      ["buhl", 0.5, true],
      ["mo", 0.5, true],
    ]);
    // 'mo' has 0.5 too (halve in r2) — ties for 4th all included; someone on 0 is out
    expect(individual.find((r) => r.playerId === "berg")!.inPlayoffCut).toBe(false);
  });
});

describe("monthBonus", () => {
  it("goes to the outright monthly leader once every match is closed", () => {
    const matches = [
      match("1", "mo", "berg", "teamA"), match("2", "buhl", "chase", "teamA"),
      match("3", "pete", "guinny", "teamA"), match("4", "neal", "phil", "teamB"),
    ];
    expect(monthBonus(round("r1", 1), matches, teams, teamOf)).toMatchObject({ teamId: "wir", pending: false, reason: "outright" });
  });

  it("stays pending while matches are open, naming the current leader", () => {
    const matches = [match("1", "mo", "berg", "teamA"), match("2", "buhl", "chase", null, { closed: false })];
    expect(monthBonus(round("r1", 1), matches, teams, teamOf)).toMatchObject({ teamId: null, pending: true, reason: "pendingMatches", leaderId: "wir" });
  });

  it("breaks a tie by the tied captains' lowest net score", () => {
    const matches = [
      // wir 1 pt (mo wins), cq 1 pt (phil wins); mo net 72, phil net 70 → cq
      match("1", "mo", "berg", "teamA", { holes: fullCard(4, 5) }),
      match("2", "phil", "chase", "teamA", { holes: fullCard(4, 5), strokesA: [1, 1, ...Array(16).fill(0)] }),
    ];
    expect(monthBonus(round("r1", 1), matches, teams, teamOf)).toMatchObject({ teamId: "cq", pending: false, reason: "captainNet" });
  });

  it("is pending when a tied captain's net can't be computed (result-only match)", () => {
    const matches = [
      match("1", "mo", "berg", "teamA", { holes: fullCard(4, 5) }),
      match("2", "phil", "chase", "teamA", { manual: true }),
    ];
    expect(monthBonus(round("r1", 1), matches, teams, teamOf)).toMatchObject({ teamId: null, pending: true, reason: "captainNetUnavailable" });
  });

  it("honours the admin override", () => {
    const matches = [match("1", "mo", "berg", "teamA", { holes: fullCard(4, 5) }), match("2", "phil", "chase", "teamA", { manual: true })];
    expect(monthBonus(round("r1", 1, { bonusTeamId: "wir" }), matches, teams, teamOf)).toMatchObject({ teamId: "wir", pending: false, reason: "override" });
  });
});

describe("computeLeagueStandings — teams", () => {
  it("sums members' records, adds the monthly bonus, and counts a same-team pairing as one W and one L", () => {
    const rounds = [round("r1", 1), round("r2", 2)];
    const matchesByRound = {
      r1: [
        match("1", "mo", "buhl", "teamA"),      // wir vs wir: 1 W + 1 L for wir, 1 pt
        match("2", "pete", "berg", "teamA"),    // wir +1
        match("3", "neal", "phil", "AS"),       // wir +0.5, cq +0.5
        match("4", "chase", "guinny", "teamB"), // bcb +1
      ],
      r2: [match("5", "phil", "mo", "teamA", { roundId: "r2" })], // cq +1, cq bonus
    };
    const { teams: rowsT, grid, bonusByRound } = computeLeagueStandings({ rounds, matchesByRound, leagueTeams: teams });
    const t = (id: string) => rowsT.find((r) => r.teamId === id)!;
    expect(bonusByRound.r1).toMatchObject({ teamId: "wir", reason: "outright" });
    expect(bonusByRound.r2).toMatchObject({ teamId: "cq", reason: "outright" });
    expect(t("wir")).toMatchObject({ mp: 5, w: 2, l: 2, t: 1, extra: 1, points: 3.5, rank: 1 });
    expect(t("cq")).toMatchObject({ mp: 2, w: 1, l: 0, t: 1, extra: 1, points: 2.5, rank: 2 });
    expect(t("bcb")).toMatchObject({ mp: 1, w: 1, extra: 0, points: 1 });
    expect(t("rw")).toMatchObject({ mp: 2, l: 2, points: 0, rank: 4 });
    expect(grid.wir.r1).toEqual({ points: 2.5, projectedPoints: 2.5, bonus: true, bonusPending: false });
    expect(formatGridCell(grid.wir.r1)).toBe("2.5 + 1");
    expect(formatGridCell(grid.rw.r2)).toBe("");
  });
});

describe("captainNet", () => {
  it("sums gross minus strokes over a full card and is null for a partial one", () => {
    const m = match("1", "mo", "berg", "teamA", { holes: fullCard(5, 4), strokesA: [1, 0, 1, ...Array(15).fill(0)] });
    expect(captainNet(m, "mo")).toBe(90 - 2);
    expect(captainNet(m, "berg")).toBe(72);
    expect(captainNet(m, "phil")).toBeNull();
    const partial = match("2", "mo", "berg", null, { closed: false, holes: { "1": { input: { teamAPlayerGross: 4, teamBPlayerGross: 4 } } } as unknown as MatchDoc["holes"] });
    expect(captainNet(partial, "mo")).toBeNull();
  });
});
