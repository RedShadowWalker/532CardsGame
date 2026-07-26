/**
 * socketEvents.ts
 * Wire-format contracts shared between server and client. This server now
 * hosts two games — 5-3-2 (3 players, custom 30-card deck, trump-by-rotation,
 * hand-debt settlement) and Three of Spades (4 players, standard 52-card
 * deck, auction bidding, a hidden partner, point-capture scoring). A room
 * plays exactly one, chosen by the host before anyone else can join.
 * Everything here is plain, JSON-serializable data — no class instances.
 *
 * IMPORTANT (client copy only): this file is a copy of
 * server/src/shared/socketEvents.ts. If you change one, change the other.
 */

// ---- Game catalog ----

export type GameType = "532" | "threeOfSpades";

// ---- Primitive DTOs — 5-3-2 (30-card deck) ----

export type SuitDTO = "Spades" | "Hearts" | "Diamonds" | "Clubs";
export type RankDTO = "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface CardDTO {
  suit: SuitDTO;
  rank: RankDTO;
  value: number;
}

export type GamePhaseDTO = "WAITING_TO_START" | "TRUMP_SELECTION" | "SETTLEMENT" | "PLAYING" | "ROUND_COMPLETE";

export type SettlementMethodDTO = "card" | "carryForward";

// ---- Primitive DTOs — Three of Spades (standard 52-card deck) ----

export type TosRankDTO = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface TosCardDTO {
  suit: SuitDTO;
  rank: TosRankDTO;
  value: number;
}

export type TosGamePhaseDTO =
  | "WAITING_TO_START"
  | "AUCTION"
  | "TRUMP_AND_PARTNER_SELECTION"
  | "PLAYING"
  | "ROUND_COMPLETE"
  | "MATCH_COMPLETE";

// ---- Event name constants ----
// Distinct names per game (rather than one shared "game:*" set) so a room
// playing one game never accidentally triggers the other's handlers.

export const ClientEvents = {
  CreateRoom: "room:create",
  JoinRoom: "room:join",
  LeaveRoom: "room:leave",
  SelectGame: "room:selectGame",
  SetReady: "room:setReady",
  KickPlayer: "room:kickPlayer",
  TransferHost: "room:transferHost",
  StartGame: "game:start",

  // 5-3-2
  ChooseTrump: "game:chooseTrump",
  SettleDebt: "game:settleDebt",
  RespondToSettlement: "game:respondToSettlement",
  PlayCard: "game:playCard",
  NextRound: "game:nextRound",

  // Three of Spades
  TosPlaceBid: "tos:placeBid",
  TosPass: "tos:pass",
  TosChooseTrumpAndPartner: "tos:chooseTrumpAndPartner",
  TosPlayCard: "tos:playCard",
  TosRequestLeaderboardVote: "tos:requestLeaderboardVote",
  TosCastLeaderboardVote: "tos:castLeaderboardVote",
  TosNextRound: "tos:nextRound",
} as const;

export const ServerEvents = {
  RoomState: "room:state",
  Kicked: "room:kicked",
  Error: "game:error",

  // 5-3-2
  GameState: "game:state",
  TrickResolved: "game:trickResolved",
  RoundComplete: "game:roundComplete",

  // Three of Spades
  TosState: "tos:state",
  TosTrickResolved: "tos:trickResolved",
  TosRoundComplete: "tos:roundComplete",
  TosLeaderboardReveal: "tos:leaderboardReveal",
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
  gameType: GameType | null;
  matchLength: number | null;
  /** Null until the host has chosen a game — nobody else can join before then. */
  maxPlayers: number | null;
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

export interface SelectGameRequest {
  gameType: GameType;
  /** Required for games whose catalog entry needs one (currently Three of Spades: 7 or 10). */
  matchLength?: number;
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

// 5-3-2
export interface ChooseTrumpRequest {
  suit: SuitDTO;
}

export interface SettleDebtRequest {
  creditorId: string;
  method: SettlementMethodDTO;
}

export interface RespondToSettlementRequest {
  action: "keep" | "reject";
  returnCard?: CardDTO;
}

export interface PlayCardRequest {
  card: CardDTO;
}

// Three of Spades
export interface TosPlaceBidRequest {
  amount: number;
}

export interface TosChooseTrumpAndPartnerRequest {
  suit: SuitDTO;
  partnerCard: { suit: SuitDTO; rank: TosRankDTO };
}

export interface TosPlayCardRequest {
  card: TosCardDTO;
}

export interface TosCastLeaderboardVoteRequest {
  vote: boolean;
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

// ---- 5-3-2 broadcast/state payloads ----

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
  hand?: CardDTO[];
  currentTrick: { playerId: string; card: CardDTO }[];
  tricksWon: Record<string, number>;
  ledger: Record<string, Record<string, number>>;
  roundHistory: RoundCompletePayload[];
  currentTurnPlayerId?: string;
  settlementQueue?: SettlementQueueItemDTO[];
  settlementIndex?: number;
  pendingExchange?: PendingExchangeDTO | null;
}

// ---- Three of Spades broadcast/state payloads ----

export interface TosTrickResolvedPayload {
  cards: { playerId: string; card: TosCardDTO }[];
  leadSuit: SuitDTO;
  winnerId: string;
  points: number;
}

export interface TosRoundCompletePayload {
  round: number;
  dealerId: string;
  declarerId: string;
  partnerId: string;
  bidAmount: number;
  trumpSuit: SuitDTO;
  partnerCard: { suit: SuitDTO; rank: TosRankDTO };
  teamTotal: number;
  contractSucceeded: boolean;
  // Deliberately no scoreDelta/cumulativeScores here — see the hidden score system.
}

export interface TosLeaderboardRevealPayload {
  /** Null if the vote wasn't unanimous — the round still happened, but standings stay hidden. */
  standings: Record<string, number> | null;
}

export interface TosBidRecordDTO {
  playerId: string;
  amount: number;
}

export interface TosGameStateDTO {
  phase: TosGamePhaseDTO;
  round: number;
  matchLength: number;
  players: string[];
  dealerId: string;
  handSizes: Record<string, number>;
  hand?: TosCardDTO[];
  declarerId: string | null;
  bidAmount: number | null;
  trumpSuit: SuitDTO | null;
  partnerCard: { suit: SuitDTO; rank: TosRankDTO } | null;
  /** Null until the partner's card has actually been played. */
  partnerId: string | null;
  partnerRevealed: boolean;
  currentTrick: { playerId: string; card: TosCardDTO }[];
  capturedPoints: Record<string, number>;
  roundHistory: TosRoundCompletePayload[];
  pendingVoteStatus: Record<string, boolean> | null;
  // Present only during Auction:
  highestBid?: TosBidRecordDTO | null;
  activeBidders?: string[];
  currentBidderId?: string;
  // Present only during Playing:
  currentTurnPlayerId?: string;
  // Present only during MatchComplete:
  finalStandings?: Record<string, number>;
}

export interface ErrorPayload {
  message: string;
}
