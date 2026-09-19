import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

export interface MonthChip {
  id: string;
  label: string;
  /** Green count pill — e.g. bet offers waiting in that month. */
  count?: number;
  /** Primary dot — e.g. the viewer still has a match to play that month. */
  dot?: boolean;
  /** Small check — every match that month is final. */
  done?: boolean;
}

/**
 * A row of month chips, one tappable button per month (Bets' open-bets board,
 * the Matches tab). Markers on a chip keep something in an unselected month —
 * offers waiting, your match still to play — from being hidden.
 *
 * `scroll` (default) is a single sideways-scrolling row, for a handful of
 * months; `grid` lays a full season out five to a row so every month is in
 * view at once.
 */
export default function MonthPicker({
  months,
  selectedId,
  onSelect,
  layout = "scroll",
}: {
  months: MonthChip[];
  selectedId: string;
  onSelect: (id: string) => void;
  layout?: "scroll" | "grid";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  // A scrolling row can start with the selected month off-screen: centre it by
  // scrolling the row itself (scrollIntoView would also scroll the page).
  useEffect(() => {
    const row = scrollerRef.current;
    const chip = selectedRef.current;
    if (layout !== "scroll" || !row || !chip) return;
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    row.scrollLeft += c.left + c.width / 2 - (r.left + r.width / 2);
  }, [layout, selectedId]);

  const chips = months.map((mo) => {
    const active = mo.id === selectedId;
    return (
      <button
        key={mo.id}
        ref={active ? selectedRef : undefined}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => onSelect(mo.id)}
        className={`relative flex items-center justify-center gap-1 whitespace-nowrap rounded-full py-1.5 text-xs font-semibold transition-colors ${
          layout === "grid" ? "px-2" : "px-3.5"
        } ${
          active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
        }`}
      >
        {mo.label}
        {mo.done && (
          <>
            <Check className="h-3 w-3 opacity-70" strokeWidth={3} aria-hidden />
            <span className="sr-only">(complete)</span>
          </>
        )}
        {!!mo.count && mo.count > 0 && (
          <span
            className="rounded-full bg-emerald-500 px-1.5 text-[0.6rem] font-bold leading-4 text-white tabular-nums"
            aria-label={`${mo.count} open`}
          >
            {mo.count}
          </span>
        )}
        {mo.dot && (
          <>
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-background" aria-hidden />
            <span className="sr-only">(your match to play)</span>
          </>
        )}
      </button>
    );
  });

  if (layout === "grid") {
    return (
      <div className="grid grid-cols-5 gap-2" role="tablist" aria-label="Month">
        {chips}
      </div>
    );
  }
  return (
    <div ref={scrollerRef} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-2" role="tablist" aria-label="Month">
        {chips}
      </div>
    </div>
  );
}
