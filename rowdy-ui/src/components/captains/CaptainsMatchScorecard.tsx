import { useEffect, useRef, useState } from "react";
import type { CourseDoc } from "../../types";
import type { HoleData } from "../match/PlayerScoreRow";
import { ScorecardTableHeader } from "../match/ScorecardTableHeader";
import { ScoreShapeOverlay } from "../match/ScoreShapeOverlay";
import { isValidGross } from "../../utils/matchScoring";
import {
  HOLES_PER_ROUND,
  formatClinchChip,
  formatMarginChip,
  type CaptainsRoundSummary,
  type CaptainsSide,
} from "../../utils/captainsMatchScoring";

const AS_GRAY = "#94a3b8";

export type CaptainsMatchScorecardProps = {
  round: CaptainsRoundSummary;
  /** The app course the round was played on, for par / hcp / yards. */
  course: CourseDoc | null;
  labelA: string;
  labelB: string;
  colorA: string;
  colorB: string;
  /** Present when the match was decided in this round — labels the deciding hole. */
  clinch: { winner: CaptainsSide; margin: number; toPlay: number } | null;
  tSeries?: string;
};

type PlayerRow = {
  side: CaptainsSide;
  label: string;
  color: string;
  gross: (number | null)[];
  strokes: number[];
};

function sumGross(values: (number | null)[], from: number, to: number): number | null {
  const scored = values.slice(from, to).filter((g): g is number => isValidGross(g));
  return scored.length > 0 ? scored.reduce((sum, g) => sum + g, 0) : null;
}

/**
 * One round of the captains' match as a read-only 18-hole card: the match
 * page's layout (HOLE / Hcp / Yards / Par header, player row, running status
 * row, player row) with no inputs.
 *
 * Cells are plain divs rather than ScoreInputCell, which mounts a number picker
 * per cell. They keep its look: the hole winner's cell is tinted, stroke holes
 * get the sky-blue dot, and birdies/bogeys get the shared circle/square shapes.
 * The status row is the running SEASON margin, since the match carries from
 * round to round.
 */
