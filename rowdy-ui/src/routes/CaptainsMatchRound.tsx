import { memo, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc } from "firebase/firestore";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "../firebase";
import { playerPhotoUrl } from "../assets/players";
import { useAuth } from "../contexts/AuthContext";
import { useTournamentContextOptional } from "../contexts/TournamentContext";
import { useCaptainsMatch } from "../hooks/useCaptainsMatch";
import { getDocCacheFirst } from "../utils/firestoreReads";
import { formatPlayedOn, roundFlowHistory, type CaptainsSide } from "../utils/captainsMatchScoring";
import { getPlayerFirstNameLastInitial, getPlayerName } from "../utils/playerHelpers";
import CaptainsMatchScorecard from "../components/captains/CaptainsMatchScorecard";
import { ComponentErrorBoundary } from "../components/ComponentErrorBoundary";
import Layout from "../components/Layout";
import LastUpdated from "../components/LastUpdated";
import PlayerAvatar from "../components/PlayerAvatar";
import { RoundPageSkeleton } from "../components/Skeleton";
import { ViewTransitionLink } from "../components/ViewTransitionLink";
import { MatchFlowGraph } from "../components/match/MatchFlowGraph";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import type { CourseDoc } from "../types";

/**
 * One round of the captains' match: the card, what the round did to the running
 * match, and the round's own match flow.
 *
 * Read-only for everyone — rounds are played off the app and an admin enters
 * the card afterwards (admins get a link to the editor). Everything comes from
 * the single match doc; the only other read is the course, for par/hcp/yards.
 */
