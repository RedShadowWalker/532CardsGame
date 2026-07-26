interface TrickWinnerBannerProps {
  winnerName: string;
  visible: boolean;
}

export function TrickWinnerBanner({ winnerName, visible }: TrickWinnerBannerProps) {
  return (
    <div
      className={[
        "absolute inset-0 z-10 flex items-center justify-center pointer-events-none transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0",
      ].join(" ")}
    >
      <div className="bg-black/70 rounded-xl px-5 py-3 text-white text-center shadow-lg">
        <p className="text-lg font-bold">{winnerName} wins the trick!</p>
      </div>
    </div>
  );
}