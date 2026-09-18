/**
 * Server copy of the Putt Pirates league standings (rowdy-ui/src/utils/leagueStandings.ts),
 * so league bets (playoffs, final points, month team battles) settle on exactly
 * the numbers the app's standings page shows — including priorStandings, the
 * monthly bonus and its captain card-off.
 *
 * Only this header differs from the client file: the client imports its
 * MatchDoc/RoundDoc types, while functions has no such types, so the minimal
 * shapes the logic reads are declared here. Edit the client file, then copy the
 * part below the marker; leagueStandings.test.ts fails if the two drift.
 */

import type { LeagueTeam, PriorStandings } from "../types.js";

type MatchSide = { playerId: string; strokesReceived?: number[] };
/** The fields of a match doc the standings read. */
export type MatchDoc = {
  id?: string;
  teamAPlayers?: MatchSide[];
  teamBPlayers?: MatchSide[];
  result?: { winner?: "teamA" | "teamB" | "AS" | null } | null;
  status?: { closed?: boolean; thru?: number } | null;
  manualResult?: unknown;
  holes?: Record<string, { input?: unknown } | undefined>;
};
/** The fields of a round (month) doc the standings read. */
export type RoundDoc = {
  id: string;
  day?: number;
  pointsValue?: number;
  bonusTeamId?: string | null;
};

// ---- Everything below is mirrored verbatim in functions/src/helpers/leagueStandings.ts
// ---- (league bets settle from it); functions/src/helpers/leagueStandings.test.ts fails on drift.

export interface IndividualRow {
  playerId: string;
  teamId: string | null;
  mp: number;
  w: number;
  l: number;
  t: number;
  points: number;
  /** points + points from in-progress matches as they stand right now */
  projectedPoints: number;
  rank: number;
  /** In the top 4, counting ties for 4th. */
  inPlayoffCut: boolean;
}

export interface TeamRow {
  teamId: string;
  mp: number;
  w: number;
  l: number;
  t: number;
  extra: number;
  points: number;
  projectedPoints: number;
  rank: number;
}

export type BonusReason = "override" | "outright" | "captainNet" | "pendingMatches" | "captainNetUnavailable" | "noMatches";

export interface MonthBonus {
  teamId: string | null;
  pending: boolean;
  reason: BonusReason;
  /** Team leading the month right now (for a pending month's display). */
  leaderId: string | null;
}

export interface GridCell {
  /** Members' match points (closed matches only). */
  points: number;
  projectedPoints: number;
  bonus: boolean;
  bonusPending: boolean;
}

export interface LeagueStandings {
  individual: IndividualRow[];
  teams: TeamRow[];
  /** teamId → roundId → cell */
  grid: Record<string, Record<string, GridCell>>;
  bonusByRound: Record<string, MonthBonus>;
}

export interface StandingsInput {
  rounds: RoundDoc[];
  matchesByRound: Record<string, MatchDoc[]>;
  leagueTeams: LeagueTeam[];
  /** playerId → display name (for the name tiebreak / stable ordering). */
  names?: Record<string, string>;
  /** Standings carried in from before the app. */
  prior?: PriorStandings | null;
}

const PLAYOFF_SPOTS = 4;

function sideIds(m: MatchDoc): { a: string | null; b: string | null } {
  return {
    a: m.teamAPlayers?.[0]?.playerId || null,
    b: m.teamBPlayers?.[0]?.playerId || null,
  };
}

/** Points each side earns from a match's current result (closed or projected). */
function sidePoints(m: MatchDoc, pv: number): { a: number; b: number } {
  const w = m.result?.winner;
  return {
    a: w === "teamA" ? pv : w === "AS" ? pv / 2 : 0,
    b: w === "teamB" ? pv : w === "AS" ? pv / 2 : 0,
  };
}

const isClosed = (m: MatchDoc) => m.status?.closed === true;
const isStarted = (m: MatchDoc) => !isClosed(m) && (m.status?.thru ?? 0) > 0;

/**
 * A player's net total for a completed 18-hole card, or null when any hole is
 * missing / the match has no card (result-only). Net = Σ (gross − strokes).
 */
export function captainNet(match: MatchDoc, playerId: string): number | null {
  if (match.manualResult && Object.keys(match.holes ?? {}).length === 0) return null;
  const { a, b } = sideIds(match);
  const side = a === playerId ? "A" : b === playerId ? "B" : null;
  if (!side) return null;
  const strokes = (side === "A" ? match.teamAPlayers?.[0] : match.teamBPlayers?.[0])?.strokesReceived ?? [];
  let net = 0;
  for (let h = 1; h <= 18; h++) {
    const input = match.holes?.[String(h)]?.input as Record<string, unknown> | undefined;
    const gross = side === "A" ? input?.teamAPlayerGross : input?.teamBPlayerGross;
    if (typeof gross !== "number" || !Number.isFinite(gross) || gross <= 0) return null;
    net += gross - (Number(strokes[h - 1]) === 1 ? 1 : 0);
  }
  return net;
}

