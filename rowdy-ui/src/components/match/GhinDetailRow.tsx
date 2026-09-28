import { memo } from "react";
import type { HoleData } from "./PlayerScoreRow";
import type { GhinAdjustedCard, GhinHole } from "../../utils/ghin";

export interface GhinDetailRowProps {
  holes: HoleData[];
  /** Null when the card has no course handicap or stroke indexes yet. */
  card: GhinAdjustedCard | null;
  courseHandicap: number | null;
  /** 0-indexed hole where match closed (null if match ongoing or went to 18) */
  closingHole?: number | null;
  /** Closes the table (takes over the last player row's thick bottom border). */
  isLast?: boolean;
}

/** One dot per handicap stroke received (a plus handicap's give-backs show none). */
function StrokeDots({ strokes }: { strokes: number }) {
  if (strokes <= 0) return null;
  return (
    <div className="absolute top-0 right-0.5 flex gap-px" aria-hidden="true">
      {Array.from({ length: strokes }, (_, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-sky-400" />
      ))}
    </div>
  );
}

function HoleCell({
  hole,
  strokes,
  holeNum,
  className,
}: {
  hole: GhinHole | null;
  strokes: number;
  holeNum: number;
  className: string;
}) {
  const strokeText = strokes > 0 ? ` (${strokes} stroke${strokes === 1 ? "" : "s"})` : "";
  return (
    <td className={className}>
      <div className="relative flex h-6 items-center justify-center">
        {hole && !hole.capped && <span className="text-xs text-muted-foreground">{hole.adjusted}</span>}
        {hole?.capped && (
          <span
            className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-amber-100 px-1 text-xs font-bold text-amber-900 ring-1 ring-amber-400"
            title={`Hole ${holeNum}: ${hole.gross} counts as ${hole.adjusted} (net double bogey)${strokeText}`}
            aria-label={`Hole ${holeNum}: ${hole.gross} counts as ${hole.adjusted}, net double bogey${strokeText}`}
          >
            {hole.adjusted}
          </span>
        )}
        <StrokeDots strokes={strokes} />
      </div>
    </td>
  );
}

/**
 * A player's card as posted to GHIN: every hole capped at net double bogey
 * off their full course handicap. Capped holes are highlighted so the player
 * can see how the gross total becomes the GHIN total.
 */
export const GhinDetailRow = memo(function GhinDetailRow({
  holes,
  card,
  courseHandicap,
  closingHole,
  isLast = false,
}: GhinDetailRowProps) {
  const holeCell = (h: HoleData, holeIdx: number, extra = "") => {
    const isPostMatch = closingHole != null && holeIdx > closingHole;
    return (
      <HoleCell
        key={h.k}
        hole={card?.holes[holeIdx] ?? null}
        strokes={card?.strokes[holeIdx] ?? 0}
        holeNum={h.num}
        className={`py-1 px-0.5 ${extra} ${isPostMatch ? "bg-muted/60" : ""}`}
      />
    );
  };

  return (
    <tr className={`border-t border-border ${isLast ? "border-b-2" : ""}`}>
      <td className="sticky left-0 z-10 bg-card text-left px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
        GHIN{courseHandicap != null && <span className="ml-1 font-normal normal-case">· CH {courseHandicap}</span>}
      </td>
      {holes.slice(0, 9).map((h, i) => holeCell(h, i))}
      <td className="py-1 bg-muted text-xs font-semibold text-muted-foreground border-l-2 border-border">
        {card?.out ?? ""}
      </td>
      {holes.slice(9, 18).map((h, i) => holeCell(h, 9 + i, i === 0 ? "border-l-2 border-border" : ""))}
      <td className="py-1 bg-muted text-xs font-semibold text-muted-foreground border-l-2 border-border">
        {card?.in ?? ""}
      </td>
      <td className="py-1 bg-muted text-xs font-bold text-foreground">{card?.total ?? ""}</td>
      <td
        className="py-1 bg-muted text-xs font-semibold text-amber-700 border-l-2 border-border"
        title={card?.strokesRemoved ? `${card.strokesRemoved} stroke${card.strokesRemoved === 1 ? "" : "s"} removed by net double bogey` : undefined}
      >
        {card?.strokesRemoved ? `−${card.strokesRemoved}` : ""}
      </td>
    </tr>
  );
});
