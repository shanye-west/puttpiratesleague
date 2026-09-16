import { memo, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import LoadingScreen from "../components/LoadingScreen";
import LastUpdated from "../components/LastUpdated";
import PlayerAvatar from "../components/PlayerAvatar";
import { ViewTransitionLink } from "../components/ViewTransitionLink";
import { Card, CardContent } from "../components/ui/card";
import { useTournamentContext } from "../contexts/TournamentContext";
import { useTournamentData } from "../hooks/useTournamentData";
import { useLeagueSeason } from "../hooks/useLeagueSeason";
import { useAuth } from "../contexts/AuthContext";
import { fmtPts } from "../utils/leagueStandings";
import { leagueTeamColor } from "../utils/leagueTeams";
import {
  getPlayerName as getPlayerNameFromLookup,
  getPlayerFirstNameLastInitial as getPlayerPublicNameFromLookup,
} from "../utils/playerHelpers";

/**
 * League teams: the four 4-man teams with captain, each member's record and
 * the team's season line. Reads the same season data as Home (shared cache).
 */
function TeamsComponent() {
  const [searchParams] = useSearchParams();
  const tournamentIdParam = searchParams.get("tournamentId");
  const { user } = useAuth();

  const { tournament: activeTournament, loading: contextLoading } = useTournamentContext();
  const useContextTournament = !tournamentIdParam || tournamentIdParam === activeTournament?.id;
  // A past season by id: one tournament read; otherwise reuse the context's doc.
  const { tournament: fetched, loading: fetchLoading } = useTournamentData(
    useContextTournament ? { prefetchedTournament: activeTournament } : { tournamentId: tournamentIdParam! }
  );
  const tournament = useContextTournament ? activeTournament : fetched;

  const { loading: seasonLoading, players, leagueTeams, standings } = useLeagueSeason(tournament);
  const loading = (useContextTournament ? contextLoading : fetchLoading) || seasonLoading;

  const nameOf = useMemo(
    () => (pid: string) => (user ? getPlayerNameFromLookup(pid, players) : getPlayerPublicNameFromLookup(pid, players)),
    [user, players]
  );
  const rowOf = (pid: string) => standings.individual.find((r) => r.playerId === pid);

  if (loading) return <LoadingScreen />;

  return (
    <Layout title="Teams" series={tournament?.series} showBack tournamentLogo={tournament?.tournamentLogo}>
      <div className="space-y-4 px-4 py-6">
        {leagueTeams.length === 0 && (
          <Card className="border-border/80 bg-card/85">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No league teams yet.</CardContent>
          </Card>
        )}
        {standings.teams.map((teamRow) => {
          const team = leagueTeams.find((t) => t.id === teamRow.teamId);
          if (!team) return null;
          const color = leagueTeamColor(team, leagueTeams);
          return (
            <Card key={team.id} className="overflow-hidden border-border/80 bg-card/85">
              <div className="h-1.5" style={{ background: color }} />
              <CardContent className="space-y-3 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      #{teamRow.rank}
                    </div>
                    <div className="truncate text-lg font-semibold text-foreground">{team.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums" style={{ color }}>{fmtPts(teamRow.points)}</div>
                    <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      {teamRow.w}-{teamRow.l}-{teamRow.t} · +{teamRow.extra} bonus
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-border/60 rounded-xl border border-border/60">
                  {team.playerIds.map((pid) => {
                    const r = rowOf(pid);
                    const isCaptain = pid === team.captainId;
                    return (
                      <ViewTransitionLink
                        key={pid}
                        to={`/player/${pid}`}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted/60"
                      >
                        <PlayerAvatar name={nameOf(pid)} playerId={pid} color={color} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">{nameOf(pid)}</span>
                            {isCaptain && (
                              <span
                                className="rounded px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider"
                                style={{ color, background: `color-mix(in srgb, ${color} 15%, var(--card-bg))` }}
                              >
                                Captain
                              </span>
                            )}
                          </div>
                          <div className="text-[0.65rem] text-muted-foreground">
                            {r ? `#${r.rank} · ${r.mp} played` : "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold tabular-nums">{r ? fmtPts(r.points) : "0"}</div>
                          <div className="font-mono text-[0.65rem] text-muted-foreground">
                            {r ? `${r.w}-${r.l}-${r.t}` : "0-0-0"}
                          </div>
                        </div>
                      </ViewTransitionLink>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
        <LastUpdated />
      </div>
    </Layout>
  );
}

export default memo(TeamsComponent);