function CaptainsMatchRoundComponent() {
  const { tournamentId, roundNumber: roundParam } = useParams<{ tournamentId: string; roundNumber: string }>();
  const roundNumber = Number(roundParam);
  const { user, player } = useAuth();
  const tournamentContext = useTournamentContextOptional();
  const { loading, error, match, summary, tournament, players } = useCaptainsMatch(tournamentId);

  const round = summary?.rounds.find((r) => r.roundNumber === roundNumber) ?? null;

  // The course is static for the session: shared cache first, then one
  // cache-first read that also fills the shared cache.
  const courseId = round?.round.courseId ?? null;
  const cachedCourse = courseId ? tournamentContext?.courses[courseId] ?? null : null;
  const addCourse = tournamentContext?.addCourse;
  const [fetchedCourse, setFetchedCourse] = useState<CourseDoc | null>(null);
  useEffect(() => {
    if (!courseId || cachedCourse) return;
    let cancelled = false;
    getDocCacheFirst(doc(db, "courses", courseId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const c = { id: snap.id, ...snap.data() } as CourseDoc;
        setFetchedCourse(c);
        addCourse?.(c);
      })
      .catch((err) => console.error("Course fetch error:", err));
    return () => {
      cancelled = true;
    };
  }, [courseId, cachedCourse, addCourse]);
  const course = cachedCourse ?? (fetchedCourse?.id === courseId ? fetchedCourse : null);

  if (loading) return (
    <Layout title="Loading..." showBack>
      <RoundPageSkeleton />
    </Layout>
  );

  const tName = tournament?.name || "Putt Pirates";
  const homeLink = tournamentContext?.tournament?.id === tournamentId ? "/" : `/tournament/${tournamentId}`;

  if (error || !match || !summary || !round) {
    const message =
      error ?? (!match ? "Captains' match not found." : `Round ${roundParam} hasn't been played yet.`);
    return (
      <Layout title={tName} series={tournament?.series} showBack tournamentLogo={tournament?.tournamentLogo}>
        <div className="px-4 py-10">
          <Card className="mx-auto max-w-md border-border/80 bg-card/90 text-center">
            <CardContent className="py-8">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="text-lg font-semibold text-foreground">{message}</div>
              <Button asChild className="mt-4">
                <ViewTransitionLink to={homeLink}>Back to the match</ViewTransitionLink>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const colorA = tournament?.teamA?.color || "var(--team-a-default)";
  const colorB = tournament?.teamB?.color || "var(--team-b-default)";
  const sideColor = (side: CaptainsSide | null) =>
    side === "A" ? colorA : side === "B" ? colorB : "var(--text-secondary)";
  const firstName = (side: CaptainsSide) =>
    players[side === "A" ? match.playerAId : match.playerBId]?.displayName?.trim().split(/\s+/)[0] ||
    (side === "A" ? "Player A" : "Player B");
  // Logged-out viewers see "First L." wherever a full last name would show.
  const displayName = (pid: string) =>
    user ? getPlayerName(pid, players) : getPlayerFirstNameLastInitial(pid, players);
  const marginText = (margin: number) =>
    margin === 0 ? "All Square" : `${firstName(margin > 0 ? "A" : "B")} ${Math.abs(margin)} UP`;
  const marginSide = (margin: number): CaptainsSide | null => (margin > 0 ? "A" : margin < 0 ? "B" : null);

  const { state } = summary;
  const clinch =
    state.kind === "won" && state.roundNumber === round.roundNumber
      ? { winner: state.winner, margin: state.margin, toPlay: state.toPlay }
      : null;

  // The day's own result, across every hole scored on the card.
  const dayLeader: CaptainsSide | null =
    round.holesWonA > round.holesWonB ? "A" : round.holesWonB > round.holesWonA ? "B" : null;
  const dayText =
    round.thru === 0 ? "No scores entered yet" : dayLeader ? `${firstName(dayLeader)} won the round` : "Round halved";

  // Both play off their full course handicaps, so usually both get strokes.
  const strokesText =
    round.strokesGivenA > 0 || round.strokesGivenB > 0
      ? `Strokes: ${firstName("A")} ${round.strokesGivenA} · ${firstName("B")} ${round.strokesGivenB}`
      : "No strokes";

  const details = [formatPlayedOn(round.round.playedOn), round.round.courseName, round.round.tees]
    .filter(Boolean)
    .join(" · ");

  const history = roundFlowHistory(round);
  const index = summary.rounds.findIndex((r) => r.roundNumber === round.roundNumber);
  const prev = index > 0 ? summary.rounds[index - 1] : null;
  const next = index < summary.rounds.length - 1 ? summary.rounds[index + 1] : null;

  const renderPlayer = (side: CaptainsSide) => {
    const pid = side === "A" ? match.playerAId : match.playerBId;
    return (
      <div className="flex min-w-0 flex-col items-center gap-1.5">
        <PlayerAvatar name={getPlayerName(pid, players)} playerId={pid} color={sideColor(side)} size={48} />
        <span className="max-w-full truncate text-sm font-semibold" style={{ color: sideColor(side) }}>
          {displayName(pid)}
        </span>
      </div>
    );
  };

  return (
    <Layout title={tName} series={tournament?.series} showBack tournamentLogo={tournament?.tournamentLogo}>
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <Card className="border-white/50 bg-card/85 shadow-lg">
          <CardContent className="space-y-4 py-5">
            <div className="space-y-1 text-center">
              <div className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                {match.name}
              </div>
              <div className="text-2xl font-semibold text-foreground">
                Round {round.roundNumber}{" "}
                <span className="text-base font-normal text-muted-foreground">of {summary.totalRounds}</span>
              </div>
              {details && <div className="text-sm text-muted-foreground">{details}</div>}
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {renderPlayer("A")}
              <div className="text-center">
                <div className="whitespace-nowrap text-3xl font-semibold tracking-tight text-foreground">
                  <span style={{ color: colorA }}>{round.holesWonA}</span>
                  <span className="text-muted-foreground">–</span>
                  <span style={{ color: colorB }}>{round.holesWonB}</span>
                </div>
                <div className="text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Holes won
                </div>
              </div>
              {renderPlayer("B")}
            </div>

            <div className="space-y-1 rounded-xl border border-border/70 bg-card/80 p-3 text-center">
              <div className="text-sm font-semibold" style={dayLeader ? { color: sideColor(dayLeader) } : undefined}>
                {dayText}
                {!round.complete && round.thru > 0 ? ` · thru ${round.thru}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {round.postMatch ? (
                  "Played after the match was decided"
                ) : clinch ? (
                  <span style={{ color: sideColor(clinch.winner) }} className="font-semibold">
                    {firstName(clinch.winner)} won the match{" "}
                    {clinch.toPlay > 0 ? `${clinch.margin} & ${clinch.toPlay}` : `${clinch.margin} UP`}
                  </span>
                ) : (
                  <>
                    <span style={{ color: sideColor(marginSide(round.startMargin)) }}>
                      {marginText(round.startMargin)}
                    </span>
                    {" → "}
                    <span style={{ color: sideColor(marginSide(round.endMargin)) }} className="font-semibold">
                      {marginText(round.endMargin)}
                    </span>
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{strokesText}</div>
            </div>
          </CardContent>
        </Card>

        {player?.isAdmin && (
          <div className="text-right">
            <Link
              to={`/admin/t/${tournamentId}/captains-match/round/${round.roundNumber}`}
              className="inline-block rounded bg-purple-100 px-2 py-1 text-xs text-purple-700 transition-colors hover:bg-purple-200"
            >
              ⚙ Edit scorecard
            </Link>
          </div>
        )}

        <ComponentErrorBoundary
          fallback={<div className="card p-4 text-center text-sm text-muted-foreground">Scorecard unavailable</div>}
        >
          <CaptainsMatchScorecard
            round={round}
            course={course}
            labelA={firstName("A")}
            labelB={firstName("B")}
            colorA={colorA}
            colorB={colorB}
            clinch={clinch}
            tSeries={tournament?.series}
          />
        </ComponentErrorBoundary>

        {history.length > 0 && !round.postMatch && (
          <ComponentErrorBoundary
            fallback={<div className="card p-4 text-center text-sm text-muted-foreground">Match flow graph unavailable</div>}
          >
            <MatchFlowGraph
              marginHistory={history}
              startMargin={round.startMargin}
              teamAColor={colorA}
              teamBColor={colorB}
              teamALogo={playerPhotoUrl(match.playerAId)}
              teamBLogo={playerPhotoUrl(match.playerBId)}
            />
          </ComponentErrorBoundary>
        )}

        <div className="grid grid-cols-2 gap-3">
          {prev ? (
            <Button asChild variant="outline" className="h-11 rounded-xl">
              <ViewTransitionLink to={`/captains-match/${tournamentId}/round/${prev.roundNumber}`}>
                <ChevronLeft className="h-4 w-4" />
                Round {prev.roundNumber}
              </ViewTransitionLink>
            </Button>
          ) : (
            <div />
          )}
          {next ? (
            <Button asChild variant="outline" className="h-11 rounded-xl">
              <ViewTransitionLink to={`/captains-match/${tournamentId}/round/${next.roundNumber}`}>
                Round {next.roundNumber}
                <ChevronRight className="h-4 w-4" />
              </ViewTransitionLink>
            </Button>
          ) : (
            <div />
          )}
        </div>

        <div>
          <LastUpdated />
        </div>
      </div>
    </Layout>
  );
}

export default memo(CaptainsMatchRoundComponent);
