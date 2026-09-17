/**
 * League "Set up match" panel (Putt Pirates): the two players pick the course
 * they're playing and type their course handicaps for the day; the server
 * gives the higher handicap the difference on the hardest holes. Shown on the
 * match page until the card is set up, then as a one-line summary.
 *
 * Players can re-run it until a score is entered; after that only an admin can.
 *
 * There's no fixed course list: the Course dropdown also offers "Add a new
 * course…" and "Add tees to an existing course…", which open an inline
 * CourseCreateForm; the new course is selected as soon as it's saved.
 */

import { useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { useCourses } from "../../hooks/useCourses";
import CourseCreateForm, { type CourseCreateMode } from "./CourseCreateForm";
import { useToast } from "../../contexts/ToastContext";
import { matchApi } from "../../api/match";
import { getErrorMessage } from "../../api/errors";
import { allocateStrokes } from "../../utils/captainsMatchScoring";
import type { CourseDoc, MatchDoc } from "../../types";

interface Props {
  match: MatchDoc;
  /** Whether the viewer may set the card up (a participant or an admin). */
  canSetup: boolean;
  isAdmin: boolean;
  /** Any hole already has a score — players are locked out, admins aren't. */
  hasScores: boolean;
  nameOf: (pid: string | undefined) => string;
  /** Called after a successful save (e.g. to refetch on the admin page). */
  onSaved?: () => void;
  /** Admin page: start expanded. */
  defaultOpen?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/** Sentinel <option> values in the Course dropdown that open the create form. */
const NEW_COURSE = "__new_course__";
const NEW_TEES = "__new_tees__";

/** Courses grouped by name (one <optgroup> per course, one <option> per tees). */
function groupByName(courses: CourseDoc[]): { name: string; items: CourseDoc[] }[] {
  const groups = new Map<string, { name: string; items: CourseDoc[] }>();
  for (const c of courses) {
    const name = (c.name || c.id).trim();
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name, items: [] });
    groups.get(key)!.items.push(c);
  }
  return [...groups.values()];
}

