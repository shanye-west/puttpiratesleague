import { memo, type CSSProperties } from "react";
import { playerPhotoUrl } from "../../assets/players";
import { useAuth } from "../../contexts/AuthContext";
import { useCaptainsMatch } from "../../hooks/useCaptainsMatch";
import {
  formatCaptainsMatchStatus,
  formatClinchChip,
  formatPlayedOn,
  formatRoundRanges,
  missingRoundNumbers,
  type CaptainsRoundSummary,
  type CaptainsSide,
} from "../../utils/captainsMatchScoring";
import { getPlayerFirstNameLastInitial, getPlayerName } from "../../utils/playerHelpers";
import PlayerAvatar from "../PlayerAvatar";
import SectionLabel from "../SectionLabel";
import { CaptainsMatchSkeleton } from "../Skeleton";
import { ViewTransitionLink } from "../ViewTransitionLink";
import { Card, CardContent } from "../ui/card";
import SeasonFlowGraph from "./SeasonFlowGraph";
import type { TournamentDoc } from "../../types";

const AS_GRAY = "#94a3b8";

// Golden halo that traces the winner's photo, like the champion logo on the
// tournament page.
const WINNER_GLOW: CSSProperties = {
  filter: "drop-shadow(0 0 7px rgba(251,191,36,0.95)) drop-shadow(0 0 18px rgba(245,158,11,0.55))",
};

interface CaptainsMatchSectionProps {
  tournament: TournamentDoc;
}

/**
 * The captains' match on the tournament home page: the running status, the
 * season's match flow, and a card per round that opens its scorecard.
 *
 * Rendered only for tournaments with `hasCaptainsMatch`. Player A is always the
 * left/teamA side and player B the right/teamB side, so the colours line up
 * with the teams the two captains go on to lead.
 */
