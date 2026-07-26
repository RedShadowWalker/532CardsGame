import type { GameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";
import { TrickWinnerBanner } from "./TrickWinnerBanner";

interface TableProps {
  gameState: GameStateDTO;
  myPlayerId: string;
  playerNames: Record<string, string>;
  /** When set, overrides the live currentTrick display (used to hold a just-completed trick on screen). */
  overrideTrick?: { playerId: string; card: GameStateDTO["currentTrick"][number]["card"] }[] | null;
  /** Player id to announce as the trick winner, shown as a fading banner. */
  announceWinnerId?: string | null;
  showWinnerBanner?: boolean;
}

// Exactly 3 seats: me (bottom), left, right — no "across" position needed
// since this is always a 3-player table, not 4.
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
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute inset-6 rounded-full bg-green-900/40 border-4 border-yellow-900/30 shadow-inner" />

      {seatOrder.map((playerId, seatIdx) => {
        const isTurn = gameState.currentTurnPlayerId === playerId;
        const played = cardByPlayer.get(playerId);
        const role =
          playerId === gameState.trumpPlayerId
            ? "Trump"
            : playerId === gameState.dealerId
              ? "Dealer"
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
          Trump: {gameState.trumpSuit}
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