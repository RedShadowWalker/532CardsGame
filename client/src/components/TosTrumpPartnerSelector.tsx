import { useState } from "react";
import type { SuitDTO, TosCardDTO, TosRankDTO } from "../shared/socketEvents";
import { Card } from "./Card";

const SUITS: { suit: SuitDTO; symbol: string; red: boolean }[] = [
  { suit: "Spades", symbol: "♠", red: false },
  { suit: "Hearts", symbol: "♥", red: true },
  { suit: "Clubs", symbol: "♣", red: false },
  { suit: "Diamonds", symbol: "♦", red: true },
];

const SUIT_ORDER: SuitDTO[] = ["Spades", "Hearts", "Clubs", "Diamonds"];
const RANK_ORDER: TosRankDTO[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/**  ok thike Every card in the deck, high to low within each suit, as candidate partner-card choices. */
function allCandidateCards(): TosCardDTO[] {
  const cards: TosCardDTO[] = [];
  for (const suit of SUIT_ORDER) {
    for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
      cards.push({ suit, rank: RANK_ORDER[i], value: i });
    }
  }
  return cards;
}

interface TosTrumpPartnerSelectorProps {
  bidAmount: number | null;
  /** The declarer's own hand — excluded from the partner-card choices below, since you can't call your own card. */
  myHand: TosCardDTO[];
  onChoose: (suit: SuitDTO, partnerCard: { suit: SuitDTO; rank: TosRankDTO }) => Promise<unknown>;
}

export function TosTrumpPartnerSelector({ bidAmount, myHand, onChoose }: TosTrumpPartnerSelectorProps) {
  const [suit, setSuit] = useState<SuitDTO | null>(null);
  const [partnerCard, setPartnerCard] = useState<TosCardDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = suit && partnerCard;

  // Only cards NOT in your own hand can be called as the partner card —
  // otherwise you could name a card you already hold, which is nonsensical.
  const myHandIds = new Set(myHand.map((c) => `${c.suit}-${c.rank}`));
  const candidates = allCandidateCards().filter((c) => !myHandIds.has(`${c.suit}-${c.rank}`));

  async function confirm() {
    if (!suit || !partnerCard) return;
    setBusy(true);
    setError(null);
    try {
      await onChoose(suit, { suit: partnerCard.suit, rank: partnerCard.rank });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="bg-black/30 rounded-lg p-4 text-white w-full max-w-lg text-center">
      <p className="font-semibold mb-3">You won the bid at {bidAmount} — declare Hukum and a partner card</p>

      <p className="text-xs text-white/60 mb-1">Hukum suit</p>
      <div className="flex justify-center gap-2 mb-4">
        {SUITS.map(({ suit: s, symbol, red }) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => setSuit(s)}
            className={[
              "w-12 h-12 rounded-lg shadow-md flex items-center justify-center text-2xl font-bold transition-transform",
              suit === s ? "ring-2 ring-emerald-400 scale-105" : "",
              "bg-white",
              red ? "text-red-600" : "text-slate-900",
            ].join(" ")}
          >
            {symbol}
          </button>
        ))}
      </div>

      <p className="text-xs text-white/60 mb-2">
        Partner card — whoever holds this becomes your hidden teammate (nobody, including you, will know who until
        it's played). Your own cards aren't shown here since you can't call a card you already hold.
      </p>
      <div className="max-h-56 overflow-y-auto bg-black/20 rounded-lg p-2 mb-4">
        <div className="flex flex-wrap justify-center gap-1">
          {candidates.map((c) => {
            const isSelected = partnerCard?.suit === c.suit && partnerCard?.rank === c.rank;
            return (
              <Card
                key={`${c.suit}-${c.rank}`}
                card={c}
                size="sm"
                selectable={!busy}
                selected={isSelected}
                onClick={() => setPartnerCard(c)}
              />
            );
          })}
        </div>
      </div>

      <button
        className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-semibold"
        disabled={!canConfirm || busy}
        onClick={confirm}
      >
        Confirm
      </button>

      {error && <p className="mt-2 text-red-300 text-xs">{error}</p>}
    </div>
  );
}