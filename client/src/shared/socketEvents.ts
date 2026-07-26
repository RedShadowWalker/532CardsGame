/**
 * socketEvents.ts
 * Wire-format contracts shared between server and client for the 5-3-2 game
 * (3 players, custom 30-card deck, trump-by-rotation, hand-debt settlement).
 * Everything here is plain, JSON-serializable data — no class instances.
 *
 * IMPORTANT (client copy only): this file is a copy of
 * server/src/shared/socketEvents.ts. If you change one, change the other.
 */

// ---- Primitive DTOs ----

export type SuitDTO = "Spades" | "Hearts" | "Diamonds" | "Clubs";
export type RankDTO = "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface CardDTO {
  suit: SuitDTO;
  rank: RankDTO;
  value: number;
}

export type GamePhaseDTO = "WAITING_TO_START" | "TRUMP_SELECTION" | "SETTLEMENT" | "PLAYING" | "ROUND_COMPLETE";

export type SettlementMethodDTO = "card" | "carryForward";

// ---- Event name constants ----

export const ClientEvents = {
  CreateRoom: "room:create",
  JoinRoom: "room:join",
  LeaveRoom: "room:leave",
  SetReady: "room:setReady",
  KickPlayer: "room:kickPlayer",
  TransferHost: "room:transferHost",
  StartGame: "game:start",
  ChooseTrump: "game:chooseTrump",
  SettleDebt: "game:settleDebt",
  RespondToSettlement: "game:respondToSettlement",
  PlayCard: "game:playCard",
  NextRound: "game:nextRound",
} as const;

export const ServerEvents = {
  RoomState: "room:state",
  Kicked: "room:kicked",
  GameState: "game:state",
  TrickResolved: "game:trickResolved",
  RoundComplete: "game:roundComplete",
  Error: "game:error",
} as const;

// ---- Lobby DTOs ----

export interface RoomPlayerDTO {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
}

export interface RoomStateDTO {
  roomCode: string;
  players: RoomPlayerDTO[];
  hostId: string;
  maxPlayers: number;
  status: "LOBBY" | "IN_GAME";
  allReady: boolean;
  canStart: boolean;
}

// ---- Request payloads (client -> server) ----

export interface CreateRoomRequest {
  playerName: string;
}

export interface JoinRoomRequest {
  roomCode: string;
  playerName: string;
  playerToken?: string;
}

export interface SetReadyRequest {
  ready: boolean;
}

export interface KickPlayerRequest {
  targetPlayerId: string;
}

export interface TransferHostRequest {
  newHostId: string;
}

export interface ChooseTrumpRequest {
  suit: SuitDTO;
}

export interface SettleDebtRequest {
  creditorId: string;
  method: SettlementMethodDTO;
}

export interface RespondToSettlementRequest {
  action: "keep" | "reject";
  /** Required when action is "keep" — the card being returned instead. */
  returnCard?: CardDTO;
}

export interface PlayCardRequest {
  card: CardDTO;
}

// ---- Ack response payloads ----

export type AckResponse<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

export interface CreateRoomAck {
  roomCode: string;
  playerId: string;
  playerToken: string;
}

export interface JoinRoomAck {
  roomCode: string;
  playerId: string;
  playerToken: string;
}

// ---- Broadcast payloads ----

export interface KickedPayload {
  message: string;
}

export interface TrickResolvedPayload {
  cards: { playerId: string; card: CardDTO }[];
  leadSuit: SuitDTO;
  winnerId: string;
}

export interface SnatchDTO {
  debtor: string;
  creditor: string;
  amount: number;
}

export interface RoundCompletePayload {
  round: number;
  dealerId: string;
  trumpPlayerId: string;
  leftPlayerId: string;
  trumpSuit: SuitDTO;
  targets: Record<string, number>;
  tricksWon: Record<string, number>;
  differences: Record<string, number>;
  snatches: SnatchDTO[];
  ledgerAfter: Record<string, Record<string, number>>;
}

export interface SettlementQueueItemDTO {
  debtor: string;
  creditor: string;
  remaining: number;
  method: SettlementMethodDTO | null;
}

export interface PendingExchangeDTO {
  debtor: string;
  creditor: string;
  card: CardDTO;
}

export interface GameStateDTO {
  phase: GamePhaseDTO;
  round: number;
  players: string[];
  trumpPlayerId: string | null;
  leftPlayerId: string | null;
  dealerId: string | null;
  targets: Record<string, number>;
  trumpSuit: SuitDTO | null;
  handSizes: Record<string, number>;
  /** Only present in the payload sent to the player whose hand this is. */
  hand?: CardDTO[];
  currentTrick: { playerId: string; card: CardDTO }[];
  tricksWon: Record<string, number>;
  ledger: Record<string, Record<string, number>>;
  roundHistory: RoundCompletePayload[];
  // Present only during Playing:
  currentTurnPlayerId?: string;
  // Present only during Settlement:
  settlementQueue?: SettlementQueueItemDTO[];
  settlementIndex?: number;
  pendingExchange?: PendingExchangeDTO | null;
}

export interface ErrorPayload {
  message: string;
}
