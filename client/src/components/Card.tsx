import type { SuitDTO } from "../shared/socketEvents";

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
  /** Can be clicked/played right now. */
  selectable?: boolean;
  /** Greyed to ~40% — not a legal play right now (or just not your turn). */
  dimmed?: boolean;
  /** Actively chosen in a pick-then-confirm flow (settlement return card, partner card) — blue glow + raised. */
  selected?: boolean;
  onClick?: () => void;
}

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

export function Card({
  card,
  size = "md",
  faceDown = false,
  selectable = false,
  dimmed = false,
  selected = false,
  onClick,
}: CardProps) {
  const isRed = RED_SUITS.includes(card.suit);

  if (faceDown) {
    return (
      <div
        className={`${SIZE_CLASSES[size]} rounded-xl border-2 border-white/40 bg-gradient-to-br from-blue-800 to-blue-950 shadow-md`}
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
        "rounded-xl bg-gradient-to-b from-white to-slate-50 shadow-md flex flex-col items-center justify-center font-bold select-none transition-all duration-150 gap-0.5",
        isRed ? "text-red-600" : "text-slate-900",
        selected
          ? "ring-4 ring-blue-500 -translate-y-5 shadow-2xl z-30 relative"
          : selectable
            ? "ring-2 ring-white border border-white/60 hover:-translate-y-3 hover:shadow-xl hover:z-20 relative cursor-pointer"
            : "border border-slate-300 cursor-default",
        dimmed ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      <span className={RANK_TEXT_CLASSES[size]}>{card.rank}</span>
      <span className={`leading-none drop-shadow-sm ${SUIT_TEXT_CLASSES[size]}`}>{SUIT_SYMBOL[card.suit]}</span>
    </button>
  );
}