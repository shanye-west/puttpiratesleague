/**
 * The public routes, lazy-loaded for code splitting. Defined here (rather than
 * in main.tsx) so routePrefetch can call each route's `preload()` — preloading
 * the very component the router renders is what lets an already-fetched route
 * render without suspending.
 */
import { lazyWithRecovery } from "../utils/lazyWithRecovery";

export const Match = lazyWithRecovery(() => import("./Match"));
export const Round = lazyWithRecovery(() => import("./Round"));
export const RoundRecap = lazyWithRecovery(() => import("./RoundRecap"));
export const Teams = lazyWithRecovery(() => import("./Teams"));
export const Matches = lazyWithRecovery(() => import("./Matches"));
export const Season = lazyWithRecovery(() => import("./Season"));
export const Leaderboard = lazyWithRecovery(() => import("./Leaderboard"));
export const Sportsbook = lazyWithRecovery(() => import("./Sportsbook"));
export const Chat = lazyWithRecovery(() => import("./Chat"));
export const Player = lazyWithRecovery(() => import("./Player"));
export const Login = lazyWithRecovery(() => import("./Login"));
export const History = lazyWithRecovery(() => import("./History"));
export const NotificationSettings = lazyWithRecovery(() => import("./NotificationSettings"));
export const Tournament = lazyWithRecovery(() => import("./Tournament"));
