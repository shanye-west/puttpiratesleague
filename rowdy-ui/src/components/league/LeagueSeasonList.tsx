import { Users } from "lucide-react";
import { ViewTransitionLink } from "../ViewTransitionLink";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import type { LeagueSeason } from "../../hooks/useLeagueSeason";
import type { RoundDoc, TournamentDoc } from "../../types";

const sectionLabel = "flex items-center gap-2 pl-2 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground";

const label = (r: RoundDoc, idx: number) => r.name?.trim() || (r.day ? `Round ${r.day}` : `Round ${idx + 1}`);

/** The season calendar: one row per month → that month's page. */
export function LeagueSeasonList({ season, tournament }: { season: LeagueSeason; tournament: TournamentDoc }) {
  const { rounds, matchesByRound, leagueTeams, standings, currentRound } = season;
  const played = (r: RoundDoc) => (matchesByRound[r.id] ?? []).filter((m) => m.status?.closed === true).length;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className={sectionLabel}>Season</div>
        <Button asChild variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs">
          <ViewTransitionLink to="/teams">
            <Users className="h-3.5 w-3.5" />
            Team rosters
          </ViewTransitionLink>
        </Button>
      </div>
      <div className="space-y-2">
        {rounds.map((r, idx) => {
          const total = (matchesByRound[r.id] ?? []).length;
          const done = played(r);
          const bonus = standings.bonusByRound[r.id];
          const bonusTeam = bonus?.teamId ? leagueTeams.find((t) => t.id === bonus.teamId) : null;
          const carriedIn = !!tournament.priorStandings && leagueTeams.some((t) => tournament.priorStandings!.teams?.[t.id]?.[r.id]);
          const isCurrent = r.id === currentRound?.id;
          return (
            <ViewTransitionLink key={r.id} to={`/round/${r.id}`} className="card-link-hover block">
              <Card className={isCurrent ? "border-primary/40 bg-card/90" : "border-border/80 bg-card/80"}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{label(r, idx)}</div>
                    <div className="text-xs text-muted-foreground">
                      {total === 0
                        ? carriedIn ? "Scored before the app" : "No matches yet"
                        : `${done}/${total} played${carriedIn ? " · earlier results carried in" : ""}`}
                      {bonusTeam ? ` · bonus: ${bonusTeam.name}` : bonus?.pending && bonus.reason === "captainNetUnavailable" ? " · bonus TBD" : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.locked && <Badge variant="muted" className="text-[0.55rem]">final</Badge>}
                    {!r.locked && total > 0 && done === total && <Badge variant="outline" className="text-[0.55rem]">complete</Badge>}
                    {isCurrent && !r.locked && <Badge variant="outline" className="text-[0.55rem]">now</Badge>}
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
  );
}
