/**
 * Seed the 2026 Putt Pirates season (Firebase project `puttpiratesgolf` ONLY).
 *
 *   npx ts-node seed-putt-pirates-2026.ts                     # dry run: prints what it would write
 *   npx ts-node seed-putt-pirates-2026.ts --commit            # pass 1: players, season, 10 rounds, 80 matches
 *   npx ts-node seed-putt-pirates-2026.ts --commit --admin-email you@example.com --admin-player pNickPetersen
 *   # an admin who isn't one of the 16 players: add --admin-name "Shane Peterson" to create the doc
 *   npx ts-node seed-putt-pirates-2026.ts --commit --results data/putt-pirates-2026-results.json
 *                                                             # pass 2: result-only backfill for played matches
 *
 * Pass 1 creates every doc WITHOUT a manualResult. Results are a separate pass
 * because the seedMatchBoilerplate trigger merges `status` on create and could
 * race a manual result back open — run pass 2 once every match has `_seededAt`
 * (about 30s after pass 1; the script checks and refuses otherwise).
 *
 * Safety: refuses to run unless the service-account key's project_id is
 * `puttpiratesgolf`. This script must never touch any other project.
 */

import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

const EXPECTED_PROJECT = "puttpiratesgolf";
const TOURNAMENT_ID = "2026PuttPirates";
const YEAR = 2026;

// ---------------------------------------------------------------------------
// Season data (from setup/2026 Putt Pirates Schedule.xlsx + the kickoff email)
// ---------------------------------------------------------------------------

const PLAYERS: { id: string; displayName: string }[] = [
  { id: "pBrianMarrero", displayName: "Brian Marrero" },
  { id: "pTravisBuhl", displayName: "Travis Buhl" },
  { id: "pNickPetersen", displayName: "Nick Petersen" },
  { id: "pNealMuir", displayName: "Neal Muir" },
  { id: "pTravisBerg", displayName: "Travis Berg" },
  { id: "pBrianChase", displayName: "Brian Chase" },
  { id: "pJoshMcGinnis", displayName: "Josh McGinnis" },
  { id: "pMichaelGiaimo", displayName: "Michael Giaimo" },
  { id: "pAaronMcGuinness", displayName: "Aaron McGuinness" },
  { id: "pNigelOrozco", displayName: "Nigel Orozco" },
  { id: "pJasonPadula", displayName: "Jason Padula" },
  { id: "pMattRoberts", displayName: "Matt Roberts" },
  { id: "pPhilSalazar", displayName: "Phil Salazar" },
  { id: "pDannyCostello", displayName: "Danny Costello" },
  { id: "pCraigBlouin", displayName: "Craig Blouin" },
  { id: "pChrisHertz", displayName: "Chris Hertz" },
];

const LEAGUE_TEAMS = [
  { id: "wreckItRalph", name: "Wreck It Ralph", captainId: "pBrianMarrero", playerIds: ["pBrianMarrero", "pTravisBuhl", "pNickPetersen", "pNealMuir"], color: "#0b3d3a" },
  { id: "rhinoWranglers", name: "Rhino Wranglers", captainId: "pTravisBerg", playerIds: ["pTravisBerg", "pBrianChase", "pJoshMcGinnis", "pMichaelGiaimo"], color: "#7c2d12" },
  { id: "beerCartBandits", name: "Beer Cart Bandits", captainId: "pAaronMcGuinness", playerIds: ["pAaronMcGuinness", "pNigelOrozco", "pJasonPadula", "pMattRoberts"], color: "#c9a227" },
  { id: "crackersQueso", name: "Crackers & Queso", captainId: "pPhilSalazar", playerIds: ["pPhilSalazar", "pDannyCostello", "pCraigBlouin", "pChrisHertz"], color: "#1e3a8a" },
];

/** Last name → player id, for the schedule below. */
const BY_LAST: Record<string, string> = {};
for (const p of PLAYERS) BY_LAST[p.displayName.split(" ").slice(-1)[0]] = p.id;

