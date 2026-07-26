/**
 * games.ts
 * The catalog of games this server can host. A room picks exactly one of
 * these before anyone but the host can join — the choice determines how
 * many seats the room has (RoomManager reads this, not a hardcoded number).
 */

export type GameType = "532" | "threeOfSpades";

export const MATCH_LENGTHS = [7, 10] as const;
export type MatchLength = (typeof MATCH_LENGTHS)[number];

export interface GameConfig {
  label: string;
  maxPlayers: number;
  /** Three of Spades needs the host to also pick a match length; 5-3-2 doesn't. */
  needsMatchLength: boolean;
}

export const GAME_CATALOG: Record<GameType, GameConfig> = {
  "532": { label: "5-3-2", maxPlayers: 3, needsMatchLength: false },
  threeOfSpades: { label: "Three of Spades", maxPlayers: 4, needsMatchLength: true },
};
