/**
 * Bet sheet for the captains' match — the pre-draft season-long running singles
 * match between the two captains. Four markets behind one toggle:
 *   - Overall: who wins the match outright (teamA = player A, teamB = player B).
 *     A halved match is a push.
 *   - Round: who wins one round's card. Only rounds that haven't been played are
 *     offered, since a round's market closes the moment its card is entered.
 *   - Clinch O/U: which round the match is decided in; going the distance
 *     settles at the full schedule. Half-lines only, so it can't push.
 *   - Rounds won O/U: how many rounds one captain wins outright across the
 *     season. Halved rounds count for neither. Half-lines only.
 *
 * Mirrors PlayerPropSheet's builder (stake stepper, open-offer vs challenge,
 * bet-slip review, takeable open offers) and posts through the same betsOps
 * callables. The captains are usually not on any roster yet, so every label here
 * comes from the match doc rather than from team names.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus } from "lucide-react";
import { Modal } from "./Modal";
import BetSlipReview from "./BetSlipReview";
import { useToast } from "../contexts/ToastContext";
import { betsApi } from "../api/bets";
import type { CreateBetOfferRequest } from "../api/adminContracts";
import type { BetDoc, BetOverUnderMetric } from "../types";

const QUICK_AMOUNTS = [10, 20, 50, 100];
const STEP = 5;
const OVER_COLOR = "#059669"; // emerald-600
const UNDER_COLOR = "#475569"; // slate-600

/** Half-lines only on both O/Us, so neither can land on the number. */
const CLINCH_LINES = [8.5, 10.5, 12.5, 14.5, 16.5, 18.5];
const ROUNDS_WON_LINES = [4.5, 6.5, 8.5, 10.5, 12.5];

type CaptainsBetType = "overall" | "round" | "clinch" | "roundsWon";

export interface CaptainsBetSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: string;
  /** Match billing (e.g. "Captains' Match") for the sheet header. */
  label: string;
  /** The two captains' display names, A on the left / B on the right. */
  sideLabels: { teamA: string; teamB: string };
  sideColors: { teamA: string; teamB: string };
  playerAId: string;
  playerBId: string;
  /** Round numbers still open to betting (no card entered yet). */
  bettableRounds: number[];
  /** Open captains'-match offers for this tournament — listed with Take. */
  openOffers: BetDoc[];
  loggedIn: boolean;
  meId?: string;
  rosterOptions: { id: string; name: string }[];
  bettorName: (pid?: string) => string;
  onTake: (b: BetDoc) => void | Promise<unknown>;
}

