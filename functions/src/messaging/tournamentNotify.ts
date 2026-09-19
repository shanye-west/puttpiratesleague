/**
 * Tournament-milestone notifications: overall team lead changes, a round going
 * final, and the champion being decided. All three share the single "tournament"
 * notification category (one player-facing toggle).
 *
 * Wired in index.ts as an onDocumentWritten("rounds/{roundId}") trigger —
 * per-round point totals are written there by computeRoundTotals, so this reacts
 * to that write-back rather than to raw match keystrokes. Standings are summed
 * across every round of the tournament, mirroring the frontend
 * (useTournamentData + getTournamentWinner) so copy matches what players see.
 *
 * Idempotency/state lives in tournamentNotifyState/{tournamentId} (off the
 * tournament doc, so clients subscribed to the tournament aren't churned and no
 * other trigger is re-fired).
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { notify, type NotifyPayload } from "./notify.js";
import { loadTournamentMeta } from "../helpers/roster.js";

function db() {
  return getFirestore();
}

export type RoundWriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, { roundId: string }>;

type TeamKey = "teamA" | "teamB";

/** Format a point total: whole numbers plain, halves with one decimal ("3", "3.5"). */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function teamLabel(team: TeamKey, teamAName: string, teamBName: string): string {
  return team === "teamA" ? teamAName : teamBName;
}

/**
 * Server-side mirror of rowdy-ui/src/utils.ts `getTournamentWinner`: a champion
 * exists when a team has clinched on confirmed points (a majority the other can
 * no longer catch) or the admin set a tiebreaker winner. Keep in sync with the
 * frontend so the banner and this notification agree on "who won".
 */
function getTournamentWinner(
  tiebreakerWinner: TeamKey | undefined,
  teamAConfirmed: number,
  teamBConfirmed: number,
  totalPointsAvailable: number
): TeamKey | null {
  if (tiebreakerWinner === "teamA" || tiebreakerWinner === "teamB") return tiebreakerWinner;
  if (totalPointsAvailable > 0) {
    const pointsToWin = totalPointsAvailable / 2 + 0.5;
    if (teamAConfirmed >= pointsToWin) return "teamA";
    if (teamBConfirmed >= pointsToWin) return "teamB";
  }
  return null;
}

interface PointTotalsLike {
  teamAConfirmed?: number;
  teamBConfirmed?: number;
  teamAPending?: number;
  teamBPending?: number;
  matchCount?: number;
}

/**
 * Pure: could this pointTotals change have altered which matches are closed?
 * Every closed match contributes exactly its pointsValue to the combined
 * confirmed total (a win all to one side, a halve split), so that sum moves
 * precisely when a match closes or reopens; matchCount covers a match being
 * added or removed. Lead flips in open matches only move the pending totals.
 * The authoritative check (isRoundComplete) still runs whenever this is true.
 */
export function closedSetMayHaveChanged(
  before: PointTotalsLike | undefined,
  after: PointTotalsLike | undefined
): boolean {
  if (!before || !after) return true;
  const confirmed = (pt: PointTotalsLike) => (pt.teamAConfirmed ?? 0) + (pt.teamBConfirmed ?? 0);
  return confirmed(before) !== confirmed(after) || (before.matchCount ?? 0) !== (after.matchCount ?? 0);
}

/** A round is final once every one of its matches is closed. */
async function isRoundComplete(roundId: string): Promise<boolean> {
  const snap = await db().collection("matches").where("roundId", "==", roundId).get();
  if (snap.empty) return false;
  return snap.docs.every((d) => d.data().status?.closed === true);
}

