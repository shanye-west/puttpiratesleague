import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, Flag, Lock, Plus, Users, Wrench } from "lucide-react";
import AdminPage from "../../components/admin/AdminPage";
import AdminSection from "../../components/admin/AdminSection";
import NavRow, { EmptyRow } from "../../components/admin/NavRow";
import TournamentBadges from "../../components/admin/TournamentBadges";
import { Field, ToggleRow } from "../../components/admin/fields";
import { inputClass, monoInputClass } from "../../components/admin/inputStyles";
import { Modal } from "../../components/Modal";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useAdminTournaments } from "../../hooks/admin/useAdminTournaments";
import { useRounds } from "../../hooks/admin/useRounds";
import { adminApi } from "../../api/admin";
import { getErrorMessage } from "../../api/errors";
import { formatRoundType } from "../../utils";

/**
 * Admin home. Leads with the active tournament and its rounds — the day-of
 * path (open a round, lock it, fix a score) is the one that matters most, so it
 * starts here instead of behind a tournament picker.
 */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [includeArchived, setIncludeArchived] = useState(false);
  const { tournaments, loading, error: loadError, refresh } = useAdminTournaments({ includeArchived });

  const activeTournament = tournaments.find((t) => t.active) ?? null;
  const { rounds, loading: roundsLoading } = useRounds(activeTournament?.id);
  const otherTournaments = tournaments.filter((t) => t.id !== activeTournament?.id);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [newSeries, setNewSeries] = useState("rowdyCup");
  const [newTest, setNewTest] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await adminApi.createTournament({
        ...(newId.trim() ? { id: newId.trim() } : {}),
        name: newName.trim(),
        year: Number(newYear),
        series: newSeries.trim(),
        test: newTest,
      });
      await refresh();
      setShowCreate(false);
      navigate(`/admin/t/${res.tournamentId}`);
    } catch (err) {
      console.error("Error creating tournament:", err);
      setError(getErrorMessage(err, "Failed to create tournament"));
      setCreating(false);
    }
  };

  return (
    <AdminPage
      title="Admin"
      description="Manage tournaments, rounds, matches, players, and courses."
      error={error ?? loadError}
      loading={loading}
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New tournament
        </Button>
      }
    >
      {activeTournament ? (
        <AdminSection
          title={`${activeTournament.year} ${activeTournament.name}`}
          description="The live tournament. Open a round to manage its matches, lock score entry, or run the pairings draft."
          actions={<Badge variant="success">active</Badge>}
        >
          <div className="space-y-2">
            {roundsLoading && rounds.length === 0 && (
              <div className="h-12 animate-pulse rounded-xl bg-muted/60" aria-hidden="true" />
            )}
            {rounds.map((r) => (
              <NavRow
                key={r.id}
                to={`/admin/t/${activeTournament.id}/round/${r.id}`}
                leading={
                  <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-center">
                    <span className="text-[0.5rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Day
                    </span>
                    <span className="text-xs font-bold leading-none text-foreground">{r.day ?? "?"}</span>
                  </div>
                }
                title={formatRoundType(r.format)}
                subtitle={`${r.matchIds?.length ?? 0} match${(r.matchIds?.length ?? 0) === 1 ? "" : "es"} · ${r.pointsValue ?? 1} pt each`}
                badges={
                  r.locked ? (
                    <Badge variant="muted" className="gap-1">
                      <Lock className="h-3 w-3" />
                      locked
                    </Badge>
                  ) : null
                }
              />
            ))}
            {!roundsLoading && rounds.length === 0 && <EmptyRow>No rounds yet.</EmptyRow>}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to={`/admin/t/${activeTournament.id}`}>Manage tournament</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin/t/${activeTournament.id}/settings`}>Rosters &amp; settings</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to={`/tournament/${activeTournament.id}`}>
                <ExternalLink className="h-4 w-4" />
                Public page
              </Link>
            </Button>
          </div>
        </AdminSection>
      ) : (
        <AdminSection
          title="No active tournament"
          description="Nothing is flagged active right now. Open a tournament below and flip Active in its settings, or create a new one."
        >
          <Button type="button" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            New tournament
          </Button>
        </AdminSection>
      )}

      <AdminSection
        title="All tournaments"
        description="Past events, tests, and anything not currently active."
        actions={
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand-primary)]"
            />
            Archived
          </label>
        }
      >
        <div className="space-y-2">
          {otherTournaments.map((t) => (
            <NavRow
              key={t.id}
              to={`/admin/t/${t.id}`}
              title={`${t.year} ${t.name}`}
              subtitle={t.series}
              badges={<TournamentBadges tournament={t} />}
            />
          ))}
          {otherTournaments.length === 0 && <EmptyRow>No other tournaments.</EmptyRow>}
        </div>
      </AdminSection>

      <AdminSection title="Library" description="Data shared across every tournament.">
        <div className="space-y-2">
          <NavRow
            to="/admin/players"
            leading={<Users className="h-5 w-5 text-muted-foreground" />}
            title="Players"
            subtitle="Add, rename, link logins, admin access, delete"
          />
          <NavRow
            to="/admin/courses"
            leading={<Flag className="h-5 w-5 text-muted-foreground" />}
            title="Courses"
            subtitle="Pars, handicap indexes, and yardages"
          />
          <NavRow
            to="/admin/recalculate"
            leading={<Wrench className="h-5 w-5 text-muted-foreground" />}
            title="Recalculate all stats"
            subtitle="Rebuild every playerMatchFact and stat, across all tournaments"
            badges={<Badge variant="warning">heavy</Badge>}
          />
        </div>
      </AdminSection>

      <Modal
        key="create-tournament"
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="New tournament"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreate} className="space-y-3 text-left">
          <Field label="Name">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Rowdy Cup 2027"
              className={inputClass}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Year">
              <input
                type="number"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Series">
              <select
                value={newSeries}
                onChange={(e) => setNewSeries(e.target.value)}
                className={inputClass}
                required
              >
                <option value="rowdyCup">Rowdy Cup</option>
                <option value="christmasClassic">Christmas Classic</option>
              </select>
            </Field>
          </div>
          <Field label="ID" optional hint="Auto-generated when blank.">
            <input
              type="text"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="e.g. 2027RowdyCup"
              className={monoInputClass}
            />
          </Field>
          <ToggleRow
            label="Test tournament"
            description="Only visible to admins."
            checked={newTest}
            onChange={setNewTest}
          />
          <p className="text-xs text-muted-foreground">
            Created inactive — set rosters and rounds first, then flip Active in Settings.
          </p>
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={creating} className="flex-1">
              {creating ? "Creating…" : "Create tournament"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </AdminPage>
  );
}