function CaptainsMatchSection({ tournament }: CaptainsMatchSectionProps) {
  const { user } = useAuth();
  const { loading, error, match, summary, players } = useCaptainsMatch(tournament.id);

  if (loading) return <CaptainsMatchSkeleton />;

  if (error) {
    return (
      <Card className="border-border/80 bg-card/85">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">{error}</CardContent>
      </Card>
    );
  }

  if (!match || !summary) return null;

  const colorA = tournament.teamA?.color || "var(--team-a-default)";
  const colorB = tournament.teamB?.color || "var(--team-b-default)";
  const color = (side: CaptainsSide | null) => (side === "A" ? colorA : side === "B" ? colorB : AS_GRAY);
  const playerId = (side: CaptainsSide) => (side === "A" ? match.playerAId : match.playerBId);
  const nameOf = (side: CaptainsSide) =>
    players[playerId(side)]?.displayName?.trim().split(/\s+/)[0] || (side === "A" ? "Player A" : "Player B");
  // Logged-out viewers see "First L." wherever a full last name would show.
  const displayName = (pid: string) =>
    user ? getPlayerName(pid, players) : getPlayerFirstNameLastInitial(pid, players);

  const { state } = summary;
  const winner = state.kind === "won" ? state.winner : null;

  let statusLabel = "";
  let statusMain = "AS";
  let statusColor = AS_GRAY;
  let statusNote = "";
  switch (state.kind) {
    case "notStarted":
      statusNote = "Not started";
      break;
    case "live":
      if (state.leader) {
        statusLabel = nameOf(state.leader);
        statusMain = `${state.margin} UP`;
        statusColor = color(state.leader);
      } else {
        statusLabel = "All square";
      }
      statusNote = state.dormie ? "Dormie" : `${state.toPlay} holes to play`;
      break;
    case "won":
      statusLabel = `${nameOf(state.winner)} wins`;
      statusMain = state.toPlay > 0 ? `${state.margin} & ${state.toPlay}` : `${state.margin} UP`;
      statusColor = color(state.winner);
      statusNote = "Final";
      break;
    case "halved":
      statusMain = "Halved";
      statusNote = "Final";
      break;
  }

  const played = summary.rounds.filter((r) => r.thru > 0);
  const latest = played.length > 0 ? played[played.length - 1] : null;
  const progress =
    state.kind === "won"
      ? `Decided in round ${state.roundNumber}, hole ${state.hole}`
      : state.kind === "halved"
        ? `All ${summary.totalRounds} rounds played`
        : `${summary.roundsPlayed} of ${summary.totalRounds} rounds played${
            latest && !latest.complete ? ` · round ${latest.roundNumber} thru ${latest.thru}` : ""
          }`;

  const missing = missingRoundNumbers(summary);

  const renderPlayer = (side: CaptainsSide) => {
    const pid = playerId(side);
    return (
      <div className="flex min-w-0 flex-col items-center gap-2">
        <div style={winner === side ? WINNER_GLOW : undefined}>
          <PlayerAvatar name={getPlayerName(pid, players)} playerId={pid} color={color(side)} size={72} />
        </div>
        <div className="max-w-full truncate text-sm font-semibold" style={{ color: color(side) }}>
          {displayName(pid)}
        </div>
      </div>
    );
  };

  const renderRound = (r: CaptainsRoundSummary) => {
    // The day's own result, across every hole scored on the card. Kept short —
    // it shares a phone-width row with the round badge and the match status.
    const dayLeader: CaptainsSide | null =
      r.holesWonA > r.holesWonB ? "A" : r.holesWonB > r.holesWonA ? "B" : null;
    const dayResult =
      r.thru === 0
        ? "No scores yet"
        : dayLeader
          ? `${nameOf(dayLeader)} won ${Math.max(r.holesWonA, r.holesWonB)}–${Math.min(r.holesWonA, r.holesWonB)}`
          : `Halved ${r.holesWonA}–${r.holesWonB}`;
    const details = [
      formatPlayedOn(r.round.playedOn),
      r.round.courseName,
      !r.complete && r.thru > 0 ? `thru ${r.thru}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    // Where the match stood once this round was done.
    let afterLabel = "Match";
    let afterText: string;
    let afterColor: string;
    if (r.postMatch) {
      afterLabel = "After final";
      afterText = "—";
      afterColor = AS_GRAY;
    } else if (state.kind === "won" && state.roundNumber === r.roundNumber) {
      afterLabel = "Final";
      afterText = `${nameOf(state.winner)} ${formatClinchChip(state.margin, state.toPlay)}`;
      afterColor = color(state.winner);
    } else {
      const leader: CaptainsSide | null = r.endMargin > 0 ? "A" : r.endMargin < 0 ? "B" : null;
      afterText = leader ? `${nameOf(leader)} ${Math.abs(r.endMargin)} UP` : "All Square";
      afterColor = color(leader);
    }

    return (
      <ViewTransitionLink
        key={r.roundNumber}
        to={`/captains-match/${tournament.id}/round/${r.roundNumber}`}
        className="card-link-hover block"
      >
        <Card className="border-border/80 bg-card/80">
          <CardContent className="flex items-center gap-3 py-3">
            <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-muted text-center">
              <span className="text-[0.5rem] font-semibold uppercase tracking-wider text-muted-foreground">Round</span>
              <span className="text-base font-bold leading-none text-foreground">{r.roundNumber}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-sm font-semibold"
                style={dayLeader ? { color: color(dayLeader) } : undefined}
              >
                {dayResult}
              </div>
              {details && <div className="truncate text-xs text-muted-foreground">{details}</div>}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {afterLabel}
              </div>
              <div className="whitespace-nowrap text-sm font-bold" style={{ color: afterColor }}>
                {afterText}
              </div>
            </div>
          </CardContent>
        </Card>
      </ViewTransitionLink>
    );
  };

  return (
    <>
      <section>
        <Card className="relative overflow-hidden border-white/40 bg-card/75 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(191,32,60,0.14),_transparent_55%)]" />
          <CardContent className="relative space-y-5 pt-6">
            <div className="space-y-1 text-center">
              <div className="text-[1.0rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {match.name}
              </div>
              {match.stakes && <div className="text-xs text-muted-foreground">{match.stakes}</div>}
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {renderPlayer("A")}
              <div
                className="flex min-w-[6.5rem] flex-col items-center text-center"
                role="status"
                aria-label={formatCaptainsMatchStatus(state, nameOf("A"), nameOf("B"))}
              >
                <div
                  className="h-4 text-[0.65rem] font-semibold uppercase tracking-[0.15em]"
                  style={{ color: statusColor }}
                >
                  {statusLabel}
                </div>
                <div className="whitespace-nowrap text-3xl font-semibold tracking-tight" style={{ color: statusColor }}>
                  {statusMain}
                </div>
                <div className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  {statusNote}
                </div>
              </div>
              {renderPlayer("B")}
            </div>

            <div className="text-center text-xs text-muted-foreground">{progress}</div>
          </CardContent>
        </Card>
      </section>

      <section>
        <SeasonFlowGraph
          series={summary.series}
          totalRounds={summary.totalRounds}
          colorA={colorA}
          colorB={colorB}
          photoA={playerPhotoUrl(match.playerAId)}
          photoB={playerPhotoUrl(match.playerBId)}
          peakA={summary.peakA}
          peakB={summary.peakB}
          decided={state.kind === "won" || state.kind === "halved"}
        />
      </section>

      <section className="space-y-3">
        <SectionLabel
          trailing={
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              {summary.roundsPlayed}/{summary.totalRounds}
            </span>
          }
        >
          Rounds
        </SectionLabel>

        {summary.rounds.length === 0 ? (
          <Card className="border-border/80 bg-card/80">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No rounds played yet — {summary.totalRounds} to go.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">{summary.rounds.map(renderRound)}</div>
        )}

        {summary.rounds.length > 0 && missing.length > 0 && (
          <div className="px-2 text-center text-xs text-muted-foreground">
            Not played yet: round{missing.length === 1 ? "" : "s"} {formatRoundRanges(missing)}
          </div>
        )}
      </section>
    </>
  );
}

export default memo(CaptainsMatchSection);
