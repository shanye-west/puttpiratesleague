# AGENTS.md — Putt Pirates Golf PWA

Canonical, tool-agnostic guide for AI coding agents (Claude Code, Cursor, Copilot, Codex, Aider, …) working in this repo. **This is the source of truth**; `CLAUDE.md` and `.github/copilot-instructions.md` are thin pointers to this file. Human contributors: start with [README.md](README.md).

---

## What this is

A mobile-first Progressive Web App for **Putt Pirates Golf**, a season-long handicapped **singles match-play league**: 16 players, one season per year, 10 monthly rounds (March–December). Each month every player plays one match against an assigned opponent (8 matches/month), at whatever course the two players choose. 1 point for a win, ½ for a halve. Players are also in **4 league teams of 4** with a captain. Players enter gross scores on their phones; Cloud Functions compute net scores, hole winners, match status, results and stats in real time. Everything is **public read-only**; score entry uses email/password auth linked to a player.

- **Lineage:** this is an adaptation of the Rowdy Cup (12v12 Ryder-Cup) PWA. The engine (match model, scoring, stats, betting, chat, push, admin) is shared; the Cup-only surfaces (pairings draft/TV/plan, skins, side events, captains' match, draft pool, rules official) are **not routed** here — their source files remain under `rowdy-ui/src/routes/` etc. but nothing links to them. The `rowdy-ui/` directory name and package names were deliberately kept.
- **Firebase project: `puttpiratesgolf`** (hosting site `puttpiratesgolf` → https://puttpiratesgolf.web.app, Firestore `(default)` in `nam5`). **Never** deploy to or write to the Rowdy Cup project (`rowdy-pwa`) from here.

## Golden rules (read before doing anything)

1. **Production is the only environment.** One Firebase project — `puttpiratesgolf`. No staging. Every deploy and every emulator-free run touches **live league data**. **Before anything that writes to Firestore or deploys** (`firebase deploy`, any script in `scripts/`), confirm intent with the user and check `firebase use` prints `puttpiratesgolf`. Reads, builds, lints, and tests are safe.
2. **`tsc` is the feedback loop.** The frontend `build` runs `tsc -b` first, so type errors block the build. Run builds/typecheck after edits; treat that as primary validation.
3. **Keep scoring & rules green.** Scoring logic and `firestore.rules` are covered by extensive tests; never change them without `cd functions && npm run test:run` passing.
4. **Strict TypeScript, no `as any`.** Narrow with the type guards in `rowdy-ui/src/types.ts` instead of casting.

## Monorepo layout

- **`rowdy-ui/`** — React 19 + Vite 7 + TypeScript 5.9 + Tailwind 4 frontend (the PWA).
- **`functions/`** — Firebase Cloud Functions Gen-2 (TypeScript, Node 20). Firestore triggers + HTTPS callables for scoring, stats, betting, chat, notifications, and admin ops.
- **`scripts/`** — Break-glass admin Node/TS scripts (the season seed, auth linking, exports). Bypass callable auth/rate-limits and write straight to Firestore with a service account. See `scripts/README.md`.
- **Root** — Firebase config: `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc`. `setup/` holds the league's source documents (kickoff email, schedule, standings screenshots).

## Commands

```bash
# Frontend (rowdy-ui/)
cd rowdy-ui && npm run dev        # Vite dev server (PWA enabled in dev)
cd rowdy-ui && npm run build      # tsc -b && vite build  ← primary check
cd rowdy-ui && npm run lint       # eslint .
cd rowdy-ui && npm run test:run   # vitest single run

# Functions (functions/)
cd functions && npm run build     # tsc
cd functions && npm run test:run  # vitest single run (scoring/stats suites)
cd functions && npm run serve     # build + Firebase emulators (local only)

# Deploy (manual, no predeploy build hooks — BUILD FIRST, then confirm with user)
firebase deploy --only firestore:indexes     # deploy indexes BEFORE code that queries them
firebase deploy --only firestore:rules
cd functions && npm run build && firebase deploy --only functions
cd rowdy-ui && npm run build && firebase deploy --only hosting
```

Frontend env lives in `rowdy-ui/.env.local` (template `.env.example`): the public `VITE_*` web config for `puttpiratesgolf` plus `VITE_FIREBASE_VAPID_KEY` for web push. `rowdy-ui/public/firebase-messaging-sw.js` inlines the same config (service workers can't read env) — keep the two in sync.

## Architecture & data flow

1. A player writes a gross score to `matches/{id}.holes.{N}.input` — the **only** field clients may write (enforced by security rules).
2. `computeMatchOnWrite` (Firestore trigger) recomputes `status` + `result` on every match write. It caches round context on the match doc (`_lastComputed`) and guards re-runs with `_computeSig` (a signature of `holes` **and** `manualResult` — see "League" below).
3. When a match closes (`status.closed === true`), `updateMatchFacts` writes one immutable `playerMatchFacts/{matchId}_{playerId}` doc per player.
4. `aggregatePlayerStats` rolls those facts up into `playerStats/{playerId}/bySeries/{series}` (and `byTournament`/`byRound`).
5. `computeRoundTotals` denormalizes per-round side totals onto the round doc; betting-settlement triggers settle wagers on match completion.
6. The frontend uses Firestore `onSnapshot` listeners (see `rowdy-ui/src/hooks/`) so all UI updates live. **League standings are computed client-side** from rounds + matches (`utils/leagueStandings.ts`) — there is no standings trigger.

Editing an earlier hole can **reopen** a closed match if the math changes; facts are deleted/rewritten accordingly. Triggers are marked `retry: true` and are idempotent.

## League model (Putt Pirates)

A **season** is a `tournaments/{id}` doc with `series: "puttPirates"` and **`leagueTeams`** (present ⇒ the app renders the league home/standings). Each **month** is a `rounds/{id}` doc (`day` = order 1…10, `name` = the month, `format: "singles"`, `pointsValue: 1`, **no `courseId`**). Each **match** is a normal `matches/{id}` doc: `teamAPlayers[0]` vs `teamBPlayers[0]`.

- **Match sides vs league teams.** `teamA`/`teamB` on a match are just the two *sides*; a player's league team comes from `tournament.leagueTeams[].playerIds`. Two members of one league team can be drawn against each other. The tournament's Cup-era `teamA`/`teamB` fields exist as empty skeletons only.
- **Course per match.** Players pick their course and enter their **course handicaps** for the day through **`setupMatchCard`** (a participant or an admin; blocked for players once a hole is scored). It writes `match.courseId`, `courseHandicaps: [A, B]`, `strokesReceived` (the higher handicap gets the difference on the hardest holes — `computeTeamsWithStrokesFromCourseHandicaps`), refreshes `authorizedUids`, and deletes `_computeSig`/`_lastComputed` so the trigger re-derives. `computeMatchOnWrite`/`updateMatchFacts` prefer `match.courseId` over the round's. Score entry is locked in the UI until the card is set up.
- **Result-only matches.** A match played off-app is recorded by an admin with **`adminSetMatchResult`** (`manualResult: { winner, margin, thru }`). When a manual result exists and **no hole is scored**, `computeMatchOnWrite` closes the match from it (`helpers/manualResult.ts`); its facts carry `outcome`/`pointsEarned` and `manualResult: true` with all hole/momentum/scoring stats zeroed or omitted. `adminClearMatchResult` reopens it. Setting a manual result on a match with hole scores is refused.
- **Standings** (`rowdy-ui/src/utils/leagueStandings.ts`, unit-tested): individual MP/W/L/T/points from closed matches (in-progress shown as projected), sorted points → wins → name; top 4 + ties for 4th make the playoffs. Team points = members' points + **1 bonus per month** to the team with the most points that month; a tie goes to the tied captains' lowest **net** that month (`captainNet`, from their cards); unresolvable (result-only captain, further tie) ⇒ *pending* until an admin sets **`round.bonusTeamId`**. Year-end team ties break on the captains' individual rank.
- **Player onboarding.** Player docs are keyed `pFirstLast`. Create the auth user (or have them sign up), then link from `/admin/players` (`linkAuthToPlayer`), which also fans the uid into `authorizedUids` of their open matches (via the denormalized `match.playerIds`). Note `matches` carry `playerIds` for array-contains queries; the composite index `{tournamentId, playerIds CONTAINS}` backs the betting gate.
- **Betting.** Match winner (+ holes O/U), **team battles** (`teamMonth`: which of two league teams scores more in a month, bonus point included; closes when the month's first match starts) and **season bets** (`playoffs` yes/no, and final-points O/U on `playerTournamentPoints`, lines limited to those still undecided). Season bets close when the subject's last match starts (`isPlayerPropClosed`), can't be cancelled once locked, and untaken offers are voided when the subject's match closes. League bets settle from the standings (`functions/src/helpers/leagueStandings.ts`, a byte-for-byte mirror of the client file enforced by a test) via `settleLeagueBetsFor`, run by `settleMatchBets` on every match close and by the admin **Settle league bets** button (`settleLeagueBets`, e.g. after setting a tied month's `bonusTeamId`). Cup futures, round/session, player matchup, wins O/U and captains markets are hidden in league mode.
- **Notifications.** In league mode a match's sides are labelled by player names; the only round-level push is "month is in the books". Champion / lead-change pushes are skipped.

## Firestore collections

Most collections are **public-read**; `bets`, `betSettlements`, and `comments` (+ replies) require `request.auth != null`. Clients may write only a match's `holes` map and their own notification read-state; everything else is written by Cloud Functions via the Admin SDK.

| Collection | Purpose |
|---|---|
| `tournaments/{id}` | A season: `active`, `series`, `year`, **`leagueTeams[]`** (`{ id, name, captainId, playerIds, color? }`), `teamA`/`teamB` skeletons, `roundIds[]`, flags (`openPublicEdits`, `commentsEnabled`, `sportsbookEnabled`, `archived`, `test`) |
| `players/{id}` | `displayName`, `authUid` (query key), `isAdmin`. PII lives in server-only `players/{id}/private/profile` |
| `rounds/{id}` | A month: `tournamentId`, `day`, **`name`**, `format`, `pointsValue`, `locked`, `courseId` (null in league), **`bonusTeamId?`**, denormalized `pointTotals`, `matchIds[]` |
| `matches/{id}` | `teamAPlayers`/`teamBPlayers` (`{playerId, strokesReceived[18]}`), **`playerIds[]`**, **`courseId?`**, `courseHandicaps[]`, **`manualResult?`**, `strokesSetAt/By`, `holes.{1..18}.input`, computed `status`/`result`, `authorizedUids`, cache fields (`_computeSig`, `_lastComputed`) |
| `courses/{id}` | `name`, `tees`, `par`, `rating`, `slope`, `holes[18]` (`number`, `par`, `hcpIndex`, `yards`) — one doc per course+tees combination. Any player can add one (or new tees for an existing course) from the match setup panel via `createCourse`; edit/delete stay admin-only |
| `playerMatchFacts/{matchId}_{playerId}` | Immutable per-player, per-match stats (`manualResult: true` for result-only) |
| `playerStats/{playerId}` | Subcollections `bySeries/{series}`, `byTournament/{id}`, `byRound/{id}` |
| `roundRecaps/{roundId}` | Scoring leaders, per-hole averages, vs-all records |
| `bets`, `betSettlements` | Peer-to-peer sportsbook wagers + settle-up ledger |
| `comments/{id}` (+ `replies/`) | Match-thread & sportsbook trash-talk |
| `notifications`, `pushTokens`, `matchNotifyState`, `tournamentNotifyState` | In-app feed, FCM tokens, idempotency guards |

Cup-era collections (`pairingDrafts`, `pairingPlans`, `sideEvents`, `sideEventTeams`, `captainsMatches`, `rounds/*/skinsResults`) still have rules and functions but no UI here.

## Match formats & scoring

The engine supports `singles`, `twoManBestBall`, `twoManShamble`, `twoManScramble` (+ historical `fourManScramble`); **the league uses `singles` only**: hole input `{ teamAPlayerGross, teamBPlayerGross }`, winner = net vs net (`gross − strokesReceived`, never more than 1 stroke/hole). Match status/result: win = full `pointsValue`, halve = half, loss = 0; early closure when lead > holes remaining; `dormie` when lead == holes remaining; tied through 18 → AS. Use the type guards in `rowdy-ui/src/types.ts` rather than string comparisons.

## Cloud Functions map (`functions/src/`)

- **Seed triggers** (`onCreate`): `seedMatchBoilerplate` (also writes `playerIds`), `seedRoundDefaults`, `seedTournamentDefaults`, `seedCourseDefaults`; `linkRoundToTournament` (`onWrite`).
- **Scoring/stats triggers** (`onWrite`): `computeMatchOnWrite`, `updateMatchFacts`, `aggregatePlayerStats`, `computeRoundTotals`. (`computeRoundSkins` is Cup-only and **not exported/deployed** — league rounds have no course or skins pot, so it only cost a read per score write.)
- **Betting settlement**: `settleMatchBets` (+ `scoring/betSettlement.ts`).
- **Notifications**: `notifyMatchEvents`, `notifyTournamentEvents` (`messaging/`; league-aware via `TournamentMeta.leagueMode`).
- **Callables** (`callables/`):
  - `adminOps.ts` — tournament/round/player CRUD (incl. `leagueTeams`, `round.name`/`bonusTeamId`), locks, `adminOverrideHoleScore`, `linkAuthToPlayer` (+ auth fan-out), `setPlayerAdmin`.
  - `matchOps.ts` — `seedMatch`, `editMatch` (both tolerate a round without a course), `recalculateMatchStrokes` (Cup path).
  - **`matchSetupOps.ts` — `setupMatchCard`** (player/admin; see League).
  - **`playerCourseOps.ts` — `createCourse`** (any linked player; validates with `validateCourseInput`, rejects a duplicate name+tees via `courseKey`).
  - **`matchResultOps.ts` — `adminSetMatchResult`, `adminClearMatchResult`.**
  - `betsOps.ts` / `settlementOps.ts`, `commentOps.ts`, `pushOps.ts`, `statsOps.ts`, `courseOps.ts`, `contracts.ts` (shared request/response types, mirrored in `rowdy-ui/src/api/adminContracts.ts`).
  - Cup-only (still deployed, unused): `draftOps.ts`, `pairingPlanOps.ts`, `sideEventOps.ts`, `captainsMatchOps.ts`. **Not deployed:** `rulesOfficial/askRulesOfficial.ts` (needs the `XAI_API_KEY` secret + App Check; its export is commented out in `index.ts`).
- Pure helpers: `helpers/manualResult.ts`, `helpers/strokeCalculation.ts`, `helpers/matchHelpers.ts` (`holeHasScore`, `countScoredHoles`), `helpers/roster.ts` (`rosterPlayerIds` includes league teams), `scoring/matchScoring.ts`.

## Frontend conventions (`rowdy-ui/src/`)

- **Routing**: `main.tsx`. Public: `/` (League home), `/round/:id` (a month), `/round/:id/recap`, `/match/:id`, `/teams`, `/leaderboard`, `/sportsbook`, `/chat`, `/player/:id`, `/history`, `/tournament/:id`, `/settings/notifications`, `/login`; admin subtree under `/admin` gated by `RequireAdmin`.
- **League UI**: `components/league/` (`LeagueHome`, `StandingsTables`, `MonthMatchList`), `hooks/useLeagueSeason.ts` (rounds + matches with `splitLockedRounds` — lock finished months so only the current month keeps a live listener; for the active season it reads the shared `SeasonDataContext`), `components/match/MatchSetupPanel.tsx`, `utils/leagueTeams.ts`. `App.tsx` and `routes/Tournament.tsx` fall back to the two-sided Cup scoreboard only for a tournament without `leagueTeams`.
- **Global state via contexts**: `AuthContext`, `TournamentContext` (shared tournament + player cache — reuse it), `SeasonDataContext` (the active season's rounds + matches, subscribed once on first use and kept open for the session so tab switches don't reload — use `useSeasonData(tournament)` rather than a per-screen `useTournamentData`), `NotificationsContext`, `ToastContext`, `LayoutContext`.
- **Loading speed**: prefer cache-first reads (`utils/firestoreReads.ts`, with `onFresh` for a background refresh) over plain `getDoc`/`getDocs`, which wait on the server. Public routes are defined in `routes/lazyRoutes.ts` with a `preload()` that `utils/routePrefetch.ts` calls on press and at idle; list only routed pages there (an unrouted import pulls its chunk back into the build).
- **PWA**: `vite-plugin-pwa`, `registerType: autoUpdate`; offline scoring is queued and flushed on reconnect.
- **Styling**: Tailwind 4; theme tokens in `src/index.css` (`--brand-primary` teal `#0b3d3a`, `--brand-secondary` gold `#c9a227` — a placeholder palette; league-team colours fall back to `utils/leagueTeams.ts`). The placeholder logo is `public/images/puttpirates-logo.svg`.

## Security rules (`firestore.rules`)

Unchanged from the Rowdy Cup engine: public-read per collection (no wildcard), signed-in-read for `bets`/`betSettlements`/`comments`, server-only `players/{id}/private/**`. Clients may update `matches/{id}` **only** on the `holes` map and only when their uid is in `authorizedUids` (or `openPublicEdits`), never dropping a hole key. Every league field (`courseId`, `courseHandicaps`, `strokesReceived`, `manualResult`, `playerIds`) is server-written through the callables. There is no working `isAdmin()` in rules — admin is enforced in the callables (`requireAdmin`); `RequireAdmin` in the UI is UX only.

## Don't touch lightly

- **Scoring logic** (`functions/src/scoring/`, `functions/src/helpers/`) — thousands of lines of vitest coverage. Keep `cd functions && npm run test:run` green.
- **`computeMatchOnWrite`** — runs on every match write; preserve the `_computeSig`/`_lastComputed` guards (and remember the signature includes `manualResult`).
- **`firestore.rules`** — misconfiguration either locks players out or exposes the DB.

## Where to look for more

- [README.md](README.md) — product overview + human/dev onboarding.
- `scripts/README.md` — the season seed script (`seed-putt-pirates-2026.ts`), result backfill, and auth linking.
- [SCORING-LEADERS-IMPLEMENTATION.md](SCORING-LEADERS-IMPLEMENTATION.md) — round-recap scoring-leaders feature.
- `setup/` — the league's own rules email, schedule and standings.
