import { memo } from "react";
import { Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import LoadingScreen from "../components/LoadingScreen";
import LeagueHome from "../components/league/LeagueHome";
import { useTournamentContext } from "../contexts/TournamentContext";
import { isLeagueTournament } from "../utils/leagueTeams";

/**
 * Matches tab: what's left to play this season, grouped by month, plus the
 * most recent results. The season's standings are the app's home page (`/`).
 */
function MatchesComponent() {
  const { tournament, loading } = useTournamentContext();
  if (loading) return <LoadingScreen />;
  // A non-league (Cup) tournament has no separate matches page — its home is the scoreboard.
  if (!tournament || !isLeagueTournament(tournament)) return <Navigate to="/" replace />;
  return (
    <Layout title="Matches" series={tournament.series} tournamentLogo={tournament.tournamentLogo}>
      <LeagueHome tournament={tournament} />
    </Layout>
  );
}

export default memo(MatchesComponent);
