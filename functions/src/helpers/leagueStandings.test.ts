import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeLeagueStandings, type MatchDoc, type RoundDoc } from "./leagueStandings.js";
import type { LeagueTeam } from "../types.js";

const MARKER = "// ---- Everything below is mirrored verbatim";
const below = (path: string) => {
  const src = readFileSync(path, "utf8");
  const i = src.indexOf(MARKER);
  if (i < 0) throw new Error(`marker missing in ${path}`);
  return src.slice(i);
};

describe("leagueStandings mirror", () => {
  it("matches the client's standings logic byte for byte", () => {
    const server = fileURLToPath(new URL("./leagueStandings.ts", import.meta.url));
    const client = fileURLToPath(new URL("../../../rowdy-ui/src/utils/leagueStandings.ts", import.meta.url));
    expect(below(server)).toBe(below(client));
  });
});

describe("computeLeagueStandings (server copy)", () => {
  const teams: LeagueTeam[] = [
    { id: "t1", name: "One", captainId: "a", playerIds: ["a", "b"] },
    { id: "t2", name: "Two", captainId: "c", playerIds: ["c", "d"] },
  ];
  const round: RoundDoc = { id: "r1", day: 1, pointsValue: 1 };
  const match = (id: string, a: string, b: string, winner: "teamA" | "teamB" | "AS"): MatchDoc => ({
    id,
    teamAPlayers: [{ playerId: a }],
    teamBPlayers: [{ playerId: b }],
    status: { closed: true, thru: 18 },
    result: { winner },
  });

  it("adds prior standings and awards the month bonus", () => {
    const s = computeLeagueStandings({
      rounds: [round],
      matchesByRound: { r1: [match("m1", "a", "c", "teamA"), match("m2", "b", "d", "AS")] },
      leagueTeams: teams,
      prior: { players: { c: { mp: 2, w: 2, l: 0, t: 0 } }, teams: {} },
    });
    const pts = Object.fromEntries(s.individual.map((r) => [r.playerId, r.points]));
    expect(pts).toEqual({ a: 1, b: 0.5, c: 2, d: 0.5 });
    expect(s.grid.t1.r1).toMatchObject({ points: 1.5, bonus: true });
    expect(s.grid.t2.r1).toMatchObject({ points: 0.5, bonus: false });
  });
});
