/**
 * Scoring.ts
 * Spec section 20: Difference = TricksWon - Target, per player. Positive
 * means they exceeded their target; negative means they fell short. This
 * game has no card point values at all — it's purely trick-count vs. a
 * fixed target (5 for the Trump Player, 3 for the Left Player, 2 for the
 * Dealer) — so unlike a points-trick game, there's nothing else to compute
 * here. Snatch allocation from these differences lives in Ledger.ts, since
 * it's really part of the debt-ledger subsystem, not scoring itself.
 */

import { PlayerId } from "./types";

export function computeDifferences(
  tricksWon: Record<PlayerId, number>,
  targets: Record<PlayerId, number>
): Record<PlayerId, number> {
  const differences: Record<PlayerId, number> = {};
  for (const playerId of Object.keys(targets)) {
    differences[playerId] = (tricksWon[playerId] ?? 0) - targets[playerId];
  }
  return differences;
}
