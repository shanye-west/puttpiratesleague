/**
 * useLeagueSeason — the Putt Pirates season in one hook: rounds (months),
 * matches, the rostered players, and the computed standings.
 *
 * Matches of locked months are read once (cache-first) and only the open
 * months keep a live listener (`splitLockedRounds`), so once the admin locks
 * each finished month the steady-state cost is the current month's 8 docs.
 * For the active season that subscription is shared app-wide and kept open
 * (SeasonDataContext), so it is paid once per session, not once per screen.
 */

import { useMemo } from "react";
import { usePlayers } from "../contexts/TournamentContext";
import { useSeasonData } from "../contexts/SeasonDataContext";
import { rosterPlayerIds } from "../utils/roster";
import { computeLeagueStandings, type LeagueStandings } from "../utils/leagueStandings";
import type { LeagueTeam, MatchDoc, PlayerDoc, RoundDoc, TournamentDoc } from "../types";

export interface LeagueSeason {
  loading: boolean;
  error: string | null;
  tournament: TournamentDoc | null;
  rounds: RoundDoc[];
  matchesByRound: Record<string, MatchDoc[]>;
  players: Record<string, PlayerDoc>;
  leagueTeams: LeagueTeam[];
  standings: LeagueStandings;
  /** The month to feature on Home: the first with an open match, else the last. */
  currentRound: RoundDoc | null;
}

export function useLeagueSeason(tournament: TournamentDoc | null | undefined): LeagueSeason {
  // The active season comes from the session-long shared subscription, so
  // switching between season screens doesn't reload it.
  const { loading, error, rounds, matchesByRound } = useSeasonData(tournament);

  const rosterIds = useMemo(() => rosterPlayerIds(tournament ?? null), [tournament]);
  const { players, loaded: playersLoaded } = usePlayers(rosterIds);

  const leagueTeams = useMemo(() => tournament?.leagueTeams ?? [], [tournament?.leagueTeams]);

  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, p] of Object.entries(players)) out[id] = p.displayName ?? id;
    return out;
  }, [players]);

  const prior = tournament?.priorStandings ?? null;
  const standings = useMemo(
    () => computeLeagueStandings({ rounds, matchesByRound, leagueTeams, names, prior }),
    [rounds, matchesByRound, leagueTeams, names, prior]
  );

  const currentRound = useMemo(() => {
    if (rounds.length === 0) return null;
    const open = rounds.find((r) => (matchesByRound[r.id] ?? []).some((m) => m.status?.closed !== true));
    return open ?? rounds[rounds.length - 1];
  }, [rounds, matchesByRound]);

  return {
    loading: loading || (rosterIds.length > 0 && !playersLoaded),
    error,
    tournament: tournament ?? null,
    rounds,
    matchesByRound,
    players,
    leagueTeams,
    standings,
    currentRound,
  };
}
