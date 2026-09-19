import { memo } from "react";
import { ViewTransitionLink } from "../ViewTransitionLink";
import PlayerAvatar from "../PlayerAvatar";
import { MatchStatusBadge, getMatchCardStyles } from "../MatchStatusBadge";
import { HoleByHoleTracker } from "../HoleByHoleTracker";
import { Card, CardContent } from "../ui/card";
import { cn } from "../../lib/utils";
import { leagueTeamColor, teamOfPlayer } from "../../utils/leagueTeams";
import type { LeagueTeam, MatchDoc } from "../../types";

interface Props {
  matches: MatchDoc[];
  leagueTeams: LeagueTeam[];
  nameOf: (pid: string) => string;
  shortNameOf: (pid: string) => string;
  /**
   * Show a "needs setup" chip on matches without a course/strokes yet.
   * `"mine"`: only on `highlightPlayerId`'s match — setting it up is that
   * player's job, so on everyone else's cards the hint is noise.
   */
  showSetupHint?: boolean | "mine";
  /** The viewer: their match gets a primary ring and a "Your match" line. */
  highlightPlayerId?: string;
  /** Round page: the hole-by-hole tracker under each card (not for result-only matches). */
  showTracker?: boolean;
  format?: string | null;
}

/**
 * The month's singles matches as tappable cards: player vs player, each side
 * tinted with the player's league-team colour, status badge in the middle.
 */
export const MonthMatchList = memo(function MonthMatchList({
  matches,
  leagueTeams,
  nameOf,
  shortNameOf,
  showSetupHint = true,
  showTracker = false,
  format = "singles",
  highlightPlayerId,
}: Props) {
  if (matches.length === 0) {
    return (
      <Card className="border-border/80 bg-card/85">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">No matches left to play in the app this month.</CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3" role="list" aria-label="Matches">
      {matches.map((match) => {
        const aId = match.teamAPlayers?.[0]?.playerId ?? "";
        const bId = match.teamBPlayers?.[0]?.playerId ?? "";
        const colorA = leagueTeamColor(teamOfPlayer(leagueTeams, aId), leagueTeams);
        const colorB = leagueTeamColor(teamOfPlayer(leagueTeams, bId), leagueTeams);
        const { bgStyle, borderStyle, textColor } = getMatchCardStyles(match.status, match.result, colorA, colorB);
        const onColored = textColor === "text-white";
        const needsSetup = !match.courseId && !match.manualResult && match.status?.closed !== true;
        const isManual = !!match.manualResult && match.status?.closed === true;
        const isMine = !!highlightPlayerId && (aId === highlightPlayerId || bId === highlightPlayerId);
        const setupHint = needsSetup && (showSetupHint === "mine" ? isMine : showSetupHint);
        const note = [isMine && "Your match", isManual ? "Result entered by admin" : setupHint && "Tap to set course & strokes"]
          .filter(Boolean)
          .join(" · ");
        return (
          <div key={match.id} role="listitem">
            <ViewTransitionLink
              to={`/match/${match.id}`}
              aria-label={`Match: ${shortNameOf(aId)} vs ${shortNameOf(bId)}`}
              className="card-link-hover block"
            >
              <Card
                className={cn("overflow-hidden border-border/70", isMine && "ring-2 ring-primary/70 ring-offset-2 ring-offset-background")}
                style={{ ...bgStyle, ...borderStyle }}
              >
                <CardContent className="space-y-2 py-3">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className={cn("flex min-w-0 items-center gap-1.5 text-sm leading-tight", textColor)}>
                      <span className="shrink-0 rounded-full" style={{ boxShadow: `0 0 0 1.5px ${onColored ? "rgba(255,255,255,0.85)" : colorA}` }}>
                        <PlayerAvatar name={nameOf(aId)} playerId={aId} color={colorA} size={26} />
                      </span>
                      <span className="min-w-0 truncate font-semibold">{shortNameOf(aId)}</span>
                    </div>
                    <MatchStatusBadge
                      status={match.status}
                      result={match.result}
                      teamAColor={colorA}
                      teamBColor={colorB}
                      teamAName={shortNameOf(aId)}
                      teamBName={shortNameOf(bId)}
                      matchNumber={match.matchNumber}
                      teeTime={match.teeTime}
                      showTeeLabel={false}
                      variant="compact"
                    />
                    <div className={cn("flex min-w-0 flex-row-reverse items-center gap-1.5 text-sm leading-tight", textColor)}>
                      <span className="shrink-0 rounded-full" style={{ boxShadow: `0 0 0 1.5px ${onColored ? "rgba(255,255,255,0.85)" : colorB}` }}>
                        <PlayerAvatar name={nameOf(bId)} playerId={bId} color={colorB} size={26} />
                      </span>
                      <span className="min-w-0 truncate font-semibold">{shortNameOf(bId)}</span>
                    </div>
                  </div>
                  {note && (
                    <div className={cn("text-center text-[0.6rem] font-semibold uppercase tracking-wider", onColored ? "text-white/80" : "text-muted-foreground")}>
                      {note}
                    </div>
                  )}
                </CardContent>
              </Card>
            </ViewTransitionLink>
            {showTracker && !isManual && (
              <div className="mt-2 px-2">
                <HoleByHoleTracker match={match} format={format} teamAColor={colorA} teamBColor={colorB} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
