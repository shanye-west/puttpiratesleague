import { ArrowRight } from "lucide-react";
import LastUpdated from "../LastUpdated";
import LoadingScreen from "../LoadingScreen";
import { ViewTransitionLink } from "../ViewTransitionLink";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { useAuth } from "../../contexts/AuthContext";
import { fmtPts } from "../../utils/leagueStandings";
import { useLeagueSeason } from "../../hooks/useLeagueSeason";
import { useLeagueNames } from "./useLeagueNames";
import { IndividualStandingsTable, TeamStandingsTable, TeamMonthGrid } from "./StandingsTables";
import { LeagueSeasonList } from "./LeagueSeasonList";
import type { TournamentDoc } from "../../types";

/**
 * The standings body (the app's home for a league season). `withSeasonList`
 * adds the month calendar (used for a past season); `showPlayCta` adds the
 * link through to the matches still to be played; `showPastSeasons` a link to
 * the archive.
 */
export default function LeagueStandingsView({
  tournament,
  withSeasonList = false,
  showPlayCta = false,
  showPastSeasons = false,
}: {
  tournament: TournamentDoc;
  withSeasonList?: boolean;
  showPlayCta?: boolean;
  showPastSeasons?: boolean;
}) {
  const { player } = useAuth();
  const season = useLeagueSeason(tournament);
  const { nameOf } = useLeagueNames(season.players);
  if (season.loading) return <LoadingScreen />;
  const { standings, leagueTeams, rounds, matchesByRound } = season;

  const openMatches = Object.values(matchesByRound).flat().filter((m) => m.status?.closed !== true);
  const myOpen = player ? openMatches.filter((m) => (m.playerIds ?? []).includes(player.id)) : [];
  const me = player ? standings.individual.find((r) => r.playerId === player.id) : undefined;

  return (
    <div className="space-y-6 px-4 py-6">
      {showPlayCta && openMatches.length > 0 && (
        <ViewTransitionLink to="/matches" className="card-link-hover block">
          <Card className="border-primary/30 bg-card/90">
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {me ? "You" : "Matches"}
                </div>
                <div className="truncate text-sm font-semibold text-foreground">
                  {me
                    ? `#${me.rank} · ${fmtPts(me.points)} pts · ${me.w}-${me.l}-${me.t}`
                    : `${openMatches.length} match${openMatches.length === 1 ? "" : "es"} still to play`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary">
                {me
                  ? myOpen.length > 0
                    ? `${myOpen.length} to play`
                    : "View matches"
                  : "View"}
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </ViewTransitionLink>
      )}
      {tournament.priorStandings?.asOf && (
        <p className="px-1 text-[0.65rem] text-muted-foreground">
          Includes results carried in from the {tournament.priorStandings.asOf}.
        </p>
      )}
      <IndividualStandingsTable standings={standings} leagueTeams={leagueTeams} nameOf={nameOf} />
      <TeamStandingsTable standings={standings} leagueTeams={leagueTeams} nameOf={nameOf} />
      <TeamMonthGrid standings={standings} leagueTeams={leagueTeams} rounds={rounds} />
      {withSeasonList && <LeagueSeasonList season={season} tournament={tournament} />}
      {showPastSeasons && (
        <div className="flex justify-center">
          <Button asChild variant="ghost" size="sm">
            <ViewTransitionLink to="/history">Past seasons</ViewTransitionLink>
          </Button>
        </div>
      )}
      <div>
        <LastUpdated />
      </div>
    </div>
  );
}
