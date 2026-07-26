import type { CardDTO, GameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";

const SUIT_ORDER: CardDTO["suit"][] = ["Spades", "Hearts", "Clubs", "Diamonds"];
const RANK_ORDER: CardDTO["rank"][] = ["7", "8", "9", "10", "J", "Q", "K", "A"];

function sortHand(hand: CardDTO[]): CardDTO[] {
  return [...hand].sort((a, b) => {
    const suitDiff = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
  });
}

/**
 * UI-only hint mirroring the server's follow-suit rule (Rules.legalMoves).
 * This never gates what gets sent to the server — it just greys out cards
 * that are very likely illegal so players aren't guessing. The server's
 * playCard validation is what actually decides; if this hint is ever wrong
 * (e.g. a state update in flight), the server ack will simply reject the
 * play and the UI shows the error.
 */
function isLikelyLegal(card: CardDTO, hand: CardDTO[], leadSuit: CardDTO["suit"] | null): boolean {
  if (!leadSuit) return true;
  const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
  if (!hasLeadSuit) return true;
  return card.suit === leadSuit;
}

interface HandProps {
  gameState: GameStateDTO;
  isMyTurn: boolean;
  onPlay: (card: CardDTO) => void;
}

export function Hand({ gameState, isMyTurn, onPlay }: HandProps) {
  const hand = gameState.hand ?? [];
  const sorted = sortHand(hand);
  const leadSuit = gameState.currentTrick.length > 0 ? gameState.currentTrick[0].card.suit : null;
  const canPlay = isMyTurn && gameState.phase === "PLAYING";

  return (
    <div className="flex flex-wrap justify-center gap-2 px-2">
      {sorted.map((card) => {
        const legal = isLikelyLegal(card, hand, leadSuit);
        return (
          <Card
            key={`${card.suit}-${card.rank}`}
            card={card}
            size="lg"
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
