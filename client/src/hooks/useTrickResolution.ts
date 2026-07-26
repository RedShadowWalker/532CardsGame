import { useEffect, useRef, useState } from "react";

interface TrickLike {
  cards: { playerId: string; card: unknown }[];
  winnerId: string;
}

const HOLD_MS = 3000; // how long the completed trick's 4th card stays visible
const ANNOUNCE_MS = 1600; // how long the "X wins the trick" banner shows after that

export type TrickResolutionPhase = "idle" | "holding" | "announcing";

/**
 * Fixes a real bug: the server emits `trickResolved` with the completed
 * trick, then immediately emits `gameState` with `currentTrick` already
 * reset to empty for the next trick. Reading `gameState.currentTrick`
 * directly means the last card played in a trick is never actually shown —
 * it resolves instantly. This hook holds onto the just-completed trick
 * (from the `trickResolved` broadcast) for a few seconds before reverting
 * display to the live, ongoing trick.
 */
export function useTrickResolution<T extends TrickLike>(lastTrick: T | null) {
  const [phase, setPhase] = useState<TrickResolutionPhase>("idle");
  const [activeTrick, setActiveTrick] = useState<T | null>(null);
  const seenRef = useRef<T | null>(null);

  useEffect(() => {
    if (lastTrick && lastTrick !== seenRef.current) {
      seenRef.current = lastTrick;
      setActiveTrick(lastTrick);
      setPhase("holding");

      const t1 = setTimeout(() => setPhase("announcing"), HOLD_MS);
      const t2 = setTimeout(() => {
        setPhase("idle");
        setActiveTrick(null);
      }, HOLD_MS + ANNOUNCE_MS);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [lastTrick]);

  return { phase, activeTrick };
}