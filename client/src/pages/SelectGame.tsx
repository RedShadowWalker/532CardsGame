import { useState } from "react";
import type { GameType } from "../shared/socketEvents";

interface SelectGameProps {
  roomCode: string;
  onSelectGame: (gameType: GameType, matchLength?: number) => Promise<unknown>;
  onLeaveRoom: () => void;
}

const GAME_OPTIONS: {
  gameType: GameType;
  label: string;
  players: number;
  description: string;
  needsMatchLength: boolean;
}[] = [
  {
    gameType: "532",
    label: "5-3-2",
    players: 3,
    description: "Trump rotates every round, a hand-debt ledger settles between rounds.",
    needsMatchLength: false,
  },
  {
    gameType: "threeOfSpades",
    label: "Three of Spades",
    players: 4,
    description: "Auction bidding, a hidden partner, point-capture scoring.",
    needsMatchLength: true,
  },
];

const MATCH_LENGTHS = [7, 10];

export function SelectGame({ roomCode, onSelectGame, onLeaveRoom }: SelectGameProps) {
  const [selected, setSelected] = useState<GameType | null>(null);
  const [matchLength, setMatchLength] = useState<number>(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const option = GAME_OPTIONS.find((o) => o.gameType === selected);

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await onSelectGame(selected, option?.needsMatchLength ? matchLength : undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 text-white">
      <div className="mb-1 flex items-center gap-3">
        <button
          type="button"
          onClick={copyRoomCode}
          className="group relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-black/30 shadow-md transition-transform hover:-translate-y-0.5 hover:border-white/30"
          aria-label="Copy room code"
          title="Copy room code"
        >
          <div className="absolute left-2 top-2 h-5 w-4 -rotate-12 rounded-md border border-white/50 bg-white/95" />
          <div className="absolute left-4 top-3 h-5 w-4 rotate-3 rounded-md border border-white/70 bg-white/90" />
          <div className="absolute left-6 top-4 h-5 w-4 rotate-12 rounded-md border border-amber-200 bg-amber-100" />
          <span className="sr-only">Copy room code</span>
        </button>
        <div className="text-left">
          <h1 className="text-2xl font-black tracking-wider uppercase leading-none">Room {roomCode}</h1>
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/45 mt-1">Tap the cards to copy</p>
        </div>
      </div>
      {copied && <p className="mb-4 text-xs text-emerald-300">Room code copied.</p>}
      <p className="text-white/60 mb-6 text-sm text-center max-w-sm">
        Choose a game before sharing your room code — the number of seats depends on which one you pick.
      </p>

      <div className="w-full max-w-md space-y-3">
        {GAME_OPTIONS.map((o) => (
          <button
            key={o.gameType}
            onClick={() => setSelected(o.gameType)}
            className={[
              "w-full text-left rounded-xl p-4 border transition-colors",
              selected === o.gameType
                ? "bg-emerald-600/20 border-emerald-400"
                : "bg-black/30 border-white/10 hover:border-white/30",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">{o.label}</span>
              <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{o.players} players</span>
            </div>
            <p className="text-white/60 text-sm mt-1">{o.description}</p>
          </button>
        ))}

        {option?.needsMatchLength && (
          <div className="bg-black/30 rounded-xl p-4">
            <p className="text-sm text-white/70 mb-2">How many rounds?</p>
            <div className="flex gap-2">
              {MATCH_LENGTHS.map((len) => (
                <button
                  key={len}
                  onClick={() => setMatchLength(len)}
                  className={[
                    "flex-1 py-2 rounded-md font-semibold",
                    matchLength === len ? "bg-emerald-600" : "bg-white/10 hover:bg-white/20",
                  ].join(" ")}
                >
                  {len} rounds
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          className="w-full py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 font-semibold disabled:opacity-40"
          disabled={!selected || busy}
          onClick={confirm}
        >
          Confirm and open room for joining
        </button>

        {error && <p className="text-red-300 text-sm text-center">{error}</p>}

        <button className="w-full text-sm text-white/40 hover:text-white/70" onClick={onLeaveRoom}>
          Leave room
        </button>
      </div>
    </div>
  );
}
