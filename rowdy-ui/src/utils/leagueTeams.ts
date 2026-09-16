import type { LeagueTeam, TournamentDoc } from "../types";

/** Fallback palette for league teams without a color, by team index. */
const LEAGUE_TEAM_COLORS = ["#0b3d3a", "#c9a227", "#7c2d12", "#1e3a8a"];

/** A tournament is a league season when it has league teams. */
export function isLeagueTournament(
  t: Pick<TournamentDoc, "leagueTeams"> | null | undefined
): t is Pick<TournamentDoc, "leagueTeams"> & { leagueTeams: LeagueTeam[] } {
  return Array.isArray(t?.leagueTeams) && t!.leagueTeams!.length > 0;
}

/** playerId → league team, for every rostered player. */
export function leagueTeamByPlayer(leagueTeams: LeagueTeam[] | undefined): Record<string, LeagueTeam> {
  const out: Record<string, LeagueTeam> = {};
  for (const team of leagueTeams ?? []) for (const pid of team.playerIds ?? []) out[pid] = team;
  return out;
}

/** The league team a player belongs to, or null. */
export function teamOfPlayer(leagueTeams: LeagueTeam[] | undefined, playerId: string): LeagueTeam | null {
  return (leagueTeams ?? []).find((t) => (t.playerIds ?? []).includes(playerId)) ?? null;
}

/** A team's color, falling back to a stable palette slot by its position. */
export function leagueTeamColor(team: LeagueTeam | null | undefined, leagueTeams: LeagueTeam[] | undefined): string {
  if (!team) return "var(--text-secondary)";
  if (team.color && team.color.trim()) return team.color.trim();
  const idx = Math.max(0, (leagueTeams ?? []).findIndex((t) => t.id === team.id));
  return LEAGUE_TEAM_COLORS[idx % LEAGUE_TEAM_COLORS.length];
}
