import type { LeagueTeam, TierMap, TournamentDoc } from "../types";

const TIERS = ["A", "B", "C", "D"] as const;

/** Flatten one team's rosterByTier into a player-id list. */
export function tierPlayerIds(roster: TierMap | undefined): string[] {
  return TIERS.flatMap((tier) => roster?.[tier] ?? []);
}

/** Player ids across a tournament's league teams (Putt Pirates), in team order. */
export function leagueTeamPlayerIds(leagueTeams: LeagueTeam[] | undefined): string[] {
  return (leagueTeams ?? []).flatMap((t) => t.playerIds ?? []);
}

/**
 * All player ids rostered in a tournament: both Cup sides' tiers plus every
 * league team's members, deduped (a player appears once even if listed twice).
 */
export function rosterPlayerIds(
  tournament: Pick<TournamentDoc, "teamA" | "teamB"> & { leagueTeams?: LeagueTeam[] } | null | undefined
): string[] {
  if (!tournament) return [];
  return [
    ...new Set([
      ...tierPlayerIds(tournament.teamA?.rosterByTier),
      ...tierPlayerIds(tournament.teamB?.rosterByTier),
      ...leagueTeamPlayerIds(tournament.leagueTeams),
    ]),
  ];
}

export type Tier = (typeof TIERS)[number];

/** Flatten one team's rosterByTier into a playerId → tier map. */
export function tierLookupForTeam(roster: TierMap | undefined): Record<string, Tier> {
  const out: Record<string, Tier> = {};
  for (const tier of TIERS) for (const pid of roster?.[tier] ?? []) out[pid] = tier;
  return out;
}

/** playerId → tier across both teams of a tournament (used for the A/A·D/D rule). */
export function playerTierLookup(
  tournament: Pick<TournamentDoc, "teamA" | "teamB"> | null | undefined
): Record<string, Tier> {
  return {
    ...tierLookupForTeam(tournament?.teamA?.rosterByTier),
    ...tierLookupForTeam(tournament?.teamB?.rosterByTier),
  };
}
