import { memo } from "react";
import { ViewTransitionLink } from "../ViewTransitionLink";
import PlayerAvatar from "../PlayerAvatar";
import { Card, CardContent } from "../ui/card";
import { cn } from "../../lib/utils";
import { fmtPts, formatGridCell, type LeagueStandings } from "../../utils/leagueStandings";
import { leagueTeamColor } from "../../utils/leagueTeams";
import type { LeagueTeam, RoundDoc } from "../../types";

const sectionLabel = "flex items-center gap-2 pl-2 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground";
const th = "px-2 py-2 text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground";
const numTh = cn(th, "text-center");

interface IndividualProps {
  standings: LeagueStandings;
  leagueTeams: LeagueTeam[];
  nameOf: (pid: string) => string;
  /** Rows to show before "Show all" (undefined = all). */
  limit?: number;
}

/** PLAYERS / MP / W / L / T / POINTS with the playoff cut line (top 4 + ties). */
export const IndividualStandingsTable = memo(function IndividualStandingsTable({
  standings,
  leagueTeams,
  nameOf,
  limit,
}: IndividualProps) {
  const rows = limit ? standings.individual.slice(0, limit) : standings.individual;
  const cutIndex = standings.individual.findIndex((r) => !r.inPlayoffCut);
  const teamById = Object.fromEntries(leagueTeams.map((t) => [t.id, t]));
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className={sectionLabel}>Standings</div>
        <span className="text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">
          Top 4 make the playoffs
        </span>
      </div>
      <Card className="overflow-hidden border-border/80 bg-card/85">
        <CardContent className="p-0">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className={cn(th, "w-8 text-center")}>#</th>
                <th className={cn(th, "text-left")}>Player</th>
                <th className={numTh}>MP</th>
                <th className={numTh}>W</th>
                <th className={numTh}>L</th>
                <th className={numTh}>T</th>
                <th className={cn(numTh, "pr-3")}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const team = r.teamId ? teamById[r.teamId] : null;
                const color = leagueTeamColor(team, leagueTeams);
                const projected = r.projectedPoints - r.points;
                const isCutLine = cutIndex > 0 && i === cutIndex;
                return (
                  <tr
                    key={r.playerId}
                    className={cn(
                      "border-t border-border/60",
                      r.inPlayoffCut && "bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)]",
                      isCutLine && "border-t-2 border-t-[var(--brand-secondary)]"
                    )}
                  >
                    <td className="py-2 text-center text-xs font-semibold text-muted-foreground">{r.rank}</td>
                    <td className="py-2 pr-2">
                      <ViewTransitionLink to={`/player/${r.playerId}`} className="flex min-w-0 items-center gap-2">
                        <PlayerAvatar name={nameOf(r.playerId)} playerId={r.playerId} color={color} size={24} />
                        <span className="min-w-0 truncate font-semibold text-foreground">{nameOf(r.playerId)}</span>
                      </ViewTransitionLink>
                    </td>
                    <td className="py-2 text-center tabular-nums">{r.mp}</td>
                    <td className="py-2 text-center tabular-nums">{r.w}</td>
                    <td className="py-2 text-center tabular-nums">{r.l}</td>
                    <td className="py-2 text-center tabular-nums">{r.t}</td>
                    <td className="py-2 pr-3 text-center font-bold tabular-nums">
                      {fmtPts(r.points)}
                      {projected > 0 && (
                        <span className="ml-1 text-[0.6rem] font-semibold text-muted-foreground">(+{fmtPts(projected)})</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">No players yet.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
});

interface TeamProps {
  standings: LeagueStandings;
  leagueTeams: LeagueTeam[];
  nameOf: (pid: string) => string;
}

/** TEAMS / MP / W / L / T / EXTRA / POINTS. */
export const TeamStandingsTable = memo(function TeamStandingsTable({ standings, leagueTeams, nameOf }: TeamProps) {
  const teamById = Object.fromEntries(leagueTeams.map((t) => [t.id, t]));
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className={sectionLabel}>Team play</div>
        <ViewTransitionLink to="/teams" className="text-[0.6rem] font-semibold uppercase tracking-wider text-primary">
          Rosters
        </ViewTransitionLink>
      </div>
      <Card className="overflow-hidden border-border/80 bg-card/85">
        <CardContent className="p-0">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className={cn(th, "text-left")}>Team</th>
                <th className={numTh}>MP</th>
                <th className={numTh}>W</th>
                <th className={numTh}>L</th>
                <th className={numTh}>T</th>
                <th className={numTh}>Extra</th>
                <th className={cn(numTh, "pr-3")}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.teams.map((r) => {
                const team = teamById[r.teamId];
                const color = leagueTeamColor(team, leagueTeams);
                const projected = r.projectedPoints - r.points;
                return (
                  <tr key={r.teamId} className="border-t border-border/60">
                    <td className="py-2 pl-2 pr-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">{team?.name ?? r.teamId}</div>
                          {team?.captainId && (
                            <div className="truncate text-[0.65rem] text-muted-foreground">({nameOf(team.captainId)})</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 text-center tabular-nums">{r.mp}</td>
                    <td className="py-2 text-center tabular-nums">{r.w}</td>
                    <td className="py-2 text-center tabular-nums">{r.l}</td>
                    <td className="py-2 text-center tabular-nums">{r.t}</td>
                    <td className="py-2 text-center tabular-nums">{r.extra}</td>
                    <td className="py-2 pr-3 text-center font-bold tabular-nums">
                      {fmtPts(r.points)}
                      {projected > 0 && (
                        <span className="ml-1 text-[0.6rem] font-semibold text-muted-foreground">(+{fmtPts(projected)})</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
});

interface GridProps {
  standings: LeagueStandings;
  leagueTeams: LeagueTeam[];
  rounds: RoundDoc[];
}

/** Team × month grid ("4 + 1" = 4 match points plus the monthly bonus). */
export const TeamMonthGrid = memo(function TeamMonthGrid({ standings, leagueTeams, rounds }: GridProps) {
  if (rounds.length === 0) return null;
  const monthLabel = (r: RoundDoc, i: number) => (r.name ? r.name.slice(0, 3) : `R${r.day ?? i + 1}`);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className={sectionLabel}>Month by month</div>
        <span className="text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">+1 = bonus point</span>
      </div>
      <Card className="overflow-hidden border-border/80 bg-card/85">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <th className={cn(th, "sticky left-0 z-10 bg-muted text-left")}>Team</th>
                  {rounds.map((r, i) => {
                    const bonus = standings.bonusByRound[r.id];
                    return (
                      <th key={r.id} className={cn(numTh, "min-w-[3rem]")}>
                        <ViewTransitionLink to={`/round/${r.id}`} className="hover:underline">
                          {monthLabel(r, i)}
                        </ViewTransitionLink>
                        {bonus?.pending && bonus.reason === "captainNetUnavailable" && (
                          <span className="block text-[0.5rem] normal-case tracking-normal text-amber-600">bonus TBD</span>
                        )}
                      </th>
                    );
                  })}
                  <th className={cn(numTh, "pr-3")}>Total</th>
                </tr>
              </thead>
              <tbody>
                {standings.teams.map((row) => {
                  const team = leagueTeams.find((t) => t.id === row.teamId);
                  const color = leagueTeamColor(team, leagueTeams);
                  return (
                    <tr key={row.teamId} className="border-t border-border/60">
                      <td className="sticky left-0 z-10 bg-card py-2 pl-2 pr-3 font-semibold text-foreground">
                        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: color }} />
                        {team?.name ?? row.teamId}
                      </td>
                      {rounds.map((r) => {
                        const cell = standings.grid[row.teamId]?.[r.id];
                        const pendingLead = cell?.bonusPending;
                        return (
                          <td
                            key={r.id}
                            className={cn(
                              "py-2 text-center tabular-nums",
                              cell?.bonus && "font-bold text-foreground",
                              r.locked === false && cell && cell.projectedPoints > cell.points && "text-muted-foreground"
                            )}
                          >
                            {formatGridCell(cell) || (cell && cell.projectedPoints > 0 ? `(${fmtPts(cell.projectedPoints)})` : "")}
                            {pendingLead && <span className="text-amber-600"> *</span>}
                          </td>
                        );
                      })}
                      <td className="py-2 pr-3 text-center font-bold tabular-nums">{fmtPts(row.points)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
});
