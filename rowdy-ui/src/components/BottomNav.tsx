import { useLocation } from "react-router-dom";
import { Flag, Trophy, CalendarDays, DollarSign } from "lucide-react";
import { ViewTransitionLink } from "./ViewTransitionLink";
import { useNotifications } from "../contexts/NotificationsContext";

type Tab = {
  to: string;
  label: string;
  Icon: typeof Flag;
  /** Returns true when this tab should be highlighted for the given pathname. */
  isActive: (pathname: string) => boolean;
  /** Deep-link prefix whose unread notifications badge this tab (optional). */
  badgePrefix?: string;
};

// League flow: where everyone stands → what's left to play → the calendar → bets.
// Team rosters live in the hamburger menu.
const TABS: Tab[] = [
  {
    // The standings are the app's home page.
    to: "/",
    label: "Standings",
    Icon: Trophy,
    isActive: (p) =>
      p === "/" || p.startsWith("/standings") || p.startsWith("/teams") || p.startsWith("/player") || p.startsWith("/leaderboard"),
  },
  {
    to: "/matches",
    label: "Matches",
    Icon: Flag,
    isActive: (p) => p.startsWith("/match"),
    // Badge match results / lead changes (they deep-link to /match/…).
    badgePrefix: "/match",
  },
  {
    to: "/season",
    label: "Season",
    Icon: CalendarDays,
    isActive: (p) => p.startsWith("/season") || p.startsWith("/round") || p.startsWith("/history") || p.startsWith("/tournament"),
  },
  {
    to: "/sportsbook",
    label: "Bets",
    Icon: DollarSign,
    isActive: (p) => p.startsWith("/sportsbook"),
    // Badge bet challenges/accepts (they deep-link to /sportsbook).
    badgePrefix: "/sportsbook",
  },
];

/**
 * Persistent, thumb-reachable bottom tab bar for the primary public destinations.
 * Rendered by LayoutShell and hidden on admin/login routes.
 */
export default function BottomNav() {
  const { pathname } = useLocation();
  const { unreadForPrefix } = useNotifications();

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map(({ to, label, Icon, isActive, badgePrefix }) => {
        const active = isActive(pathname);
        const badge = badgePrefix ? unreadForPrefix(badgePrefix) : 0;
        return (
          <ViewTransitionLink
            key={to}
            to={to}
            className="bottom-nav-item"
            aria-current={active ? "page" : undefined}
            aria-label={badge > 0 ? `${label}, ${badge} unread` : label}
          >
            <span className="relative">
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              {badge > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold leading-none text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </span>
            <span>{label}</span>
          </ViewTransitionLink>
        );
      })}
    </nav>
  );
}
