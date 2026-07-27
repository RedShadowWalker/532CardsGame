import { useState } from "react";
import type { CardDTO, GameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";

const SUIT_ORDER: CardDTO["suit"][] = ["Spades", "Hearts", "Clubs", "Diamonds"];
const RANK_ORDER: CardDTO["rank"][] = ["7", "8", "9", "10", "J", "Q", "K", "A"];

function groupBySuit(hand: CardDTO[]): { suit: CardDTO["suit"]; cards: CardDTO[] }[] {
  return SUIT_ORDER.map((suit) => ({
    suit,
    cards: hand
      .filter((c) => c.suit === suit)
      .sort((a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank)),
  })).filter((group) => group.cards.length > 0);
}

interface SettlementPanelProps {
  gameState: GameStateDTO;
  myPlayerId: string;
  playerNames: Record<string, string>;
  onSettleDebt: (creditorId: string, method: "card" | "carryForward") => Promise<unknown>;
  onRespondToSettlement: (action: "keep" | "reject", returnCard?: CardDTO) => Promise<unknown>;
}

export function SettlementPanel({
  gameState,
  myPlayerId,
  playerNames,
  onSettleDebt,
  onRespondToSettlement,
}: SettlementPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReturnCard, setSelectedReturnCard] = useState<CardDTO | null>(null);

  const item = gameState.settlementQueue?.[gameState.settlementIndex ?? -1];
  const exchange = gameState.pendingExchange;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setSelectedReturnCard(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ---- A card exchange is awaiting the creditor's response ----
  if (exchange) {
    const isCreditor = exchange.creditor === myPlayerId;
    if (!isCreditor) {
      return (
        <div className="bg-black/30 rounded-lg p-4 text-white w-full max-w-sm text-center">
          <p className="text-sm text-white/70">
            Settling: {playerNames[exchange.debtor] ?? exchange.debtor} → {playerNames[exchange.creditor] ?? exchange.creditor}.
            Waiting for {playerNames[exchange.creditor] ?? exchange.creditor} to respond…
          </p>
        </div>
      );
    }

    const hand = gameState.hand ?? [];
    // Cards the creditor could safely return: not the received card itself
    // (that's what "Reject" is for), and not their only card of that suit
    // (the void-suit constraint, spec section 11 Choice A).
    const candidates = hand.filter((c) => {
      if (c.suit === exchange.card.suit && c.rank === exchange.card.rank) return false;
      const sameSuitCount = hand.filter((x) => x.suit === c.suit).length;
      return sameSuitCount >= 2;
    });
    const groupedCandidates = groupBySuit(candidates);

    return (
      <div className="bg-black/30 rounded-lg p-4 text-white w-full max-w-md text-center">
        <p className="mb-2 font-semibold">
          {playerNames[exchange.debtor] ?? exchange.debtor} handed you a card to settle their debt:
        </p>
        <div className="flex justify-center mb-3">
          <Card card={exchange.card} size="md" />
        </div>
        <p className="text-xs text-white/60 mb-2">
          Keep it and return a different card, or reject it (hand it straight back).
        </p>

        <div className="flex flex-col items-center gap-2 mb-3">
          {groupedCandidates.map(({ suit, cards }) => (
            <div key={suit} className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs font-bold text-white/50 uppercase tracking-widest">{suit[0]}</span>
              <div className="flex flex-wrap justify-center gap-2">
                {cards.map((c) => {
                  const isSelected =
                    !!selectedReturnCard && selectedReturnCard.suit === c.suit && selectedReturnCard.rank === c.rank;
                  return (
                    <Card
                      key={`${c.suit}-${c.rank}`}
                      card={c}
                      size="sm"
                      selectable
                      selected={isSelected}
                      onClick={() => setSelectedReturnCard(c)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-2">
          <button
            className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-semibold"
            disabled={busy || !selectedReturnCard}
            onClick={() => selectedReturnCard && run(() => onRespondToSettlement("keep", selectedReturnCard))}
          >
            Keep & return selected
          </button>
          <button
            className="px-4 py-1.5 rounded bg-red-700/80 hover:bg-red-700 disabled:opacity-40 font-semibold"
            disabled={busy}
            onClick={() => run(() => onRespondToSettlement("reject"))}
          >
            Reject
          </button>
        </div>

        {error && <p className="mt-2 text-red-300 text-xs">{error}</p>}
      </div>
    );
  }

  // ---- Waiting for the debtor to choose a method for the current item ----
  if (!item) {
    return (
      <div className="bg-black/30 rounded-lg p-4 text-white w-full max-w-sm text-center">
        <p className="text-sm text-white/70">Settling outstanding hand debts…</p>
      </div>
    );
  }

  const isDebtor = item.debtor === myPlayerId;
  if (!isDebtor) {
    return (
      <div className="bg-black/30 rounded-lg p-4 text-white w-full max-w-sm text-center">
        <p className="text-sm text-white/70">
          {playerNames[item.debtor] ?? item.debtor} owes {playerNames[item.creditor] ?? item.creditor}{" "}
          {item.remaining} hand{item.remaining === 1 ? "" : "s"} — waiting for them to decide how to settle it.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-black/30 rounded-lg p-4 text-white w-full max-w-sm text-center">
      <p className="mb-3 font-semibold">
        You owe {playerNames[item.creditor] ?? item.creditor} {item.remaining} hand
        {item.remaining === 1 ? "" : "s"}. How do you want to settle it?
      </p>
      <div className="flex justify-center gap-2">
        <button
          className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-semibold"
          disabled={busy}
          onClick={() => run(() => onSettleDebt(item.creditor, "card"))}
        >
          Card Settlement
        </button>
        <button
          className="px-4 py-1.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 font-semibold"
          disabled={busy}
          onClick={() => run(() => onSettleDebt(item.creditor, "carryForward"))}
        >
          Carry Forward
        </button>
      </div>
      {error && <p className="mt-2 text-red-300 text-xs">{error}</p>}
    </div>
  );
}