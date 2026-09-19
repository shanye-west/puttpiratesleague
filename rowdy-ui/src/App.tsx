import { Flag } from "lucide-react";
import { useTournamentData } from "./hooks/useTournamentData";
import { useTournamentContext } from "./contexts/TournamentContext";
import Layout from "./components/Layout";
import LastUpdated from "./components/LastUpdated";
import ScoreBlock from "./components/ScoreBlock";
import ScoreTrackerBar from "./components/ScoreTrackerBar";
import ChampionBanner from "./components/ChampionBanner";
import OfflineImage from "./components/OfflineImage";
import LeagueStandingsView from "./components/league/LeagueStandingsView";
import { LoadingEscalation } from "./components/LoadingScreen";
import { HomePageSkeleton } from "./components/Skeleton";
import { ViewTransitionLink } from "./components/ViewTransitionLink";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { formatRoundType } from "./utils";
import { isLeagueTournament } from "./utils/leagueTeams";

/**
 * Home. A league season (the Putt Pirates default — the tournament has
 * `leagueTeams`) opens on the standings: the individual table with the playoff
 * line, the team table, and the team × month grid. The season's matches,
 * month by month, live on their own tab (`/matches`). A tournament without league teams falls back to
 * the original two-sided Cup scoreboard.
 */
export default function App() {
  // Service worker registration + update polling live app-wide in main.tsx.
  const { tournament, loading: tournamentLoading } = useTournamentContext();
  const isLeague = isLeagueTournament(tournament);

  // Cup scoreboard data (denormalized round totals). Skipped for a league
  // season — the standings view runs its own subscription — by handing the hook null.
  const {
    loading: dataLoading,
    rounds,
    coursesByRound,
    stats,
    roundStats,
    totalPointsAvailable,
  } = useTournamentData({ prefetchedTournament: isLeague ? null : tournament, preferDenormalizedTotals: true });

  const tName = tournament?.name || "Putt Pirates";
  const tSeries = tournament?.series;
  const tLogo = tournament?.tournamentLogo;

  if (tournamentLoading || (!isLeague && dataLoading)) {
    return (
      <Layout title={tName} series={tSeries} tournamentLogo={tLogo}>
        <HomePageSkeleton />
        <LoadingEscalation />
      </Layout>
    );
  }

  if (!tournament) {
    return (
      <Layout title={tName} series={tSeries} tournamentLogo={tLogo}>
        <div className="px-4 pt-10">
          <Card className="mx-auto max-w-sm border-border/80 bg-card/85 text-center shadow-xl backdrop-blur">
            <CardContent className="space-y-4 py-8">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Flag className="h-6 w-6" />
              </div>
              <div className="text-lg font-semibold text-foreground">No active season</div>
              <Button asChild variant="outline" className="mx-auto">
                <ViewTransitionLink to="/history">View past seasons</ViewTransitionLink>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (isLeague) {
    return (
      <Layout title={tName} series={tSeries} tournamentLogo={tLogo}>
        <LeagueStandingsView tournament={tournament} showPlayCta showPastSeasons />
      </Layout>
    );
  }

  // ---- Legacy two-sided Cup scoreboard (no league teams on the tournament) ----
  const pointsToWin = totalPointsAvailable ? totalPointsAvailable / 2 + 0.5 : null;
  const teamAColor = tournament.teamA?.color || "var(--team-a-default)";
  const teamBColor = tournament.teamB?.color || "var(--team-b-default)";
  const pointsToWinDisplay =
    pointsToWin !== null ? (Number.isInteger(pointsToWin) ? String(pointsToWin) : pointsToWin.toFixed(1)) : "";
  const showPoints = totalPointsAvailable > 0;

  return (
    <Layout title={tName} series={tSeries} tournamentLogo={tLogo}>
      <div className="space-y-6 px-4 py-6">
        <ChampionBanner
          tournament={tournament}
          teamAConfirmed={stats.teamAConfirmed}
          teamBConfirmed={stats.teamBConfirmed}
          totalPointsAvailable={totalPointsAvailable}
        />

        <section>
          <Card className="relative overflow-hidden border-white/40 bg-card/75 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
            <CardContent className="relative space-y-6 pt-6">
              <div className="space-y-2">
                <div className="text-center">
                  <div className="text-[1.0rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Total Score
                  </div>
                </div>
                {showPoints && (
                  <div className="space-y-1">
                    <div className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {pointsToWinDisplay} points needed to win
                    </div>
                    <div className="rounded-xl bg-card/80 p-2 shadow-inner">
                      <ScoreTrackerBar
                        totalPoints={totalPointsAvailable}
                        teamAConfirmed={stats.teamAConfirmed}
                        teamBConfirmed={stats.teamBConfirmed}
                        teamAPending={stats.teamAPending}
                        teamBPending={stats.teamBPending}
                        teamAColor={teamAColor}
                        teamBColor={teamBColor}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <div className="flex flex-col items-center gap-2">
                  <OfflineImage
                    src={tournament.teamA?.logo}
                    alt={tournament.teamA?.name || "Team A"}
                    fallbackIcon="🔵"
                    style={{ width: 96, height: 96, objectFit: "contain" }}
                  />
                  <div className="text-4xl font-semibold tracking-tight" style={{ color: teamAColor }}>
                    {stats.teamAConfirmed}
                  </div>
                </div>
                <div className="flex h-12 items-center justify-center">
                  <div className="h-10 w-px bg-muted/80" />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <OfflineImage
                    src={tournament.teamB?.logo}
                    alt={tournament.teamB?.name || "Team B"}
                    fallbackIcon="🔴"
                    style={{ width: 96, height: 96, objectFit: "contain" }}
                  />
                  <div className="text-4xl font-semibold tracking-tight" style={{ color: teamBColor }}>
                    {stats.teamBConfirmed}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 pl-3 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Schedule
          </div>
          <div className="space-y-3">
            {rounds.map((r, idx) => {
              const rs = roundStats[r.id];
              const courseName = coursesByRound[r.id]?.name || r.course?.name;
              return (
                <ViewTransitionLink key={r.id} to={`/round/${r.id}`} className="card-link-hover block">
                  <Card className="border-border/80 bg-card/80">
                    <CardContent className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-4">
                      <div className="text-lg font-semibold text-foreground">
                        <ScoreBlock final={rs?.teamAConfirmed ?? 0} proj={rs?.teamAPending ?? 0} color={teamAColor} />
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-semibold text-foreground">{r.name || `Round ${idx + 1}`}</div>
                        <Badge variant="outline" className="mt-1 border-border text-[0.55rem]">
                          {formatRoundType(r.format)}
                        </Badge>
                        {courseName && <div className="mt-2 text-xs text-muted-foreground">{courseName}</div>}
                      </div>
                      <div className="flex justify-end text-lg font-semibold text-foreground">
                        <ScoreBlock final={rs?.teamBConfirmed ?? 0} proj={rs?.teamBPending ?? 0} color={teamBColor} projLeft />
                      </div>
                    </CardContent>
                  </Card>
                </ViewTransitionLink>
              );
            })}
          </div>
        </section>

        <div>
          <LastUpdated />
        </div>
      </div>
    </Layout>
  );
}
