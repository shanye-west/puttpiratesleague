/**
 * Page shell for every admin route.
 *
 * Before this, each admin page re-declared its own `<Layout>` + container +
 * banner + "Loading..." text, and none of them told you where you were. This
 * standardizes the frame: breadcrumb trail → page heading (with badges and
 * actions) → status banner → content, plus shared loading and not-found states.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import Layout from "../Layout";
import StatusBanner from "./StatusBanner";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export interface Crumb {
  label: string;
  /** Omit on the current page — the last crumb renders as plain text. */
  to?: string;
}

export interface AdminPageProps {
  /** Page heading. */
  title: ReactNode;
  /** Small uppercase line above the heading — usually the parent context. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Status badges under the heading. */
  badges?: ReactNode;
  /** Buttons/links aligned with the heading. */
  actions?: ReactNode;
  error?: string | null;
  success?: string | null;
  /** Renders the skeleton instead of children. */
  loading?: boolean;
  /** App-header title (defaults to "Admin"; tournament pages pass their name). */
  headerTitle?: string;
  /** Wider container for data-dense pages (course grid, stats tools). */
  wide?: boolean;
  children: ReactNode;
}

export default function AdminPage({
  title,
  eyebrow,
  description,
  breadcrumbs,
  badges,
  actions,
  error,
  success,
  loading = false,
  headerTitle = "Admin",
  wide = false,
  children,
}: AdminPageProps) {
  return (
    <Layout title={headerTitle} showBack>
      <div className={cn("mx-auto w-full space-y-4 px-4 pb-8 pt-4", wide ? "max-w-3xl" : "max-w-2xl")}>
        {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}

        <header className="space-y-2">
          {eyebrow && (
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="min-w-0 text-2xl leading-tight">{title}</h1>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
          </div>
          {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
          {description && <p className="text-sm leading-snug text-muted-foreground">{description}</p>}
        </header>

        <StatusBanner error={error} success={success} />

        {loading ? <AdminSkeleton /> : children}
      </div>
    </Layout>
  );
}

function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {items.map((crumb, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
            {crumb.to && !last ? (
              <Link to={crumb.to} className="rounded px-1 py-0.5 hover:bg-muted hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              <span className={cn("px-1 py-0.5", last && "font-semibold text-foreground")}>{crumb.label}</span>
            )}
            {!last && <ChevronRight className="h-3 w-3 opacity-60" />}
          </span>
        );
      })}
    </nav>
  );
}

/** Placeholder cards shown while a page's data loads. */
export function AdminSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl border border-border/60 bg-muted/50" />
      ))}
    </div>
  );
}

/**
 * Shared "we couldn't find that" page — a dead end with a way out, instead of
 * each route inventing its own banner + back link.
 */
export function AdminNotFound({
  title,
  message,
  backTo,
  backLabel,
  breadcrumbs,
}: {
  title: string;
  message: string;
  backTo: string;
  backLabel: string;
  breadcrumbs?: Crumb[];
}) {
  return (
    <AdminPage title={title} breadcrumbs={breadcrumbs} error={message}>
      <Button asChild variant="outline">
        <Link to={backTo}>{backLabel}</Link>
      </Button>
    </AdminPage>
  );
}