/** Which league team, if any, earns the month's extra point. */
export function monthBonus(
  round: RoundDoc,
  matches: MatchDoc[],
  leagueTeams: LeagueTeam[],
  teamOf: Record<string, string>,
  prior?: PriorStandings | null
): MonthBonus {
  const pv = round.pointsValue ?? 1;
  const closedPts: Record<string, number> = {};
  const livePts: Record<string, number> = {};
  let anyMatch = false;
  let allClosed = true;
  for (const t of leagueTeams) {
    const carried = prior?.teams?.[t.id]?.[round.id];
    closedPts[t.id] = carried?.points ?? 0;
    livePts[t.id] = carried?.points ?? 0;
    if (carried) anyMatch = true;
    // The league already awarded this month's bonus before the app.
    if (carried?.bonus) return { teamId: t.id, pending: false, reason: "override", leaderId: t.id };
  }

  for (const m of matches) {
    const { a, b } = sideIds(m);
    if (!a || !b) continue;
    anyMatch = true;
    const closed = isClosed(m);
    if (!closed) allClosed = false;
    if (!closed && !isStarted(m)) continue;
    const pts = sidePoints(m, pv);
    const ta = teamOf[a]; const tb = teamOf[b];
    if (ta) { livePts[ta] = (livePts[ta] ?? 0) + pts.a; if (closed) closedPts[ta] = (closedPts[ta] ?? 0) + pts.a; }
    if (tb) { livePts[tb] = (livePts[tb] ?? 0) + pts.b; if (closed) closedPts[tb] = (closedPts[tb] ?? 0) + pts.b; }
  }

  const leaders = (pts: Record<string, number>): string[] => {
    const max = Math.max(...leagueTeams.map((t) => pts[t.id] ?? 0));
    return leagueTeams.filter((t) => (pts[t.id] ?? 0) === max).map((t) => t.id);
  };
  const liveLeaders = leaders(livePts);
  const leaderId = liveLeaders.length === 1 ? liveLeaders[0] : null;

  if (round.bonusTeamId && leagueTeams.some((t) => t.id === round.bonusTeamId)) {
    return { teamId: round.bonusTeamId, pending: false, reason: "override", leaderId };
  }
  if (!anyMatch) return { teamId: null, pending: false, reason: "noMatches", leaderId: null };
  if (!allClosed) return { teamId: null, pending: true, reason: "pendingMatches", leaderId };

  const tied = leaders(closedPts);
  if (tied.length === 1) return { teamId: tied[0], pending: false, reason: "outright", leaderId };

  // Card-off between the tied captains: lowest net that month wins.
  const nets: { teamId: string; net: number }[] = [];
  for (const teamId of tied) {
    const team = leagueTeams.find((t) => t.id === teamId)!;
    const captainMatch = matches.find((m) => {
      const { a, b } = sideIds(m);
      return a === team.captainId || b === team.captainId;
    });
    const net = captainMatch ? captainNet(captainMatch, team.captainId) : null;
    if (net === null) return { teamId: null, pending: true, reason: "captainNetUnavailable", leaderId };
    nets.push({ teamId, net });
  }
  const best = Math.min(...nets.map((n) => n.net));
  const winners = nets.filter((n) => n.net === best);
  if (winners.length !== 1) return { teamId: null, pending: true, reason: "captainNetUnavailable", leaderId };
  return { teamId: winners[0].teamId, pending: false, reason: "captainNet", leaderId };
}

