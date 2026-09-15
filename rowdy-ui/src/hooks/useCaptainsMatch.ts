import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { CaptainsMatchDoc, PlayerDoc, TournamentDoc } from "../types";
import { useTournamentContextOptional, usePlayers } from "../contexts/TournamentContext";
import { getDocCacheFirst } from "../utils/firestoreReads";
import { ensureTournamentTeamColors } from "../utils/teamColors";
import { summarizeCaptainsMatch, type CaptainsMatchSummary } from "../utils/captainsMatchScoring";
import { useResolvedLoading } from "./useResolvedLoading";

interface UseCaptainsMatchResult {
  loading: boolean;
  error: string | null;
  match: CaptainsMatchDoc | null;
  /** The whole season, played out from the cards; null until the doc loads. */
  summary: CaptainsMatchSummary | null;
  tournament: TournamentDoc | null;
  players: Record<string, PlayerDoc>;
}

/**
 * A tournament's captains' match (captainsMatches/{tournamentId}) — the
 * pre-draft running singles match between the two captains.
 *
 * One listener on one doc: every round's card lives inside it, so the season's
 * status, flow graph and round list cost a single read. The summary is derived
 * client-side by utils/captainsMatchScoring; nothing is computed server-side.
 */
export function useCaptainsMatch(tournamentId: string | undefined): UseCaptainsMatchResult {
  const [match, setMatch] = useState<CaptainsMatchDoc | null>(null);
  const [matchLoaded, setMatchLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localTournament, setLocalTournament] = useState<TournamentDoc | null>(null);
  const tournamentContext = useTournamentContextOptional();

  // 1) The match doc
  useEffect(() => {
    if (!tournamentId) {
      setMatch(null);
      setMatchLoaded(true);
      return;
    }
    setMatchLoaded(false);
    setError(null);
    const unsub = onSnapshot(
      doc(db, "captainsMatches", tournamentId),
      (snap) => {
        setMatch(snap.exists() ? ({ id: snap.id, ...snap.data() } as CaptainsMatchDoc) : null);
        setMatchLoaded(true);
      },
      (err) => {
        console.error("Captains' match subscription error:", err);
        setError("Unable to load the captains' match.");
        setMatchLoaded(true);
      }
    );
    return () => unsub();
  }, [tournamentId]);

  // 2) Tournament (colors, series, logo) — reuse the shared context whenever it
  //    already has it, same cascade as useSideEvent. Depends on the context's
  //    pieces rather than the whole value, which changes every time the player
  //    cache fills and would otherwise restart an in-flight fetch.
  const contextTournament = tournamentContext?.tournament ?? null;
  const getTournamentById = tournamentContext?.getTournamentById;
  const addTournament = tournamentContext?.addTournament;
  useEffect(() => {
    if (!tournamentId) {
      setLocalTournament(null);
      return;
    }
    if (contextTournament?.id === tournamentId) {
      setLocalTournament(contextTournament);
      return;
    }
    const cached = getTournamentById?.(tournamentId);
    if (cached) {
      setLocalTournament(cached);
      return;
    }
    let cancelled = false;
    getDocCacheFirst(doc(db, "tournaments", tournamentId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const t = ensureTournamentTeamColors({ id: snap.id, ...snap.data() } as TournamentDoc);
        if (!t) return;
        setLocalTournament(t);
        addTournament?.(t);
      })
      .catch((err) => console.error("Tournament fetch error:", err));
    return () => {
      cancelled = true;
    };
  }, [tournamentId, contextTournament, getTournamentById, addTournament]);

  // 3) The two players' names — usually already warm in the shared cache.
  const playerAId = match?.playerAId;
  const playerBId = match?.playerBId;
  const playerIds = useMemo(
    () => [playerAId, playerBId].filter((id): id is string => !!id),
    [playerAId, playerBId]
  );
  const { players, loaded: playersLoaded } = usePlayers(playerIds);

  const summary = useMemo(() => (match ? summarizeCaptainsMatch(match) : null), [match]);

  const rawLoading = !matchLoaded || (match !== null && !playersLoaded);
  // Once the match doc is in hand, don't let a wedged player read spin forever.
  const loading = useResolvedLoading(rawLoading, match !== null);

  const tournament = contextTournament?.id === tournamentId ? contextTournament : localTournament;

  return { loading, error, match, summary, tournament, players };
}
