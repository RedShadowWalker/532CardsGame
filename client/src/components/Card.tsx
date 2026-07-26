import type { CardDTO, SuitDTO } from "../shared/socketEvents";

const SUIT_SYMBOL: Record<SuitDTO, string> = {
  Hearts: "♥",
  Diamonds: "♦",
  Clubs: "♣",
  Spades: "♠",
};

const RED_SUITS: SuitDTO[] = ["Hearts", "Diamonds"];

interface CardProps {
  card: CardDTO;
  size?: "sm" | "md" | "lg";
  faceDown?: boolean;
  selectable?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
}

const SIZE_CLASSES: Record<NonNullable<CardProps["size"]>, string> = {
  sm: "w-9 h-13 text-xs",
  md: "w-14 h-20 text-base",
  lg: "w-20 h-28 text-2xl",
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
        "rounded-md bg-white shadow-md border border-slate-300 flex flex-col items-center justify-center font-bold select-none transition-transform",
        isRed ? "text-red-600" : "text-slate-900",
        selectable ? "cursor-pointer hover:-translate-y-2 hover:shadow-lg" : "cursor-default",
        dimmed ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      <span>{card.rank}</span>
      <span className="leading-none">{SUIT_SYMBOL[card.suit]}</span>
    </button>
  );
}
