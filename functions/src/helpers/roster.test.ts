import { describe, expect, it } from "vitest";
import { leagueTeamsOf, matchPlayerIds, rosterPlayerIds } from "./roster.js";

describe("rosterPlayerIds", () => {
  it("flattens both Cup sides' tiers and handicap maps, deduped", () => {
    const t = {
      teamA: { rosterByTier: { A: ["p1"], B: ["p2"] }, handicapByPlayer: { p1: 5, p9: 7 } },
      teamB: { rosterByTier: { A: ["p3"] } },
    };
    expect(rosterPlayerIds(t)).toEqual(["p1", "p2", "p9", "p3"]);
  });

  it("includes league team members (Putt Pirates) ahead of the Cup sides", () => {
    const t = {
      teamA: { id: "teamA", name: "" },
      teamB: { id: "teamB", name: "" },
      leagueTeams: [
        { id: "wir", name: "Wreck It Ralph", captainId: "pMo", playerIds: ["pMo", "pBuhl"] },
        { id: "rw", name: "Rhino Wranglers", captainId: "pBerg", playerIds: ["pBerg", "pChase", "pMo"] },
      ],
    };
    expect(rosterPlayerIds(t)).toEqual(["pMo", "pBuhl", "pBerg", "pChase"]);
  });

  it("handles missing / malformed input", () => {
    expect(rosterPlayerIds(undefined)).toEqual([]);
    expect(rosterPlayerIds({ leagueTeams: "nope" })).toEqual([]);
    expect(leagueTeamsOf({ leagueTeams: [null, { name: "no id" }, { id: "ok", playerIds: ["a", 3, ""] }] })).toEqual([
      { id: "ok", name: "ok", captainId: "", playerIds: ["a"] },
    ]);
  });
});

describe("matchPlayerIds", () => {
  it("lists side A then side B", () => {
    expect(matchPlayerIds({ teamAPlayers: [{ playerId: "a" }], teamBPlayers: [{ playerId: "b" }, { playerId: 5 }] })).toEqual(["a", "b"]);
  });
});
