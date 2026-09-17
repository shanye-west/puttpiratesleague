import { memo } from "react";
import Layout from "../components/Layout";
import LoadingScreen from "../components/LoadingScreen";
import LeagueStandingsView from "../components/league/LeagueStandingsView";
import { useTournamentContext } from "../contexts/TournamentContext";
import { isLeagueTournament } from "../utils/leagueTeams";
import { Card, CardContent } from "../components/ui/card";

/** Standings tab: individual table (playoff line), team table, month grid. */
function StandingsComponent() {
  const { tournament, loading } = useTournamentContext();
  if (loading) return <LoadingScreen />;
  return (
    <Layout title="Standings" series={tournament?.series} tournamentLogo={tournament?.tournamentLogo}>
      {tournament && isLeagueTournament(tournament) ? (
        <LeagueStandingsView tournament={tournament} />
      ) : (
        <div className="px-4 py-10">
          <Card className="border-border/80 bg-card/85">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No active season.</CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}

export default memo(StandingsComponent);
