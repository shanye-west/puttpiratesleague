import { leagueTeamColor } from "../../utils/leagueTeams";
import { fmtPts, type LeagueStandings } from "../../utils/leagueStandings";
import type { LeagueTeam } from "../../types";

/** The month's bonus point, in words ("" while it's still open with nothing to say). */
function monthBonusLabel(standings: LeagueStandings, leagueTeams: LeagueTeam[], roundId: string): string {
  const info = standings.bonusByRound[roundId];
  if (info?.teamId) return `Bonus: ${leagueTeams.find((t) => t.id === info.teamId)?.name ?? ""}`;
  if (info?.pending) return info.reason === "captainNetUnavailable" ? "Bonus: captains' card-off TBD" : "Bonus: pending";
  return "";
}

/**
 * One month's team battle: each league team's points that month (+1 for the
 * bonus, in-progress matches as a projected "(+n)"), leaders first. `standings`
 * may cover the whole season or just this month — only this month's grid
 * column is read.
 */
export function MonthTeamPoints({
  standings,
  leagueTeams,
  roundId,
}: {
  standings: LeagueStandings;
  leagueTeams: LeagueTeam[];
  roundId: string;
}) {
  const cells = leagueTeams
    .map((team) => ({ team, cell: standings.grid[team.id]?.[roundId] }))
    .sort((a, z) => {
      const total = (x: typeof a) => (x.cell?.points ?? 0) + (x.cell?.bonus ? 1 : 0);
      return total(z) - total(a) || (z.cell?.projectedPoints ?? 0) - (a.cell?.projectedPoints ?? 0);
    });
  const bonusLabel = monthBonusLabel(standings, leagueTeams, roundId);
  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Team points this month</span>
        <span className="truncate">{bonusLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map(({ team, cell }) => {
          const color = leagueTeamColor(team, leagueTeams);
          const projected = (cell?.projectedPoints ?? 0) - (cell?.points ?? 0);
          return (
            <div key={team.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate">{team.name}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums" style={{ color }}>
                {fmtPts(cell?.points ?? 0)}{cell?.bonus ? " + 1" : ""}
                {projected > 0 && <span className="ml-1 text-[0.6rem] font-semibold text-muted-foreground">(+{fmtPts(projected)})</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
