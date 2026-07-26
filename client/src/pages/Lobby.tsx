import { useState } from "react";
import type { GameType, RoomStateDTO } from "../shared/socketEvents";

const GAME_LABELS: Record<GameType, string> = {
  "532": "5-3-2",
  threeOfSpades: "Three of Spades",
};

interface LobbyProps {
  roomState: RoomStateDTO;
  myPlayerId: string;
  onSetReady: (ready: boolean) => Promise<unknown>;
  onStartGame: () => Promise<unknown>;
  onKickPlayer: (targetPlayerId: string) => Promise<unknown>;
  onTransferHost: (newHostId: string) => Promise<unknown>;
  onLeaveRoom: () => void;
}

export function Lobby({
  roomState,
  myPlayerId,
  onSetReady,
  onStartGame,
  onKickPlayer,
  onTransferHost,
  onLeaveRoom,
}: LobbyProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const me = roomState.players.find((p) => p.id === myPlayerId);
  const isHost = me?.isHost ?? false;
  const maxPlayers = roomState.maxPlayers ?? 0;
  const seatsLeft = maxPlayers - roomState.players.length;

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

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10 text-white">
      <h1 className="text-2xl font-bold mb-1">Room {roomState.roomCode}</h1>
      {roomState.gameType && (
        <p className="text-emerald-300 text-sm mb-1 font-medium">
          {GAME_LABELS[roomState.gameType]}
          {roomState.matchLength ? ` · ${roomState.matchLength} rounds` : ""}
        </p>
      )}
      <p className="text-white/60 mb-6 text-sm">
        Share this code with your friends — they enter it on the "Join with a room code" screen.
      </p>

      <div className="bg-black/30 rounded-xl p-6 w-full max-w-sm">
        <ul className="space-y-2 mb-4">
          {roomState.players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between bg-white/5 rounded-md px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${p.connected ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className="font-medium">
                  {p.name}
                  {p.id === myPlayerId ? " (you)" : ""}
                </span>
                {p.isHost && <span className="text-xs bg-yellow-500/80 text-black px-1.5 py-0.5 rounded">HOST</span>}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    p.ready ? "bg-emerald-600" : "bg-white/10 text-white/60"
                  }`}
                >
                  {p.ready ? "Ready" : "Not ready"}
                </span>
                {isHost && p.id !== myPlayerId && (
                  <>
                    <button
                      className="text-xs text-white/50 hover:text-white disabled:opacity-30"
                      disabled={busy}
                      title="Make host"
                      onClick={() => run(() => onTransferHost(p.id))}
                    >
                      👑
                    </button>
                    <button
                      className="text-xs text-red-300 hover:text-red-200 disabled:opacity-30"
                      disabled={busy}
                      title="Remove player"
                      onClick={() => run(() => onKickPlayer(p.id))}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
          {Array.from({ length: seatsLeft }).map((_, i) => (
            <li key={`empty-${i}`} className="px-3 py-2 text-white/30 italic text-sm border border-dashed border-white/10 rounded-md">
              Waiting for a player to join…
            </li>
          ))}
        </ul>

        <button
          className={[
            "w-full py-2 rounded-md font-semibold disabled:opacity-40",
            me?.ready ? "bg-white/10 hover:bg-white/20" : "bg-emerald-600 hover:bg-emerald-500",
          ].join(" ")}
          disabled={busy}
          onClick={() => run(() => onSetReady(!me?.ready))}
        >
          {me?.ready ? "Cancel ready" : "I'm ready"}
        </button>

        <p className="text-xs text-white/50 text-center mt-2">
          {roomState.allReady
            ? "Everyone's ready — starting…"
            : `Game starts automatically once all ${maxPlayers} players are ready.`}
        </p>

        {isHost && (
          <button
            className="w-full mt-2 py-2 rounded-md bg-white/10 hover:bg-white/20 font-semibold disabled:opacity-40"
            disabled={busy || !roomState.canStart}
            onClick={() => run(onStartGame)}
          >
            Start now (host override)
          </button>
        )}

        {error && <p className="mt-3 text-red-300 text-sm">{error}</p>}

        <button className="w-full mt-4 text-sm text-white/40 hover:text-white/70" onClick={onLeaveRoom}>
          Leave room
        </button>
      </div>
    </div>
  );
}
