/**
 * Inline "add a course" form for the league match setup panel.
 *
 * Two modes, picked from the Course dropdown:
 *  - "course": a brand-new course (name + tees + rating/slope + 18 holes).
 *  - "tees":   a new set of tees for a course already in the list. The name is
 *              fixed and the pars/handicap indexes are copied from that course
 *              (they're the same from every tee box); only the tees name,
 *              rating, slope and yardages need typing.
 *
 * Each `courses/{id}` doc is one course+tees combination, so both modes create
 * a new doc through the player-callable `createCourse`. Once saved it is
 * selectable by everyone setting up a match.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { matchApi } from "../../api/match";
import { getErrorMessage } from "../../api/errors";
import { cn } from "../../lib/utils";
import type { CourseDoc } from "../../types";

export type CourseCreateMode = "course" | "tees";

interface HoleRow {
  par: string;
  hcpIndex: string;
  yards: string;
}

interface Props {
  mode: CourseCreateMode;
  /** Every course currently in the list (for the "new tees" base picker). */
  courses: CourseDoc[];
  onCreated: (course: CourseDoc) => void;
  onCancel: () => void;
}

const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted disabled:text-muted-foreground";
const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

const blankHoles = (): HoleRow[] => Array.from({ length: 18 }, () => ({ par: "4", hcpIndex: "", yards: "" }));

/** Pars and handicap indexes from a course, yardage left blank (it differs per tee). */
function holesFrom(course: CourseDoc): HoleRow[] {
  const rows = blankHoles();
  (course.holes ?? []).forEach((h) => {
    if (h.number >= 1 && h.number <= 18) {
      rows[h.number - 1] = { par: String(h.par ?? 4), hcpIndex: h.hcpIndex ? String(h.hcpIndex) : "", yards: "" };
    }
  });
  return rows;
}

