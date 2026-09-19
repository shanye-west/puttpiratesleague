import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { ViewTransitionLink } from "../ViewTransitionLink";
import LastUpdated from "../LastUpdated";
import { LoadingEscalation } from "../LoadingScreen";
import { HomePageSkeleton } from "../Skeleton";
import SectionLabel from "../SectionLabel";
import MonthPicker from "../MonthPicker";
import { MONTH_NAMES, shortRoundLabel } from "../../utils/months";
import { Card, CardContent } from "../ui/card";
import { useAuth } from "../../contexts/AuthContext";
import { useLeagueSeason } from "../../hooks/useLeagueSeason";
import { useLeagueNames } from "./useLeagueNames";
import { MonthMatchList } from "./MonthMatchList";
import { MonthTeamPoints } from "./MonthTeamPoints";
import type { MatchDoc, RoundDoc, TournamentDoc } from "../../types";

function roundLabel(r: RoundDoc): string {
  return r.name?.trim() || (r.day ? `Round ${r.day}` : "Round");
}

const isClosed = (m: MatchDoc) => m.status?.closed === true;
const isLive = (m: MatchDoc) => !isClosed(m) && (m.status?.thru ?? 0) > 0;
const involves = (m: MatchDoc, pid: string | undefined) =>
  !!pid &&
  (m.playerIds?.includes(pid) || m.teamAPlayers?.[0]?.playerId === pid || m.teamBPlayers?.[0]?.playerId === pid);

/**
 * The Matches tab: the season one month at a time. A grid of month chips (the
 * whole season, so it doubles as the calendar) picks the month; the month shows
 * its team battle and its matches, still-to-play above final.
 */
export default function LeagueMatches({ tournament }: { tournament: TournamentDoc }) {
  const { player } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { loading, rounds, matchesByRound, players, leagueTeams, standings, currentRound } = useLeagueSeason(tournament);
  const { nameOf, shortNameOf } = useLeagueNames(players);
  const me = player?.id;

  // Opens on this calendar month when it's in the season (the league runs
  // behind, so "first month with an open match" can sit months back on one
  // straggler); otherwise the first open month, else the last.
  const defaultRound = useMemo(() => {
    const thisMonth = MONTH_NAMES[new Date().getMonth()];
    return rounds.find((r) => r.name?.trim().toLowerCase() === thisMonth) ?? currentRound;
  }, [rounds, currentRound]);
  // Selected month lives in the URL (as on Bets) so Back from a scorecard
  // lands on the same month.
  const selected = rounds.find((r) => r.id === searchParams.get("month")) ?? defaultRound;
  const setMonth = (roundId: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("month", roundId);
        return next;
      },
      { replace: true }
    );

  const chips = useMemo(
    () =>
      rounds.map((r) => {
        const ms = matchesByRound[r.id] ?? [];
        return {
          id: r.id,
          label: shortRoundLabel(r),
          done: r.locked === true || (ms.length > 0 && ms.every(isClosed)),
          dot: ms.some((m) => !isClosed(m) && involves(m, me)),
        };
      }),
    [rounds, matchesByRound, me]
  );

  // Within each group: your match first, then live ones, then schedule order.
  const { toPlay, final } = useMemo(() => {
    const ms = selected ? matchesByRound[selected.id] ?? [] : [];
    const order = (list: MatchDoc[]) =>
      list
        .map((m, i) => ({ m, i, mine: involves(m, me) ? 0 : 1, live: isLive(m) ? 0 : 1 }))
        .sort((a, z) => a.mine - z.mine || a.live - z.live || a.i - z.i)
        .map((x) => x.m);
    return { toPlay: order(ms.filter((m) => !isClosed(m))), final: order(ms.filter(isClosed)) };
  }, [selected, matchesByRound, me]);

  if (loading) {
    return (
      <>
        <HomePageSkeleton />
        <LoadingEscalation />
      </>
    );
  }

  if (!selected) {
    return (
      <div className="px-4 py-6">
        <Card className="border-border/80 bg-card/85">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">The season hasn't been scheduled yet.</CardContent>
        </Card>
      </div>
    );
  }

  const total = toPlay.length + final.length;
  const carriedIn = !!tournament.priorStandings && leagueTeams.some((t) => tournament.priorStandings!.teams?.[t.id]?.[selected.id]);
  // Before anyone tees off the team battle is four zeros — skip it.
  const showTeamPoints = final.length > 0 || toPlay.some(isLive) || carriedIn;
  const listProps = { leagueTeams, nameOf, shortNameOf, highlightPlayerId: me, showSetupHint: "mine" as const };

  return (
    <div className="space-y-5 px-4 py-6">
      <MonthPicker months={chips} selectedId={selected.id} onSelect={setMonth} layout="grid" />

      <div className="space-y-3">
        <SectionLabel
          trailing={
            total > 0 && (
              <ViewTransitionLink
                to={`/round/${selected.id}`}
                className="flex items-center text-[0.6rem] font-semibold uppercase tracking-wider text-primary"
              >
                Details
                <ChevronRight className="h-3.5 w-3.5" />
              </ViewTransitionLink>
            )
          }
        >
          {roundLabel(selected)}
        </SectionLabel>
        {showTeamPoints && <MonthTeamPoints standings={standings} leagueTeams={leagueTeams} roundId={selected.id} />}
      </div>

      {total === 0 ? (
        <Card className="border-border/80 bg-card/85">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {carriedIn ? "Played before the app — results are in the standings." : "No matches scheduled yet."}
          </CardContent>
        </Card>
      ) : (
        <>
          {toPlay.length > 0 && (
            <section className="space-y-3">
              <SectionLabel trailing={<Count n={toPlay.length} />}>To play</SectionLabel>
              <MonthMatchList matches={toPlay} {...listProps} />
            </section>
          )}
          {final.length > 0 && (
            <section className="space-y-3">
              <SectionLabel trailing={<Count n={final.length} />}>Final</SectionLabel>
              <MonthMatchList matches={final} {...listProps} />
            </section>
          )}
        </>
      )}

      <div>
        <LastUpdated />
      </div>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-xs font-semibold tabular-nums text-muted-foreground">{n}</span>;
}
