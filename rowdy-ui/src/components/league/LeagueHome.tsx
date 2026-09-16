import { useMemo } from "react";
import { ViewTransitionLink } from "../ViewTransitionLink";
import LastUpdated from "../LastUpdated";
import { LoadingEscalation } from "../LoadingScreen";
import { HomePageSkeleton } from "../Skeleton";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { useAuth } from "../../contexts/AuthContext";
import { useLeagueSeason } from "../../hooks/useLeagueSeason";
import {
  getPlayerName as getPlayerNameFromLookup,
  getPlayerShortName as getPlayerShortNameFromLookup,
  getPlayerFirstNameLastInitial as getPlayerPublicNameFromLookup,
} from "../../utils/playerHelpers";
import { IndividualStandingsTable, TeamStandingsTable, TeamMonthGrid } from "./StandingsTables";
import { MonthMatchList } from "./MonthMatchList";
import type { RoundDoc, TournamentDoc } from "../../types";

const sectionLabel = "flex items-center gap-2 pl-2 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground";

export function roundLabel(r: RoundDoc, idx: number): string {
  return r.name?.trim() || (r.day ? `Round ${r.day}` : `Round ${idx + 1}`);
}

/**
 * The league season's home: this month's matches, the individual standings
 * with the playoff cut, the team standings, the team × month grid, and the
 * list of months. Also used for a past season on /tournament/:id.
 */
export default function LeagueHome({ tournament }: { tournament: TournamentDoc }) {
  const { user } = useAuth();
  const { loading, rounds, matchesByRound, players, leagueTeams, standings, currentRound } =
    useLeagueSeason(tournament);

  // Logged-out (public) viewers see "First L." instead of full last names.
  const nameOf = useMemo(
    () => (pid: string) => (user ? getPlayerNameFromLookup(pid, players) : getPlayerPublicNameFromLookup(pid, players)),
    [user, players]
  );
  const shortNameOf = useMemo(
    () => (pid: string) => (user ? getPlayerShortNameFromLookup(pid, players) : getPlayerPublicNameFromLookup(pid, players)),
    [user, players]
  );

  if (loading) {
    return (
      <>
        <HomePageSkeleton />
        <LoadingEscalation />
      </>
    );
  }

  const currentIdx = currentRound ? rounds.findIndex((r) => r.id === currentRound.id) : -1;
  const currentMatches = currentRound ? matchesByRound[currentRound.id] ?? [] : [];
  const playedCount = (r: RoundDoc) => (matchesByRound[r.id] ?? []).filter((m) => m.status?.closed === true).length;

  return (
    <div className="space-y-6 px-4 py-6">
      {currentRound && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className={sectionLabel}>This month</div>
            <ViewTransitionLink
              to={`/round/${currentRound.id}`}
              className="text-[0.6rem] font-semibold uppercase tracking-wider text-primary"
            >
              {roundLabel(currentRound, currentIdx)} · {playedCount(currentRound)}/{currentMatches.length} played
            </ViewTransitionLink>
          </div>
          <MonthMatchList matches={currentMatches} leagueTeams={leagueTeams} nameOf={nameOf} shortNameOf={shortNameOf} />
        </section>
      )}

      <IndividualStandingsTable standings={standings} leagueTeams={leagueTeams} nameOf={nameOf} />
      <TeamStandingsTable standings={standings} leagueTeams={leagueTeams} nameOf={nameOf} />
      <TeamMonthGrid standings={standings} leagueTeams={leagueTeams} rounds={rounds} />

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className={sectionLabel}>Season</div>
        </div>
        <div className="space-y-2">
          {rounds.map((r, idx) => {
            const total = (matchesByRound[r.id] ?? []).length;
            const played = playedCount(r);
            const bonus = standings.bonusByRound[r.id];
            const bonusTeam = bonus?.teamId ? leagueTeams.find((t) => t.id === bonus.teamId) : null;
            return (
              <ViewTransitionLink key={r.id} to={`/round/${r.id}`} className="card-link-hover block">
                <Card className={r.id === currentRound?.id ? "border-primary/40 bg-card/90" : "border-border/80 bg-card/80"}>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{roundLabel(r, idx)}</div>
                      <div className="text-xs text-muted-foreground">
                        {total === 0 ? "No matches yet" : `${played}/${total} played`}
                        {bonusTeam ? ` · bonus: ${bonusTeam.name}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {r.locked && <Badge variant="muted" className="text-[0.55rem]">final</Badge>}
                      {!r.locked && total > 0 && played === total && <Badge variant="outline" className="text-[0.55rem]">complete</Badge>}
                    </div>
                  </CardContent>
                </Card>
              </ViewTransitionLink>
            );
          })}
          {rounds.length === 0 && (
            <Card className="border-border/80 bg-card/85">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">The season hasn't been scheduled yet.</CardContent>
            </Card>
          )}
        </div>
      </section>

      <div>
        <LastUpdated />
      </div>
    </div>
  );
}