export default function CourseCreateForm({ mode, courses, onCreated, onCancel }: Props) {
  // Distinct course names for the "new tees" picker; the first doc of each name is the template.
  const baseCourses = useMemo(() => {
    const seen = new Map<string, CourseDoc>();
    for (const c of courses) {
      const key = (c.name ?? "").trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, c);
    }
    return [...seen.values()];
  }, [courses]);

  const [baseId, setBaseId] = useState(mode === "tees" && baseCourses.length === 1 ? baseCourses[0].id : "");
  const base = useMemo(() => baseCourses.find((c) => c.id === baseId), [baseCourses, baseId]);
  const existingTees = useMemo(
    () =>
      base
        ? courses
            .filter((c) => (c.name ?? "").trim().toLowerCase() === (base.name ?? "").trim().toLowerCase())
            .map((c) => c.tees?.trim() || "(no tees listed)")
        : [],
    [courses, base]
  );

  const [name, setName] = useState("");
  const [tees, setTees] = useState("");
  const [rating, setRating] = useState("");
  const [slope, setSlope] = useState("");
  const [holes, setHoles] = useState<HoleRow[]>(blankHoles());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New tees: copy the layout from the base course whenever it changes.
  useEffect(() => {
    if (mode !== "tees") return;
    if (base) {
      setName(base.name ?? "");
      setHoles(holesFrom(base));
    } else {
      setName("");
      setHoles(blankHoles());
    }
  }, [mode, base]);

  const parTotal = useMemo(() => holes.reduce((sum, h) => sum + (Number(h.par) || 0), 0), [holes]);

  const hcpProblem = useMemo(() => {
    const used = holes.map((h) => Number(h.hcpIndex)).filter((n) => Number.isFinite(n) && n > 0);
    const dupes = used.filter((n, i) => used.indexOf(n) !== i);
    if (dupes.length > 0) return `Handicap index repeated: ${[...new Set(dupes)].sort((a, b) => a - b).join(", ")}`;
    const missing = Array.from({ length: 18 }, (_, i) => i + 1).filter((n) => !used.includes(n));
    if (missing.length > 0) return `Handicap index still needed: ${missing.join(", ")}`;
    return null;
  }, [holes]);

  const updateHole = (idx: number, patch: Partial<HoleRow>) =>
    setHoles((prev) => prev.map((h, i) => (i === idx ? { ...h, ...patch } : h)));

  const submit = async () => {
    setError(null);
    if (mode === "tees" && !base) { setError("Pick the course you're adding tees to."); return; }
    if (!name.trim()) { setError("Enter the course name."); return; }
    if (mode === "tees" && !tees.trim()) { setError("Enter the name of the tees (e.g. Blue)."); return; }
    if (hcpProblem) { setError(hcpProblem); return; }
    const ratingNum = Number(rating); const slopeNum = Number(slope);
    if (rating === "" || !Number.isFinite(ratingNum)) { setError("Enter the course rating for these tees."); return; }
    if (slope === "" || !Number.isInteger(slopeNum)) { setError("Enter the slope for these tees (whole number)."); return; }

    const payload = {
      name: name.trim(),
      ...(tees.trim() ? { tees: tees.trim() } : {}),
      par: parTotal,
      rating: ratingNum,
      slope: slopeNum,
      holes: holes.map((h, i) => ({
        number: i + 1,
        par: Number(h.par),
        hcpIndex: Number(h.hcpIndex),
        ...(h.yards !== "" ? { yards: Number(h.yards) } : {}),
      })),
    };
    setBusy(true);
    try {
      const res = await matchApi.createCourse(payload);
      onCreated({ id: res.courseId, ...payload });
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't add the course"));
    } finally {
      setBusy(false);
    }
  };

  const cell = cn(inputClass, "px-1.5 py-1.5 text-center");

  // This sits inside the setup panel's <form>, so it can't be a <form> itself:
  // Enter submits this creator, not the outer match setup.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      e.stopPropagation();
      if (!busy) void submit();
    }
  };

  return (
    <div onKeyDown={onKeyDown} className="space-y-3 rounded-lg border border-primary/30 bg-muted/30 p-3">
      <div>
        <div className="text-sm font-semibold text-foreground">
          {mode === "tees" ? "Add tees to a course" : "Add a new course"}
        </div>
        <div className="text-xs text-muted-foreground">
          {mode === "tees"
            ? "Pars and handicap indexes are copied from the course — just add the tees name, rating, slope and (optionally) yardages."
            : "Copy the pars and handicap (stroke) indexes off the scorecard. Once saved, anyone can pick it."}
        </div>
      </div>

      {mode === "tees" && (
        <label className="block space-y-1">
          <span className={labelClass}>Course</span>
          <select value={baseId} onChange={(e) => setBaseId(e.target.value)} className={inputClass}>
            <option value="">Choose a course…</option>
            {baseCourses.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.id}</option>
            ))}
          </select>
          {base && existingTees.length > 0 && (
            <span className="block text-xs text-muted-foreground">Already listed: {existingTees.join(", ")}</span>
          )}
        </label>
      )}

      {mode === "course" && (
        <label className="block space-y-1">
          <span className={labelClass}>Course name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chambers Bay" className={inputClass} autoFocus />
        </label>
      )}

      <div className="grid grid-cols-3 gap-2">
        <label className="block space-y-1">
          <span className={labelClass}>Tees</span>
          <input type="text" value={tees} onChange={(e) => setTees(e.target.value)} placeholder="e.g. Blue" className={inputClass} autoFocus={mode === "tees"} />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Rating</span>
          <input type="number" inputMode="decimal" step="0.1" min="50" max="90" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="71.2" className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Slope</span>
          <input type="number" inputMode="numeric" step="1" min="55" max="155" value={slope} onChange={(e) => setSlope(e.target.value)} placeholder="128" className={inputClass} />
        </label>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className={labelClass}>Holes</span>
          <span className="text-xs text-muted-foreground">Par {parTotal}</span>
        </div>
        <div className="text-[0.7rem] leading-snug text-muted-foreground">
          Hcp = handicap index (1 = hardest, 18 = easiest). Each of 1–18 used once. Yards optional.
        </div>
        <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr] items-center gap-1.5">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">#</div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Par</div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Hcp</div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Yards</div>
          {holes.map((h, i) => (
            <HoleInputs key={i} index={i} row={h} cell={cell} readOnlyLayout={mode === "tees" && !!base} onChange={updateHole} />
          ))}
        </div>
        {hcpProblem && <div className="text-xs text-amber-700">{hcpProblem}</div>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" className="flex-1" disabled={busy} onClick={() => void submit()}>
          {busy ? "Adding…" : mode === "tees" ? "Add tees" : "Add course"}
        </Button>
      </div>
    </div>
  );
}

function HoleInputs({
  index, row, cell, readOnlyLayout, onChange,
}: {
  index: number;
  row: HoleRow;
  cell: string;
  /** New tees: par/hcp come from the base course and shouldn't be edited here. */
  readOnlyLayout: boolean;
  onChange: (idx: number, patch: Partial<HoleRow>) => void;
}) {
  return (
    <>
      <div className="text-sm font-semibold text-muted-foreground">{index + 1}</div>
      <input type="number" inputMode="numeric" min="3" max="6" value={row.par} onChange={(e) => onChange(index, { par: e.target.value })} className={cell} aria-label={`Hole ${index + 1} par`} readOnly={readOnlyLayout} tabIndex={readOnlyLayout ? -1 : undefined} />
      <input type="number" inputMode="numeric" min="1" max="18" value={row.hcpIndex} onChange={(e) => onChange(index, { hcpIndex: e.target.value })} className={cell} aria-label={`Hole ${index + 1} handicap index`} readOnly={readOnlyLayout} tabIndex={readOnlyLayout ? -1 : undefined} />
      <input type="number" inputMode="numeric" min="0" value={row.yards} onChange={(e) => onChange(index, { yards: e.target.value })} placeholder="—" className={cell} aria-label={`Hole ${index + 1} yards`} />
    </>
  );
}
