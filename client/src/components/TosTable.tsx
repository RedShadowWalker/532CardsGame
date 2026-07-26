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

// 4 seats: me (bottom), left, across, right — matching a 4-sided, square table.
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
    <div className="relative mx-auto aspect-square w-full max-w-md min-w-[280px] min-h-[280px] flex-shrink-0">
      {/* Brown square table — 4-player game, 4-sided table. */}
      <div className="absolute inset-6 rounded-2xl bg-amber-900/70 border-4 border-amber-950/60 shadow-inner" />

      {seatOrder.map((playerId, seatIdx) => {
        const isTurn = gameState.currentTurnPlayerId === playerId;
        const played = cardByPlayer.get(playerId);
        const isDeclarer = playerId === gameState.declarerId;
        const isRevealedPartner = gameState.partnerRevealed && playerId === gameState.partnerId;
        // Once the partner is revealed, give the declarer and their partner
        // a shared, distinctive color so the two-person team is obvious at
        // a glance, separate from whose turn it currently is.
        const isTeamPlayer = isDeclarer || isRevealedPartner;

        return (
          <div key={playerId} className={`absolute ${SEAT_POSITION_CLASSES[seatIdx]} flex flex-col items-center gap-1`}>
            <div
              className={[
                "px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap border-2",
                isTurn
                  ? "bg-yellow-400 text-black border-yellow-400"
                  : isTeamPlayer
                    ? "bg-amber-600/80 text-white border-amber-300"
                    : "bg-black/40 text-white border-transparent",
              ].join(" ")}
            >
              {playerNames[playerId] ?? "Player"}
              {playerId === myPlayerId ? " (you)" : ""}
              {isDeclarer ? " · Declarer" : ""}
              {isRevealedPartner ? " · Partner" : ""}
            </div>
            <div
              className={[
                "h-20 flex items-center justify-center rounded-lg",
                isTeamPlayer ? "ring-2 ring-amber-400/70" : "",
              ].join(" ")}
            >
              {played ? <Card card={played} size="md" /> : <div className="w-14 h-20" />}
            </div>
          </div>
        );
      })}

      {gameState.trumpSuit && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/70 text-sm font-semibold text-center">
          <div>Hukum: {SUIT_SYMBOL[gameState.trumpSuit]} {gameState.trumpSuit}</div>
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