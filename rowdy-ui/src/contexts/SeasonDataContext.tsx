/**
 * SeasonDataContext — one long-lived rounds + matches subscription for the
 * active tournament, shared by every screen that shows the season (Standings,
 * Matches, Season, Teams, Sportsbook).
 *
 * Previously each of those routes ran its own useTournamentData, so every tab
 * switch tore the listeners down, re-opened them and showed a full-page
 * spinner until they re-resolved. Here the subscription starts the first time a
 * season screen mounts and then stays open for the session, so moving between
 * tabs renders instantly from data already in memory.
 *
 * It is lazy on purpose: a deep link straight to a scorecard (e.g. from a push
 * notification) doesn't pay for the whole season until a season screen is opened.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTournamentContext } from "./TournamentContext";
import { useTournamentData, type UseTournamentDataResult } from "../hooks/useTournamentData";
import type { TournamentDoc } from "../types";

interface SeasonDataValue {
  data: UseTournamentDataResult;
  /** True once some screen has asked for the shared subscription. */
  active: boolean;
  activate: () => void;
}

const SeasonDataContext = createContext<SeasonDataValue | null>(null);

export function SeasonDataProvider({ children }: { children: ReactNode }) {
  const { tournament } = useTournamentContext();
  const [active, setActive] = useState(false);
  const activate = useCallback(() => setActive(true), []);

  // Locked months are read once (cache-first); only open months keep a live
  // listener — the same read profile each screen used on its own before.
  const data = useTournamentData({
    prefetchedTournament: active ? tournament : null,
    splitLockedRounds: true,
  });

  const value = useMemo(() => ({ data, active, activate }), [data, active, activate]);
  return <SeasonDataContext.Provider value={value}>{children}</SeasonDataContext.Provider>;
}

/**
 * Rounds + matches for `tournament`. The active season is served from the
 * shared, session-long subscription; any other tournament (a past season)
 * gets its own subscription for as long as the caller is mounted.
 */
export function useSeasonData(tournament: TournamentDoc | null | undefined): UseTournamentDataResult {
  const ctx = useContext(SeasonDataContext);
  const { tournament: activeTournament } = useTournamentContext();
  const shared = !!ctx && !!tournament && tournament.id === activeTournament?.id;

  const activate = ctx?.activate;
  useEffect(() => {
    if (shared) activate?.();
  }, [shared, activate]);

  // Handing the hook `null` makes it an inert no-op when the shared data applies.
  const own = useTournamentData({
    prefetchedTournament: shared ? null : (tournament ?? null),
    splitLockedRounds: true,
  });

  if (!shared || !ctx) return own;
  // Until the provider has picked up the tournament (the render right after
  // activation), report loading rather than an empty season.
  const ready = ctx.active && ctx.data.tournament?.id === tournament.id;
  return ready ? ctx.data : { ...ctx.data, loading: true };
}
