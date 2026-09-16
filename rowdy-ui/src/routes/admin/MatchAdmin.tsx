import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { ExternalLink, Lock } from "lucide-react";
import { db } from "../../firebase";
import AdminPage, { AdminNotFound } from "../../components/admin/AdminPage";
import AdminSection from "../../components/admin/AdminSection";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import MatchForm, { type MatchFormPlayer, type MatchFormValues } from "../../components/admin/MatchForm";
import { Field, InfoNote, ToggleRow } from "../../components/admin/fields";
import { inputClass, monoInputClass } from "../../components/admin/inputStyles";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useAdminTournament } from "../../contexts/AdminTournamentContext";
import { adminApi } from "../../api/admin";
import { getErrorMessage } from "../../api/errors";
import { localInputToStored } from "../../utils/teeTime";
import { formToInput, inputToForm, type HoleFormState } from "../../utils/holeInputForm";
import { formatRoundType } from "../../utils";
import { cn } from "../../lib/utils";
import type { MatchDoc, RoundFormat } from "../../types";
import { isDriveTrackingFormat, isScrambleFormat, isSinglesFormat } from "../../types";
import MatchSetupPanel from "../../components/match/MatchSetupPanel";
import { isLeagueTournament } from "../../utils/leagueTeams";

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

/**
 * Everything for one match in context: the hole-by-hole score grid (tap a hole
 * to correct it), the lock, player/tee-time edits, stroke recalculation, and
 * deletion.
 */