/** Month → 8 pairings ("A vs B", A is side teamA). Order = matchNumber. */
const SCHEDULE: { month: string; day: number; pairings: [string, string][] }[] = [
  { month: "March", day: 1, pairings: [["Marrero", "McGinnis"], ["Buhl", "Giaimo"], ["Petersen", "Berg"], ["Muir", "Chase"], ["McGuinness", "Blouin"], ["Orozco", "Hertz"], ["Padula", "Salazar"], ["Roberts", "Costello"]] },
  { month: "April", day: 2, pairings: [["Marrero", "Giaimo"], ["Buhl", "Berg"], ["Petersen", "Chase"], ["Muir", "McGinnis"], ["McGuinness", "Hertz"], ["Orozco", "Salazar"], ["Padula", "Costello"], ["Roberts", "Blouin"]] },
  { month: "May", day: 3, pairings: [["Marrero", "Chase"], ["Buhl", "McGinnis"], ["Petersen", "Giaimo"], ["Muir", "Berg"], ["McGuinness", "Costello"], ["Orozco", "Blouin"], ["Padula", "Hertz"], ["Roberts", "Salazar"]] },
  { month: "June", day: 4, pairings: [["Marrero", "McGuinness"], ["Buhl", "Orozco"], ["Petersen", "Padula"], ["Muir", "Roberts"], ["Berg", "Salazar"], ["Chase", "Costello"], ["McGinnis", "Blouin"], ["Giaimo", "Hertz"]] },
  { month: "July", day: 5, pairings: [["Marrero", "Orozco"], ["Buhl", "Padula"], ["Petersen", "Roberts"], ["Muir", "McGuinness"], ["Berg", "Costello"], ["Chase", "Blouin"], ["McGinnis", "Hertz"], ["Giaimo", "Salazar"]] },
  { month: "August", day: 6, pairings: [["Marrero", "Berg"], ["Buhl", "Chase"], ["Petersen", "McGinnis"], ["Muir", "Giaimo"], ["McGuinness", "Salazar"], ["Orozco", "Costello"], ["Padula", "Blouin"], ["Roberts", "Hertz"]] },
  { month: "September", day: 7, pairings: [["Marrero", "Padula"], ["Buhl", "Roberts"], ["Petersen", "McGuinness"], ["Muir", "Orozco"], ["Berg", "Blouin"], ["Chase", "Hertz"], ["McGinnis", "Salazar"], ["Giaimo", "Costello"]] },
  { month: "October", day: 8, pairings: [["Marrero", "Salazar"], ["Buhl", "Costello"], ["Petersen", "Blouin"], ["Muir", "Hertz"], ["Berg", "McGuinness"], ["Chase", "Orozco"], ["McGinnis", "Padula"], ["Giaimo", "Roberts"]] },
  { month: "November", day: 9, pairings: [["Marrero", "Roberts"], ["Buhl", "McGuinness"], ["Petersen", "Orozco"], ["Muir", "Padula"], ["Berg", "Hertz"], ["Chase", "Salazar"], ["McGinnis", "Costello"], ["Giaimo", "Blouin"]] },
  { month: "December", day: 10, pairings: [["Marrero", "Costello"], ["Buhl", "Blouin"], ["Petersen", "Hertz"], ["Muir", "Salazar"], ["Berg", "Orozco"], ["Chase", "Padula"], ["McGinnis", "Roberts"], ["Giaimo", "McGuinness"]] },
];

const roundId = (day: number) => `${TOURNAMENT_ID}-R${String(day + 2).padStart(2, "0")}`; // R03 = March … R12 = December
const matchId = (day: number, n: number) => `${roundId(day)}M${String(n).padStart(2, "0")}`;
const zeros18 = () => Array.from({ length: 18 }, () => 0);

// ---------------------------------------------------------------------------
// Args + admin init (with the project guard)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const argValue = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const adminEmail = argValue("--admin-email");
const adminPlayer = argValue("--admin-player");
const adminName = argValue("--admin-name");
const resultsFile = argValue("--results");