export default function CaptainsBetSheet({
  isOpen,
  onClose,
  tournamentId,
  label,
  sideLabels,
  sideColors,
  playerAId,
  playerBId,
  bettableRounds,
  openOffers,
  loggedIn,
  meId,
  rosterOptions,
  bettorName,
  onTake,
}: CaptainsBetSheetProps) {
  const { showToast } = useToast();

  const [betType, setBetType] = useState<CaptainsBetType>("overall");
  const [teamSide, setTeamSide] = useState<"teamA" | "teamB" | null>(null);
  const [ouSide, setOuSide] = useState<"over" | "under" | null>(null);
  const [roundNumber, setRoundNumber] = useState<number | null>(bettableRounds[0] ?? null);
  const [clinchLine, setClinchLine] = useState(14.5);
  const [roundsWonLine, setRoundsWonLine] = useState(8.5);
  const [subjectId, setSubjectId] = useState(playerAId);
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

  const sortedRoster = useMemo(
    () => [...rosterOptions].sort((a, b) => a.name.localeCompare(b.name)),
    [rosterOptions]
  );

  const isTeamMarket = betType === "overall" || betType === "round";
  const ouMetric: BetOverUnderMetric = betType === "clinch" ? "captainsClinchRound" : "captainsRoundsWon";
  const ouLine = betType === "clinch" ? clinchLine : roundsWonLine;
  const ouLines = betType === "clinch" ? CLINCH_LINES : ROUNDS_WON_LINES;
  const setOuLine = betType === "clinch" ? setClinchLine : setRoundsWonLine;
  const subjectName = subjectId === playerAId ? sideLabels.teamA : sideLabels.teamB;

  const market: CreateBetOfferRequest["market"] =
    betType === "overall" ? "captainsMatch" : betType === "round" ? "captainsRound" : "overUnder";

  const relevantOffers = openOffers.filter((b) => {
    if (betType === "overall") return b.market === "captainsMatch";
    if (betType === "round") return b.market === "captainsRound" && b.captainsRoundNumber === roundNumber;
    return b.market === "overUnder" && b.metric === ouMetric;
  });

  const canSubmit =
    (isTeamMarket ? !!teamSide && (betType !== "round" || roundNumber !== null) : !!ouSide) &&
    amount > 0 &&
    (!directed || !!targetId) &&
    !submitting;
  const targetName = rosterOptions.find((p) => p.id === targetId)?.name;

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handlePost = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const base: CreateBetOfferRequest = {
        tournamentId,
        market,
        side: isTeamMarket ? teamSide! : ouSide!,
        amount,
      };
      if (betType === "round") base.captainsRoundNumber = roundNumber!;
      if (!isTeamMarket) {
        base.metric = ouMetric;
        base.line = ouLine;
        if (betType === "roundsWon") base.subjectId = subjectId;
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

  const contextLabel = (() => {
    if (betType === "overall") return `${label} · outright winner`;
    if (betType === "round") return `${label} · round ${roundNumber ?? "—"}`;
    if (betType === "clinch") return `${label} · round it's decided in`;
    return `${subjectName} · rounds won`;
  })();

  const review = (() => {
    if (isTeamMarket && teamSide) {
      return {
        sideLabel: sideLabels[teamSide],
        sideColor: sideColors[teamSide],
      };
    }
    if (!isTeamMarket && ouSide) {
      const unit = betType === "clinch" ? "" : " rounds";
      return {
        sideLabel: `${ouSide === "over" ? "Over" : "Under"} ${ouLine}${unit}`,
        sideColor: ouSide === "over" ? OVER_COLOR : UNDER_COLOR,
      };
    }
    return { sideLabel: "", sideColor: "#000" };
  })();

  const noRoundsLeft = betType === "round" && bettableRounds.length === 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Captains' match" ariaLabel="Place a captains' match bet">
      {reviewing ? (
        <BetSlipReview
          contextLabel={contextLabel}
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
          <div className="text-center text-sm text-muted-foreground">{label}</div>

          {/* Market toggle */}
          <div className="grid grid-cols-4 gap-1 rounded-full bg-muted p-0.5">
            {(
              [
                { id: "overall", label: "Overall" },
                { id: "round", label: "Round" },
                { id: "clinch", label: "Clinch" },
                { id: "roundsWon", label: "Rds won" },
              ] as { id: CaptainsBetType; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setBetType(t.id)}
                className={`rounded-full px-2 py-1.5 text-xs font-semibold transition-colors ${
                  betType === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Round picker — only rounds with no card yet */}
          {betType === "round" && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Round</div>
              {noRoundsLeft ? (
                <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Every round has been played — there's nothing left to bet here.
                </p>
              ) : (
                <select
                  value={roundNumber ?? ""}
                  onChange={(e) => setRoundNumber(Number(e.target.value))}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-slate-400 focus:outline-none"
                >
                  {bettableRounds.map((n) => (
                    <option key={n} value={n}>
                      Round {n}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Subject picker for rounds-won */}
          {betType === "roundsWon" && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Captain</div>
              <div className="flex items-stretch gap-2">
                {([playerAId, playerBId] as const).map((pid) => {
                  const selected = subjectId === pid;
                  const color = pid === playerAId ? sideColors.teamA : sideColors.teamB;
                  const name = pid === playerAId ? sideLabels.teamA : sideLabels.teamB;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => setSubjectId(pid)}
                      aria-pressed={selected}
                      style={
                        selected
                          ? { backgroundColor: color, borderColor: color }
                          : { borderLeftColor: color, borderLeftWidth: 4 }
                      }
                      className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                        selected ? "text-white" : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      <span className={`block text-sm font-semibold ${selected ? "text-white" : "text-foreground"}`}>
                        {name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Side picker */}
          {isTeamMarket ? (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                You're betting
              </div>
              <div className="flex items-stretch gap-2">
                {(["teamA", "teamB"] as const).map((s) => {
                  const selected = teamSide === s;
                  const color = sideColors[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTeamSide(s)}
                      aria-pressed={selected}
                      style={
                        selected
                          ? { backgroundColor: color, borderColor: color }
                          : { borderLeftColor: color, borderLeftWidth: 4 }
                      }
                      className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                        selected ? "text-white" : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      <span className={`block text-sm font-semibold ${selected ? "text-white" : "text-foreground"}`}>
                        {sideLabels[s]}
                      </span>
                    </button>
                  );
                })}
              </div>
              {betType === "overall" && (
                <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
                  A halved match refunds both sides.
                </p>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {betType === "clinch" ? "Decided by round" : `${subjectName}'s rounds won`}
              </div>
              <div className="mb-2 grid grid-cols-6 gap-2">
                {ouLines.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setOuLine(l)}
                    className={`rounded-full px-2 py-1 text-xs font-semibold transition-colors ${
                      ouLine === l ? "bg-slate-900 text-white" : "bg-muted text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex items-stretch gap-2">
                {(["under", "over"] as const).map((s) => {
                  const selected = ouSide === s;
                  const color = s === "over" ? OVER_COLOR : UNDER_COLOR;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setOuSide(s)}
                      aria-pressed={selected}
                      style={
                        selected
                          ? { backgroundColor: color, borderColor: color }
                          : { borderLeftColor: color, borderLeftWidth: 4 }
                      }
                      className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                        selected ? "text-white" : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      <span
                        className={`block text-[0.6rem] font-bold uppercase tracking-wide ${selected ? "text-white/85" : ""}`}
                        style={selected ? undefined : { color }}
                      >
                        {s}
                      </span>
                      <span className={`block text-sm font-semibold ${selected ? "text-white" : "text-foreground"}`}>
                        {s === "over" ? `Over ${ouLine}` : `Under ${ouLine}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
                {betType === "clinch"
                  ? "If it goes the distance, it settles at the final round."
                  : "Halved rounds count for neither captain."}
              </p>
            </div>
          )}

          {/* Stake stepper + presets */}
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Stake (each side risks this)
            </div>
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
              <button
                type="button"
                onClick={() => setDirected(false)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                  !directed ? "border-slate-900 bg-slate-900 text-white" : "border-border bg-card text-foreground"
                }`}
              >
                Open offer
              </button>
              <button
                type="button"
                onClick={() => setDirected(true)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                  directed ? "border-slate-900 bg-slate-900 text-white" : "border-border bg-card text-foreground"
                }`}
              >
                Challenge a player
              </button>
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

          {/* Existing open offers on this market — take the other side */}
          {relevantOffers.length > 0 && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open offers</div>
              <ul className="space-y-1.5">
                {relevantOffers.map((b) => {
                  const isOu = b.market === "overUnder";
                  const desc = isOu
                    ? `${b.proposerSide === "over" ? "Over" : "Under"} ${b.line}`
                    : b.proposerSide === "teamA"
                      ? sideLabels.teamA
                      : sideLabels.teamB;
                  const color = isOu
                    ? b.proposerSide === "over"
                      ? OVER_COLOR
                      : UNDER_COLOR
                    : b.proposerSide === "teamA"
                      ? sideColors.teamA
                      : sideColors.teamB;
                  return (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-slate-200"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-semibold" style={{ color }}>
                          {desc}
                        </span>{" "}
                        <span className="text-muted-foreground">·</span> {bettorName(b.proposerId)}
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
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
