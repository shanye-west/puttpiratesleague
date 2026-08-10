/**
 * The admin surface's one clickable-row idiom: title, supporting line, optional
 * status badges, chevron. Every admin list (tournaments, rounds, matches,
 * courses, side events) used to hand-roll this with a literal "→" character.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

export interface NavRowProps {
  to: string;
  title: ReactNode;
  /** Supporting line under the title — format, course, counts. */
  subtitle?: ReactNode;
  /** Status badges rendered to the left of the chevron. */
  badges?: ReactNode;
  /** Leading slot — a day number, an avatar, an icon. */
  leading?: ReactNode;
  /** Interactive controls rendered outside the link (e.g. a lock switch). */
  trailing?: ReactNode;
  /** Draws attention to the row (used for the active tournament). */
  highlight?: boolean;
  className?: string;
}

export default function NavRow({
  to,
  title,
  subtitle,
  badges,
  leading,
  trailing,
  highlight = false,
  className,
}: NavRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border transition-colors",
        highlight ? "border-primary/40 bg-primary/5" : "border-border/70 bg-card",
        className
      )}
    >
      <Link
        to={to}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 hover:bg-muted/60 active:bg-muted"
      >
        {leading}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{title}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {badges && <div className="flex shrink-0 items-center gap-1">{badges}</div>}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
      {trailing && <div className="shrink-0 pr-3">{trailing}</div>}
    </div>
  );
}

/** Consistent empty text for the lists NavRow fills. */
export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
