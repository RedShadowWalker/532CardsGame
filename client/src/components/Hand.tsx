import { useState } from "react";
import type { CardDTO, GameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";

const SUIT_ORDER: CardDTO["suit"][] = ["Spades", "Hearts", "Clubs", "Diamonds"];
const RANK_ORDER: CardDTO["rank"][] = ["7", "8", "9", "10", "J", "Q", "K", "A"];

function sortHand(hand: CardDTO[]): CardDTO[] {
  return [...hand].sort((a, b) => {
    const suitDiff = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank); // high to low within suit
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
  const [privacyHidden, setPrivacyHidden] = useState(false);
  const hand = gameState.hand ?? [];
  const sorted = sortHand(hand);
  const leadSuit = gameState.currentTrick.length > 0 ? gameState.currentTrick[0].card.suit : null;
  const canPlay = isMyTurn && gameState.phase === "PLAYING";

  return (
    <div className="w-full flex flex-col items-center gap-1.5">
      <button
        className="text-xs text-white/50 hover:text-white/80 underline"
        onClick={() => setPrivacyHidden((v) => !v)}
      >
        {privacyHidden ? "👁 Show my cards" : "🙈 Hide my cards from view"}
      </button>

      {/* Horizontal scroll strip, not wrap — keeps this row's height fixed
          regardless of how many cards remain, so the table above it never
          reflows as the hand shrinks over the course of a round. */}
      <div className="w-full overflow-x-auto">
        <div className="flex justify-center gap-1.5 px-2 py-2 min-w-min mx-auto w-fit">
          {sorted.map((card) => {
            const legal = isLikelyLegal(card, hand, leadSuit);
            // Shadowed whenever it isn't actually your turn to act — a
            // constant visual cue you're waiting, not just for illegal cards.
            const shadowed = !canPlay || !legal;
            return (
              <div key={`${card.suit}-${card.rank}`} className="flex-shrink-0">
                {privacyHidden ? (
                  <Card card={card} size="lg" faceDown />
                ) : (
                  <Card
                    card={card}
                    size="lg"
                    selectable={canPlay}
                    dimmed={shadowed}
                    onClick={() => canPlay && onPlay(card)}
                  />
                )}
              </div>
            );
          })}
          {sorted.length === 0 && <p className="text-white/60 italic px-2">No cards left this round.</p>}
        </div>
      </div>
    </div>
  );
}