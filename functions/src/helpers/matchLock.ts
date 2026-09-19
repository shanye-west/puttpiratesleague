/**
 * Match & month locks (Putt Pirates). League months aren't played on a
 * calendar, so nothing locks on a date: a match locks itself the moment its
 * card is finished (autoLockOnFinish), and a month locks once every match in
 * it is locked. Admins can still lock/unlock by hand (setMatchLock) — both
 * paths keep the month in step through setMatchLockAndSyncRound.
 */

import { getFirestore, FieldValue, type DocumentReference } from "firebase-admin/firestore";

interface LockableMatch {
  completed?: boolean;
  manualResult?: unknown;
  status?: { closed?: boolean };
}

/**
 * The match needs no more input: closed with every hole scored
 * (computeMatchOnWrite's `completed`), or closed from an admin-entered result.
 */
export function isMatchFinished(m: LockableMatch | undefined | null): boolean {
  if (!m) return false;
  if (m.completed === true) return true;
  return !!m.manualResult && m.status?.closed === true;
}

/**
 * True only on the write where a match first becomes finished — so an admin
 * unlock afterwards (or any later write to a finished match) never re-locks it.
 */
export function justFinished(
  before: LockableMatch | undefined | null,
  after: LockableMatch | undefined | null
): boolean {
  return isMatchFinished(after) && !isMatchFinished(before);
}

/**
 * The month's lock after one of its matches is locked/unlocked, or null to
 * leave it alone. Locking the last open match locks the month; unlocking a
 * match unlocks the month only when every other match is still locked, so a
 * month an admin locked with unplayed matches in it (a deadline/forfeit)
 * doesn't reopen those matches.
 */
export function nextRoundLock(matchLocked: boolean, othersAllLocked: boolean, roundLocked: boolean): boolean | null {
  if (!othersAllLocked) return null;
  if (matchLocked && !roundLocked) return true;
  if (!matchLocked && roundLocked) return false;
  return null;
}

/**
 * Lock or unlock one match and bring its month's lock in line, atomically (two
 * matches finishing at once can't both miss that the month is done).
 * `extra` is merged into the match write (e.g. a lock timestamp).
 * Returns the month's new lock state when it changed, else null.
 */
export async function setMatchLockAndSyncRound(
  matchRef: DocumentReference,
  locked: boolean,
  extra: Record<string, unknown> = {}
): Promise<boolean | null> {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const mSnap = await tx.get(matchRef);
    if (!mSnap.exists) return null;
    const roundId = mSnap.data()?.roundId;

    const roundRef = typeof roundId === "string" && roundId ? db.collection("rounds").doc(roundId) : null;
    const [siblings, rSnap] = roundRef
      ? await Promise.all([tx.get(db.collection("matches").where("roundId", "==", roundId)), tx.get(roundRef)])
      : [null, null];

    tx.set(matchRef, { locked, ...extra }, { merge: true });

    if (!roundRef || !rSnap?.exists || !siblings) return null;
    const othersAllLocked = siblings.docs
      .filter((d) => d.id !== matchRef.id)
      .every((d) => d.data().locked === true);
    const next = nextRoundLock(locked, othersAllLocked, rSnap.data()?.locked === true);
    if (next === null) return null;
    tx.set(roundRef, { locked: next, _lockSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
}
