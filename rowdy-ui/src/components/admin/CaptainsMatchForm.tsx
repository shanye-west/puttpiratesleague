import { useState } from "react";
import { Button } from "../ui/button";
import { Field, InfoNote } from "./fields";
import { inputClass } from "./inputStyles";
import type { CaptainsMatchDoc, PlayerDoc } from "../../types";
import type { CaptainsMatchSettings } from "../../api/adminContracts";

const DEFAULT_NAME = "Captains' Match";
const DEFAULT_STAKES = "Winner chooses: 1st overall pick or defer";
const DEFAULT_TOTAL_ROUNDS = 20;
const MAX_TOTAL_ROUNDS = 50;

interface CaptainsMatchFormProps {
  /** Prefill for edit mode; omit to create. */
  initial?: CaptainsMatchDoc;
  /** Suggested players for a new match — the tournament's two team captains. */
  defaultPlayerAId?: string;
  defaultPlayerBId?: string;
  /** Every player, sorted by name. */
  players: PlayerDoc[];
  /** True once any round has a card: the players are then fixed. */
  playersLocked: boolean;
  /** Highest round with a card — the schedule can't shrink below it. */
  minRounds: number;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (settings: CaptainsMatchSettings) => void;
}

/**
 * Create/edit form for a tournament's captains' match: the two players, how
 * many rounds, and what it decides. Round cards are entered separately, one
 * page per round.
 */
export default function CaptainsMatchForm({
  initial,
  defaultPlayerAId,
  defaultPlayerBId,
  players,
  playersLocked,
  minRounds,
  submitting,
  submitLabel,
  onSubmit,
}: CaptainsMatchFormProps) {
  const [name, setName] = useState(initial?.name ?? DEFAULT_NAME);
  const [stakes, setStakes] = useState(initial ? initial.stakes ?? "" : DEFAULT_STAKES);
  const [playerAId, setPlayerAId] = useState(initial?.playerAId ?? defaultPlayerAId ?? "");
  const [playerBId, setPlayerBId] = useState(initial?.playerBId ?? defaultPlayerBId ?? "");
  const [totalRounds, setTotalRounds] = useState(String(initial?.totalRounds ?? DEFAULT_TOTAL_ROUNDS));
  const [error, setError] = useState<string | null>(null);

  const minimum = Math.max(1, minRounds);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rounds = Number(totalRounds);
    if (!playersLocked && (!playerAId || !playerBId)) {
      setError("Pick both players.");
      return;
    }
    if (!playersLocked && playerAId === playerBId) {
      setError("Pick two different players.");
      return;
    }
    if (!Number.isInteger(rounds) || rounds < minimum || rounds > MAX_TOTAL_ROUNDS) {
      setError(`Rounds must be a whole number from ${minimum} to ${MAX_TOTAL_ROUNDS}.`);
      return;
    }
    setError(null);
    onSubmit({
      name: name.trim() || DEFAULT_NAME,
      stakes: stakes.trim(),
      // The server refuses a player change once a round has a card, so don't send one.
      ...(playersLocked ? {} : { playerAId, playerBId }),
      totalRounds: rounds,
    });
  };

  const renderPlayerSelect = (value: string, onChange: (id: string) => void, label: string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={playersLocked}
      className={inputClass}
      aria-label={label}
    >
      <option value="">Pick a player…</option>
      {players.map((p) => (
        <option key={p.id} value={p.id}>{p.displayName ?? p.id}</option>
      ))}
    </select>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Field label="Name" hint="Shown above the status on the tournament home page.">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className={inputClass}
        />
      </Field>

      <Field label="What it decides" optional hint="A line under the name on the home page.">
        <input
          type="text"
          value={stakes}
          onChange={(e) => setStakes(e.target.value)}
          maxLength={140}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Player A" hint="Left side, team A colour.">
          {renderPlayerSelect(playerAId, setPlayerAId, "Player A")}
        </Field>
        <Field label="Player B" hint="Right side, team B colour.">
          {renderPlayerSelect(playerBId, setPlayerBId, "Player B")}
        </Field>
      </div>
      {playersLocked && (
        <InfoNote>The players are fixed now that a round has a card — every card's columns belong to them.</InfoNote>
      )}

      <Field label="Rounds" hint="Running match play: the margin carries from one round into the next.">
        <input
          type="number"
          min={minimum}
          max={MAX_TOTAL_ROUNDS}
          step={1}
          value={totalRounds}
          onChange={(e) => setTotalRounds(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
