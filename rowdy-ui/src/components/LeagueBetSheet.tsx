/**
 * Bet sheet for the league (Putt Pirates) markets that aren't a single match:
 *
 *   Season (mode "season"):
 *     - Playoffs: yes/no on a player finishing in the playoff cut (top 4 + ties
 *       for 4th).
 *     - Final points: over/under on a player's FINAL season points, the points
 *       already banked included. The sheet shows where the player stands and
 *       only offers lines the rest of the season can still decide.
 *     Both close once the player's last match starts, and can't be cancelled
 *     once locked in (the season moves under them in the meantime).
 *
 *   Team battle (mode "teamMonth"): which of two league teams scores more in
 *     one month, the month's bonus point included (level = push). Closes when
 *     the month's first match starts.
 *
 * Same builder flow as PlayerPropSheet (stake stepper, open offer vs challenge,
 * bet-slip review, open offers with Take), posting through the same callables.
 * Settlement runs from the season standings — see functions/src/helpers/leagueBets.ts.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus } from "lucide-react";
import { Modal } from "./Modal";
import BetSlipReview from "./BetSlipReview";
import { useToast } from "../contexts/ToastContext";
import { betsApi } from "../api/bets";
import { fmtPts } from "../utils/leagueStandings";
import type { CreateBetOfferRequest } from "../api/adminContracts";
import type { BetDoc } from "../types";

const QUICK_AMOUNTS = [10, 20, 50, 100];
const STEP = 5;
const YES_COLOR = "#059669"; // emerald-600 (matches Over)
const NO_COLOR = "#475569"; // slate-600 (matches Under)

export type LeagueBetMode = { kind: "season" } | { kind: "teamMonth"; roundId: string; monthName: string };

/** A player's season so far, as the season bets see it. */
export interface SeasonPlayer {
  id: string;
  name: string;
  points: number;
  /** Matches not yet closed. */
  remaining: number;
  rank: number;
  inCut: boolean;
  /** Still bettable: has a match that hasn't started. */
  open: boolean;
}

export interface LeagueTeamOption {
  id: string;
  name: string;
  color: string;
}

type SeasonProp = "playoffs" | "points";

/** Every half-point strictly between banked points and the most still reachable (server: isLivePointLine). */
function livePointLines(banked: number, remaining: number): number[] {
  const lines: number[] = [];
  for (let l = banked + 0.5; l < banked + remaining; l += 0.5) lines.push(l);
  return lines;
}

const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export interface LeagueBetSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: string;
  mode: LeagueBetMode;
  players: SeasonPlayer[];
  teams: LeagueTeamOption[];
  /** Takeable open offers for this sheet's markets (season props, or this month's team battles). */
  openOffers: BetDoc[];
  loggedIn: boolean;
  meId?: string;
  /** Everyone you could challenge. */
  rosterOptions: { id: string; name: string }[];
  bettorName: (pid?: string) => string;
  onTake: (b: BetDoc) => void | Promise<unknown>;
}

