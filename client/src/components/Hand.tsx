import { useState } from "react";
import type { CardDTO, GameStateDTO } from "../shared/socketEvents";
import { Card } from "./Card";

const SUIT_ORDER: CardDTO["suit"][] = ["Spades", "Hearts", "Clubs", "Diamonds"];
const RANK_ORDER: CardDTO["rank"][] = ["7", "8", "9", "10", "J", "Q", "K", "A"];

/** Groups the hand into one row per suit (highest to lowest), skipping suits with no cards left. */
function groupBySuit(hand: CardDTO[]): { suit: CardDTO["suit"]; cards: CardDTO[] }[] {
  return SUIT_ORDER.map((suit) => ({
    suit,
    cards: hand
      .filter((c) => c.suit === suit)
      .sort((a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank)),
  })).filter((group) => group.cards.length > 0);
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
          {privacyHidden ? "👁️" : "🙈"}
        </button>
      </div>

      {/* One row per suit; cards wrap so every card stays fully visible. */}
      <div className="w-full bg-black/15 rounded-xl p-2 flex flex-col gap-2">
        {groups.map(({ suit, cards }) => (
          <div key={suit} className="flex flex-wrap items-center justify-center gap-2 py-1 px-1">
            {cards.map((card) => {
              const legal = isLikelyLegal(card, hand, leadSuit);
              const shadowed = !canPlay || !legal;
              return (
                <div
                  key={`${card.suit}-${card.rank}`}
                  className="flex-shrink-0"
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