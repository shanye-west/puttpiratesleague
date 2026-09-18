/**
 * Pure rules for the league (Putt Pirates) season markets — kept free of
 * Firestore so they can be unit-tested; betsOps loads the season and applies them.
 *
 *  - playoffs:  yes/no on one player finishing in the playoff cut (top 4 + ties
 *               for 4th), from the final standings.
 *  - overUnder playerTournamentPoints (league): the player's FINAL season points,
 *               prior (pre-app) points included. Only lines strictly between what
 *               the player has banked and the most they can still reach are
 *               accepted, so no one can post a line that is already decided.
 *  - teamMonth: which of two league teams scores more in one month, counting the
 *               month's bonus point.
 */

import type { BetDoc, BetResult } from "../types.js";
import type { LeagueStandings, MatchDoc } from "./leagueStandings.js";
import { settleOverUnderBet, settleTeamMonthBet, settleYesNoBet } from "../scoring/betSettlement.js";

/** A player's season so far: banked points/wins and matches not yet closed. */
export interface PlayerSeasonState {
  points: number;
  wins: number;
  remaining: number;
}

/** Banked points/wins (standings) plus unclosed matches for one player. */
export function playerSeasonState(
  standings: LeagueStandings,
  matches: MatchDoc[],
  playerId: string
): PlayerSeasonState {
  const row = standings.individual.find((r) => r.playerId === playerId);
  const remaining = matches.filter(
    (m) =>
      m.status?.closed !== true &&
      [...(m.teamAPlayers ?? []), ...(m.teamBPlayers ?? [])].some((p) => p.playerId === playerId)
  ).length;
  return { points: row?.points ?? 0, wins: row?.w ?? 0, remaining };
}

/**
 * The final-total lines still in play: every half-point strictly between the
 * banked total and the most still reachable (banked + remaining matches).
 * Empty when the player has nothing left to play.
 */
export function livePointLines(banked: number, remaining: number): number[] {
  const lines: number[] = [];
  for (let l = banked + 0.5; l < banked + remaining; l += 0.5) lines.push(l);
  return lines;
}

export function isLivePointLine(banked: number, remaining: number, line: number): boolean {
  return Number.isInteger(line * 2) && line > banked && line < banked + remaining;
}

/** A league team's points in one month as the team battle counts them: match points + bonus. */
export function teamMonthPoints(standings: LeagueStandings, teamId: string, roundId: string): number {
  const cell = standings.grid[teamId]?.[roundId];
  if (!cell) return 0;
  return cell.points + (cell.bonus ? 1 : 0);
}

/** A month is final once every match in it is closed and its bonus is decided. */
export function isMonthFinal(standings: LeagueStandings, roundId: string, matches: MatchDoc[]): boolean {
  const bonus = standings.bonusByRound[roundId];
  if (!bonus || bonus.pending) return false;
  return matches.every((m) => m.status?.closed === true);
}

/**
 * The settlement for a league bet, or null when its market isn't final yet (or
 * the bet isn't a league market). `finalMonths` = roundIds whose month is final;
 * `seasonComplete` = every match of the season is closed.
 */
export function leagueBetResult(
  bet: BetDoc,
  standings: LeagueStandings,
  finalMonths: Set<string>,
  seasonComplete: boolean
): BetResult | null {
  if (bet.market === "teamMonth") {
    if (!bet.roundId || !finalMonths.has(bet.roundId) || !bet.leagueTeamAId || !bet.leagueTeamBId) return null;
    return settleTeamMonthBet(
      bet,
      teamMonthPoints(standings, bet.leagueTeamAId, bet.roundId),
      teamMonthPoints(standings, bet.leagueTeamBId, bet.roundId)
    );
  }
  if (!seasonComplete) return null;
  const row = standings.individual.find((r) => r.playerId === bet.subjectId);
  if (bet.market === "playoffs") return settleYesNoBet(bet, row?.inPlayoffCut === true);
  if (bet.market === "overUnder" && typeof bet.line === "number") {
    if (bet.metric === "playerTournamentPoints") return settleOverUnderBet(bet, row?.points ?? 0, bet.line);
    if (bet.metric === "playerTournamentWins") return settleOverUnderBet(bet, row?.w ?? 0, bet.line);
  }
  return null;
}
