import { useState } from "react";
import { Button } from "../ui/button";
import { Field, FieldGroup, ToggleList, ToggleRow } from "./fields";
import { inputClass, monoInputClass } from "./inputStyles";
import type { CourseDoc, LeagueTeam, RoundDoc, RoundFormat } from "../../types";
import type { RoundUpdates } from "../../api/adminContracts";

// `fourManScramble` is deliberately absent: it exists only to render historical
// tournaments and is not a scorable format for new rounds.
const FORMAT_OPTIONS: { value: RoundFormat | ""; label: string }[] = [
  { value: "", label: "Format TBD" },
  { value: "twoManBestBall", label: "2-Man Best Ball" },
  { value: "twoManShamble", label: "2-Man Shamble" },
  { value: "twoManScramble", label: "2-Man Scramble" },
  { value: "singles", label: "Singles" },
];

interface RoundFormState {
  day: string;
  name: string;
  bonusTeamId: string;
  format: RoundFormat | "";
  courseId: string;
  pointsValue: string;
  trackDrives: boolean;
  locked: boolean;
  skinsGrossPot: string;
  skinsNetPot: string;
  skinsHandicapPercent: string;
}

const emptyForm: RoundFormState = {
  day: "1",
  name: "",
  bonusTeamId: "",
  format: "singles",
  courseId: "",
  pointsValue: "1",
  trackDrives: false,
  locked: false,
  skinsGrossPot: "0",
  skinsNetPot: "0",
  skinsHandicapPercent: "100",
};

function roundToForm(r: RoundDoc): RoundFormState {
  return {
    day: String(r.day ?? 0),
    name: r.name ?? "",
    bonusTeamId: r.bonusTeamId ?? "",
    format: r.format ?? "",
    courseId: r.courseId ?? "",
    pointsValue: String(r.pointsValue ?? 1),
    trackDrives: !!r.trackDrives,
    locked: !!r.locked,
    skinsGrossPot: String(r.skinsGrossPot ?? 0),
    skinsNetPot: String(r.skinsNetPot ?? 0),
    skinsHandicapPercent: String(r.skinsHandicapPercent ?? 100),
  };
}

function formToUpdates(form: RoundFormState): RoundUpdates {
  return {
    day: Number(form.day),
    name: form.name.trim(),
    bonusTeamId: form.bonusTeamId === "" ? null : form.bonusTeamId,
    format: form.format === "" ? null : form.format,
    courseId: form.courseId === "" ? null : form.courseId,
    pointsValue: Number(form.pointsValue),
    trackDrives: form.trackDrives,
    locked: form.locked,
    skinsGrossPot: Number(form.skinsGrossPot),
    skinsNetPot: Number(form.skinsNetPot),
    skinsHandicapPercent: Number(form.skinsHandicapPercent),
  };
}

interface RoundFormProps {
  /** Prefill for edit mode; omit for create. */
  initial?: RoundDoc;
  /** Default day for create mode (e.g. rounds.length + 1). */
  defaultDay?: number;
  courses: CourseDoc[];
  /** League seasons: the teams the monthly bonus point can be assigned to. */
  leagueTeams?: LeagueTeam[];
  /** Shown only in create mode. */
  showRoundIdInput?: boolean;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (updates: RoundUpdates, newRoundId: string) => void;
}

/** Shared round create/edit form body. */
export default function RoundForm({
  initial,
  defaultDay,
  courses,
  leagueTeams,
  showRoundIdInput = false,
  submitting,
  submitLabel,
  onSubmit,
}: RoundFormProps) {
  const [form, setForm] = useState<RoundFormState>(
    initial ? roundToForm(initial) : { ...emptyForm, day: String(defaultDay ?? 1) }
  );
  const [newRoundId, setNewRoundId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formToUpdates(form), newRoundId.trim());
  };

  const skinsEligible = form.format === "singles" || form.format === "twoManBestBall";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {showRoundIdInput && (
        <Field label="Round ID" optional hint="Auto-generated when blank.">
          <input
            type="text"
            value={newRoundId}
            onChange={(e) => setNewRoundId(e.target.value)}
            placeholder="e.g. 2026PuttPirates-R03"
            className={monoInputClass}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Order" hint="Sorts the season's rounds (1 = first month).">
          <input
            type="number"
            min="0"
            value={form.day}
            onChange={(e) => setForm({ ...form, day: e.target.value })}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Name" optional hint="Shown instead of “Round n” — e.g. the month.">
          <input
            type="text"
            maxLength={40}
            value={form.name}
            placeholder="March"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Points per match">
          <input
            type="number"
            min="0"
            step="0.5"
            value={form.pointsValue}
            onChange={(e) => setForm({ ...form, pointsValue: e.target.value })}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Format">
          <select
            value={form.format}
            onChange={(e) => setForm({ ...form, format: e.target.value as RoundFormat | "" })}
            className={inputClass}
          >
            {FORMAT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
            {/* Historical rounds only — kept so an old 4-man scramble round can be
                edited without its format silently round-tripping to null. */}
            {initial?.format === "fourManScramble" && (
              <option value="fourManScramble">4-Man Scramble (historical)</option>
            )}
          </select>
        </Field>
        <Field label="Course" hint="Leave blank when players pick their own course per match.">
          <select
            value={form.courseId}
            onChange={(e) => setForm({ ...form, courseId: e.target.value })}
            className={inputClass}
          >
            <option value="">No course (per match)</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
                {c.tees ? ` — ${c.tees}` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {leagueTeams && leagueTeams.length > 0 && (
        <Field
          label="Monthly bonus point"
          optional
          hint="Normally computed (most points, then captains' lowest net). Set it here when the card-off can't be resolved from the app."
        >
          <select
            value={form.bonusTeamId}
            onChange={(e) => setForm({ ...form, bonusTeamId: e.target.value })}
            className={inputClass}
          >
            <option value="">Automatic</option>
            {leagueTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
      )}

      <ToggleList>
        <ToggleRow
          label="Locked"
          description="Freezes score entry for every match in the round."
          checked={form.locked}
          onChange={(locked) => setForm({ ...form, locked })}
        />
        <ToggleRow
          label="Track drives"
          description="Scramble and shamble only — records whose drive was used."
          checked={form.trackDrives}
          onChange={(trackDrives) => setForm({ ...form, trackDrives })}
        />
      </ToggleList>

      <FieldGroup
        title="Skins"
        description={
          skinsEligible
            ? "Pots for this round. Leave at 0 to run no skins game."
            : "Singles and best ball only — ignored for the current format."
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <Field label="Gross pot $">
            <input
              type="number"
              min="0"
              value={form.skinsGrossPot}
              onChange={(e) => setForm({ ...form, skinsGrossPot: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Net pot $">
            <input
              type="number"
              min="0"
              value={form.skinsNetPot}
              onChange={(e) => setForm({ ...form, skinsNetPot: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Handicap %">
            <input
              type="number"
              min="0"
              max="100"
              value={form.skinsHandicapPercent}
              onChange={(e) => setForm({ ...form, skinsHandicapPercent: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
      </FieldGroup>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
