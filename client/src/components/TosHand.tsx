import { useState } from "react";
import type { TosCardDTO, TosGameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";

const SUIT_ORDER: TosCardDTO["suit"][] = ["Spades", "Hearts", "Clubs", "Diamonds"];
const RANK_ORDER: TosCardDTO["rank"][] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/** Groups the hand into one row per suit (highest to lowest), skipping suits with no cards left. */
function groupBySuit(hand: TosCardDTO[]): { suit: TosCardDTO["suit"]; cards: TosCardDTO[] }[] {
  return SUIT_ORDER.map((suit) => ({
    suit,
    cards: hand
      .filter((c) => c.suit === suit)
      .sort((a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank)),
  })).filter((group) => group.cards.length > 0);
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
  const groups = groupBySuit(hand);
  const leadSuit = gameState.currentTrick.length > 0 ? gameState.currentTrick[0].card.suit : null;
  const canPlay = isMyTurn && gameState.phase === "PLAYING";

  return (
    <div className="w-full max-w-md flex flex-col gap-1">
      <div className="flex justify-end pr-1">
        <button
          aria-label={privacyHidden ? "Show my cards" : "Hide my cards"}
          onClick={() => setPrivacyHidden((v) => !v)}
          className="text-xl leading-none w-9 h-9 rounded-full bg-black/30 hover:bg-black/40 flex items-center justify-center"
        >
          {privacyHidden ? "🙈" : "👁️"}
        </button>
      </div>

      {/* One row per suit — scroll VERTICALLY between suits (swipe up/down).
          Within a row, cards overlap slightly like a real fanned hand. */}
      <div className="w-full max-h-[230px] overflow-y-auto overflow-x-hidden bg-black/15 rounded-xl p-2 flex flex-col gap-2">
        {groups.map(({ suit, cards }) => (
          <div key={suit} className="flex items-center overflow-x-auto py-1 px-1">
            {cards.map((card, i) => {
              const legal = isLikelyLegal(card, hand, leadSuit);
              const shadowed = !canPlay || !legal;
              return (
                <div
                  key={`${card.suit}-${card.rank}`}
                  className="flex-shrink-0"
                  style={{ marginLeft: i === 0 ? 0 : "-0.9rem" }}
                >
                  {privacyHidden ? (
                    <Card card={card} size="sm" faceDown />
                  ) : (
                    <Card
                      card={card}
                      size="sm"
                      selectable={canPlay}
                      dimmed={shadowed}
                      onClick={() => canPlay && onPlay(card)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && <p className="text-white/60 italic px-2 py-4 text-center">No cards left this round.</p>}
      </div>
    </div>
  );
}