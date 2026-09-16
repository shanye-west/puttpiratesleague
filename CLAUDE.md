# CLAUDE.md — Putt Pirates Golf PWA

**📖 Read [AGENTS.md](AGENTS.md) first — it is the canonical, tool-agnostic guide** to this codebase (architecture, the league model, Firestore collections, scoring & stats contracts, Cloud Functions map, security rules, and conventions). This file only adds Claude-Code–specific working notes on top of it.

## Working here as Claude Code

- **Never touch the Rowdy Cup app.** This repo began as a copy of the Rowdy Cup PWA, but it is a separate app on a separate Firebase project. Never deploy to, write to, or run scripts against the `rowdy-pwa` project (or `dev-rowdy-pwa`). `firebase use` must print **`puttpiratesgolf`** before any deploy.
- **Production is the only environment.** One Firebase project (`puttpiratesgolf`); no staging. Every deploy and every non-emulator run hits **live league data**. **Confirm with the user before anything that writes to Firestore or deploys** (`firebase deploy`, any `scripts/` command). Reads, builds, lints, and tests are safe — run them freely.
- **Primary feedback loop:** after edits, run the build. `cd rowdy-ui && npm run build` runs `tsc -b` first, so type errors surface there. For backend/scoring changes, also run `cd functions && npm run test:run` and keep it green.
- **Deploys are manual with no predeploy hooks** — always build before `firebase deploy`. Deploy new Firestore indexes before the code that queries them.
- **Cup-only features are hidden, not deleted.** Pairings draft/TV/plan, skins, side events, captains' match, draft pool and the Grok rules official still have source files but no routes/menu links (and `askRulesOfficial` is not exported/deployed). Don't re-link them without asking.
- **`fourManScramble` is historical-only** — present solely to render past data. Don't add it to format-selection UI.
- **Scope a change's deploys explicitly.** A frontend feature is usually hosting-only; touching callables/triggers needs a functions deploy; changing `firestore.rules` or `firestore.indexes.json` needs those deployed too. Call out which deploys a change requires.

## The quick map (details in AGENTS.md)

- `rowdy-ui/` — React 19 + Vite 7 + TS + Tailwind 4 PWA (directory name kept from the Rowdy Cup lineage).
- `functions/` — Cloud Functions Gen-2 (Node 20): scoring/stats triggers, betting, chat, notifications, and admin/league callables (`setupMatchCard`, `adminSetMatchResult`).
- `scripts/` — break-glass admin scripts (write straight to prod — treat like a loaded gun). `seed-putt-pirates-2026.ts` refuses to run against any project but `puttpiratesgolf`.

Don't touch lightly: the scoring logic (`functions/src/scoring/`, `functions/src/helpers/`), the `computeMatchOnWrite` trigger, and `firestore.rules`. See the "Don't touch lightly" and "Security rules" sections of [AGENTS.md](AGENTS.md).
