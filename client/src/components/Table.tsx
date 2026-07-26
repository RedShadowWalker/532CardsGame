import type { GameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";
import { TrickWinnerBanner } from "./TrickWinnerBanner";

interface TableProps {
  gameState: GameStateDTO;
  myPlayerId: string;
  playerNames: Record<string, string>;
  /** When set, overrides the live currentTrick display (used to hold a just-completed hand on screen). */
  overrideTrick?: { playerId: string; card: GameStateDTO["currentTrick"][number]["card"] }[] | null;
  /** Player id to announce as the hand winner, shown as a fading banner. */
  announceWinnerId?: string | null;
  showWinnerBanner?: boolean;
}

// Exactly 3 seats: me (bottom), left, right — matching a 3-sided,
// triangular table, not a 4-sided one.
const SEAT_POSITION_CLASSES = [
  "bottom-0 left-1/2 -translate-x-1/2", // me
  "top-1/4 left-0 -translate-x-1/4", // left
  "top-1/4 right-0 translate-x-1/4", // right
];

export function Table({
  gameState,
  myPlayerId,
  playerNames,
  overrideTrick,
  announceWinnerId,
  showWinnerBanner,
}: TableProps) {
  const myIndex = gameState.players.indexOf(myPlayerId);
  const seatOrder =
    myIndex === -1
      ? gameState.players
      : [...gameState.players.slice(myIndex), ...gameState.players.slice(0, myIndex)];

  const trickToShow = overrideTrick ?? gameState.currentTrick;
  const cardByPlayer = new Map(trickToShow.map((pc) => [pc.playerId, pc.card]));

  return (
<div className="relative mx-auto w-[min(90vw,380px)] h-[min(90vw,380px)] flex-shrink-0">      {/* Brown triangular table — 3-player game, 3-sided table. */}
      <div
        className="absolute inset-4 bg-amber-900/70 border-4 border-amber-950/60 shadow-inner"
        style={{ clipPath: "polygon(50% 6%, 6% 94%, 94% 94%)" }}
      />

      {seatOrder.map((playerId, seatIdx) => {
        const isTurn = gameState.currentTurnPlayerId === playerId;
        const played = cardByPlayer.get(playerId);
        const role =
          playerId === gameState.trumpPlayerId
            ? "Hukum"
            : playerId === gameState.leftPlayerId
              ? "Left"
              : null;

        return (
          <div key={playerId} className={`absolute ${SEAT_POSITION_CLASSES[seatIdx]} flex flex-col items-center gap-1`}>
            <div
              className={[
                "px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap",
                isTurn ? "bg-yellow-400 text-black" : "bg-black/40 text-white",
              ].join(" ")}
            >
              {playerNames[playerId] ?? "Player"}
              {playerId === myPlayerId ? " (you)" : ""}
              {role ? ` · ${role}` : ""}
            </div>
            <div className="h-20 flex items-center justify-center">
              {played ? <Card card={played} size="md" /> : <div className="w-14 h-20" />}
            </div>
          </div>
        );
      })}

      {gameState.trumpSuit && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/70 text-sm font-semibold">
          Hukum: {gameState.trumpSuit}
        </div>
      )}

      {announceWinnerId && (
        <TrickWinnerBanner
          winnerName={playerNames[announceWinnerId] ?? "Someone"}
          visible={!!showWinnerBanner}
        />
      )}
    </div>
  );
}