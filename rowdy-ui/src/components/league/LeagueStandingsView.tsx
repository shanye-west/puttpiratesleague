import LastUpdated from "../LastUpdated";
import LoadingScreen from "../LoadingScreen";
import { useLeagueSeason } from "../../hooks/useLeagueSeason";
import { useLeagueNames } from "./useLeagueNames";
import { IndividualStandingsTable, TeamStandingsTable, TeamMonthGrid } from "./StandingsTables";
import { LeagueSeasonList } from "./LeagueSeasonList";
import type { TournamentDoc } from "../../types";

/** The Standings tab body; `withSeasonList` adds the month calendar (past seasons). */
export default function LeagueStandingsView({ tournament, withSeasonList = false }: { tournament: TournamentDoc; withSeasonList?: boolean }) {
  const season = useLeagueSeason(tournament);
  const { nameOf } = useLeagueNames(season.players);
  if (season.loading) return <LoadingScreen />;
  const { standings, leagueTeams, rounds } = season;
  return (
    <div className="space-y-6 px-4 py-6">
      {tournament.priorStandings?.asOf && (
        <p className="px-1 text-[0.65rem] text-muted-foreground">
          Includes results carried in from the {tournament.priorStandings.asOf}.
        </p>
      )}
      <IndividualStandingsTable standings={standings} leagueTeams={leagueTeams} nameOf={nameOf} />
      <TeamStandingsTable standings={standings} leagueTeams={leagueTeams} nameOf={nameOf} />
      <TeamMonthGrid standings={standings} leagueTeams={leagueTeams} rounds={rounds} />
      {withSeasonList && <LeagueSeasonList season={season} tournament={tournament} />}
      <div>
        <LastUpdated />
      </div>
    </div>
  );
}
