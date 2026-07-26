/**
 * Seating.ts
 * Pure helpers for the game's circular 3-player seating (spec sections 3-6).
 *
 * `seatOrder` is a fixed array of the 3 player ids for the lifetime of a
 * game (their join order). "Right" and "left" are always relative to
 * whoever is being asked about, per spec section 3 — never a fixed screen
 * position. Verified against the spec's own example: seatOrder [A,B,C],
 * A is Trump Player => rightOf(A) = B (dealer), leftOf(A) = C.
 */

import { PlayerId } from "./types";

/** The next player going around the table (clockwise) from `playerId`. */
export function rightOf(seatOrder: PlayerId[], playerId: PlayerId): PlayerId {
  const idx = seatOrder.indexOf(playerId);
  if (idx === -1) throw new Error(`${playerId} is not in this seat order.`);
  return seatOrder[(idx + 1) % seatOrder.length];
}

/** The previous player going around the table (counter-clockwise) from `playerId`. */
export function leftOf(seatOrder: PlayerId[], playerId: PlayerId): PlayerId {
  const idx = seatOrder.indexOf(playerId);
  if (idx === -1) throw new Error(`${playerId} is not in this seat order.`);
  return seatOrder[(idx - 1 + seatOrder.length) % seatOrder.length];
}

/**
 * The Trump Player for a given round number (1-indexed), per spec section 4:
 * the privilege rotates to the next seat every round, wrapping around.
 * Round 1 => seatOrder[0], round 2 => seatOrder[1], round 3 => seatOrder[2],
 * round 4 => seatOrder[0] again.
 */
export function trumpPlayerForRound(seatOrder: PlayerId[], round: number): PlayerId {
  const idx = (round - 1) % seatOrder.length;
  return seatOrder[idx];
}

export interface RoundRoles {
  trumpPlayerId: PlayerId;
  leftPlayerId: PlayerId;
  dealerId: PlayerId; // == rightOf(trumpPlayerId), per spec section 5
  targets: Record<PlayerId, number>; // per spec section 6: 5 / 3 / 2
}

/** Derives all per-round roles and trick targets from the trump player. */
export function deriveRoundRoles(seatOrder: PlayerId[], trumpPlayerId: PlayerId): RoundRoles {
  const leftPlayerId = leftOf(seatOrder, trumpPlayerId);
  const dealerId = rightOf(seatOrder, trumpPlayerId); // dealer == right player, spec section 5

  return {
    trumpPlayerId,
    leftPlayerId,
    dealerId,
    targets: {
      [trumpPlayerId]: 5,
      [leftPlayerId]: 3,
      [dealerId]: 2,
    },
  };
}
