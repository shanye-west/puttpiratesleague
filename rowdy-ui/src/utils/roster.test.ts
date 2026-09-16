import { describe, expect, it } from "vitest";
import { leagueTeamPlayerIds, rosterPlayerIds, tierPlayerIds } from "./roster";
import type { TournamentDoc } from "../types";

describe("tierPlayerIds", () => {
  it("flattens tiers in A-D order", () => {
    expect(
      tierPlayerIds({ A: ["p1"], B: ["p2", "p3"], D: ["p4"] })
    ).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("handles undefined roster", () => {
    expect(tierPlayerIds(undefined)).toEqual([]);
  });
});

describe("rosterPlayerIds", () => {
  const tournament = {
    teamA: { id: "a", name: "A", rosterByTier: { A: ["p1"], C: ["p2"] } },
    teamB: { id: "b", name: "B", rosterByTier: { B: ["p3"] } },
  } as Pick<TournamentDoc, "teamA" | "teamB">;

  it("combines both teams, team A first", () => {
    expect(rosterPlayerIds(tournament)).toEqual(["p1", "p2", "p3"]);
  });

  it("handles null tournament and missing rosters", () => {
    expect(rosterPlayerIds(null)).toEqual([]);
    expect(
      rosterPlayerIds({ teamA: { id: "a", name: "A" }, teamB: { id: "b", name: "B" } } as Pick<TournamentDoc, "teamA" | "teamB">)
    ).toEqual([]);
  });
});

describe("rosterPlayerIds with league teams", () => {
  const league = {
    teamA: { id: "a", name: "" },
    teamB: { id: "b", name: "" },
    leagueTeams: [
      { id: "t1", name: "One", captainId: "p1", playerIds: ["p1", "p2"] },
      { id: "t2", name: "Two", captainId: "p3", playerIds: ["p3", "p4"] },
    ],
  } as Pick<TournamentDoc, "teamA" | "teamB" | "leagueTeams">;

  it("includes every league team member when the Cup sides are empty", () => {
    expect(rosterPlayerIds(league)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(leagueTeamPlayerIds(league.leagueTeams)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("dedupes a player listed on both a Cup side and a league team", () => {
    const both = {
      ...league,
      teamA: { id: "a", name: "A", rosterByTier: { A: ["p1"] } },
    } as Pick<TournamentDoc, "teamA" | "teamB" | "leagueTeams">;
    expect(rosterPlayerIds(both)).toEqual(["p1", "p2", "p3", "p4"]);
  });
});
