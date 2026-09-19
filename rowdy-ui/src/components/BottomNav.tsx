import { useLocation } from "react-router-dom";
import { Flag, Trophy, DollarSign, MessageCircle } from "lucide-react";
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

// League flow: where everyone stands → the season's matches, month by month → bets → chat.
// Team rosters and past seasons live in the hamburger menu.
const TABS: Tab[] = [
  {
    // The standings are the app's home page.
    to: "/",
    label: "Standings",
    Icon: Trophy,
    isActive: (p) =>
      p === "/" ||
      p.startsWith("/standings") ||
      p.startsWith("/teams") ||
      p.startsWith("/player") ||
      p.startsWith("/leaderboard") ||
      p.startsWith("/history") ||
      p.startsWith("/tournament"),
  },
  {
    to: "/matches",
    label: "Matches",
    Icon: Flag,
    // A month's page (/round/…) is part of the Matches tab.
    isActive: (p) => p.startsWith("/match") || p.startsWith("/round") || p.startsWith("/season"),
    // Badge match results / lead changes (they deep-link to /match/…).
    badgePrefix: "/match",
  },
  {
    to: "/sportsbook",
    label: "Bets",
    Icon: DollarSign,
    isActive: (p) => p.startsWith("/sportsbook"),
    // Badge bet challenges/accepts (they deep-link to /sportsbook).
    badgePrefix: "/sportsbook",
  },
  {
    to: "/chat",
    label: "Chat",
    Icon: MessageCircle,
    isActive: (p) => p.startsWith("/chat"),
    // Badge league-chat comments/replies (they deep-link to /chat).
    badgePrefix: "/chat",
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
