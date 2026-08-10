import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Card } from "../ui/card";

export interface AdminSectionProps {
  title: ReactNode;
  /** Optional explanatory copy shown under the title. */
  description?: ReactNode;
  /** Right-aligned controls in the section header (a link, a small button). */
  actions?: ReactNode;
  /** Use for destructive sections to get a red-tinted header. */
  danger?: boolean;
  /** Removes the body padding — for full-bleed lists/tables. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Titled card section used to group admin controls. The header is a distinct
 * band so a long page reads as a stack of discrete tasks rather than one wall
 * of forms.
 */
export default function AdminSection({
  title,
  description,
  actions,
  danger = false,
  flush = false,
  className,
  children,
}: AdminSectionProps) {
  return (
    <Card className={cn(danger && "border-destructive/40", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <h2 className={cn("text-base leading-tight", danger && "text-destructive")}>{title}</h2>
          {description && (
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </Card>
  );
}
