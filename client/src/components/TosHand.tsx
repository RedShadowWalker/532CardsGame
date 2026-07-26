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
    <div className="flex justify-center">
      <div className="flex flex-wrap justify-center divide-x divide-white/15 bg-black/10 rounded-lg px-1 py-2">
        {sorted.map((card) => {
          const legal = isLikelyLegal(card, hand, leadSuit);
          return (
            <div key={`${card.suit}-${card.rank}`} className="px-1 first:pl-2 last:pr-2">
              <Card
                card={card}
                size="md"
                selectable={canPlay}
                dimmed={canPlay && !legal}
                onClick={() => canPlay && onPlay(card)}
              />
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-white/60 italic px-2">No cards left this round.</p>}
      </div>
    </div>
  );
}