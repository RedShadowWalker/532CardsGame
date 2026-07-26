import { useState } from "react";
import type { TosGameStateDTO } from "../shared/socketEvents";

const MIN_OPENING_BID = 130;
const MAX_BID = 270;
const MIN_RAISE = 5;

interface TosBiddingPanelProps {
  gameState: TosGameStateDTO;
  myPlayerId: string;
  playerNames: Record<string, string>;
  onBid: (amount: number) => Promise<unknown>;
  onPass: () => Promise<unknown>;
}

export function TosBiddingPanel({ gameState, myPlayerId, playerNames, onBid, onPass }: TosBiddingPanelProps) {
  const isMyTurn = gameState.currentBidderId === myPlayerId;
  const floor = gameState.highestBid ? gameState.highestBid.amount + MIN_RAISE : MIN_OPENING_BID;
  const [amount, setAmount] = useState(floor);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveAmount = Math.max(floor, Math.min(amount, MAX_BID));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const stillIn = gameState.activeBidders ?? [];

  return (
    <div className="bg-black/30 rounded-lg p-4 text-white w-full max-w-sm text-center">
      <p className="text-sm text-white/70">
        {gameState.highestBid
          ? `Highest bid: ${gameState.highestBid.amount} by ${playerNames[gameState.highestBid.playerId] ?? "?"}`
          : "No bids yet"}
      </p>
      <p className="text-xs text-white/50 mt-1">
        Still bidding: {stillIn.map((id) => playerNames[id] ?? id).join(", ")}
      </p>
      <p className="mt-2 font-semibold">
        {isMyTurn ? "Your turn to bid" : `Waiting on ${playerNames[gameState.currentBidderId ?? ""] ?? "..."}`}
      </p>

      {isMyTurn && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <button
              className="w-8 h-8 rounded bg-white/20 hover:bg-white/30 disabled:opacity-30"
              disabled={busy || effectiveAmount <= floor}
              onClick={() => setAmount((a) => Math.max(floor, a - MIN_RAISE))}
            >
              −
            </button>
            <span className="text-xl font-bold w-14 text-center">{effectiveAmount}</span>
            <button
              className="w-8 h-8 rounded bg-white/20 hover:bg-white/30 disabled:opacity-30"
              disabled={busy || effectiveAmount >= MAX_BID}
              onClick={() => setAmount((a) => Math.min(MAX_BID, a + MIN_RAISE))}
            >
              +
            </button>
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-semibold"
              disabled={busy}
              onClick={() => run(() => onBid(effectiveAmount))}
            >
              Bid {effectiveAmount}
            </button>
            <button
              className="px-4 py-1.5 rounded bg-red-700/80 hover:bg-red-700 disabled:opacity-40 font-semibold"
              disabled={busy}
              onClick={() => run(onPass)}
            >
              Pass
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-red-300 text-xs">{error}</p>}
    </div>
  );
}
