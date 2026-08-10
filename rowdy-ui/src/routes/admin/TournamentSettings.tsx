import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import AdminPage, { AdminNotFound } from "../../components/admin/AdminPage";
import AdminSection from "../../components/admin/AdminSection";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import TournamentBadges from "../../components/admin/TournamentBadges";
import TournamentSettingsForm, { type SettingsTab } from "../../components/admin/TournamentSettingsForm";
import { Field } from "../../components/admin/fields";
import { inputClass } from "../../components/admin/inputStyles";
import { Button } from "../../components/ui/button";
import { useAdminTournament } from "../../contexts/AdminTournamentContext";
import { adminApi } from "../../api/admin";
import { betsApi } from "../../api/bets";
import { getErrorMessage } from "../../api/errors";
import { cn } from "../../lib/utils";
import type { PlayerDoc } from "../../types";
import type { TournamentUpdates } from "../../api/adminContracts";

type Tab = SettingsTab | "betting" | "danger";

const TABS: { id: Tab; label: string }[] = [
  { id: "setup", label: "Setup" },
  { id: "rosters", label: "Rosters" },
  { id: "betting", label: "Betting" },
  { id: "danger", label: "Danger" },
];

/** Tournament settings, rosters, betting settlement, and the archive control. */
export default function TournamentSettings() {
  const navigate = useNavigate();
  const { tournamentId, tournament, loading } = useAdminTournament();

  const [tab, setTab] = useState<Tab>("setup");
  const [allPlayers, setAllPlayers] = useState<PlayerDoc[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Betting settlement — operations, not settings, so they live outside the form.
  const [cupWinner, setCupWinner] = useState<"" | "teamA" | "teamB" | "push">("");
  const [confirmCup, setConfirmCup] = useState(false);
  const [confirmPlayerFutures, setConfirmPlayerFutures] = useState(false);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    getDocs(collection(db, "players"))
      .then((snap) =>
        setAllPlayers(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as PlayerDoc))
            .sort((a, b) => (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id))
        )
      )
      .catch((err) => setError(getErrorMessage(err, "Failed to load players")))
      .finally(() => setPlayersLoading(false));
  }, []);

  const handleSubmit = async (updates: TournamentUpdates) => {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await adminApi.updateTournament({ tournamentId, updates });
      setSuccess("Tournament updated.");
    } catch (err) {
      console.error("Error updating tournament:", err);
      setError(getErrorMessage(err, "Failed to update tournament"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!tournament) return;
    setError(null);
    setSuccess(null);
    setArchiving(true);
    try {
      await adminApi.updateTournament({
        tournamentId,
        updates: { archived: !tournament.archived },
      });
      setConfirmArchive(false);
      if (!tournament.archived) {
        navigate("/admin");
      } else {
        setSuccess("Tournament unarchived.");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to archive tournament"));
    } finally {
      setArchiving(false);
    }
  };

  const handleSettleCupFutures = async () => {
    if (cupWinner === "") return;
    setConfirmCup(false);
    setError(null);
    setSuccess(null);
    setSettling(true);
    try {
      const res = await betsApi.settleCupFutures({ tournamentId, winningTeam: cupWinner });
      setSuccess(`Settled ${res.settledCount} Cup-winner bet${res.settledCount === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't settle Cup futures"));
    } finally {
      setSettling(false);
    }
  };

  const handleSettlePlayerFutures = async () => {
    setConfirmPlayerFutures(false);
    setError(null);
    setSuccess(null);
    setSettling(true);
    try {
      const res = await betsApi.settlePlayerFutures({ tournamentId });
      setSuccess(`Settled ${res.settledCount} player-prop bet${res.settledCount === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't settle player futures"));
    } finally {
      setSettling(false);
    }
  };

  const breadcrumbs = [
    { label: "Admin", to: "/admin" },
    { label: tournament?.name ?? "Tournament", to: `/admin/t/${tournamentId}` },
    { label: "Settings" },
  ];

  if (loading || playersLoading) {
    return (
      <AdminPage title="Settings" breadcrumbs={breadcrumbs} loading>
        {null}
      </AdminPage>
    );
  }

  if (!tournament) {
    return (
      <AdminNotFound
        title="Settings"
        message="Tournament not found"
        backTo="/admin"
        backLabel="Back to Admin"
        breadcrumbs={breadcrumbs}
      />
    );
  }

  const teamAName = tournament.teamA?.name || "Team A";
  const teamBName = tournament.teamB?.name || "Team B";
  const cupOutcome =
    cupWinner === "push"
      ? "refund every Cup-winner bet (tie)"
      : `pay out every Cup-winner bet to ${cupWinner === "teamA" ? teamAName : teamBName} backers`;

  return (
    <AdminPage
      headerTitle={`${tournament.year} ${tournament.name}`}
      breadcrumbs={breadcrumbs}
      eyebrow={`${tournament.year} ${tournament.name}`}
      title="Settings"
      badges={<TournamentBadges tournament={tournament} />}
      error={error}
      success={success}
    >
      <div role="tablist" aria-label="Settings sections" className="flex gap-1 rounded-xl bg-muted/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
              tab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              t.id === "danger" && tab === t.id && "text-destructive"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* The form stays mounted across tab switches so in-progress edits survive. */}
      <div className={cn(tab !== "setup" && tab !== "rosters" && "hidden")}>
        <TournamentSettingsForm
          key={tournament.id}
          tournament={tournament}
          allPlayers={allPlayers}
          submitting={submitting}
          tab={tab === "rosters" ? "rosters" : "setup"}
          onSubmit={handleSubmit}
        />
      </div>

      {tab === "betting" && (
        <>
          {!tournament.sportsbookEnabled && (
            <AdminSection title="Sportsbook is off" description="Turn it on under Setup to use these controls.">
              <Button type="button" variant="outline" onClick={() => setTab("setup")}>
                Go to Setup
              </Button>
            </AdminSection>
          )}

          <AdminSection
            title="Settle Cup-winner futures"
            description="Resolves active bets on who wins the Cup. These never settle automatically — pick the winner once the Cup is decided. A tie refunds every bet."
          >
            <div className="space-y-3">
              <Field label="Cup winner">
                <select
                  value={cupWinner}
                  onChange={(e) => setCupWinner(e.target.value as "" | "teamA" | "teamB" | "push")}
                  className={inputClass}
                >
                  <option value="">Select the Cup winner…</option>
                  <option value="teamA">{teamAName} won the Cup</option>
                  <option value="teamB">{teamBName} won the Cup</option>
                  <option value="push">Tie — refund all Cup bets</option>
                </select>
              </Field>
              <Button
                type="button"
                onClick={() => setConfirmCup(true)}
                disabled={settling || cupWinner === ""}
              >
                {settling ? "Settling…" : "Settle Cup futures"}
              </Button>
            </div>
          </AdminSection>

          <AdminSection
            title="Settle player futures"
            description="Resolves active player matchups and tournament-points over/unders from each player's total points. Run once every match is closed. Match and round bets settle automatically; Cup-winner bets need the control above."
          >
            <Button type="button" onClick={() => setConfirmPlayerFutures(true)} disabled={settling}>
              {settling ? "Settling…" : "Settle player futures"}
            </Button>
          </AdminSection>
        </>
      )}

      {tab === "danger" && (
        <AdminSection
          title={tournament.archived ? "Unarchive tournament" : "Archive tournament"}
          description={
            tournament.archived
              ? "Bring this tournament back into the default admin list."
              : "Archiving hides this tournament from the default admin list. Nothing is deleted — history and stats stay intact, and you can unarchive any time."
          }
          danger={!tournament.archived}
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => (tournament.archived ? handleArchiveToggle() : setConfirmArchive(true))}
            disabled={archiving}
            className={
              tournament.archived
                ? undefined
                : "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            }
          >
            {archiving ? "Working…" : tournament.archived ? "Unarchive" : "Archive tournament"}
          </Button>
        </AdminSection>
      )}

      <ConfirmDialog
        isOpen={confirmArchive}
        title="Archive tournament?"
        confirmLabel="Archive"
        danger
        busy={archiving}
        onConfirm={handleArchiveToggle}
        onCancel={() => setConfirmArchive(false)}
      >
        “{tournament.year} {tournament.name}” will be hidden from the default admin list.
        Nothing is deleted and this can be undone any time.
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={confirmCup}
        title="Settle Cup futures?"
        confirmLabel="Settle"
        danger
        busy={settling}
        onConfirm={handleSettleCupFutures}
        onCancel={() => setConfirmCup(false)}
      >
        This will {cupOutcome}. It can't be undone.
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={confirmPlayerFutures}
        title="Settle player futures?"
        confirmLabel="Settle"
        danger
        busy={settling}
        onConfirm={handleSettlePlayerFutures}
        onCancel={() => setConfirmPlayerFutures(false)}
      >
        Settles every active player-prop bet (matchups + player point over/unders) from final
        tournament points. Make sure every match is closed first — this can't be undone.
      </ConfirmDialog>
    </AdminPage>
  );
}
