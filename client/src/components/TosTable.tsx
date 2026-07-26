import type { TosGameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";
import { PlayerAvatar } from "./PlayerAvatar";
import { TrickWinnerBanner } from "./TrickWinnerBanner";

interface TosTableProps {
  gameState: TosGameStateDTO;
  myPlayerId: string;
  playerNames: Record<string, string>;
  overrideTrick?: { playerId: string; card: TosGameStateDTO["currentTrick"][number]["card"] }[] | null;
  announceWinnerId?: string | null;
  showWinnerBanner?: boolean;
}

const SUIT_SYMBOL: Record<string, string> = { Spades: "♠", Hearts: "♥", Diamonds: "♦", Clubs: "♣" };

// 4 seats: me (bottom), left, across, right — a 4-sided table.
const SEAT_POSITION_CLASSES = [
  "bottom-1 left-1/2 -translate-x-1/2",
  "left-1 top-1/2 -translate-y-1/2",
  "top-1 left-1/2 -translate-x-1/2",
  "right-1 top-1/2 -translate-y-1/2",
];

export function TosTable({
  gameState,
  myPlayerId,
  playerNames,
  overrideTrick,
  announceWinnerId,
  showWinnerBanner,
}: TosTableProps) {
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
          {gameState.partnerCard && (
            <span className="text-white/50 text-[10px] ml-1">
              Partner: {gameState.partnerCard.rank}
              {SUIT_SYMBOL[gameState.partnerCard.suit]} {gameState.partnerRevealed ? "(revealed)" : "(hidden)"}
            </span>
          )}
        </div>
      )}

      <div className="relative w-[min(88vw,360px)] h-[min(88vw,360px)] flex-shrink-0 rounded-2xl bg-black/10 shadow-[inset_0_0_60px_rgba(0,0,0,0.5)]">
        {seatOrder.map((playerId, seatIdx) => {
          const isTurn = gameState.currentTurnPlayerId === playerId;
          const isMe = playerId === myPlayerId;
          const isDeclarer = playerId === gameState.declarerId;
          const isRevealedPartner = gameState.partnerRevealed && playerId === gameState.partnerId;
          const isTeamPlayer = isDeclarer || isRevealedPartner;
          const name = playerNames[playerId] ?? "Player";

          return (
            <div key={playerId} className={`absolute ${SEAT_POSITION_CLASSES[seatIdx]} flex flex-col items-center gap-1 w-24`}>
              <div className={`rounded-full ${isTurn ? (isMe ? "pulse-turn" : "pulse-thinking") : ""}`}>
                <PlayerAvatar playerId={playerId} name={name} size="md" />
              </div>
              <div
                className={[
                  "rounded-lg px-2 py-1 text-center w-full",
                  isTeamPlayer ? "bg-amber-600/70 ring-1 ring-amber-300" : "bg-black/50",
                ].join(" ")}
              >
                <p className="text-xs font-semibold text-white truncate">
                  {name}
                  {isMe ? " (you)" : ""}
                </p>
                <p className="text-[10px] text-white/70">
                  {isDeclarer ? "Declarer" : isRevealedPartner ? "Partner" : ""}
                </p>
                {isTurn && (
                  <p className={`text-[10px] font-bold ${isMe ? "text-green-300" : "text-amber-300"}`}>
                    {isMe ? "YOUR TURN" : "Thinking…"}
                  </p>
                )}
              </div>
            </div>
          );
        })}

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