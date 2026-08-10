import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "../ui/button";
import { Field, FieldGroup } from "./fields";
import { inputClass, monoInputClass } from "./inputStyles";
import { cn } from "../../lib/utils";
import type { MatchDoc, PlayerDoc, TournamentDoc } from "../../types";
import { tierPlayerIds } from "../../utils/roster";
import { storedToLocalInput } from "../../utils/teeTime";

export interface MatchFormPlayer {
  playerId: string;
  /** Only shown/sent in edit mode (handicap override). */
  handicapIndex?: number;
  /** Display only — current calculated value from the match doc. */
  courseHandicap?: number;
}

export interface MatchFormValues {
  matchId: string;
  /** datetime-local value, "" if unset. Convert with localInputToIso before calling the API. */
  teeTime: string;
  teamAPlayers: MatchFormPlayer[];
  teamBPlayers: MatchFormPlayer[];
}

interface MatchFormProps {
  tournament: TournamentDoc;
  /** Roster player docs (from AdminTournamentContext). */
  players: PlayerDoc[];
  /** Prefill for edit mode; omit for create. */
  initial?: { match: MatchDoc; teamA: MatchFormPlayer[]; teamB: MatchFormPlayer[] };
  /** Show per-player handicap index override inputs (edit mode). */
  showHandicapOverride?: boolean;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: MatchFormValues) => void;
}

/**
 * Shared match create/edit form: match id, tee time, and per-team player
 * pickers restricted to the tournament roster.
 */
export default function MatchForm({
  tournament,
  players,
  initial,
  showHandicapOverride = false,
  submitting,
  submitLabel,
  onSubmit,
}: MatchFormProps) {
  const isEdit = !!initial;
  const [matchId, setMatchId] = useState(initial?.match.id ?? "");
  const [teeTime, setTeeTime] = useState(initial ? storedToLocalInput(initial.match.teeTime) : "");
  const [teamAPlayers, setTeamAPlayers] = useState<MatchFormPlayer[]>(
    initial?.teamA.length ? initial.teamA : [{ playerId: "" }]
  );
  const [teamBPlayers, setTeamBPlayers] = useState<MatchFormPlayer[]>(
    initial?.teamB.length ? initial.teamB : [{ playerId: "" }]
  );

  const teamAAvailablePlayers = useMemo(() => {
    const ids = tierPlayerIds(tournament.teamA?.rosterByTier);
    return players.filter((p) => ids.includes(p.id));
  }, [tournament, players]);

  const teamBAvailablePlayers = useMemo(() => {
    const ids = tierPlayerIds(tournament.teamB?.rosterByTier);
    return players.filter((p) => ids.includes(p.id));
  }, [tournament, players]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      matchId,
      teeTime,
      teamAPlayers: teamAPlayers.filter((p) => p.playerId),
      teamBPlayers: teamBPlayers.filter((p) => p.playerId),
    });
  };

  const renderTeam = (
    teamKey: "teamA" | "teamB",
    list: MatchFormPlayer[],
    setList: (next: MatchFormPlayer[]) => void,
    available: PlayerDoc[]
  ) => {
    const team = tournament[teamKey];
    const fallbackColor = teamKey === "teamA" ? "var(--team-a-default)" : "var(--team-b-default)";
    const teamName = team?.name || (teamKey === "teamA" ? "Team A" : "Team B");
    return (
      <FieldGroup
        title={
          <span className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full border border-border"
              style={{ background: team?.color || fallbackColor }}
            />
            {teamName}
          </span>
        }
      >
        {list.map((playerInput, idx) => (
          <div key={idx} className="flex items-end gap-2">
            <Field label={`Player ${idx + 1}`} className="flex-1">
              <select
                value={playerInput.playerId}
                onChange={(e) => {
                  const updated = [...list];
                  updated[idx] = { ...updated[idx], playerId: e.target.value };
                  setList(updated);
                }}
                className={inputClass}
                required
              >
                <option value="">Select player</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName || p.id}
                  </option>
                ))}
              </select>
            </Field>

            {showHandicapOverride && (
              <Field
                label="Hcp index"
                className="w-24 shrink-0"
                hint={
                  playerInput.courseHandicap !== undefined
                    ? `course ${playerInput.courseHandicap}`
                    : undefined
                }
              >
                <input
                  type="number"
                  step="0.1"
                  value={playerInput.handicapIndex ?? 0}
                  onChange={(e) => {
                    const updated = [...list];
                    updated[idx] = { ...updated[idx], handicapIndex: parseFloat(e.target.value) || 0 };
                    setList(updated);
                  }}
                  className={cn(inputClass, "px-2")}
                  required
                />
              </Field>
            )}

            {idx > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setList(list.filter((_, i) => i !== idx))}
                aria-label={`Remove player ${idx + 1}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setList([...list, showHandicapOverride ? { playerId: "", handicapIndex: 0 } : { playerId: "" }])}
        >
          <Plus className="h-4 w-4" />
          Add {teamName} player
        </Button>
      </FieldGroup>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Match ID"
          hint={isEdit ? "Fixed once a match exists." : "e.g. rowdyCup2026-R01M01-twoManBestBall"}
        >
          <input
            type="text"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            placeholder="rowdyCup2026-R01M01-twoManBestBall"
            className={monoInputClass}
            readOnly={isEdit}
            required
          />
        </Field>
        <Field label="Tee time" optional hint="Venue-local wall clock.">
          <input
            type="datetime-local"
            value={teeTime}
            onChange={(e) => setTeeTime(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      {renderTeam("teamA", teamAPlayers, setTeamAPlayers, teamAAvailablePlayers)}
      {renderTeam("teamB", teamBPlayers, setTeamBPlayers, teamBAvailablePlayers)}

      <Button type="submit" disabled={submitting || !matchId} className="w-full">
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