export default function MatchAdmin() {
  const navigate = useNavigate();
  const { matchId = "" } = useParams<{ matchId: string }>();
  const { tournamentId, tournament, players, rounds, loading: ctxLoading } = useAdminTournament();

  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [matchLoading, setMatchLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [holeNum, setHoleNum] = useState("1");
  const [holeForm, setHoleForm] = useState<HoleFormState | null>(null);
  // League: result-only matches (played off-app)
  const [resultWinner, setResultWinner] = useState<"teamA" | "teamB" | "AS">("teamA");
  const [resultMargin, setResultMargin] = useState("1");
  const [resultThru, setResultThru] = useState("18");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const round = rounds.find((r) => r.id === match?.roundId);
  const format = (round?.format ?? "twoManBestBall") as RoundFormat;

  const loadMatch = useCallback(async () => {
    const snap = await getDoc(doc(db, "matches", matchId));
    setMatch(snap.exists() ? ({ id: snap.id, ...snap.data() } as MatchDoc) : null);
  }, [matchId]);

  useEffect(() => {
    setMatchLoading(true);
    loadMatch()
      .catch((err) => setError(getErrorMessage(err, "Failed to load match")))
      .finally(() => setMatchLoading(false));
  }, [loadMatch]);

  // Load hole inputs into the override form whenever the match/hole changes
  useEffect(() => {
    if (!match) {
      setHoleForm(null);
      return;
    }
    setHoleForm(inputToForm(match.holes?.[holeNum]?.input, format));
  }, [match, holeNum, format]);

  const playerName = useMemo(() => {
    const map: Record<string, string> = {};
    players.forEach((p) => { map[p.id] = p.displayName ?? p.id; });
    return map;
  }, [players]);

  const runAction = async (action: () => Promise<string>) => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const message = await action();
      setSuccess(message);
      await loadMatch();
    } catch (err) {
      console.error("Match admin action failed:", err);
      setError(getErrorMessage(err, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const handleEditSubmit = (values: MatchFormValues) =>
    runAction(async () => {
      if (values.teamAPlayers.length === 0 || values.teamBPlayers.length === 0) {
        throw new Error("Each team must have at least one player");
      }
      await adminApi.editMatch({
        matchId,
        tournamentId,
        roundId: match!.roundId,
        ...(values.teeTime ? { teeTime: localInputToStored(values.teeTime) } : {}),
        teamAPlayers: values.teamAPlayers.map((p) => ({ playerId: p.playerId, handicapIndex: p.handicapIndex })),
        teamBPlayers: values.teamBPlayers.map((p) => ({ playerId: p.playerId, handicapIndex: p.handicapIndex })),
      });
      return "Match updated. Strokes were recalculated.";
    });

  const handleToggleLock = (next: boolean) =>
    runAction(async () => {
      await adminApi.setMatchLock({ matchId, locked: next });
      return next ? "Match locked." : "Match unlocked.";
    });

  const handleOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holeForm) return;
    runAction(async () => {
      await adminApi.adminOverrideHoleScore({
        matchId,
        hole: Number(holeNum),
        input: formToInput(holeForm, format),
      });
      return `Hole ${holeNum} saved. Status and stats recompute automatically.`;
    });
  };

  const handleSetResult = (e: React.FormEvent) => {
    e.preventDefault();
    runAction(async () => {
      await adminApi.setMatchResult({
        matchId,
        winner: resultWinner,
        ...(resultWinner !== "AS" ? { margin: Number(resultMargin), thru: Number(resultThru) } : {}),
      });
      return "Result saved. Status, standings and stats recompute automatically.";
    });
  };

  const handleClearResult = () =>
    runAction(async () => {
      await adminApi.clearMatchResult({ matchId });
      return "Result cleared — the match is open again.";
    });

  const handleRecalcStrokes = () =>
    runAction(async () => {
      const res = await adminApi.recalculateMatchStrokes({ matchId });
      return `Strokes recalculated. Course handicaps: ${res.courseHandicaps?.join(", ")}`;
    });

  const handleDelete = async () => {
    setError(null);
    setBusy(true);
    try {
      await adminApi.deleteMatch({ matchId });
      navigate(round ? `/admin/t/${tournamentId}/round/${round.id}` : `/admin/t/${tournamentId}`, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete match"));
      setConfirmDelete(false);
      setBusy(false);
    }
  };

  const tournamentLabel = tournament ? `${tournament.year} ${tournament.name}` : "Tournament";
  const breadcrumbs = [
    { label: "Admin", to: "/admin" },
    { label: tournament?.name ?? "Tournament", to: `/admin/t/${tournamentId}` },
    ...(round ? [{ label: round.name?.trim() || `Round ${round.day ?? "?"}`, to: `/admin/t/${tournamentId}/round/${round.id}` }] : []),
    { label: `Match ${match?.matchNumber ?? ""}`.trim() },
  ];

  if (ctxLoading || matchLoading) {
    return (
      <AdminPage title="Match" breadcrumbs={breadcrumbs} loading>
        {null}
      </AdminPage>
    );
  }

  if (!match || !tournament) {
    return (
      <AdminNotFound
        title="Match"
        message={error ?? "Match not found"}
        backTo={`/admin/t/${tournamentId}`}
        backLabel="Back to tournament"
        breadcrumbs={breadcrumbs}
      />
    );
  }

  // Prefill the edit form with current players + tournament handicap indexes
  const toFormPlayers = (
    list: MatchDoc["teamAPlayers"],
    handicaps: Record<string, number> | undefined,
    offset: number
  ): MatchFormPlayer[] =>
    (list ?? []).map((p, idx) => ({
      playerId: p.playerId,
      handicapIndex: handicaps?.[p.playerId] ?? 0,
      courseHandicap: match.courseHandicaps?.[offset + idx],
    }));

  const initialTeamA = toFormPlayers(match.teamAPlayers, tournament.teamA?.handicapByPlayer, 0);
  const initialTeamB = toFormPlayers(match.teamBPlayers, tournament.teamB?.handicapByPlayer, match.teamAPlayers?.length ?? 0);

  const sideNames = (list: MatchDoc["teamAPlayers"]) =>
    (list ?? []).map((p) => playerName[p.playerId] ?? p.playerId);
  const teamANames = sideNames(match.teamAPlayers);
  const teamBNames = sideNames(match.teamBPlayers);

  /** Has this hole been scored at all? Drives the grid's filled state. */
  const holeScored = (hole: number) => {
    const f = inputToForm(match.holes?.[String(hole)]?.input, format);
    return !!(f.aGross || f.bGross || f.aGross2 || f.bGross2);
  };

  const scoredCount = HOLES.filter(holeScored).length;

  const driveSelect = (value: string, onChange: (v: string) => void, label: string, names: string[]) => (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">No drive</option>
        <option value="0">{names[0] ?? "Player 1"}</option>
        <option value="1">{names[1] ?? "Player 2"}</option>
      </select>
    </Field>
  );

  const grossInput = (value: string, onChange: (v: string) => void, label: string) => (
    <Field label={label}>
      <input
        type="number"
        min="1"
        max="30"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className={inputClass}
      />
    </Field>
  );

  const isLeague = isLeagueTournament(tournament);
  const teamALabel = isLeague ? teamANames[0] ?? "Player A" : tournament.teamA?.name || "Team A";
  const teamBLabel = isLeague ? teamBNames[0] ?? "Player B" : tournament.teamB?.name || "Team B";
  const manual = match.manualResult;

  return (
    <AdminPage
      headerTitle={tournamentLabel}
      breadcrumbs={breadcrumbs}
      eyebrow={round ? `${round.name?.trim() || `Round ${round.day}`} · ${formatRoundType(round.format)}` : tournamentLabel}
      title={`Match ${match.matchNumber ?? ""}`.trim() || "Match"}
      description={`${teamANames.join(" & ") || "TBD"} vs ${teamBNames.join(" & ") || "TBD"}`}
      badges={
        <>
          {match.locked && <Badge variant="muted"><Lock className="mr-1 h-3 w-3" />locked</Badge>}
          {match.status?.closed ? (
            <Badge variant="success">closed</Badge>
          ) : (
            <Badge variant="info">thru {match.status?.thru ?? 0}</Badge>
          )}
          {match.status?.dormie && <Badge variant="warning">dormie</Badge>}
          {manual && <Badge variant="info">result-only</Badge>}
        </>
      }
      error={error}
      success={success}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to={`/match/${match.id}`}>
            <ExternalLink className="h-4 w-4" />
            View
          </Link>
        </Button>
      }
    >
      {isLeague && (
        <AdminSection
          title="Result (played off-app)"
          description="For a match with no card: record the outcome directly. Standings, points and bet settlement follow. Not allowed once any hole is scored."
        >
          {manual ? (
            <div className="space-y-3">
              <InfoNote>
                Recorded as{" "}
                <strong>
                  {manual.winner === "AS"
                    ? "halved"
                    : `${manual.winner === "teamA" ? teamALabel : teamBLabel} won ${manual.margin ?? 1}${(manual.thru ?? 18) < 18 ? `&${18 - (manual.thru ?? 18)}` : " up"}`}
                </strong>
                .
              </InfoNote>
              <Button type="button" variant="outline" onClick={handleClearResult} disabled={busy}>
                {busy ? "Working…" : "Clear result"}
              </Button>
            </div>
          ) : scoredCount > 0 ? (
            <p className="text-sm text-muted-foreground">This match has hole scores — its result comes from the card.</p>
          ) : (
            <form onSubmit={handleSetResult} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Winner">
                  <select value={resultWinner} onChange={(e) => setResultWinner(e.target.value as "teamA" | "teamB" | "AS")} className={inputClass}>
                    <option value="teamA">{teamALabel}</option>
                    <option value="teamB">{teamBLabel}</option>
                    <option value="AS">Halved</option>
                  </select>
                </Field>
                <Field label="Margin (up)">
                  <input type="number" min="1" max="18" value={resultMargin} onChange={(e) => setResultMargin(e.target.value)} className={inputClass} disabled={resultWinner === "AS"} />
                </Field>
                <Field label="Thru (holes)">
                  <input type="number" min="1" max="18" value={resultThru} onChange={(e) => setResultThru(e.target.value)} className={inputClass} disabled={resultWinner === "AS"} />
                </Field>
              </div>
              <InfoNote>
                e.g. “3&amp;2” = margin 3, thru 16. A win that went the distance is margin 1+, thru 18.
              </InfoNote>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Saving…" : "Save result"}
              </Button>
            </form>
          )}
        </AdminSection>
      )}

      {isLeague && !manual && (
        <AdminSection
          title="Course & strokes"
          description="The players normally set this themselves before scoring. Change it here to correct a course or a handicap — strokes are re-placed and the match recomputes."
        >
          <MatchSetupPanel
            key={`${match.id}-${match.courseId ?? ""}-${match.courseHandicaps?.join(",") ?? ""}`}
            match={match}
            canSetup
            isAdmin
            hasScores={scoredCount > 0}
            nameOf={(pid) => (pid ? playerName[pid] ?? pid : "")}
            onSaved={() => { void loadMatch(); }}
            defaultOpen={!match.courseId}
          />
        </AdminSection>
      )}

      <AdminSection
        title="Scores"
        description="Tap a hole to correct it. Blank a field to clear that score — match status, stats, and skins recompute automatically."
        actions={
          <span className="text-xs text-muted-foreground">
            {scoredCount}/18 scored
          </span>
        }
      >
        <div className="grid grid-cols-9 gap-1">
          {HOLES.map((hole) => {
            const selected = String(hole) === holeNum;
            const scored = holeScored(hole);
            return (
              <button
                key={hole}
                type="button"
                onClick={() => setHoleNum(String(hole))}
                aria-pressed={selected}
                aria-label={`Hole ${hole}${scored ? ", scored" : ", no score"}`}
                className={cn(
                  "flex h-10 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition-colors",
                  selected
                    ? "border-transparent bg-primary text-primary-foreground"
                    : scored
                      ? "border-border bg-muted text-foreground hover:bg-accent"
                      : "border-dashed border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {hole}
                <span
                  className={cn(
                    "mt-0.5 h-1 w-1 rounded-full",
                    scored ? (selected ? "bg-primary-foreground" : "bg-emerald-500") : "bg-transparent"
                  )}
                />
              </button>
            );
          })}
        </div>

        {holeForm && (
          <form onSubmit={handleOverride} className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {isSinglesFormat(format) || isScrambleFormat(format) ? (
                <>
                  {grossInput(
                    holeForm.aGross,
                    (v) => setHoleForm({ ...holeForm, aGross: v }),
                    isScrambleFormat(format) ? `${teamALabel} gross` : `${teamANames[0] ?? teamALabel} gross`
                  )}
                  {grossInput(
                    holeForm.bGross,
                    (v) => setHoleForm({ ...holeForm, bGross: v }),
                    isScrambleFormat(format) ? `${teamBLabel} gross` : `${teamBNames[0] ?? teamBLabel} gross`
                  )}
                </>
              ) : (
                <>
                  {grossInput(holeForm.aGross, (v) => setHoleForm({ ...holeForm, aGross: v }), `${teamANames[0] ?? `${teamALabel} 1`} gross`)}
                  {grossInput(holeForm.aGross2, (v) => setHoleForm({ ...holeForm, aGross2: v }), `${teamANames[1] ?? `${teamALabel} 2`} gross`)}
                  {grossInput(holeForm.bGross, (v) => setHoleForm({ ...holeForm, bGross: v }), `${teamBNames[0] ?? `${teamBLabel} 1`} gross`)}
                  {grossInput(holeForm.bGross2, (v) => setHoleForm({ ...holeForm, bGross2: v }), `${teamBNames[1] ?? `${teamBLabel} 2`} gross`)}
                </>
              )}
              {isDriveTrackingFormat(format) && (
                <>
                  {driveSelect(holeForm.aDrive, (v) => setHoleForm({ ...holeForm, aDrive: v }), `${teamALabel} drive`, teamANames)}
                  {driveSelect(holeForm.bDrive, (v) => setHoleForm({ ...holeForm, bDrive: v }), `${teamBLabel} drive`, teamBNames)}
                </>
              )}
            </div>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Saving…" : `Save hole ${holeNum}`}
            </Button>
          </form>
        )}
      </AdminSection>

      <AdminSection title="Match lock" description="A locked match refuses score entry from players. The round lock covers every match at once.">
        <ToggleRow
          label="Locked"
          description={
            match.locked
              ? "Players cannot enter scores for this match."
              : round?.locked
                ? "This match is unlocked, but its round is locked — nobody can score."
                : "Rostered players can enter scores."
          }
          checked={!!match.locked}
          onChange={handleToggleLock}
          disabled={busy}
        />
      </AdminSection>

      <AdminSection
        title="Players & tee time"
        description="Strokes are recalculated on save. The handicap index fields override the tournament values for this match only."
      >
        <MatchForm
          key={`${match.id}-${match.courseHandicaps?.join(",") ?? ""}`}
          tournament={tournament}
          players={players}
          initial={{ match, teamA: initialTeamA, teamB: initialTeamB }}
          showHandicapOverride
          submitting={busy}
          submitLabel="Update match"
          onSubmit={handleEditSubmit}
        />
      </AdminSection>

      {!isLeague && (
      <AdminSection
        title="Recalculate strokes"
        description="Re-syncs strokesReceived with the tournament's current handicap indexes (GHIN formula, spin-down from lowest)."
      >
        <Button type="button" variant="outline" onClick={handleRecalcStrokes} disabled={busy}>
          {busy ? "Working…" : "Recalculate strokes"}
        </Button>
      </AdminSection>
      )}

      <AdminSection
        title="Delete match"
        description="Permanently deletes this match. Its playerMatchFacts are removed; player stats and skins recompute automatically."
        danger
      >
        <div className="space-y-3">
          <InfoNote>
            Type the match id <span className="font-mono text-foreground">{match.id}</span> to confirm.
          </InfoNote>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="Match id"
            className={monoInputClass}
            aria-label="Type the match id to confirm deletion"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmDelete(true)}
            disabled={busy || deleteConfirm !== match.id}
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Delete match
          </Button>
        </div>
      </AdminSection>

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete match?"
        confirmLabel="Delete match"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        Permanently deletes <strong>{match.id}</strong> and its player stats. Skins and standings
        recompute automatically.
      </ConfirmDialog>
    </AdminPage>
  );
}
