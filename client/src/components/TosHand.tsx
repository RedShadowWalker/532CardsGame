import type { TosCardDTO, TosGameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";

const SUIT_ORDER: TosCardDTO["suit"][] = ["Spades", "Hearts", "Clubs", "Diamonds"];
const RANK_ORDER: TosCardDTO["rank"][] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function sortHand(hand: TosCardDTO[]): TosCardDTO[] {
  return [...hand].sort((a, b) => {
    const suitDiff = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
  });
}

/** UI-only follow-suit hint — server remains authoritative on the actual play. */
function isLikelyLegal(card: TosCardDTO, hand: TosCardDTO[], leadSuit: TosCardDTO["suit"] | null): boolean {
  if (!leadSuit) return true;
  const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
  if (!hasLeadSuit) return true;
  return card.suit === leadSuit;
}

interface TosHandProps {
  gameState: TosGameStateDTO;
  isMyTurn: boolean;
  onPlay: (card: TosCardDTO) => void;
}

export function TosHand({ gameState, isMyTurn, onPlay }: TosHandProps) {
  const hand = gameState.hand ?? [];
  const sorted = sortHand(hand);
  const leadSuit = gameState.currentTrick.length > 0 ? gameState.currentTrick[0].card.suit : null;
  const canPlay = isMyTurn && gameState.phase === "PLAYING";

  return (
    <div className="flex flex-wrap justify-center gap-1.5 px-2">
      {sorted.map((card) => {
        const legal = isLikelyLegal(card, hand, leadSuit);
        return (
          <Card
            key={`${card.suit}-${card.rank}`}
            card={card}
            size="md"
            selectable={canPlay}
            dimmed={canPlay && !legal}
            onClick={() => canPlay && onPlay(card)}
          />
        );
      })}
      {sorted.length === 0 && <p className="text-white/60 italic">No cards left this round.</p>}
    </div>
  );
}
