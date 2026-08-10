import { useState } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, ExternalLink, Flag, Lock, Plus, Settings2 } from "lucide-react";
import AdminPage, { AdminNotFound } from "../../components/admin/AdminPage";
import AdminSection from "../../components/admin/AdminSection";
import NavRow, { EmptyRow } from "../../components/admin/NavRow";
import TournamentBadges from "../../components/admin/TournamentBadges";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import { useAdminTournament } from "../../contexts/AdminTournamentContext";
import { adminApi } from "../../api/admin";
import { getErrorMessage } from "../../api/errors";
import { formatRoundType } from "../../utils";
import { tierPlayerIds } from "../../utils/roster";
import type { RoundDoc, TournamentDoc } from "../../types";

/**
 * Tournament admin home: rounds at a glance with day-of lock toggles, the
 * remaining setup steps, and links to rosters/settings. Match work happens
 * inside each round.
 */
export default function TournamentHome() {
  const { tournamentId, tournament, rounds, loading, error: ctxError, refreshRounds } = useAdminTournament();
  // Denormalized on the tournament doc by the sideEventOps callables, so this
  // needs no extra query (the tournament subscription already has it).
  const sideEvents = tournament?.sideEvents ?? [];
  const [busyRoundId, setBusyRoundId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const toggleRoundLock = async (roundId: string, locked: boolean) => {
    setError(null);
    setSuccess(null);
    setBusyRoundId(roundId);
    try {
      await adminApi.updateRound({ roundId, updates: { locked } });
      await refreshRounds();
      setSuccess(locked ? "Round locked — score entry is frozen." : "Round unlocked — players can enter scores.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update round lock"));
    } finally {
      setBusyRoundId(null);
    }
  };

  const breadcrumbs = [{ label: "Admin", to: "/admin" }, { label: tournament?.name ?? "Tournament" }];

  if (loading) {
    return (
      <AdminPage title="Tournament" breadcrumbs={breadcrumbs} loading>
        {null}
      </AdminPage>
    );
  }

  if (!tournament) {
    return (
      <AdminNotFound
        title="Tournament"
        message={ctxError ?? "Tournament not found"}
        backTo="/admin"
        backLabel="Back to Admin"
        breadcrumbs={breadcrumbs}
      />
    );
  }

  const todo = setupTodos(tournament, rounds, tournamentId);

  return (
    <AdminPage
      headerTitle={`${tournament.year} ${tournament.name}`}
      breadcrumbs={breadcrumbs}
      eyebrow={tournament.series}
      title={`${tournament.year} ${tournament.name}`}
      badges={<TournamentBadges tournament={tournament} />}
      error={error ?? ctxError}
      success={success}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to={`/admin/t/${tournamentId}/settings`}>
            <Settings2 className="h-4 w-4" />
            Settings
          </Link>
        </Button>
      }
    >
      {todo.length > 0 && (
        <AdminSection
          title="Next steps"
          description="What still needs doing before this tournament can be played."
        >
          <ul className="space-y-2">
            {todo.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    <span className="font-semibold text-foreground">{item.label}</span>
                    <span className="block text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </AdminSection>
      )}

      <AdminSection
        title="Rounds"
        description="The lock freezes score entry for a whole round. Open a round for its matches, pairings draft, and recap."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to={`/admin/t/${tournamentId}/round/new`}>
              <Plus className="h-4 w-4" />
              Round
            </Link>
          </Button>
        }
      >
        <div className="space-y-2">
          {rounds.map((r) => (
            <NavRow
              key={r.id}
              to={`/admin/t/${tournamentId}/round/${r.id}`}
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
              badges={r.locked ? <Badge variant="muted"><Lock className="mr-1 h-3 w-3" />locked</Badge> : null}
              trailing={
                <Switch
                  checked={!!r.locked}
                  disabled={busyRoundId === r.id}
                  onCheckedChange={(next) => toggleRoundLock(r.id, next)}
                  aria-label={r.locked ? `Unlock day ${r.day}` : `Lock day ${r.day}`}
                />
              }
            />
          ))}
          {rounds.length === 0 && <EmptyRow>No rounds yet.</EmptyRow>}
        </div>
      </AdminSection>

      <AdminSection
        title="Side events"
        description="Optional for-fun games like the 3-man scramble. They award no Cup points, record no stats, and reach players through the hamburger menu only."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to={`/admin/t/${tournamentId}/side-event/new`}>
              <Plus className="h-4 w-4" />
              Event
            </Link>
          </Button>
        }
      >
        <div className="space-y-2">
          {sideEvents.map((e) => (
            <NavRow
              key={e.id}
              to={`/admin/t/${tournamentId}/side-event/${e.id}`}
              leading={<Flag className="h-5 w-5 text-muted-foreground" />}
              title={e.name}
              subtitle={e.id}
              badges={e.hidden ? <Badge variant="muted">hidden</Badge> : null}
            />
          ))}
          {sideEvents.length === 0 && <EmptyRow>No side events yet.</EmptyRow>}
        </div>
      </AdminSection>

      <AdminSection title="Tournament" description="Rosters, handicaps, captains, feature flags, and archiving.">
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={`/admin/t/${tournamentId}/settings`}>Settings &amp; rosters</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/tournament/${tournamentId}`}>
              <ExternalLink className="h-4 w-4" />
              Public page
            </Link>
          </Button>
        </div>
      </AdminSection>
    </AdminPage>
  );
}

interface TodoItem {
  label: string;
  detail: string;
  to: string;
}

/**
 * The setup steps still outstanding, in the order they have to happen. Computed
 * from data the page already has — no extra reads — and hidden entirely once a
 * tournament is ready to play.
 */
function setupTodos(tournament: TournamentDoc, rounds: RoundDoc[], tournamentId: string): TodoItem[] {
  const items: TodoItem[] = [];
  const settings = `/admin/t/${tournamentId}/settings`;

  const teamACount = tierPlayerIds(tournament.teamA?.rosterByTier).length;
  const teamBCount = tierPlayerIds(tournament.teamB?.rosterByTier).length;
  if (teamACount === 0 || teamBCount === 0) {
    items.push({
      label: "Set the rosters",
      detail: `${tournament.teamA?.name || "Team A"}: ${teamACount} · ${tournament.teamB?.name || "Team B"}: ${teamBCount}`,
      to: settings,
    });
  } else if (!tournament.teamA?.captainId || !tournament.teamB?.captainId) {
    items.push({
      label: "Pick captains",
      detail: "Captains run the pairings draft and get a planning board.",
      to: settings,
    });
  }

  if (rounds.length === 0) {
    items.push({ label: "Create the rounds", detail: "One round per day of play.", to: `/admin/t/${tournamentId}/round/new` });
  } else {
    const noFormat = rounds.filter((r) => !r.format);
    if (noFormat.length > 0) {
      items.push({
        label: `Set the format on ${noFormat.length} round${noFormat.length === 1 ? "" : "s"}`,
        detail: `Day ${noFormat.map((r) => r.day ?? "?").join(", ")} still shows "Format TBD".`,
        to: `/admin/t/${tournamentId}/round/${noFormat[0].id}`,
      });
    }
    const noCourse = rounds.filter((r) => !r.courseId);
    if (noCourse.length > 0) {
      items.push({
        label: `Assign a course to ${noCourse.length} round${noCourse.length === 1 ? "" : "s"}`,
        detail: "Strokes and skins need the course's pars and handicap indexes.",
        to: `/admin/t/${tournamentId}/round/${noCourse[0].id}`,
      });
    }
    const noMatches = rounds.filter((r) => (r.matchIds?.length ?? 0) === 0);
    if (noMatches.length > 0) {
      items.push({
        label: `Build matches for ${noMatches.length} round${noMatches.length === 1 ? "" : "s"}`,
        detail: "Run the captains' pairings draft, or add matches by hand.",
        to: `/admin/t/${tournamentId}/round/${noMatches[0].id}`,
      });
    }
  }

  if (!tournament.active && !tournament.archived) {
    items.push({
      label: "Make it active",
      detail: "Until then it stays off the app's home page.",
      to: settings,
    });
  }

  return items;
}