export default function CaptainsMatchScorecard({
  round,
  course,
  labelA,
  labelB,
  colorA,
  colorB,
  clinch,
  tSeries = "puttPirates",
}: CaptainsMatchScorecardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Fade hint on the right edge while the card still has content off-screen,
  // matching the match scorecard's affordance.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const holeInfo = new Map((course?.holes ?? []).map((h) => [h.number, h]));
  const holes: HoleData[] = Array.from({ length: HOLES_PER_ROUND }, (_, i) => {
    const info = holeInfo.get(i + 1);
    return {
      k: String(i + 1),
      num: i + 1,
      input: {},
      par: info?.par ?? 0,
      hcpIndex: info?.hcpIndex,
      yards: info?.yards,
    };
  });
  const parSum = (from: number, to: number) => holes.slice(from, to).reduce((sum, h) => sum + h.par, 0);
  const totals = { parOut: parSum(0, 9), parIn: parSum(9, 18), parTotal: parSum(0, 18) };

  // Grey the holes after the one that decided the match — or the whole card
  // when this round came after it — like the match page's post-match holes.
  const closingHole = round.postMatch ? -1 : round.clinchedAtHole;
  const isPostMatch = (i: number) => closingHole !== null && i > closingHole;

  const card = round.round;
  const rows: PlayerRow[] = [
    {
      side: "A",
      label: labelA,
      color: colorA,
      gross: Array.isArray(card.grossA) ? card.grossA : [],
      strokes: Array.isArray(card.strokesA) ? card.strokesA : [],
    },
    {
      side: "B",
      label: labelB,
      color: colorB,
      gross: Array.isArray(card.grossB) ? card.grossB : [],
      strokes: Array.isArray(card.strokesB) ? card.strokesB : [],
    },
  ];

  const renderScoreCell = (row: PlayerRow, i: number) => {
    const gross = row.gross[i];
    const value = isValidGross(gross) ? gross : null;
    const muted = isPostMatch(i);
    const wonHole = round.holeResults[i] === row.side;
    const hasStroke = Number(row.strokes[i]) === 1;
    const tint = wonHole && !muted ? `color-mix(in srgb, ${row.color} 15%, var(--card-bg))` : undefined;
    return (
      <td key={i} className={`p-0.5 ${i === 9 ? "border-l-2 border-border" : ""} ${muted ? "bg-muted/60" : ""}`}>
        <div
          className={`relative mx-auto flex h-11 w-11 select-none items-center justify-center rounded-md border text-base font-semibold ${
            muted ? "border-border bg-muted text-muted-foreground" : "border-border bg-card text-foreground"
          }`}
          style={tint ? { background: tint, borderColor: tint } : undefined}
          aria-label={`Hole ${i + 1}: ${value ?? "no score"}${hasStroke ? ", gets a stroke" : ""}${wonHole ? ", won the hole" : ""}`}
        >
          {value ?? ""}
          <ScoreShapeOverlay value={value} par={holes[i].par} muted={muted} />
          {hasStroke && <div className="absolute right-1 top-1 h-2 w-2 rounded-full bg-sky-400" />}
        </div>
      </td>
    );
  };

  const renderPlayerRow = (row: PlayerRow) => (
    <tr key={row.side} className={row.side === "B" ? "border-b-2 border-border" : ""}>
      <td
        className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1 text-left font-semibold"
        style={{ color: row.color }}
      >
        {row.label}
      </td>
      {Array.from({ length: 9 }, (_, i) => renderScoreCell(row, i))}
      <td className="border-l-2 border-border bg-muted py-1 font-bold text-foreground">
        {sumGross(row.gross, 0, 9) ?? "–"}
      </td>
      {Array.from({ length: 9 }, (_, i) => renderScoreCell(row, 9 + i))}
      <td className="border-l-2 border-border bg-muted py-1 font-bold text-foreground">
        {sumGross(row.gross, 9, 18) ?? "–"}
      </td>
      <td className="bg-muted py-1 text-base font-bold text-foreground">{sumGross(row.gross, 0, 18) ?? "–"}</td>
    </tr>
  );

  const renderStatusCell = (i: number) => {
    const margin = round.marginAfterHole[i];
    const isClosing = clinch !== null && i === round.clinchedAtHole;
    let text = "";
    let background = "transparent";
    let color = AS_GRAY;
    if (isClosing && clinch) {
      text = formatClinchChip(clinch.margin, clinch.toPlay);
      background = clinch.winner === "A" ? colorA : colorB;
      color = "#fff";
    } else if (margin !== null) {
      text = formatMarginChip(margin);
      if (margin !== 0) {
        background = margin > 0 ? colorA : colorB;
        color = "#fff";
      }
    }
    return (
      <td
        key={`status-${i}`}
        className={`px-0.5 py-1 ${i === 9 ? "border-l-2 border-border" : ""} ${isPostMatch(i) ? "bg-muted/60" : ""}`}
      >
        <div
          className="whitespace-nowrap rounded px-1 py-0.5 text-center text-xs font-bold"
          style={{ color, backgroundColor: background }}
        >
          {text}
        </div>
      </td>
    );
  };

  return (
    <div className="card relative overflow-hidden p-0">
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
            closingHole={closingHole}
            totals={totals}
            tSeries={tSeries}
            courseTees={card.tees ?? course?.tees}
          />
          <tbody>
            {renderPlayerRow(rows[0])}

            {/* Running season status after each hole */}
            <tr className="border-y-2 border-border bg-card">
              <td className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Status
              </td>
              {Array.from({ length: 9 }, (_, i) => renderStatusCell(i))}
              <td className="border-l-2 border-border bg-muted py-1" />
              {Array.from({ length: 9 }, (_, i) => renderStatusCell(9 + i))}
              <td className="border-l-2 border-border bg-muted py-1" />
              <td className="bg-muted py-1" />
            </tr>

            {renderPlayerRow(rows[1])}
          </tbody>
        </table>
      </div>
    </div>
  );
}
