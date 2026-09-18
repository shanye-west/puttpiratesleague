import { describe, expect, it } from "vitest";
import {
  isLivePointLine,
  isMonthFinal,
  leagueBetResult,
  livePointLines,
  playerSeasonState,
  teamMonthPoints,
} from "./leagueBets.js";
import { computeLeagueStandings, type MatchDoc, type RoundDoc } from "./leagueStandings.js";
import type { BetDoc, LeagueTeam } from "../types.js";

const teams: LeagueTeam[] = [
  { id: "t1", name: "One", captainId: "a", playerIds: ["a", "b"] },
  { id: "t2", name: "Two", captainId: "c", playerIds: ["c", "d"] },
  { id: "t3", name: "Three", captainId: "e", playerIds: ["e", "f"] },
];
const r1: RoundDoc = { id: "r1", day: 1, pointsValue: 1 };
const r2: RoundDoc = { id: "r2", day: 2, pointsValue: 1 };

function match(a: string, b: string, winner?: "teamA" | "teamB" | "AS"): MatchDoc {
  return {
    teamAPlayers: [{ playerId: a }],
    teamBPlayers: [{ playerId: b }],
    status: winner ? { closed: true, thru: 18 } : { closed: false, thru: 0 },
    result: winner ? { winner } : null,
  };
}

function bet(overrides: Partial<BetDoc>): BetDoc {
  return {
    id: "b",
    tournamentId: "t",
    market: "playoffs",
    kind: "offer",
    status: "active",
    amount: 10,
    proposerId: "pX",
    proposerSide: "yes",
    acceptorId: "pY",
    acceptorSide: "no",
    proposerConfirmed: true,
    acceptorConfirmed: true,
    participantIds: ["pX", "pY"],
    ...overrides,
  };
}

// Month 1 is done (t1 takes 2 of 3 + the bonus); month 2 has one match left.
const r1Matches = [match("a", "c", "teamA"), match("b", "e", "teamA"), match("d", "f", "AS")];
const r2Matches = [match("a", "e", "teamB"), match("c", "b")];
const standings = computeLeagueStandings({
  rounds: [r1, r2],
  matchesByRound: { r1: r1Matches, r2: r2Matches },
  leagueTeams: teams,
});

describe("playerSeasonState", () => {
  it("counts banked points and unclosed matches", () => {
    expect(playerSeasonState(standings, [...r1Matches, ...r2Matches], "b")).toEqual({ points: 1, wins: 1, remaining: 1 });
    expect(playerSeasonState(standings, [...r1Matches, ...r2Matches], "a")).toEqual({ points: 1, wins: 1, remaining: 0 });
  });
});

describe("live point lines", () => {
  it("offers every half-point strictly between banked and reachable", () => {
    expect(livePointLines(5.5, 3)).toEqual([6, 6.5, 7, 7.5, 8]);
    expect(livePointLines(4, 1)).toEqual([4.5]);
    expect(livePointLines(4, 0)).toEqual([]);
  });
  it("rejects decided or off-grid lines", () => {
    expect(isLivePointLine(5.5, 3, 6)).toBe(true);
    expect(isLivePointLine(5.5, 3, 5.5)).toBe(false); // already reached
    expect(isLivePointLine(5.5, 3, 8.5)).toBe(false); // can't reach it
    expect(isLivePointLine(5.5, 3, 6.25)).toBe(false);
  });
});

describe("team month", () => {
  it("counts the bonus point in a team's month total", () => {
    expect(teamMonthPoints(standings, "t1", "r1")).toBe(3); // 2 + bonus
    expect(teamMonthPoints(standings, "t2", "r1")).toBe(0.5);
  });
  it("is final only once every match is closed and the bonus is decided", () => {
    expect(isMonthFinal(standings, "r1", r1Matches)).toBe(true);
    expect(isMonthFinal(standings, "r2", r2Matches)).toBe(false);
  });
});

describe("leagueBetResult", () => {
  const finalMonths = new Set(["r1"]);

  it("settles a final month's team battle and holds an open month's", () => {
    const tm = bet({ market: "teamMonth", roundId: "r1", leagueTeamAId: "t2", leagueTeamBId: "t1", proposerSide: "teamA", acceptorSide: "teamB" });
    expect(leagueBetResult(tm, standings, finalMonths, false)).toMatchObject({ outcome: "teamB", winnerId: "pY" });
    expect(leagueBetResult({ ...tm, roundId: "r2" }, standings, finalMonths, false)).toBeNull();
  });

  it("holds season bets until the season is complete", () => {
    expect(leagueBetResult(bet({ subjectId: "a" }), standings, finalMonths, false)).toBeNull();
  });

  it("settles playoffs on the cut and final points on the standings", () => {
    // a, b, e have 1 point (top 3); d and f tie for 4th on 0.5, so a is in.
    expect(leagueBetResult(bet({ subjectId: "a" }), standings, finalMonths, true)).toMatchObject({ outcome: "yes" });
    expect(leagueBetResult(bet({ subjectId: "c" }), standings, finalMonths, true)).toMatchObject({ outcome: "no", winnerId: "pY" });
    const ou = bet({ market: "overUnder", metric: "playerTournamentPoints", subjectId: "e", line: 0.5, proposerSide: "over", acceptorSide: "under" });
    expect(leagueBetResult(ou, standings, finalMonths, true)).toMatchObject({ outcome: "over", winnerId: "pX" });
  });
});
