import { useMemo } from "react";
import { ViewTransitionLink } from "../ViewTransitionLink";
import LastUpdated from "../LastUpdated";
import { LoadingEscalation } from "../LoadingScreen";
import { HomePageSkeleton } from "../Skeleton";
import { Card, CardContent } from "../ui/card";
import { useAuth } from "../../contexts/AuthContext";
import { useLeagueSeason } from "../../hooks/useLeagueSeason";
import { useLeagueNames } from "./useLeagueNames";
import { MonthMatchList } from "./MonthMatchList";
import { fmtPts } from "../../utils/leagueStandings";
import type { MatchDoc, RoundDoc, TournamentDoc } from "../../types";

const sectionLabel = "flex items-center gap-2 pl-2 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground";

function roundLabel(r: RoundDoc, idx: number): string {
  return r.name?.trim() || (r.day ? `Round ${r.day}` : `Round ${idx + 1}`);
}

const RECENT_RESULTS = 5;

/**
 * Home = "Matches": what's left to play, grouped by month (the league runs a
 * month or two behind, so several months can be open at once), then the last
 * few results. Standings and the season calendar live on their own tabs.
 */
export default function LeagueHome({ tournament }: { tournament: TournamentDoc }) {
  const { player } = useAuth();
  const { loading, rounds, matchesByRound, players, leagueTeams, standings } = useLeagueSeason(tournament);
  const { nameOf, shortNameOf } = useLeagueNames(players);

  const openByRound = useMemo(
    () =>
      rounds
        .map((r, idx) => ({
          round: r,
          label: roundLabel(r, idx),
          matches: (matchesByRound[r.id] ?? []).filter((m) => m.status?.closed !== true),
        }))
        .filter((g) => g.matches.length > 0),
    [rounds, matchesByRound]
  );

  const recent = useMemo(() => {
    const closed: { match: MatchDoc; label: string }[] = [];
    rounds.forEach((r, idx) => {
      for (const m of matchesByRound[r.id] ?? []) {
        if (m.status?.closed === true) closed.push({ match: m, label: roundLabel(r, idx) });
      }
    });
    // Newest first: later months first, then later match numbers.
    return closed.reverse().slice(0, RECENT_RESULTS);
  }, [rounds, matchesByRound]);

  if (loading) {
    return (
      <>
        <HomePageSkeleton />
        <LoadingEscalation />
      </>
    );
  }

  const me = player ? standings.individual.find((r) => r.playerId === player.id) : undefined;
  const mine = player ? openByRound.flatMap((g) => g.matches).filter((m) => m.playerIds?.includes(player.id) || m.teamAPlayers?.[0]?.playerId === player.id || m.teamBPlayers?.[0]?.playerId === player.id) : [];

  return (
    <div className="space-y-6 px-4 py-6">
      {me && (
        <ViewTransitionLink to="/standings" className="card-link-hover block">
          <Card className="border-primary/30 bg-card/90">
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">You</div>
                <div className="truncate text-sm font-semibold text-foreground">
                  #{me.rank} · {fmtPts(me.points)} pts · {me.w}-{me.l}-{me.t}
                  {me.inPlayoffCut && <span className="ml-2 text-[0.6rem] font-bold uppercase text-primary">in the top 4</span>}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                {mine.length === 0 ? "No matches to play" : `${mine.length} to play`}
              </div>
            </CardContent>
          </Card>
        </ViewTransitionLink>
      )}

      {openByRound.length === 0 ? (
        <Card className="border-border/80 bg-card/85">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Nothing left to play — see the standings.</CardContent>
        </Card>
      ) : (
        openByRound.map((g) => (
          <section key={g.round.id} className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className={sectionLabel}>{g.label}</div>
              <ViewTransitionLink to={`/round/${g.round.id}`} className="text-[0.6rem] font-semibold uppercase tracking-wider text-primary">
                {g.matches.length} to play
              </ViewTransitionLink>
            </div>
            <MonthMatchList matches={g.matches} leagueTeams={leagueTeams} nameOf={nameOf} shortNameOf={shortNameOf} />
          </section>
        ))
      )}

      {recent.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className={sectionLabel}>Recent results</div>
            <ViewTransitionLink to="/season" className="text-[0.6rem] font-semibold uppercase tracking-wider text-primary">
              All months
            </ViewTransitionLink>
          </div>
          <MonthMatchList matches={recent.map((r) => r.match)} leagueTeams={leagueTeams} nameOf={nameOf} shortNameOf={shortNameOf} showSetupHint={false} />
        </section>
      )}

      <div>
        <LastUpdated />
      </div>
    </div>
  );
}