const serviceAccountPath = path.join(__dirname, "../service-account.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Missing ${serviceAccountPath} (Firebase Console → Project settings → Service accounts → Generate key, for ${EXPECTED_PROJECT})`);
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
if (serviceAccount.project_id !== EXPECTED_PROJECT) {
  console.error(`❌ Refusing to run: service-account.json is for project "${serviceAccount.project_id}", expected "${EXPECTED_PROJECT}".`);
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: EXPECTED_PROJECT });
const db = admin.firestore();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------

function buildDocs() {
  const rounds = SCHEDULE.map((m) => ({
    id: roundId(m.day),
    data: {
      tournamentId: TOURNAMENT_ID,
      day: m.day,
      name: m.month,
      format: "singles",
      pointsValue: 1,
      courseId: null,
      locked: false,
      matchIds: m.pairings.map((_, i) => matchId(m.day, i + 1)),
    },
  }));

  const matches: { id: string; label: string; data: Record<string, unknown> }[] = [];
  for (const m of SCHEDULE) {
    m.pairings.forEach(([a, b], i) => {
      const aId = BY_LAST[a]; const bId = BY_LAST[b];
      if (!aId || !bId) throw new Error(`Unknown player in schedule: ${a} vs ${b}`);
      matches.push({
        id: matchId(m.day, i + 1),
        label: `${m.month} · ${a} vs ${b}`,
        data: {
          tournamentId: TOURNAMENT_ID,
          roundId: roundId(m.day),
          matchNumber: i + 1,
          playerIds: [aId, bId],
          teamAPlayers: [{ playerId: aId, strokesReceived: zeros18() }],
          teamBPlayers: [{ playerId: bId, strokesReceived: zeros18() }],
          courseHandicaps: [],
          authorizedUids: [],
          holes: {},
          status: { leader: null, margin: 0, thru: 0, dormie: false, closed: false },
          result: {},
        },
      });
    });
  }

  const tournament = {
    name: "2026 Putt Pirates",
    year: YEAR,
    series: "puttPirates",
    active: true,
    archived: false,
    sportsbookEnabled: true,
    commentsEnabled: true,
    leagueTeams: LEAGUE_TEAMS,
    teamA: { id: "teamA", name: "" },
    teamB: { id: "teamB", name: "" },
    roundIds: rounds.map((r) => r.id),
  };

  return { tournament, rounds, matches };
}

async function pass1() {
  const { tournament, rounds, matches } = buildDocs();
  console.log(`\n=== PASS 1: ${PLAYERS.length} players, season ${TOURNAMENT_ID}, ${rounds.length} rounds, ${matches.length} matches ===`);

  // Players (skip existing)
  for (const p of PLAYERS) {
    const ref = db.collection("players").doc(p.id);
    const snap = await ref.get();
    if (snap.exists) { console.log(`⏭️  player ${p.id} exists`); continue; }
    console.log(`✅ player ${p.id} (${p.displayName})`);
    if (commit) await ref.set({ id: p.id, displayName: p.displayName });
  }

  // Tournament
  const tRef = db.collection("tournaments").doc(TOURNAMENT_ID);
  if ((await tRef.get()).exists) {
    console.log(`⏭️  tournament ${TOURNAMENT_ID} exists — leaving it alone`);
  } else {
    console.log(`✅ tournament ${TOURNAMENT_ID} (active, 4 league teams)`);
    if (commit) {
      // Deactivate anything else so the single-active invariant holds.
      const others = await db.collection("tournaments").where("active", "==", true).get();
      for (const d of others.docs) if (d.id !== TOURNAMENT_ID) await d.ref.update({ active: false });
      await tRef.set(tournament);
    }
  }

  // Rounds
  for (const r of rounds) {
    const ref = db.collection("rounds").doc(r.id);
    if ((await ref.get()).exists) { console.log(`⏭️  round ${r.id} exists`); continue; }
    console.log(`✅ round ${r.id} (${r.data.name})`);
    if (commit) await ref.set(r.data);
  }

  // Matches — one at a time with a small gap so the create triggers don't pile up.
  for (const m of matches) {
    const ref = db.collection("matches").doc(m.id);
    if ((await ref.get()).exists) { console.log(`⏭️  match ${m.id} exists`); continue; }
    console.log(`✅ match ${m.id}  ${m.label}`);
    if (commit) { await ref.set(m.data); await sleep(150); }
  }
}

