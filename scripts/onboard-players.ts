/**
 * Onboard players: create their Firebase Auth account and link it to their
 * player doc (Firebase project `puttpiratesgolf` ONLY).
 *
 *   npx ts-node onboard-players.ts --input data/player-emails.json            # dry run
 *   npx ts-node onboard-players.ts --input data/player-emails.json --commit   # do it
 *
 * Input JSON — an array of { playerId, email } (displayName optional, for readability):
 *   [ { "playerId": "pChrisHertz", "displayName": "Chris Hertz", "email": "chrishertz9@gmail.com" } ]
 *
 * The app has no self-signup (routes/Login.tsx is sign-in + "Forgot password?"
 * only), so an admin has to create the Auth user before a player can ever log
 * in. Each new account gets a random throwaway password that is never meant to
 * be delivered: the player uses "Forgot password?" on the login screen and sets
 * their own. The generated passwords are printed only as a fallback for when
 * the reset email doesn't arrive.
 *
 * This mirrors the `linkAuthToPlayer` callable (callables/adminOps.ts) rather
 * than the older bulk-link-auth.ts, which put the email on the world-readable
 * player doc and never fanned the uid into existing matches. Specifically it:
 *   - keeps `authUid` on the player doc (it's the authUid==uid query key),
 *   - keeps the email OUT of it — PII goes in players/{id}/private/profile,
 *   - refuses to steal a uid already linked to a different player,
 *   - fans the uid into `authorizedUids` of every OPEN match the player is in,
 *     because a match's authorizedUids is derived at seed time and a player
 *     linked afterwards otherwise can't score the matches already created.
 *
 * Safe to re-run: an existing Auth user is reused (never re-passworded) and
 * every write is idempotent, so this doubles as the "link the stragglers once
 * they send their email" script.
 */

import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const EXPECTED_PROJECT = "puttpiratesgolf";

// ---------------------------------------------------------------------------
// Args + admin init (with the project guard)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const argValue = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const inputFile = argValue("--input");

if (!inputFile) {
  console.log("Usage: npx ts-node onboard-players.ts --input data/player-emails.json [--commit]");
  process.exit(1);
}

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
const auth = admin.auth();
const { FieldValue } = admin.firestore;

// ---------------------------------------------------------------------------

interface PlayerEmail {
  playerId: string;
  email: string;
  displayName?: string;
}

/** Throwaway password — the player resets it via email, nobody needs to memorise it. */
function randomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(20);
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  // Firebase wants 6+ chars; the punctuation keeps it strong against any policy.
  return `${body}!7`;
}

function readInput(file: string): PlayerEmail[] {
  const inputPath = path.resolve(file);
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!Array.isArray(raw)) {
    console.error("❌ Input must be a JSON array of { playerId, email }");
    process.exit(1);
  }
  return raw as PlayerEmail[];
}

/** Drop exact duplicate rows and reject genuine conflicts before writing anything. */
function dedupe(entries: PlayerEmail[]): PlayerEmail[] {
  const byPlayer = new Map<string, PlayerEmail>();
  const emailOwner = new Map<string, string>();
  const errors: string[] = [];

  for (const [i, e] of entries.entries()) {
    if (!e?.playerId || !e?.email) {
      errors.push(`Row ${i}: needs both "playerId" and "email"`);
      continue;
    }
    const email = e.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push(`Row ${i} (${e.playerId}): "${e.email}" is not a valid email`);
      continue;
    }

    const seen = byPlayer.get(e.playerId);
    if (seen && seen.email !== email) {
      errors.push(`${e.playerId}: listed twice with different emails (${seen.email} vs ${email})`);
      continue;
    }
    const owner = emailOwner.get(email);
    if (owner && owner !== e.playerId) {
      errors.push(`${email}: listed for two different players (${owner} and ${e.playerId})`);
      continue;
    }
    if (seen) {
      console.log(`ℹ️  ${e.playerId}: duplicate row with the same email — ignoring the repeat`);
      continue;
    }

    emailOwner.set(email, e.playerId);
    byPlayer.set(e.playerId, { ...e, email });
  }

  if (errors.length > 0) {
    console.error("❌ Input problems:\n");
    errors.forEach((msg) => console.error(`  - ${msg}`));
    process.exit(1);
  }
  return [...byPlayer.values()];
}

