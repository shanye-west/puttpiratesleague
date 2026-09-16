# Putt Pirates Golf PWA 🏴‍☠️⛳

A mobile-first Progressive Web App for **Putt Pirates Golf**, a season-long handicapped singles match-play league: 16 players, 10 monthly matches (March–December), 4 league teams of 4. Players set up each match (course + course handicaps), enter gross scores on their phones, and the app computes net scoring, hole winners, live match status, individual and team standings, and season stats in real time. Everyone else watches live, read-only.

- **Live app:** [puttpiratesgolf.web.app](https://puttpiratesgolf.web.app)
- **Lineage:** built on the Rowdy Cup PWA engine (a Ryder-Cup style app). The Cup-only features are hidden here; see [AGENTS.md](AGENTS.md).

> **AI agents / coding assistants:** read [AGENTS.md](AGENTS.md) — it's the canonical technical guide.

---

## What it does

- **Live singles match-play scoring** with automatic net scoring, hole winners, dormie/early-close logic, and per-hole handicap strokes (the higher handicap gets the difference).
- **Set up match** — the two players pick their course and enter their course handicaps for the day; strokes are placed on the hardest holes.
- **League standings** — individual MP/W/L/T/points with the playoff cut (top 4 + ties), team standings with the monthly bonus point, and a team × month grid.
- **Result-only matches** — an admin can record the outcome of a match played off-app (no card) so standings stay complete.
- **Player profiles** — lifetime and per-season records, format breakdowns, badges.
- **Season history** — every past season, read-only.
- **Sportsbook** — peer-to-peer wagers on match winners and season-long player props, with a settle-up ledger.
- **Chat & trash talk** — match threads and a league-wide feed with emoji reactions and replies.
- **Push notifications** (chat, bets, match results, month complete) with per-category preferences.
- **Installable PWA** — offline-tolerant scoring that queues and syncs on reconnect; auto-updates after deploys.
- **Admin console** (`/admin`) — seasons, months (rounds), matches, league teams, players, courses, locks, score corrections, manual results.

## Tech stack

- **Frontend:** React 19, Vite 7, TypeScript 5.9 (strict), Tailwind CSS 4, `vite-plugin-pwa`. PWA served via Firebase Hosting.
- **Backend:** Firebase Cloud Functions Gen-2 (TypeScript, Node 20) — Firestore triggers + HTTPS callables.
- **Data / auth:** Cloud Firestore (real-time `onSnapshot`), Firebase Anonymous Auth (score entry), FCM (web push).

## Repository layout

| Path | What's there |
|---|---|
| [`rowdy-ui/`](rowdy-ui/) | React + Vite frontend (the PWA) |
| [`functions/`](functions/) | Cloud Functions — scoring, stats, betting, chat, notifications, drafts, admin |
| [`scripts/`](scripts/) | Break-glass admin scripts (seeding, exports, auth linking) — see [`scripts/README.md`](scripts/README.md) |
| Root | `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc` |
| [`AGENTS.md`](AGENTS.md) | Deep technical guide (architecture, data model, scoring contracts) |

## Getting started (local dev)

**Prerequisites:** Node 20+, `npm`, and the Firebase CLI (`npm i -g firebase-tools`).

```bash
# 1. Frontend
cd rowdy-ui
cp .env.example .env.local        # fill in Firebase web config + VAPID key
npm install
npm run dev                       # http://localhost:5173

# 2. Functions (optional — for backend work)
cd ../functions
npm install
npm run build
npm run serve                     # Firebase emulators (functions + Firestore)
```

The Firebase web config in `.env.local` is **not secret** (Firestore security rules are what protect data). Get the values from Firebase Console → Project Settings → Your apps.

### Everyday commands

```bash
# rowdy-ui/
npm run build      # tsc -b && vite build   (type errors block the build)
npm run lint       # eslint .
npm run test:run   # vitest, single run

# functions/
npm run build      # tsc
npm run test:run   # vitest (scoring + stats suites)
```

## Deploying

> ⚠️ **There is only one Firebase project: production (`puttpiratesgolf`).** No staging exists — every deploy hits **live league data**. Build first (there are no predeploy build hooks), check `firebase use` prints `puttpiratesgolf`, and double-check before deploying. Never deploy this repo to the Rowdy Cup project.

```bash
# Frontend
cd rowdy-ui && npm run build && firebase deploy --only hosting

# Cloud Functions
cd functions && npm run build && firebase deploy --only functions

# Security rules / indexes  (deploy indexes BEFORE code that queries them)
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## How the app works (in one breath)

Players write a gross score to a single field (`matches/{id}.holes.{N}.input`). A Cloud Function recomputes match `status` and `result` on every write (or, for a match played off-app, from the admin-entered result). When a match closes, per-player stat records are written and rolled up into lifetime/per-season aggregates. The UI subscribes to Firestore in real time and computes the league standings client-side, so scores, standings, and stats update live on every phone. Security rules keep the whole database public-read while allowing players to write **only** their own hole scores; everything else (course, strokes, results, teams) is written server-side through callables.

Full data model, collection reference, scoring contracts, and the Cloud Functions map are in **[AGENTS.md](AGENTS.md)**.

## For league admins

Day-to-day setup lives in the in-app **Admin console** at `/admin` (admin accounts only): seasons and their league teams, months (rounds), matches, players, and courses; lock/unlock months and matches; override scores; enter result-only matches; and recompute stats. The [`scripts/`](scripts/) folder holds the one-time **season seed** (`seed-putt-pirates-2026.ts`: 16 players, 10 months, 80 matches, result backfill) plus break-glass equivalents — see [`scripts/README.md`](scripts/README.md), including the player onboarding / login flow.

## Further reading

- **[AGENTS.md](AGENTS.md)** — architecture, Firestore collections, scoring & stats contracts, function map, conventions (the technical bible).
- **[SCORING-LEADERS-IMPLEMENTATION.md](SCORING-LEADERS-IMPLEMENTATION.md)** — round-recap scoring-leaders feature.
- **[scripts/README.md](scripts/README.md)** — seeding, exports, and player auth workflow.
