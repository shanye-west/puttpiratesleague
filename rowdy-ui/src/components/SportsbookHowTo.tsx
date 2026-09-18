/**
 * The Sportsbook "How it works" guide — a read-only explainer opened from a Help
 * button on the Open Bets tab. Covers the betting mechanics (even-money stakes,
 * offer vs. challenge, the accept/lock/settle lifecycle, pushes, the tab) and
 * lists every market a player can bet, with what settles each one.
 *
 * Pure presentational content — no data, no callables. Keep it in sync with the
 * markets exposed by BetSheet / PlayerPropSheet and the settlement rules in
 * functions/src/scoring/betSettlement.ts.
 */

import type { ReactNode } from "react";
import { Modal } from "./Modal";

export interface SportsbookHowToProps {
  isOpen: boolean;
  onClose: () => void;
  /** Swap the market list for the captains'-match markets (pre-draft tournaments). */
  hasCaptainsMatch?: boolean;
  /** Swap the market list for the league-season markets (Putt Pirates). */
  isLeague?: boolean;
}

// Tournament-long player-prop tile colors (mirror PlayerPropSheet / Sportsbook).
const OVER_COLOR = "#059669";
const UNDER_COLOR = "#475569";

export default function SportsbookHowTo({ isOpen, onClose, hasCaptainsMatch, isLeague }: SportsbookHowToProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🎲 How the Sportsbook works" ariaLabel="Sportsbook how-to" maxWidth="max-w-md">
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1 text-sm leading-relaxed text-foreground">
        {/* The basics */}
        <Section title="The basics">
          <p className="text-muted-foreground">
            Every bet is head-to-head between two players, <strong className="text-foreground">even money at a flat
              stake</strong> — both sides risk the same amount. The winner is owed the stake, the loser pays it, and a
            tie is a <em>push</em> (no money changes hands). There's no house and no odds.
          </p>
          <p className="text-muted-foreground">
            The app tracks who owes whom but doesn't move money. You pay each other directly, then mark it paid on your{" "}
            <strong className="text-foreground">tab</strong>.
          </p>
        </Section>

        {/* Two ways to bet */}
        <Section title="Two ways to start a bet">
          <Bullet>
            <strong>Open offer</strong> — post a bet to the marketplace and let anyone take the other side. It shows
            up on the event for everyone until someone grabs it (or you cancel it).
          </Bullet>
          <Bullet>
            <strong>Challenge a player</strong> — aim a bet at one specific person. Only they can accept or decline it.
          </Bullet>
          <p className="text-muted-foreground">
            You can also <strong className="text-foreground">Take</strong> any open offer someone else posted — that
            puts you on the opposite side automatically.
          </p>
        </Section>

        {/* Lifecycle */}
        <Section title="From offer to locked in">
          <ol className="list-decimal space-y-1.5 pl-6 text-muted-foreground">
            <li>Someone posts an offer or sends a challenge.</li>
            <li>
              When another player <strong className="text-foreground">takes the offer</strong> (or the challenged player{" "}
              <strong className="text-foreground">accepts</strong>), the bet <strong className="text-foreground">locks
              in</strong> and goes live.
            </li>
            <li>
              Either player can <strong className="text-foreground">call it off</strong> until the market closes
              {hasCaptainsMatch
                ? " (the round gets played, or the book is shut) — after that it's set."
                : isLeague
                  ? " (the match starts, or the month's first match starts for a team battle) — after that it's set. Season bets (playoffs, final points) are set as soon as they lock in."
                  : " (the match tees off / the tournament begins) — after that it's set."}
            </li>
            <li>
              When the result is known, the bet <strong className="text-foreground">settles automatically</strong> and
              lands in Completed Bets with the payout.
            </li>
          </ol>
        </Section>

        {/* What you can bet */}
        <Section title="What you can bet">
          {isLeague ? (
            <>
              <Market
                emoji="⛳"
                name="Match Winner"
                window="Open until the match starts"
                desc="Pick who wins one of the month's matches. Settles on the result; a halved match is a push."
              />
              <Market
                emoji="📏"
                name="Match Holes O/U"
                window="Open until the match starts"
                desc="Over or under on how many holes a match goes before it closes. Half-lines, so there are no pushes."
                sides={[
                  { label: "Under", color: UNDER_COLOR },
                  { label: "Over", color: OVER_COLOR },
                ]}
              />
              <Market
                emoji="🏴‍☠️"
                name="Team Battle"
                window="Open until the month's first match starts"
                desc="Pick which of two teams scores more points in a month. The month's bonus point counts. Equal points is a push. Settles once the month's matches are done and its bonus is decided."
              />
              <Market
                emoji="🎟️"
                name="Makes the Playoffs"
                window="Open until the player's last match starts"
                desc="Yes or no on a player finishing in the playoff spots: the top 4, plus anyone tied for 4th. Settles on the final standings. Can't be called off once locked in, and an untaken offer is pulled when that player's next match finishes."
                sides={[
                  { label: "No", color: UNDER_COLOR },
                  { label: "Yes", color: OVER_COLOR },
                ]}
              />
              <Market
                emoji="📊"
                name="Final Points O/U"
                window="Open until the player's last match starts"
                desc="Over or under on a player's final season points, including points already banked. The sheet only offers lines that are still undecided. A win is 1 point and a halve is ½, so a whole-number line can push. Settles on the final standings. Can't be called off once locked in, and an untaken offer is pulled when that player's next match finishes."
                sides={[
                  { label: "Under", color: UNDER_COLOR },
                  { label: "Over", color: OVER_COLOR },
                ]}
              />
            </>
          ) : hasCaptainsMatch ? (
            <>
              <Market
                emoji="🥊"
                name="Captains' Match Winner"
                window="Open while the book is open"
                desc="Pick which captain wins the season-long match outright. Settles when it's decided; a halved match refunds both sides."
              />
              <Market
                emoji="⛳"
                name="Round Winner"
                window="Open until that round is played"
                desc="Pick which captain wins a single round's card — most holes won that day. A halved round is a push. Each round's market closes as soon as its scorecard is entered."
              />
              <Market
                emoji="⏳"
                name="Decided By Round O/U"
                window="Open while the book is open"
                desc="Over or under on which round the match gets clinched. If it goes the distance it settles at the final round. Half-lines only, so there are no pushes."
                sides={[
                  { label: "Under", color: UNDER_COLOR },
                  { label: "Over", color: OVER_COLOR },
                ]}
              />
              <Market
                emoji="📊"
                name="Rounds Won O/U"
                window="Open while the book is open"
                desc="Over or under on how many rounds one captain wins outright across the season. Halved rounds count for neither. Half-lines only, so there are no pushes."
                sides={[
                  { label: "Under", color: UNDER_COLOR },
                  { label: "Over", color: OVER_COLOR },
                ]}
              />
            </>
          ) : (
            <>
          <Market
            emoji="🏆"
            name="Cup Winner"
            window="Open until the tournament starts"
            desc="Pick which team wins the overall Cup. Settles when the Cup is decided."
          />
          <Market
            emoji="🗓️"
            name="Session / Round Winner"
            window="Open until that round tees off"
            desc="Pick which team wins a round's points. Settles on the round's final team points; a halved session (equal points) is a push."
          />
          <Market
            emoji="⛳"
            name="Match Winner"
            window="Open until the match tees off"
            desc="Pick which player/pairing wins a single match. Settles on the match result; a halved match (All Square) is a push."
          />
          <Market
            emoji="📏"
            name="Match Holes O/U"
            window="Open until the match tees off"
            desc="Over or under on how many holes a match goes before it closes. Lines run 10.5–17.5 — half-lines, so there are no pushes."
            sides={[
              { label: "Under", color: UNDER_COLOR },
              { label: "Over", color: OVER_COLOR },
            ]}
          />
          <Market
            emoji="👤"
            name="Player Matchup"
            window="Open until the tournament starts"
            desc="Pick which of two players scores more tournament points across the whole event. Equal points is a push."
          />
          <Market
            emoji="📊"
            name="Player Points O/U"
            window="Open until the tournament starts"
            desc="Over or under on a single player's total tournament points. Lines run every half-point 0.5–3.5, so whole-point lines (1/2/3) can push if the player lands exactly there."
            sides={[
              { label: "Under", color: UNDER_COLOR },
              { label: "Over", color: OVER_COLOR },
            ]}
          />
          <Market
            emoji="🏆"
            name="Player Wins O/U"
            window="Open until the tournament starts"
            desc="Over or under on how many matches a single player wins (halved matches don't count). Lines are 0.5/1.5/2.5/3.5 — half-lines, so there are no pushes."
            sides={[
              { label: "Under", color: UNDER_COLOR },
              { label: "Over", color: OVER_COLOR },
            ]}
          />
            </>
          )}
        </Section>

        {/* The tab + leaders */}
        <Section title="Money Leaders & your tab">
          <Bullet>
            <strong>Money Leaders</strong> is the shared standings of everyone's settled bets — net winnings and a
            W-L record.
          </Bullet>
          <Bullet>
            <strong>Your tab</strong> (in My Bets) nets out what each player owes you and what you owe them across all
            your settled bets.
          </Bullet>
          <Bullet>
            <strong>Settle up</strong> when you've paid someone: tap <em>Settle up</em>, they confirm they got it, and
            it clears off your tab. Money Leaders standings don't change — only the amounts-owed tab does.
          </Bullet>
        </Section>

        <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Heads up: a <strong className="text-foreground">push</strong> happens on any tie at the line (a halved match,
          equal session points, an exact O/U number). Nobody wins or loses — the stake just comes back.
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white transition-transform active:scale-95"
      >
        Got it
      </button>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 text-muted-foreground">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
      <span>{children}</span>
    </div>
  );
}

/** A single market entry: icon + name + when it's bettable + how it settles. */
function Market({
  emoji,
  name,
  window,
  desc,
  sides,
}: {
  emoji: string;
  name: string;
  window: string;
  desc: string;
  sides?: { label: string; color: string }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <span>{emoji}</span>
          {name}
        </span>
        {sides && (
          <span className="flex gap-1">
            {sides.map((s) => (
              <span
                key={s.label}
                className="rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-white"
                style={{ backgroundColor: s.color }}
              >
                {s.label}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">{window}</div>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}