export default function LeagueBetSheet({
  isOpen,
  onClose,
  tournamentId,
  mode,
  players,
  teams,
  openOffers,
  loggedIn,
  meId,
  rosterOptions,
  bettorName,
  onTake,
}: LeagueBetSheetProps) {
  const { showToast } = useToast();
  const isSeason = mode.kind === "season";

  // Season props
  const [prop, setProp] = useState<SeasonProp>("playoffs");
  const [subjectId, setSubjectId] = useState("");
  const [yesNo, setYesNo] = useState<"yes" | "no" | null>(null);
  const [ouSide, setOuSide] = useState<"over" | "under" | null>(null);
  const [pickedLine, setPickedLine] = useState<number | null>(null);
  // Team battle: you back team A against team B.
  const [backId, setBackId] = useState("");
  const [vsId, setVsId] = useState("");
  // Shared
  const [amount, setAmount] = useState(10);
  const [directed, setDirected] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [takingId, setTakingId] = useState<string | null>(null);
  const takeOffer = async (b: BetDoc) => {
    if (takingId) return;
    setTakingId(b.id);
    try {
      await onTake(b);
    } finally {
      setTakingId(null);
    }
  };

  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const bettable = useMemo(() => players.filter((p) => p.open).sort((a, b) => a.rank - b.rank), [players]);
  const sortedRoster = useMemo(() => [...rosterOptions].sort((a, b) => a.name.localeCompare(b.name)), [rosterOptions]);
  const subject = subjectId ? playersById[subjectId] : undefined;
  const subjectName = (id?: string) => (id && playersById[id]?.name) || bettorName(id);
  const teamName = (id?: string) => (id && teamsById[id]?.name) || "Team";

  // Final-points lines for the chosen player; keep the picked line only while it's still live.
  const lines = useMemo(() => (subject ? livePointLines(subject.points, subject.remaining) : []), [subject]);
  const line = pickedLine !== null && lines.includes(pickedLine) ? pickedLine : lines[Math.floor(lines.length / 2)];

  // The parent already drops closed markets and decided lines; split by the active tab.
  const relevantOffers = openOffers.filter((b) => {
    if (!isSeason) return b.market === "teamMonth";
    return prop === "playoffs" ? b.market === "playoffs" : b.market === "overUnder" && b.metric === "playerTournamentPoints";
  });

  const ready = isSeason
    ? !!subject && (prop === "playoffs" ? !!yesNo : !!ouSide && line !== undefined)
    : !!backId && !!vsId && backId !== vsId;
  const canSubmit = ready && amount > 0 && (!directed || !!targetId) && !submitting;
  const targetName = rosterOptions.find((p) => p.id === targetId)?.name;

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handlePost = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let base: CreateBetOfferRequest;
      if (!isSeason) {
        base = {
          tournamentId,
          market: "teamMonth",
          roundId: mode.roundId,
          leagueTeamAId: backId,
          leagueTeamBId: vsId,
          side: "teamA",
          amount,
        };
      } else if (prop === "playoffs") {
        base = { tournamentId, market: "playoffs", subjectId, side: yesNo!, amount };
      } else {
        base = {
          tournamentId,
          market: "overUnder",
          metric: "playerTournamentPoints",
          subjectId,
          line: line!,
          side: ouSide!,
          amount,
        };
      }
      if (directed) {
        await betsApi.createBetChallenge({ ...base, targetId });
        showToast({ variant: "success", message: "Challenge sent — it locks in as soon as they accept." });
      } else {
        await betsApi.createBetOffer(base);
        showToast({ variant: "success", message: "Offer posted to the marketplace." });
      }
      onClose();
    } catch (e) {
      showToast({ variant: "error", message: e instanceof Error ? e.message : "Couldn't post the bet" });
      setSubmitting(false);
    }
  };

  const review = (() => {
    if (!isSeason) {
      return {
        contextLabel: `${mode.monthName} team battle · most points, bonus included`,
        sideLabel: `${teamName(backId)} over ${teamName(vsId)}`,
        sideColor: teamsById[backId]?.color ?? YES_COLOR,
      };
    }
    if (prop === "playoffs") {
      return {
        contextLabel: `${subject?.name ?? ""} · makes the playoffs?`,
        sideLabel: yesNo === "yes" ? "Yes — makes the playoffs" : "No — misses the playoffs",
        sideColor: yesNo === "yes" ? YES_COLOR : NO_COLOR,
      };
    }
    return {
      contextLabel: `${subject?.name ?? ""} · final season points (has ${fmtPts(subject?.points ?? 0)})`,
      sideLabel: `${ouSide === "over" ? "Over" : "Under"} ${line} pts`,
      sideColor: ouSide === "over" ? YES_COLOR : NO_COLOR,
    };
  })();

  const offerText = (b: BetDoc): string => {
    if (b.market === "teamMonth") {
      const backed = b.proposerSide === "teamA" ? b.leagueTeamAId : b.leagueTeamBId;
      const other = b.proposerSide === "teamA" ? b.leagueTeamBId : b.leagueTeamAId;
      return `${teamName(backed)} over ${teamName(other)}`;
    }
    if (b.market === "playoffs") {
      return `${subjectName(b.subjectId)} ${b.proposerSide === "yes" ? "makes" : "misses"} playoffs`;
    }
    return `${subjectName(b.subjectId)} ${b.proposerSide === "over" ? "over" : "under"} ${b.line} pts`;
  };

  /** A two-choice tile row (Yes/No, Under/Over). */
  const choiceTiles = <T extends string>(
    options: { id: T; label: string; sub: string; color: string }[],
    value: T | null,
    onPick: (v: T) => void
  ) => (
    <div className="flex items-stretch gap-2">
      {options.map((o) => {
        const selected = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick(o.id)}
            aria-pressed={selected}
            style={selected ? { backgroundColor: o.color, borderColor: o.color } : { borderLeftColor: o.color, borderLeftWidth: 4 }}
            className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
              selected ? "text-white" : "border-border bg-card hover:bg-muted"
            }`}
          >
            <span
              className={`block text-[0.6rem] font-bold uppercase tracking-wide ${selected ? "text-white/85" : ""}`}
              style={selected ? undefined : { color: o.color }}
            >
              {o.label}
            </span>
            <span className={`block text-sm font-semibold ${selected ? "text-white" : "text-foreground"}`}>{o.sub}</span>
          </button>
        );
      })}
    </div>
  );

  /** Team chips for the battle builder; `exclude` hides the team already picked on the other side. */
  const teamChips = (value: string, onPick: (id: string) => void, exclude?: string) => (
    <div className="grid grid-cols-2 gap-2">
      {teams
        .filter((t) => t.id !== exclude)
        .map((t) => {
          const selected = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t.id)}
              aria-pressed={selected}
              style={selected ? { backgroundColor: t.color, borderColor: t.color } : { borderLeftColor: t.color, borderLeftWidth: 4 }}
              className={`truncate rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                selected ? "text-white" : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {t.name}
            </button>
          );
        })}
    </div>
  );

  const sectionLabel = (text: string) => (
    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text}</div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isSeason ? "Season bets" : `${mode.monthName} team battle`}
      ariaLabel={isSeason ? "Place a season bet" : "Place a team battle bet"}
    >
      {reviewing ? (
        <BetSlipReview
          contextLabel={review.contextLabel}
          sideLabel={review.sideLabel}
          sideColor={review.sideColor}
          amount={amount}
          directed={directed}
          targetName={targetName}
          submitting={submitting}
          onConfirm={handlePost}
          onBack={() => setReviewing(false)}
        />
      ) : (
        <div className="space-y-4">
          {isSeason ? (
            <>
              <div className="flex gap-1 rounded-full bg-muted p-0.5">
                {(
                  [
                    { id: "playoffs", label: "Makes playoffs" },
                    { id: "points", label: "Final points O/U" },
                  ] as { id: SeasonProp; label: string }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setProp(t.id)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      prop === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div>
                {sectionLabel("Player")}
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-slate-400 focus:outline-none"
                >
                  <option value="">Select a player…</option>
                  {bettable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {ordinal(p.rank)} · {p.name} · {fmtPts(p.points)} pts
                    </option>
                  ))}
                </select>
                {subject && (
                  <p className="mt-1.5 px-1 text-xs text-muted-foreground">
                    {ordinal(subject.rank)} with {fmtPts(subject.points)} pts · {subject.remaining} match
                    {subject.remaining === 1 ? "" : "es"} left ·{" "}
                    <span className={subject.inCut ? "font-semibold text-emerald-600" : "font-semibold text-foreground"}>
                      {subject.inCut ? "in the playoff spots" : "outside the cut"}
                    </span>
                  </p>
                )}
                {bettable.length === 0 && (
                  <p className="mt-1.5 px-1 text-xs text-muted-foreground">
                    Every player&apos;s last match has started — season bets are closed.
                  </p>
                )}
              </div>

              {prop === "playoffs" ? (
                <div>
                  {sectionLabel("Top 4 + ties for 4th make it")}
                  {choiceTiles(
                    [
                      { id: "no", label: "No", sub: "Misses the playoffs", color: NO_COLOR },
                      { id: "yes", label: "Yes", sub: "Makes the playoffs", color: YES_COLOR },
                    ],
                    yesNo,
                    setYesNo
                  )}
                </div>
              ) : (
                <div>
                  {sectionLabel("Final season points")}
                  {subject ? (
                    <div className="mb-2 grid grid-cols-4 gap-2">
                      {lines.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setPickedLine(l)}
                          className={`rounded-full px-2 py-1 text-xs font-semibold transition-colors ${
                            line === l ? "bg-slate-900 text-white" : "bg-muted text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mb-2 px-1 text-xs text-muted-foreground">Pick a player to see the lines still in play.</p>
                  )}
                  {choiceTiles(
                    [
                      { id: "under", label: "Under", sub: line !== undefined ? `Under ${line} pts` : "Under", color: NO_COLOR },
                      { id: "over", label: "Over", sub: line !== undefined ? `Over ${line} pts` : "Over", color: YES_COLOR },
                    ],
                    ouSide,
                    setOuSide
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <p className="px-1 text-xs text-muted-foreground">
                Which team scores more in {mode.monthName}? Match points plus the month&apos;s bonus point; level
                is a push.
              </p>
              <div>
                {sectionLabel("Your team")}
                {teamChips(backId, (id) => {
                  setBackId(id);
                  if (vsId === id) setVsId("");
                })}
              </div>
              <div>
                {sectionLabel("Beats")}
                {teamChips(vsId, setVsId, backId)}
              </div>
            </div>
          )}

          {/* Stake stepper + presets */}
          <div>
            {sectionLabel("Stake (each side risks this)")}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAmount((a) => Math.max(STEP, a - STEP))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground active:scale-95"
                aria-label="Decrease stake"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-card py-2">
                <span className="text-lg font-bold text-muted-foreground">$</span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  className="input-lg w-20 bg-transparent text-center text-lg font-bold text-foreground focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setAmount((a) => a + STEP)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground active:scale-95"
                aria-label="Increase stake"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              {QUICK_AMOUNTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(a)}
                  className={`flex-1 rounded-full px-2 py-1 text-xs font-semibold transition-colors ${
                    amount === a ? "bg-slate-900 text-white" : "bg-muted text-muted-foreground hover:bg-muted"
                  }`}
                >
                  ${a}
                </button>
              ))}
            </div>
          </div>

          {/* Offer vs challenge */}
          <div>
            <div className="flex gap-2">
              {[false, true].map((d) => (
                <button
                  key={String(d)}
                  type="button"
                  onClick={() => setDirected(d)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                    directed === d ? "border-slate-900 bg-slate-900 text-white" : "border-border bg-card text-foreground"
                  }`}
                >
                  {d ? "Challenge a player" : "Open offer"}
                </button>
              ))}
            </div>
            {directed && (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-slate-400 focus:outline-none"
              >
                <option value="">Select a player…</option>
                {sortedRoster
                  .filter((p) => p.id !== meId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="flex-1 rounded-lg bg-muted px-4 py-3 text-base font-semibold text-foreground transition-transform active:scale-95 hover:bg-muted disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => canSubmit && setReviewing(true)}
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white transition-transform active:scale-95 hover:bg-green-700 disabled:opacity-60"
            >
              Review bet
            </button>
          </div>

          {/* Existing open offers — take the other side */}
          {relevantOffers.length > 0 && (
            <div className="space-y-1.5 border-t border-border pt-3">
              {sectionLabel("Open offers")}
              <ul className="space-y-1.5">
                {relevantOffers.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-slate-200"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-semibold text-foreground">{offerText(b)}</span>{" "}
                      <span className="text-muted-foreground">· {bettorName(b.proposerId)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-bold tabular-nums text-foreground">${b.amount}</span>
                      {loggedIn ? (
                        <button
                          type="button"
                          disabled={meId === b.proposerId || takingId !== null}
                          onClick={() => void takeOffer(b)}
                          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white active:scale-95 disabled:bg-muted disabled:text-muted-foreground"
                        >
                          {meId === b.proposerId ? "Yours" : takingId === b.id ? "Taking…" : "Take"}
                        </button>
                      ) : (
                        <Link to="/login" className="text-xs font-semibold text-blue-600">
                          Log in
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