async function linkAdmin(email: string, playerId: string) {
  console.log(`\n=== ADMIN: link ${email} → ${playerId} (isAdmin) ===`);
  const user = await admin.auth().getUserByEmail(email).catch(() => null);
  if (!user) {
    console.error(`❌ No Firebase Auth user for ${email}. Create it first (Authentication → Add user).`);
    process.exit(1);
  }
  const ref = db.collection("players").doc(playerId);
  const exists = (await ref.get()).exists;
  if (!exists && !adminName) {
    console.error(`❌ Player ${playerId} not found. Pass --admin-name "First Last" to create a non-playing admin doc.`);
    process.exit(1);
  }
  if (!exists) console.log(`✅ player ${playerId} (${adminName}) — admin only, not on a league team`);
  console.log(`✅ ${playerId}.authUid = ${user.uid}, isAdmin = true`);
  if (commit) {
    await ref.set({ ...(exists ? {} : { id: playerId, displayName: adminName }), authUid: user.uid, isAdmin: true }, { merge: true });
    await ref.collection("private").doc("profile").set({ email: email.toLowerCase() }, { merge: true });
  }
}

interface ResultEntry { winner: "teamA" | "teamB" | "AS" | null; margin?: number; thru?: number; _note?: string }

async function pass2(file: string) {
  const inputPath = path.resolve(file);
  if (!fs.existsSync(inputPath)) { console.error(`❌ Results file not found: ${inputPath}`); process.exit(1); }
  const results: Record<string, ResultEntry> = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const entries = Object.entries(results).filter(([id, r]) => !id.startsWith("_") && r && r.winner);
  console.log(`\n=== PASS 2: ${entries.length} result-only matches ===`);

  for (const [id, r] of entries) {
    const ref = db.collection("matches").doc(id);
    const snap = await ref.get();
    if (!snap.exists) { console.error(`❌ ${id}: match not found`); continue; }
    const m = snap.data()!;
    if (!m._seededAt) { console.error(`❌ ${id}: not seeded yet (no _seededAt) — wait for the create trigger and retry`); continue; }
    const scored = Object.values(m.holes ?? {}).some((h: any) => h?.input?.teamAPlayerGross != null || h?.input?.teamBPlayerGross != null);
    if (scored) { console.error(`❌ ${id}: has hole scores — a manual result only applies to a match with no card`); continue; }
    const winner = r.winner!;
    const manual = winner === "AS"
      ? { winner, margin: 0, thru: 18 }
      : { winner, margin: r.margin ?? 1, thru: r.thru ?? 18 };
    if (winner !== "AS") {
      const left = 18 - manual.thru;
      if (manual.margin < 1 || manual.margin > manual.thru || (left > 0 && manual.margin <= left)) {
        console.error(`❌ ${id}: ${manual.margin}&${left} is not a finished match`); continue;
      }
    }
    console.log(`✅ ${id}: ${winner === "AS" ? "halved" : `${winner} ${manual.margin}${manual.thru < 18 ? `&${18 - manual.thru}` : " up"}`}${r._note ? `  (${r._note})` : ""}`);
    if (commit) {
      await ref.update({
        manualResult: { ...manual, setBy: "seed-script", setAt: admin.firestore.FieldValue.serverTimestamp() },
        _computeSig: admin.firestore.FieldValue.delete(),
      });
      await sleep(100);
    }
  }
}

(async () => {
  console.log(commit ? "🔥 COMMIT mode — writing to Firestore" : "🧪 DRY RUN — nothing is written (add --commit)");
  if (resultsFile) {
    await pass2(resultsFile);
  } else {
    await pass1();
    if (adminEmail && adminPlayer) await linkAdmin(adminEmail, adminPlayer);
  }
  console.log("\nDone.");
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