export async function handleTournamentNotify(event: RoundWriteEvent): Promise<void> {
  const after = event.data?.after?.data();
  if (!after) return;
  const before = event.data?.before?.data();

  // Only react when this round's point totals actually changed (skip roundIds
  // links, lock toggles, seed merges — every other rounds/{id} write).
  if (before?.pointTotals?._sig === after.pointTotals?._sig) return;

  const tournamentId = after.tournamentId;
  if (!tournamentId || typeof tournamentId !== "string") return;

  const meta = await loadTournamentMeta(tournamentId);
  if (meta.playerIds.length === 0) return;
  // League season (Putt Pirates): no two-sided Cup standings to sum. The only
  // league milestone is a month going final, which can only happen when a match
  // closes (or one is removed) — so skip the lead-flip churn in pointTotals.
  if (meta.leagueMode) {
    if (!closedSetMayHaveChanged(before?.pointTotals, after.pointTotals)) return;
    await handleLeagueRoundNotify(event, meta.playerIds, after);
    return;
  }

  // Sum every round's totals for the tournament (mirror useTournamentData).
  const roundsSnap = await db().collection("rounds").where("tournamentId", "==", tournamentId).get();
  let confirmedA = 0, confirmedB = 0, pendingA = 0, pendingB = 0, computedTotal = 0;
  for (const d of roundsSnap.docs) {
    const pt = d.data().pointTotals;
    if (!pt) continue;
    confirmedA += pt.teamAConfirmed ?? 0;
    confirmedB += pt.teamBConfirmed ?? 0;
    pendingA += pt.teamAPending ?? 0;
    pendingB += pt.teamBPending ?? 0;
    computedTotal += (d.data().pointsValue ?? 1) * (pt.matchCount ?? 0);
  }

  const { teamAName, teamBName } = meta;
  const totalPointsAvailable = meta.totalPointsAvailable ?? computedTotal;

  // Live standing (confirmed + pending) drives the lead; clinch uses confirmed only.
  const liveA = confirmedA + pendingA;
  const liveB = confirmedB + pendingB;
  const liveLeader: TeamKey | null = liveA > liveB ? "teamA" : liveB > liveA ? "teamB" : null;
  const champion = getTournamentWinner(meta.tiebreakerWinner, confirmedA, confirmedB, totalPointsAvailable);

  const stateRef = db().collection("tournamentNotifyState").doc(tournamentId);
  const state = (await stateRef.get()).data() || {};
  const prevLeader: TeamKey | null = state.overallLeader ?? null;
  const roundsFinal: Record<string, boolean> = state.roundsFinal ?? {};

  const payloads: NotifyPayload[] = [];
  const nextState: Record<string, unknown> = {};

  // 1. Champion decided (once).
  if (champion && !state.championNotified) {
    payloads.push({
      category: "tournament",
      title: "🏆 Champions",
      body: `${teamLabel(champion, teamAName, teamBName)} win it all!`,
      link: "/",
    });
    nextState.championNotified = true;
  }

  // 2. Overall lead change — suppressed once a champion is crowned (the Cup's over).
  if (!champion && liveLeader && liveLeader !== prevLeader) {
    const lead = liveLeader === "teamA" ? `${fmt(liveA)}–${fmt(liveB)}` : `${fmt(liveB)}–${fmt(liveA)}`;
    payloads.push({
      category: "tournament",
      title: "Lead change",
      body: `${teamLabel(liveLeader, teamAName, teamBName)} take the lead, ${lead}`,
      link: "/",
    });
    nextState.overallLeader = liveLeader;
  }

  // 3. This round just went final (all its matches closed).
  const roundId = event.params.roundId;
  if (!roundsFinal[roundId] && (await isRoundComplete(roundId))) {
    const pt = after.pointTotals ?? {};
    const a = pt.teamAConfirmed ?? 0;
    const b = pt.teamBConfirmed ?? 0;
    const body =
      a > b
        ? `${teamAName} won the round ${fmt(a)}–${fmt(b)}`
        : b > a
          ? `${teamBName} won the round ${fmt(b)}–${fmt(a)}`
          : `Round tied ${fmt(a)}–${fmt(b)}`;
    payloads.push({ category: "tournament", title: "Round complete", body, link: `/round/${roundId}` });
    nextState.roundsFinal = { ...roundsFinal, [roundId]: true };
  }

  if (payloads.length === 0) return;

  for (const payload of payloads) {
    await notify(meta.playerIds, payload);
  }
  await stateRef.set({ ...nextState, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/**
 * League season (Putt Pirates): the two-sided Cup copy (champion / overall
 * lead change) doesn't apply — the standings are 16 individuals and 4 teams.
 * The one milestone worth a push is a month going final.
 */
async function handleLeagueRoundNotify(
  event: RoundWriteEvent,
  playerIds: string[],
  round: FirebaseFirestore.DocumentData
): Promise<void> {
  const roundId = event.params.roundId;
  const tournamentId = round.tournamentId as string;
  const stateRef = db().collection("tournamentNotifyState").doc(tournamentId);
  const state = (await stateRef.get()).data() || {};
  const roundsFinal: Record<string, boolean> = state.roundsFinal ?? {};
  if (roundsFinal[roundId]) return;
  if (!(await isRoundComplete(roundId))) return;

  const label = typeof round.name === "string" && round.name.trim() ? round.name.trim() : `Round ${round.day ?? ""}`.trim();
  const count = round.pointTotals?.matchCount ?? 0;
  await notify(playerIds, {
    category: "tournament",
    title: `${label} is in the books`,
    body: count > 0 ? `All ${count} matches are final — check the standings` : "All matches are final — check the standings",
    link: "/",
  });
  await stateRef.set(
    { roundsFinal: { ...roundsFinal, [roundId]: true }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}
