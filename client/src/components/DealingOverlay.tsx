import { useEffect, useRef, useState } from "react";
import type { GameStateDTO } from "../shared/socketEvents";

interface DealingOverlayProps {
  gameState: GameStateDTO;
}

/**
 * Purely cosmetic — no server round-trip involved. Watches for the round
 * number to change and plays a brief shuffle-then-deal animation over the
 * table before fading out on its own. If a player joins mid-animation or
 * the round number hasn't actually changed, nothing renders.
 */
export function DealingOverlay({ gameState }: DealingOverlayProps) {
  const previousRound = useRef<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "shuffling" | "dealing" | "fading">("idle");

  useEffect(() => {
    if (previousRound.current !== null && previousRound.current !== gameState.round) {
      setPhase("shuffling");
      const t1 = setTimeout(() => setPhase("dealing"), 500);
      const t2 = setTimeout(() => setPhase("fading"), 1300);
      const t3 = setTimeout(() => setPhase("idle"), 1700);
      previousRound.current = gameState.round;
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
    previousRound.current = gameState.round;
  }, [gameState.round]);

  if (phase === "idle") return null;

  const dealtCardPositions = [
    { x: "-90px", y: "60px" }, // toward "me"
    { x: "-70px", y: "-40px" }, // toward left seat
    { x: "70px", y: "-40px" }, // toward right seat
  ];

  return (
    <div
      className={[
        "pointer-events-none absolute inset-0 z-20 flex items-center justify-center",
        phase === "fading" ? "opacity-0 transition-opacity duration-300" : "opacity-100",
      ].join(" ")}
    >
      <div className="relative w-24 h-32">
        {Array.from({ length: 6 }).map((_, i) => {
          const isDealing = phase === "dealing" || phase === "fading";
          const target = isDealing ? dealtCardPositions[i % dealtCardPositions.length] : { x: "0px", y: "0px" };
          const shuffleOffset = phase === "shuffling" ? (i % 2 === 0 ? "4px" : "-4px") : "0px";

          return (
            <div
              key={i}
              className="absolute inset-0 w-24 h-32 rounded-lg border-2 border-white/40 bg-gradient-to-br from-blue-800 to-blue-950 shadow-lg transition-all ease-out"
              style={{
                transform: isDealing
                  ? `translate(${target.x}, ${target.y}) rotate(${(i - 3) * 8}deg)`
                  : `translateX(${shuffleOffset})`,
                transitionDuration: isDealing ? "700ms" : "150ms",
                transitionDelay: isDealing ? `${i * 60}ms` : "0ms",
                zIndex: 6 - i,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
