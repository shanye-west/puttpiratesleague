import { memo } from "react";
import { Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import LoadingScreen from "../components/LoadingScreen";
import LeagueMatches from "../components/league/LeagueMatches";
import { useTournamentContext } from "../contexts/TournamentContext";
import { isLeagueTournament } from "../utils/leagueTeams";

/**
 * Matches tab: the season month by month — pick a month, see its team battle
 * and its matches. It is also the season calendar (the old Season tab). The
 * standings are the app's home page (`/`).
 */
function MatchesComponent() {
  const { tournament, loading } = useTournamentContext();
  if (loading) return <LoadingScreen />;
  // A non-league (Cup) tournament has no separate matches page — its home is the scoreboard.
  if (!tournament || !isLeagueTournament(tournament)) return <Navigate to="/" replace />;
  return (
    <Layout title="Matches" series={tournament.series} tournamentLogo={tournament.tournamentLogo}>
      <LeagueMatches tournament={tournament} />
    </Layout>
  );
}

export default memo(MatchesComponent);
