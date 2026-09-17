import { memo } from "react";
import Layout from "../components/Layout";
import LoadingScreen from "../components/LoadingScreen";
import LastUpdated from "../components/LastUpdated";
import { LeagueSeasonList } from "../components/league/LeagueSeasonList";
import { useTournamentContext } from "../contexts/TournamentContext";
import { useLeagueSeason } from "../hooks/useLeagueSeason";
import { isLeagueTournament } from "../utils/leagueTeams";
import { Card, CardContent } from "../components/ui/card";
import { ViewTransitionLink } from "../components/ViewTransitionLink";
import { Button } from "../components/ui/button";

/** Season tab: the month calendar, each month → its page. */
function SeasonComponent() {
  const { tournament, loading } = useTournamentContext();
  const season = useLeagueSeason(tournament);
  if (loading || season.loading) return <LoadingScreen />;
  return (
    <Layout title="Season" series={tournament?.series} tournamentLogo={tournament?.tournamentLogo}>
      <div className="space-y-6 px-4 py-6">
        {tournament && isLeagueTournament(tournament) ? (
          <LeagueSeasonList season={season} tournament={tournament} />
        ) : (
          <Card className="border-border/80 bg-card/85">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No active season.</CardContent>
          </Card>
        )}
        <div className="flex justify-center">
          <Button asChild variant="ghost" size="sm">
            <ViewTransitionLink to="/history">Past seasons</ViewTransitionLink>
          </Button>
        </div>
        <LastUpdated />
      </div>
    </Layout>
  );
}

export default memo(SeasonComponent);
