import { useState } from "react";
import type { SuitDTO, TosRankDTO } from "../shared/socketEvents";

const SUITS: { suit: SuitDTO; symbol: string; red: boolean }[] = [
  { suit: "Spades", symbol: "♠", red: false },
  { suit: "Hearts", symbol: "♥", red: true },
  { suit: "Clubs", symbol: "♣", red: false },
  { suit: "Diamonds", symbol: "♦", red: true },
];

const RANKS: TosRankDTO[] = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];

interface TosTrumpPartnerSelectorProps {
  bidAmount: number | null;
  onChoose: (suit: SuitDTO, partnerCard: { suit: SuitDTO; rank: TosRankDTO }) => Promise<unknown>;
}

export function TosTrumpPartnerSelector({ bidAmount, onChoose }: TosTrumpPartnerSelectorProps) {
  const [suit, setSuit] = useState<SuitDTO | null>(null);
  const [partnerSuit, setPartnerSuit] = useState<SuitDTO | null>(null);
  const [partnerRank, setPartnerRank] = useState<TosRankDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = suit && partnerSuit && partnerRank;

  async function confirm() {
    if (!suit || !partnerSuit || !partnerRank) return;
    setBusy(true);
    setError(null);
    try {
      await onChoose(suit, { suit: partnerSuit, rank: partnerRank });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="bg-black/30 rounded-lg p-4 text-white w-full max-w-md text-center">
      <p className="font-semibold mb-3">You won the bid at {bidAmount} — choose trump and a partner card</p>

      <p className="text-xs text-white/60 mb-1">Trump suit</p>
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

      <p className="text-xs text-white/60 mb-1">
        Partner card — whoever holds this becomes your hidden teammate (nobody, including you, will know who until
        it's played)
      </p>
      <div className="flex justify-center gap-2 mb-2">
        {SUITS.map(({ suit: s, symbol, red }) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => setPartnerSuit(s)}
            className={[
              "w-10 h-10 rounded-md shadow flex items-center justify-center text-lg font-bold",
              partnerSuit === s ? "ring-2 ring-emerald-400" : "",
              "bg-white",
              red ? "text-red-600" : "text-slate-900",
            ].join(" ")}
          >
            {symbol}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-1 mb-4">
        {RANKS.map((r) => (
          <button
            key={r}
            disabled={busy}
            onClick={() => setPartnerRank(r)}
            className={[
              "w-9 h-9 rounded-md text-sm font-semibold",
              partnerRank === r ? "bg-emerald-600" : "bg-white/10 hover:bg-white/20",
            ].join(" ")}
          >
            {r}
          </button>
        ))}
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
