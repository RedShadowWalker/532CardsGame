import type { TosGameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";
import { TrickWinnerBanner } from "./TrickWinnerBanner";

interface TosTableProps {
  gameState: TosGameStateDTO;
  myPlayerId: string;
  playerNames: Record<string, string>;
  overrideTrick?: { playerId: string; card: TosGameStateDTO["currentTrick"][number]["card"] }[] | null;
  announceWinnerId?: string | null;
  showWinnerBanner?: boolean;
}

// 4 seats: me (bottom), left, across, right.
const SEAT_POSITION_CLASSES = [
  "bottom-0 left-1/2 -translate-x-1/2",
  "left-0 top-1/2 -translate-y-1/2",
  "top-0 left-1/2 -translate-x-1/2",
  "right-0 top-1/2 -translate-y-1/2",
];

const SUIT_SYMBOL: Record<string, string> = { Spades: "♠", Hearts: "♥", Diamonds: "♦", Clubs: "♣" };

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
  const cardByPlayer = new Map(trickToShow.map((pc) => [pc.playerId, pc.card]));

  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute inset-6 rounded-full bg-green-900/40 border-4 border-yellow-900/30 shadow-inner" />

      {seatOrder.map((playerId, seatIdx) => {
        const isTurn = gameState.currentTurnPlayerId === playerId;
        const played = cardByPlayer.get(playerId);
        const isDeclarer = playerId === gameState.declarerId;
        const isRevealedPartner = gameState.partnerRevealed && playerId === gameState.partnerId;
        const isDealer = playerId === gameState.dealerId;

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
              {isDeclarer ? " · Declarer" : ""}
              {isRevealedPartner ? " · Partner" : ""}
              {isDealer && !isDeclarer ? " · Dealer" : ""}
            </div>
            <div className="h-20 flex items-center justify-center">
              {played ? <Card card={played} size="md" /> : <div className="w-14 h-20" />}
            </div>
          </div>
        );
      })}

      {gameState.trumpSuit && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/70 text-sm font-semibold text-center">
          <div>Trump: {SUIT_SYMBOL[gameState.trumpSuit]} {gameState.trumpSuit}</div>
          {gameState.partnerCard && (
            <div className="text-xs text-white/50 mt-0.5">
              Partner card: {gameState.partnerCard.rank}
              {SUIT_SYMBOL[gameState.partnerCard.suit]}
              {" — "}
              {gameState.partnerRevealed ? "revealed" : "identity hidden"}
            </div>
          )}
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