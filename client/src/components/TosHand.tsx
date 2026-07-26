import { useState } from "react";
import type { TosCardDTO, TosGameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";

const SUIT_ORDER: TosCardDTO["suit"][] = ["Spades", "Hearts", "Clubs", "Diamonds"];
const RANK_ORDER: TosCardDTO["rank"][] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function sortHand(hand: TosCardDTO[]): TosCardDTO[] {
  return [...hand].sort((a, b) => {
    const suitDiff = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank); // high to low within suit
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
          regardless of how many cards remain (13 down to 0 over a round),
          so the table above it never reflows. */}
      <div className="w-full overflow-x-auto">
        <div className="flex justify-center gap-1 px-2 py-2 min-w-min mx-auto w-fit">
          {sorted.map((card) => {
            const legal = isLikelyLegal(card, hand, leadSuit);
            const shadowed = !canPlay || !legal;
            return (
              <div key={`${card.suit}-${card.rank}`} className="flex-shrink-0">
                {privacyHidden ? (
                  <Card card={card} size="md" faceDown />
                ) : (
                  <Card
                    card={card}
                    size="md"
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