import type { SuitDTO } from "../shared/socketEvents";

// Nicer, slightly bolder suit glyphs than the plain Unicode default weight.
const SUIT_SYMBOL: Record<SuitDTO, string> = {
  Hearts: "♥",
  Diamonds: "♦",
  Clubs: "♣",
  Spades: "♠",
};

const RED_SUITS: SuitDTO[] = ["Hearts", "Diamonds"];

/** Loose shape covering both games' card DTOs (5-3-2's 7-A ranks, ToS's full 2-A). */
export interface AnyCard {
  suit: SuitDTO;
  rank: string;
  value: number;
}

interface CardProps {
  card: AnyCard;
  size?: "sm" | "md" | "lg";
  faceDown?: boolean;
  selectable?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
}

// Card box size, rank text size, and suit-glyph text size configured
// separately so the suit pip can be noticeably larger than the rank —
// closer to how a real card reads at a glance.
const SIZE_CLASSES: Record<NonNullable<CardProps["size"]>, string> = {
  sm: "w-10 h-14",
  md: "w-16 h-20",
  lg: "w-24 h-32",
};
const RANK_TEXT_CLASSES: Record<NonNullable<CardProps["size"]>, string> = {
  sm: "text-xs",
  md: "text-base",
  lg: "text-xl",
};
const SUIT_TEXT_CLASSES: Record<NonNullable<CardProps["size"]>, string> = {
  sm: "text-lg",
  md: "text-3xl",
  lg: "text-4xl",
};

export function Card({ card, size = "md", faceDown = false, selectable = false, dimmed = false, onClick }: CardProps) {
  const isRed = RED_SUITS.includes(card.suit);

  if (faceDown) {
    return (
      <div
        className={`${SIZE_CLASSES[size]} rounded-md border-2 border-white/40 bg-gradient-to-br from-blue-800 to-blue-950 shadow-md`}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onClick}
      className={[
        SIZE_CLASSES[size],
        "rounded-md bg-white shadow-md border border-slate-300 flex flex-col items-center justify-center font-bold select-none transition-transform gap-0.5",
        isRed ? "text-red-600" : "text-slate-900",
        selectable ? "cursor-pointer hover:-translate-y-2 hover:shadow-lg" : "cursor-default",
        dimmed ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      <span className={RANK_TEXT_CLASSES[size]}>{card.rank}</span>
      <span className={`leading-none drop-shadow-sm ${SUIT_TEXT_CLASSES[size]}`}>{SUIT_SYMBOL[card.suit]}</span>
    </button>
  );
}