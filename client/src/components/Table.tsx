import type { GameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";
import { PlayerAvatar } from "./PlayerAvatar";
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

const SUIT_SYMBOL: Record<string, string> = { Spades: "♠", Hearts: "♥", Diamonds: "♦", Clubs: "♣" };

// Exactly 3 seats: me (bottom), left, right — a 3-sided table.
const SEAT_POSITION_CLASSES = [
  "bottom-1 left-1/2 -translate-x-1/2", // me
  "top-6 left-2", // left
  "top-6 right-2", // right
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

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {gameState.trumpSuit && (
        <div className="flex items-center gap-2 bg-black/40 rounded-full px-4 py-1.5 shadow-md">
          <span
            className={`text-2xl leading-none ${
              gameState.trumpSuit === "Hearts" || gameState.trumpSuit === "Diamonds" ? "text-red-500" : "text-white"
            }`}
          >
            {SUIT_SYMBOL[gameState.trumpSuit]}
          </span>
          <span className="text-white/70 text-xs font-bold uppercase tracking-widest">Hukum</span>
        </div>
      )}

      <div className="relative w-[min(88vw,360px)] h-[min(88vw,360px)] flex-shrink-0 rounded-full bg-black/10 shadow-[inset_0_0_60px_rgba(0,0,0,0.5)]">
        {seatOrder.map((playerId, seatIdx) => {
          const isTurn = gameState.currentTurnPlayerId === playerId;
          const isMe = playerId === myPlayerId;
          const role =
            playerId === gameState.trumpPlayerId ? "Hukum" : playerId === gameState.leftPlayerId ? "Left" : null;
          const name = playerNames[playerId] ?? "Player";

          return (
            <div key={playerId} className={`absolute ${SEAT_POSITION_CLASSES[seatIdx]} flex flex-col items-center gap-1 w-24`}>
              <div className={`rounded-full ${isTurn ? (isMe ? "pulse-turn" : "pulse-thinking") : ""}`}>
                <PlayerAvatar playerId={playerId} name={name} size="md" />
              </div>
              <div className="bg-black/50 rounded-lg px-2 py-1 text-center w-full">
                <p className="text-xs font-semibold text-white truncate">
                  {name}
                  {isMe ? " (you)" : ""}
                </p>
                <p className="text-[10px] text-white/60">
                  Won {gameState.tricksWon[playerId] ?? 0}
                  {role ? ` · ${role}` : ""}
                </p>
                {isTurn && (
                  <p className={`text-[10px] font-bold ${isMe ? "text-green-400" : "text-amber-400"}`}>
                    {isMe ? "YOUR TURN" : "Thinking…"}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {/* Played cards, center of the table. */}
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          {trickToShow.map((pc) => (
            <div key={pc.playerId} className="animate-pop-in">
              <Card card={pc.card} size="sm" />
            </div>
          ))}
        </div>

        {announceWinnerId && (
          <TrickWinnerBanner winnerName={playerNames[announceWinnerId] ?? "Someone"} visible={!!showWinnerBanner} />
        )}
      </div>
    </div>
  );
}