export function computeLeagueStandings(input: StandingsInput): LeagueStandings {
  const { rounds, matchesByRound, leagueTeams, names = {}, prior = null } = input;
  const teamOf: Record<string, string> = {};
  for (const t of leagueTeams) for (const pid of t.playerIds ?? []) teamOf[pid] = t.id;

  const rows: Record<string, IndividualRow> = {};
  const ensure = (pid: string): IndividualRow =>
    (rows[pid] ??= {
      playerId: pid, teamId: teamOf[pid] ?? null,
      mp: 0, w: 0, l: 0, t: 0, points: 0, projectedPoints: 0, rank: 0, inPlayoffCut: false,
    });
  // Every rostered player appears even before they've played.
  for (const pid of Object.keys(teamOf)) ensure(pid);
  // Carried-in records: points = wins + half a point per halve.
  for (const [pid, rec] of Object.entries(prior?.players ?? {})) {
    const row = ensure(pid);
    row.mp += rec.mp; row.w += rec.w; row.l += rec.l; row.t += rec.t;
    const pts = rec.w + rec.t / 2;
    row.points += pts; row.projectedPoints += pts;
  }

  const grid: Record<string, Record<string, GridCell>> = {};
  const bonusByRound: Record<string, MonthBonus> = {};
  const teamPts: Record<string, { points: number; projected: number; extra: number }> = {};
  for (const t of leagueTeams) {
    grid[t.id] = {};
    teamPts[t.id] = { points: 0, projected: 0, extra: 0 };
  }

  const sorted = [...rounds].sort((a, b) => (a.day ?? 0) - (b.day ?? 0) || a.id.localeCompare(b.id));
  for (const round of sorted) {
    const pv = round.pointsValue ?? 1;
    const matches = matchesByRound[round.id] ?? [];
    const cellPts: Record<string, { points: number; projected: number }> = {};
    for (const t of leagueTeams) {
      const carried = prior?.teams?.[t.id]?.[round.id]?.points ?? 0;
      cellPts[t.id] = { points: carried, projected: carried };
    }

    for (const m of matches) {
      const { a, b } = sideIds(m);
      if (!a || !b) continue;
      const closed = isClosed(m);
      const started = isStarted(m);
      if (!closed && !started) continue;
      const pts = sidePoints(m, pv);
      const w = m.result?.winner;

      const apply = (pid: string, mine: number, won: boolean, lost: boolean) => {
        const row = ensure(pid);
        row.projectedPoints += mine;
        if (closed) {
          row.mp += 1;
          row.points += mine;
          if (won) row.w += 1; else if (lost) row.l += 1; else row.t += 1;
        }
        const teamId = teamOf[pid];
        if (teamId) {
          cellPts[teamId].projected += mine;
          if (closed) cellPts[teamId].points += mine;
        }
      };
      apply(a, pts.a, w === "teamA", w === "teamB");
      apply(b, pts.b, w === "teamB", w === "teamA");
    }

    const bonus = monthBonus(round, matches, leagueTeams, teamOf, prior);
    bonusByRound[round.id] = bonus;
    for (const t of leagueTeams) {
      const c = cellPts[t.id];
      const isBonus = bonus.teamId === t.id;
      grid[t.id][round.id] = {
        points: c.points,
        projectedPoints: c.projected,
        bonus: isBonus,
        bonusPending: bonus.pending && bonus.leaderId === t.id,
      };
      teamPts[t.id].points += c.points;
      teamPts[t.id].projected += c.projected;
      if (isBonus) teamPts[t.id].extra += 1;
    }
  }

  const nameOf = (pid: string) => names[pid] ?? pid;
  const individual = Object.values(rows).sort(
    (x, y) => y.points - x.points || y.w - x.w || x.l - y.l || nameOf(x.playerId).localeCompare(nameOf(y.playerId))
  );
  individual.forEach((r, i) => { r.rank = i + 1; });
  const cutPoints = individual[PLAYOFF_SPOTS - 1]?.points;
  for (const r of individual) {
    r.inPlayoffCut = r.rank <= PLAYOFF_SPOTS || (cutPoints !== undefined && r.points === cutPoints && r.points > 0);
  }
  // Nobody has played yet → no cut line.
  if (individual.every((r) => r.mp === 0)) for (const r of individual) r.inPlayoffCut = false;

  const rankOfCaptain = (t: LeagueTeam) => individual.find((r) => r.playerId === t.captainId)?.rank ?? Number.MAX_SAFE_INTEGER;
  const teams: TeamRow[] = leagueTeams.map((t) => {
    let mp = 0, w = 0, l = 0, tt = 0;
    for (const pid of t.playerIds ?? []) {
      const r = rows[pid];
      if (!r) continue;
      mp += r.mp; w += r.w; l += r.l; tt += r.t;
    }
    const p = teamPts[t.id];
    return {
      teamId: t.id, mp, w, l, t: tt, extra: p.extra,
      points: p.points + p.extra,
      projectedPoints: p.projected + p.extra,
      rank: 0,
    };
  });
  teams.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    const tx = leagueTeams.find((t) => t.id === x.teamId)!;
    const ty = leagueTeams.find((t) => t.id === y.teamId)!;
    return rankOfCaptain(tx) - rankOfCaptain(ty);
  });
  teams.forEach((r, i) => { r.rank = i + 1; });

  return { individual, teams, grid, bonusByRound };
}

/** "4 + 1" style cell label; blank for an unplayed month. */
export function formatGridCell(cell: GridCell | undefined): string {
  if (!cell) return "";
  const base = cell.points === 0 && cell.projectedPoints === 0 ? "" : fmtPts(cell.points);
  if (cell.bonus) return `${base || "0"} + 1`;
  return base;
}

export function fmtPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
