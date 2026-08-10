import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminPage, { AdminNotFound } from "../../components/admin/AdminPage";
import AdminSection from "../../components/admin/AdminSection";
import MatchForm, { type MatchFormValues } from "../../components/admin/MatchForm";
import { useAdminTournament } from "../../contexts/AdminTournamentContext";
import { adminApi } from "../../api/admin";
import { getErrorMessage } from "../../api/errors";
import { localInputToStored } from "../../utils/teeTime";
import { formatRoundType } from "../../utils";
import type { SeedMatchRequest } from "../../api/adminContracts";

/** Create a match inside a known tournament + round — no selectors needed. */
export default function MatchCreate() {
  const navigate = useNavigate();
  const { roundId = "" } = useParams<{ roundId: string }>();
  const { tournamentId, tournament, players, rounds, loading } = useAdminTournament();
  const round = rounds.find((r) => r.id === roundId);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: MatchFormValues) => {
    setError(null);
    setSubmitting(true);
    try {
      if (values.teamAPlayers.length === 0 || values.teamBPlayers.length === 0) {
        throw new Error("Each team must have at least one player");
      }
      const payload: SeedMatchRequest = {
        id: values.matchId,
        tournamentId,
        roundId,
        teamAPlayers: values.teamAPlayers.map((p) => ({ playerId: p.playerId })),
        teamBPlayers: values.teamBPlayers.map((p) => ({ playerId: p.playerId })),
      };
      if (values.teeTime) {
        payload.teeTime = localInputToStored(values.teeTime);
      }
      await adminApi.seedMatch(payload);
      navigate(`/admin/t/${tournamentId}/match/${values.matchId}`, { replace: true });
    } catch (err) {
      console.error("Error creating match:", err);
      setError(getErrorMessage(err, "Failed to create match"));
      setSubmitting(false);
    }
  };

  const breadcrumbs = [
    { label: "Admin", to: "/admin" },
    { label: tournament?.name ?? "Tournament", to: `/admin/t/${tournamentId}` },
    ...(round ? [{ label: `Day ${round.day ?? "?"}`, to: `/admin/t/${tournamentId}/round/${round.id}` }] : []),
    { label: "New match" },
  ];

  if (loading) {
    return (
      <AdminPage title="New match" breadcrumbs={breadcrumbs} loading>
        {null}
      </AdminPage>
    );
  }

  if (!tournament || !round) {
    return (
      <AdminNotFound
        title="New match"
        message={!tournament ? "Tournament not found" : "Round not found"}
        backTo={`/admin/t/${tournamentId}`}
        backLabel="Back to tournament"
        breadcrumbs={breadcrumbs}
      />
    );
  }

  return (
    <AdminPage
      headerTitle={`${tournament.year} ${tournament.name}`}
      breadcrumbs={breadcrumbs}
      eyebrow={`Day ${round.day} · ${formatRoundType(round.format)}`}
      title="New match"
      description="Strokes are calculated from the tournament handicaps and the round's course."
      error={error}
    >
      <AdminSection title="Match details" description="Pick the players from each roster.">
        <MatchForm
          tournament={tournament}
          players={players}
          submitting={submitting}
          submitLabel="Create match"
          onSubmit={handleSubmit}
        />
      </AdminSection>
    </AdminPage>
  );
}
