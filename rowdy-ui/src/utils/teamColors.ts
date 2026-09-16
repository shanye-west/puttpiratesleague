export type SeriesKey = "puttPirates" | string;
export type TeamKey = "teamA" | "teamB";

// Default side colors when a tournament doesn't set its own. Only one series
// exists today; the map stays keyed by series so another could be added.
const DEFAULT_COLORS: Record<string, Record<TeamKey, string>> = {
  puttPirates: { teamA: "#0b3d3a", teamB: "#c9a227" },
};
const DEFAULT_SERIES = "puttPirates";

function isTruthyColor(v?: string | null): v is string {
  return !!v && String(v).trim().length > 0;
}

export function getTeamColor(series: SeriesKey | undefined, team: TeamKey, override?: string | null): string {
  if (isTruthyColor(override)) return String(override).trim();
  const key = series && DEFAULT_COLORS[series] ? series : DEFAULT_SERIES;
  return DEFAULT_COLORS[key][team];
}

export function ensureTournamentTeamColors<T extends { series?: SeriesKey; teamA?: any; teamB?: any }>(t: T | null): T | null {
  if (!t) return t;
  const series = t.series ?? DEFAULT_SERIES;
  const teamA = { ...(t.teamA ?? {}) };
  const teamB = { ...(t.teamB ?? {}) };

  teamA.color = getTeamColor(series, "teamA", teamA.color ?? null);
  teamB.color = getTeamColor(series, "teamB", teamB.color ?? null);

  return { ...t, teamA, teamB } as T;
}

export default ensureTournamentTeamColors;
