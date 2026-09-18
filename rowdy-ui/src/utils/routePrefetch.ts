/**
 * Best-effort lazy-route preload on navigation intent (pointer/touch down) and
 * at idle after launch.
 *
 * Preloading a route's lazy component before the tap completes means the
 * navigation renders immediately instead of suspending on the chunk (and
 * flashing the route spinner). A path not listed here is simply not
 * prefetched (no-op) — the route still loads on navigation — so the map
 * drifting from main.tsx only ever costs a prefetch, never correctness.
 */
import {
  Chat,
  History,
  Leaderboard,
  Login,
  Match,
  Matches,
  Player,
  Round,
  RoundRecap,
  Season,
  Sportsbook,
  Teams,
  Tournament,
} from "../routes/lazyRoutes";

const PREFETCHERS: Array<[RegExp, () => Promise<unknown>]> = [
  [/^\/matches/, Matches.preload],
  [/^\/match\//, Match.preload],
  [/^\/round\/[^/]+\/recap/, RoundRecap.preload],
  [/^\/round\//, Round.preload],
  [/^\/season/, Season.preload],
  [/^\/teams/, Teams.preload],
  [/^\/leaderboard/, Leaderboard.preload],
  [/^\/sportsbook/, Sportsbook.preload],
  [/^\/chat/, Chat.preload],
  [/^\/player\//, Player.preload],
  [/^\/history/, History.preload],
  [/^\/tournament\//, Tournament.preload],
  [/^\/login/, Login.preload],
];

/**
 * Preload the route for `path` if we know it. Safe to call often: preload()
 * no-ops once the route is loaded, the browser dedupes an in-flight import, and
 * it never rejects — a failed load is retried (with recovery) by the navigation.
 */
export function prefetchRoute(path: string): void {
  for (const [test, preload] of PREFETCHERS) {
    if (test.test(path)) {
      void preload();
      return;
    }
  }
}

/** The bottom-nav tabs plus the pages most often opened from them. */
const IDLE_WARM_PATHS = ["/matches", "/season", "/match/", "/round/", "/sportsbook", "/chat", "/player/"];

/**
 * Once the app has settled after launch, warm the chunks of the main tabs so
 * the first tap on each renders without waiting on a chunk load and parse.
 * The service worker already holds these files, so this costs no extra
 * download — only a bit of idle CPU, spread out so it never competes with
 * rendering or scoring.
 */
export function prefetchMainRoutesWhenIdle(): void {
  if (typeof window === "undefined") return;
  // Respect Data Saver on a metered connection.
  const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const idle: (cb: () => void) => void =
    "requestIdleCallback" in window
      ? (cb) => window.requestIdleCallback(cb, { timeout: 4000 })
      : (cb) => setTimeout(cb, 1500);
  let i = 0;
  const next = () => {
    if (i >= IDLE_WARM_PATHS.length) return;
    prefetchRoute(IDLE_WARM_PATHS[i++]);
    idle(next);
  };
  // Give the first screen and its data a head start.
  setTimeout(() => idle(next), 2000);
}