export default function MatchSetupPanel({ match, canSetup, isAdmin, hasScores, nameOf, onSaved, defaultOpen }: Props) {
  const aId = match.teamAPlayers?.[0]?.playerId ?? "";
  const bId = match.teamBPlayers?.[0]?.playerId ?? "";
  const isSetUp = !!match.courseId;
  const manual = !!match.manualResult;
  const [open, setOpen] = useState(defaultOpen ?? !isSetUp);
  const { courses, loading: coursesLoading, error: coursesError, addCourse } = useCourses(open);
  const { showToast } = useToast();

  const [courseId, setCourseId] = useState(match.courseId ?? "");
  const [hcpA, setHcpA] = useState(match.courseHandicaps?.[0] != null ? String(match.courseHandicaps[0]) : "");
  const [hcpB, setHcpB] = useState(match.courseHandicaps?.[1] != null ? String(match.courseHandicaps[1]) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Non-null while the inline "add course / add tees" form is open. */
  const [creating, setCreating] = useState<CourseCreateMode | null>(null);

  // Keep the form in step with the doc (another device may have set it up).
  useEffect(() => {
    setCourseId(match.courseId ?? "");
    setHcpA(match.courseHandicaps?.[0] != null ? String(match.courseHandicaps[0]) : "");
    setHcpB(match.courseHandicaps?.[1] != null ? String(match.courseHandicaps[1]) : "");
  }, [match.courseId, match.courseHandicaps]);

  const course: CourseDoc | undefined = useMemo(() => courses.find((c) => c.id === courseId), [courses, courseId]);
  const courseGroups = useMemo(() => groupByName(courses), [courses]);

  const onCourseChange = (value: string) => {
    if (value === NEW_COURSE || value === NEW_TEES) {
      setCreating(value === NEW_COURSE ? "course" : "tees");
      return;
    }
    setCreating(null);
    setCourseId(value);
  };

  const onCourseCreated = (created: CourseDoc) => {
    addCourse(created);
    setCourseId(created.id);
    setCreating(null);
    showToast({ variant: "success", message: `${created.name}${created.tees ? ` — ${created.tees}` : ""} added.` });
  };

  const preview = useMemo(() => {
    const a = Number(hcpA); const b = Number(hcpB);
    if (!Number.isInteger(a) || !Number.isInteger(b) || hcpA === "" || hcpB === "") return null;
    const diff = Math.abs(a - b);
    const who = a > b ? aId : b > a ? bId : null;
    const strokes = course ? allocateStrokes(diff, course.holes) : null;
    const holes = strokes ? strokes.map((s, i) => (s ? i + 1 : 0)).filter(Boolean) : [];
    return { diff, who, holes };
  }, [hcpA, hcpB, aId, bId, course]);

  const playersLocked = hasScores && !isAdmin;
  const canEditNow = canSetup && !manual && !playersLocked && match.locked !== true;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!courseId) { setError("Pick the course you're playing."); return; }
    const a = Number(hcpA); const b = Number(hcpB);
    if (hcpA === "" || hcpB === "" || !Number.isInteger(a) || !Number.isInteger(b)) {
      setError("Enter both course handicaps as whole numbers.");
      return;
    }
    setBusy(true);
    try {
      await matchApi.setupMatchCard({ matchId: match.id, courseId, courseHandicaps: { [aId]: a, [bId]: b } });
      showToast({ variant: "success", message: "Course and strokes set — you're ready to score." });
      setOpen(false);
      onSaved?.();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't set up the match"));
    } finally {
      setBusy(false);
    }
  };

  if (manual) return null;

  // Collapsed summary once set up.
  if (!open) {
    const a = match.courseHandicaps?.[0]; const b = match.courseHandicaps?.[1];
    const strokesA = (match.teamAPlayers?.[0]?.strokesReceived ?? []).filter((s) => s === 1).length;
    const strokesB = (match.teamBPlayers?.[0]?.strokesReceived ?? []).filter((s) => s === 1).length;
    const getter = strokesA > 0 ? `${nameOf(aId)} gets ${strokesA}` : strokesB > 0 ? `${nameOf(bId)} gets ${strokesB}` : "no strokes";
    return (
      <Card className="border-border/80 bg-card/85">
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0 text-xs text-muted-foreground">
            {isSetUp ? (
              <>
                <span className="font-semibold text-foreground">
                  {course ? `${course.name}${course.tees ? ` — ${course.tees}` : ""}` : "Course set"}
                </span>
                {a != null && b != null && <span> · {a} vs {b} · {getter}</span>}
              </>
            ) : (
              <span>Course and strokes not set.</span>
            )}
          </div>
          {canEditNow && (
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Settings2 className="h-4 w-4" />
              {isSetUp ? "Change" : "Set up"}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-card/90">
      <CardContent className="space-y-4 py-4">
        <div>
          <div className="text-sm font-semibold text-foreground">Set up the match</div>
          <div className="text-xs text-muted-foreground">
            Pick your course and enter each player's <strong>course handicap</strong> for the tees you're
            playing (from the GHIN app). The higher handicap gets the difference on the hardest holes.
          </div>
        </div>

        {!canEditNow ? (
          <p className="text-sm text-muted-foreground">
            {playersLocked
              ? "Scores have been entered — ask an admin to change the course or strokes."
              : match.locked
                ? "This match is locked."
                : "Only the two players in this match (or an admin) can set it up."}
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Course</span>
              <select
                value={creating ? (creating === "course" ? NEW_COURSE : NEW_TEES) : courseId}
                onChange={(e) => onCourseChange(e.target.value)}
                className={inputClass}
                disabled={coursesLoading}
              >
                <option value="">{coursesLoading ? "Loading courses…" : "Choose a course…"}</option>
                {courseGroups.map((g) =>
                  g.items.length === 1 && !g.items[0].tees ? (
                    <option key={g.items[0].id} value={g.items[0].id}>{g.name}</option>
                  ) : (
                    <optgroup key={g.name} label={g.name}>
                      {g.items.map((c) => (
                        <option key={c.id} value={c.id}>
                          {g.name}{c.tees ? ` — ${c.tees}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  )
                )}
                {!coursesLoading && (
                  <optgroup label="Not listed?">
                    <option value={NEW_COURSE}>＋ Add a new course…</option>
                    {courses.length > 0 && <option value={NEW_TEES}>＋ Add tees to an existing course…</option>}
                  </optgroup>
                )}
              </select>
              {coursesError && <span className="text-xs text-destructive">{coursesError}</span>}
              {!coursesLoading && courses.length === 0 && !creating && (
                <span className="text-xs text-muted-foreground">No courses yet — add yours from the dropdown.</span>
              )}
            </label>
            {creating && (
              <CourseCreateForm
                mode={creating}
                courses={courses}
                onCreated={onCourseCreated}
                onCancel={() => setCreating(null)}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="block truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">{nameOf(aId)}</span>
                <input type="number" inputMode="numeric" step="1" min="-10" max="54" value={hcpA} onChange={(e) => setHcpA(e.target.value)} placeholder="Course hcp" className={inputClass} />
              </label>
              <label className="block space-y-1">
                <span className="block truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">{nameOf(bId)}</span>
                <input type="number" inputMode="numeric" step="1" min="-10" max="54" value={hcpB} onChange={(e) => setHcpB(e.target.value)} placeholder="Course hcp" className={inputClass} />
              </label>
            </div>
            {preview && (
              <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                {preview.diff === 0
                  ? "Equal handicaps — no strokes either way."
                  : `${nameOf(preview.who ?? undefined)} gets ${Math.min(preview.diff, 18)} stroke${preview.diff === 1 ? "" : "s"}` +
                    (preview.holes.length > 0 ? ` on hole${preview.holes.length === 1 ? "" : "s"} ${preview.holes.join(", ")}.` : course ? "." : " — pick a course to see the holes.")}
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              {isSetUp && (
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={busy || coursesLoading || !!creating}>
                {busy ? "Saving…" : isSetUp ? "Update strokes" : "Save & start scoring"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