interface Outcome {
  playerId: string;
  displayName: string;
  email: string;
  account: "created" | "existing";
  password: string;
  matchesAuthorized: number;
}

async function onboard(entries: PlayerEmail[]) {
  console.log(`\n=== ${commit ? "ONBOARDING" : "DRY RUN"}: ${entries.length} players ===\n`);

  const done: Outcome[] = [];
  const problems: string[] = [];

  for (const entry of entries) {
    const { playerId, email } = entry;
    const ref = db.collection("players").doc(playerId);
    const snap = await ref.get();
    if (!snap.exists) {
      problems.push(`${playerId}: no player doc — create it first (/admin/players) or fix the id`);
      continue;
    }
    const displayName = (snap.data()?.displayName as string) ?? entry.displayName ?? playerId;

    // Find or create the Auth user. An existing account is reused as-is: never
    // reset a password out from under someone who already signed in.
    let authUser = await auth.getUserByEmail(email).catch(() => null);
    let account: Outcome["account"] = authUser ? "existing" : "created";
    let password = "(unchanged — account already existed)";

    if (!authUser) {
      if (commit) {
        password = randomPassword();
        authUser = await auth.createUser({ email, password, displayName, emailVerified: false });
      } else {
        password = "(generated on --commit)";
      }
    }

    // Don't silently steal a uid already linked to a different player.
    if (authUser) {
      const conflict = await db.collection("players").where("authUid", "==", authUser.uid).get();
      const other = conflict.docs.find((d) => d.id !== playerId);
      if (other) {
        problems.push(`${playerId}: ${email} is already linked to player "${other.id}" — resolve by hand`);
        continue;
      }
    }

    // authUid stays on the public doc (it's the query key); the email is PII and
    // goes only in the server-only private subcollection.
    if (commit && authUser) {
      await ref.set({ authUid: authUser.uid, _adminUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await ref.collection("private").doc("profile").set({ email }, { merge: true });
    }

    // Fan the uid into every OPEN match this player is in; closed matches keep
    // their historical authorizedUids.
    const openMatches = await db.collection("matches").where("playerIds", "array-contains", playerId).get();
    const toAuthorize = openMatches.docs.filter((m) => m.data().status?.closed !== true);
    if (commit && authUser && toAuthorize.length > 0) {
      const batch = db.batch();
      for (const m of toAuthorize) {
        batch.update(m.ref, { authorizedUids: FieldValue.arrayUnion(authUser.uid) });
      }
      await batch.commit();
    }

    console.log(
      `${account === "created" ? "✅" : "🔗"} ${displayName.padEnd(18)} ${email.padEnd(36)} ` +
        `account ${account}, ${toAuthorize.length} open matches authorized`
    );

    done.push({
      playerId,
      displayName,
      email,
      account,
      password,
      matchesAuthorized: toAuthorize.length,
    });
  }

  // ---- Summary -----------------------------------------------------------
  const created = done.filter((d) => d.account === "created");

  console.log(`\n${"=".repeat(72)}`);
  console.log(`${commit ? "Done" : "Dry run"} — ${done.length} players, ${created.length} new accounts`);

  if (created.length > 0) {
    console.log(`\nNew accounts. Tell each player to open the app → Login → "Forgot password?"`);
    console.log(`and set their own password. These fallback passwords only matter if the`);
    console.log(`reset email never lands — don't hand them out otherwise.\n`);
    console.table(created.map((d) => ({ player: d.displayName, email: d.email, fallbackPassword: d.password })));
  }

  if (problems.length > 0) {
    console.log(`\n⚠️  ${problems.length} skipped:`);
    problems.forEach((msg) => console.log(`  - ${msg}`));
  }

  if (!commit) {
    console.log(`\nNothing was written. Re-run with --commit to apply.`);
  }
}

onboard(dedupe(readInput(inputFile)))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
