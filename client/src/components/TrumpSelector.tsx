import { useState } from "react";
import type { SuitDTO } from "../shared/socketEvents";

const SUITS: { suit: SuitDTO; symbol: string; red: boolean }[] = [
  { suit: "Spades", symbol: "♠", red: false },
  { suit: "Hearts", symbol: "♥", red: true },
  { suit: "Clubs", symbol: "♣", red: false },
  { suit: "Diamonds", symbol: "♦", red: true },
];

interface TrumpSelectorProps {
  onChoose: (suit: SuitDTO) => Promise<unknown>;
}

export function TrumpSelector({ onChoose }: TrumpSelectorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(suit: SuitDTO) {
    setBusy(true);
    setError(null);
    try {
      await onChoose(suit);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="bg-black/30 rounded-lg p-4 text-white w-full max-w-sm text-center">
      <p className="font-semibold mb-3">You're the Trump Player this round — choose trump</p>
      <div className="flex justify-center gap-3">
        {SUITS.map(({ suit, symbol, red }) => (
          <button
            key={suit}
            disabled={busy}
            onClick={() => choose(suit)}
            className={[
              "w-16 h-16 rounded-lg bg-white shadow-md flex items-center justify-center text-3xl font-bold",
              "hover:scale-105 transition-transform disabled:opacity-40",
              red ? "text-red-600" : "text-slate-900",
            ].join(" ")}
          >
            {symbol}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-red-300 text-xs">{error}</p>}
    </div>
  );
}
