import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Field, FieldGroup, ToggleList, ToggleRow } from "./fields";
import { inputClass } from "./inputStyles";
import { cn } from "../../lib/utils";
import type { CourseDoc, SideEventDoc, SideEventNine, SideEventPayout } from "../../types";
import type { SideEventUpdates } from "../../api/adminContracts";

interface SideEventFormState {
  name: string;
  courseId: string;
  nine: SideEventNine;
  locked: boolean;
  hidden: boolean;
  /** Kept as strings so a half-typed amount doesn't fight the input. */
  payoutAmounts: string[];
}

const emptyForm: SideEventFormState = {
  name: "3-Man Scramble",
  courseId: "",
  nine: "front",
  locked: false,
  hidden: false,
  payoutAmounts: ["150", "100", "50"],
};

function eventToForm(e: SideEventDoc): SideEventFormState {
  // payouts is stored sorted by place, so index === place - 1.
  const amounts: string[] = [];
  for (const p of e.payouts ?? []) amounts[p.place - 1] = String(p.amount);
  return {
    name: e.name ?? "",
    courseId: e.courseId ?? "",
    nine: e.nine === "back" ? "back" : "front",
    locked: !!e.locked,
    hidden: !!e.hidden,
    payoutAmounts: Array.from(amounts, (a) => a ?? "0"),
  };
}

function formToUpdates(form: SideEventFormState): SideEventUpdates {
  const payouts: SideEventPayout[] = form.payoutAmounts.map((amount, idx) => ({
    place: idx + 1,
    amount: Number(amount) || 0,
  }));
  return {
    name: form.name.trim() || "Side Event",
    courseId: form.courseId === "" ? null : form.courseId,
    nine: form.nine,
    locked: form.locked,
    hidden: form.hidden,
    payouts,
  };
}

interface SideEventFormProps {
  /** Prefill for edit mode; omit for create. */
  initial?: SideEventDoc;
  courses: CourseDoc[];
  submitting: boolean;
  submitLabel: string;
  onSubmit: (updates: SideEventUpdates) => void;
}

/**
 * Create/edit form for a side event — the optional, for-fun 9-hole game.
 *
 * The payouts editor is the point of the "how many places pay, and for how
 * much" requirement: places are always 1..N in order, so the admin only sets
 * amounts and adds/removes places. It's fully editable after creation, which is
 * why it lives here rather than in a one-time create wizard.
 */
export default function SideEventForm({
  initial,
  courses,
  submitting,
  submitLabel,
  onSubmit,
}: SideEventFormProps) {
  const [form, setForm] = useState<SideEventFormState>(
    initial ? eventToForm(initial) : emptyForm
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formToUpdates(form));
  };

  const setPayout = (index: number, value: string) => {
    const next = [...form.payoutAmounts];
    next[index] = value;
    setForm({ ...form, payoutAmounts: next });
  };

  const addPlace = () => setForm({ ...form, payoutAmounts: [...form.payoutAmounts, "0"] });
  const removeLastPlace = () =>
    setForm({ ...form, payoutAmounts: form.payoutAmounts.slice(0, -1) });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Name" hint="Shown on the page and in the hamburger menu.">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="3-Man Scramble"
          maxLength={60}
          className={inputClass}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Course" hint="Without one the leaderboard ranks by raw total, with no par.">
          <select
            value={form.courseId}
            onChange={(e) => setForm({ ...form, courseId: e.target.value })}
            className={inputClass}
          >
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.id}</option>
            ))}
          </select>
        </Field>
        <Field label="Which nine">
          <select
            value={form.nine}
            onChange={(e) => setForm({ ...form, nine: e.target.value as SideEventNine })}
            className={inputClass}
          >
            <option value="front">Front 9 (holes 1–9)</option>
            <option value="back">Back 9 (holes 10–18)</option>
          </select>
        </Field>
      </div>

      <ToggleList>
        <ToggleRow
          label="Locked"
          description="Freezes score entry for every team."
          checked={form.locked}
          onChange={(locked) => setForm({ ...form, locked })}
        />
        <ToggleRow
          label="Hide from menu"
          description="Keeps the data, drops the link."
          checked={form.hidden}
          onChange={(hidden) => setForm({ ...form, hidden })}
        />
      </ToggleList>

      <FieldGroup
        title="Payouts"
        description="How many places pay, and how much. Editable at any time. Tied teams pool the places they cover and split evenly."
      >
        {form.payoutAmounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payouts — nobody gets paid.</p>
        ) : (
          <div className="space-y-2">
            {form.payoutAmounts.map((amount, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-10 text-sm font-semibold">
                  {idx + 1}
                  {idx === 0 ? "st" : idx === 1 ? "nd" : idx === 2 ? "rd" : "th"}
                </span>
                <span className="text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={amount}
                  onChange={(e) => setPayout(idx, e.target.value)}
                  className={cn(inputClass, "flex-1")}
                  aria-label={`Payout for place ${idx + 1}`}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addPlace}>
            <Plus className="h-4 w-4" />
            Add place
          </Button>
          {form.payoutAmounts.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={removeLastPlace}>
              <Minus className="h-4 w-4" />
              Remove last
            </Button>
          )}
        </div>
      </FieldGroup>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
