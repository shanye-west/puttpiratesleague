/**
 * The GHIN card (league singles): what each player posts to GHIN. Every hole
 * is capped at net double bogey off the player's FULL course handicap — the
 * match's spun-down strokes play no part. Opened from the "Course set" card.
 * Display only; nothing here touches match scoring.
 *
 * Drawn like the match scorecard (same header, cells and sideways scroll) so it
 * reads as the same card with GHIN numbers on it.
 */

import { useEffect, useRef, useState } from "react";
import { Modal } from "../Modal";
import type { HoleData } from "./PlayerScoreRow";
import { ScorecardTableHeader } from "./ScorecardTableHeader";
import { ScoreShapeOverlay } from "./ScoreShapeOverlay";
import { formatCourseHandicap, type GhinAdjustedCard, type GhinHole } from "../../utils/ghin";

export type GhinScorecardPlayer = {
  key: string;
  /** Short name for the summary tile. */
  name: string;
  /** Row label — the same name the match scorecard shows. */
  label: string;
  color: string;
  courseHandicap: number | null;
  /** Null when there's no course handicap or a scored hole has no stroke index. */
  card: GhinAdjustedCard | null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  holes: HoleData[];
  players: GhinScorecardPlayer[];
  courseTees?: string;
  tSeries: string;
}

const grossSum = (card: GhinAdjustedCard | null, from: number, to: number): number | null => {
  const scored = (card?.holes.slice(from, to) ?? []).filter((h): h is GhinHole => h !== null);
  return scored.length ? scored.reduce((s, h) => s + h.gross, 0) : null;
};

export function GhinScorecardModal({ isOpen, onClose, holes, players, courseTees, tSeries }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Fade hint on the right edge while the card still has content off-screen,
  // matching the match scorecard. Measured on open — the closed dialog has no
  // layout.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isOpen) return;
    el.scrollLeft = 0;
    const update = () => setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [isOpen]);

  const parSum = (from: number, to: number) => holes.slice(from, to).reduce((s, h) => s + (h.par || 0), 0);
  const totals = { parOut: parSum(0, 9), parIn: parSum(9, 18), parTotal: parSum(0, 18) };
  const missingCard = players.some((p) => p.courseHandicap != null && !p.card);

  const renderScoreCell = (p: GhinScorecardPlayer, i: number) => {
    const hole = p.card?.holes[i] ?? null;
    const strokes = Math.max(0, p.card?.strokes[i] ?? 0);
    const value = hole?.adjusted ?? null;
    const strokeText = strokes > 0 ? `, ${strokes} stroke${strokes === 1 ? "" : "s"}` : "";
    return (
      <td key={i} className={`p-0.5 ${i === 9 ? "border-l-2 border-border" : ""}`}>
        <div
          className={`relative mx-auto flex h-11 w-11 select-none items-center justify-center rounded-md border text-base font-semibold ${
            hole?.capped ? "border-amber-400 bg-amber-100 text-amber-900" : "border-border bg-card text-foreground"
          }`}
          title={hole?.capped ? `Scored ${hole.gross} — counts as ${hole.adjusted} (net double bogey)` : undefined}
          aria-label={`Hole ${i + 1}: ${value ?? "no score"}${hole?.capped ? `, scored ${hole.gross}, capped at net double bogey` : ""}${strokeText}`}
        >
          {value ?? ""}
          <ScoreShapeOverlay value={value} par={holes[i].par} />
          {strokes > 0 && (
            <div className="absolute right-1 top-1 flex gap-0.5">
              {Array.from({ length: strokes }, (_, s) => (
                <div key={s} className="h-2 w-2 rounded-full bg-sky-400" />
              ))}
            </div>
          )}
          {hole?.capped && (
            <div className="absolute bottom-0.5 left-1 text-[9px] font-semibold leading-none text-amber-700 line-through">
              {hole.gross}
            </div>
          )}
        </div>
      </td>
    );
  };

  // Thick rule under each player — under the first it stands in for the match
  // card's status row between the two players.
  const renderPlayerRow = (p: GhinScorecardPlayer) => (
    <tr key={p.key} className="border-b-2 border-border">
      <td
        className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1 text-left font-semibold"
        style={{ color: p.color }}
      >
        {p.label}
      </td>
      {Array.from({ length: 9 }, (_, i) => renderScoreCell(p, i))}
      <td className="border-l-2 border-border bg-muted py-1 font-bold text-foreground">{p.card?.out ?? "–"}</td>
      {Array.from({ length: 9 }, (_, i) => renderScoreCell(p, 9 + i))}
      <td className="border-l-2 border-border bg-muted py-1 font-bold text-foreground">{p.card?.in ?? "–"}</td>
      <td className="bg-muted py-1 text-base font-bold text-foreground">{p.card?.total ?? "–"}</td>
    </tr>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="GHIN Scores" maxWidth="max-w-4xl" padding="p-3">
      <div className="space-y-3">
        {/* The number to post, per player */}
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          {players.map((p) => {
            const postable = p.card?.postable ?? null;
            return (
              <div key={p.key} className="rounded-lg border border-border bg-muted/40 px-2 py-2 text-center">
                <div className="truncate text-xs font-semibold" style={{ color: p.color }}>{p.name}</div>
                <div className="text-3xl font-extrabold leading-tight tabular-nums text-foreground">{postable ?? "–"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {postable != null ? `Gross ${grossSum(p.card, 0, 18)}` : "After all 18 holes"}
                  {p.courseHandicap != null && ` · CH ${formatCourseHandicap(p.courseHandicap)}`}
                </div>
                {!!p.card?.strokesRemoved && (
                  <div className="text-[11px] font-semibold text-amber-700">
                    −{p.card.strokesRemoved} for net double bogey
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {missingCard && (
          <p className="text-center text-xs text-destructive">
            This course is missing hole handicaps, so GHIN scores can't be worked out.
          </p>
        )}

        {/* The card — same layout as the match scorecard, GHIN numbers on it */}
        <div className="card relative mb-0 overflow-hidden p-0">
          {canScrollRight && (
            <div
              className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-8"
              style={{ background: "linear-gradient(to right, transparent, rgba(0,0,0,0.15))" }}
            />
          )}
          <div ref={scrollRef} className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="w-max border-collapse text-center text-sm" style={{ minWidth: "100%" }}>
              <ScorecardTableHeader
                holes={holes}
                closingHole={null}
                totals={totals}
                tSeries={tSeries}
                courseTees={courseTees}
              />
              <tbody>{players.map(renderPlayerRow)}</tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Post the big number as your total score in the GHIN app. For handicap purposes each hole maxes out at{" "}
          <span className="font-semibold text-foreground">net double bogey</span>: par + 2 + the strokes from your full
          course handicap (<span className="text-sky-500">●</span> blue dots) — not the match strokes. Highlighted holes
          were capped (your actual score is crossed out in the corner). Entering hole-by-hole in GHIN does this for you.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-muted py-2.5 text-sm font-semibold text-foreground transition-transform active:scale-95"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
