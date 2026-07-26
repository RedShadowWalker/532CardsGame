/**
 * broadcast.ts
 * Translates authoritative server-side state (Room, GameEngine or
 * ThreeOfSpadesEngine) into the plain DTOs defined in shared/socketEvents.ts,
 * and pushes them out over Socket.IO. This is the ONLY place that
 * shape-converts engine state for the wire — socket handlers call these
 * helpers rather than emitting raw engine objects themselves, so the DTO
 * contract stays in one place.
 */

import { Server } from "socket.io";
import { Room } from "./RoomManager";
import { GameEngine } from "./game/GameEngine";
import { Card, Rank, Suit } from "./game/Card";
import { RoundSummary, TrickRecord } from "./game/types";
import { ThreeOfSpadesEngine } from "./gameToS/ThreeOfSpadesEngine";
import { Card as TosCard, Rank as TosRank } from "./gameToS/Card";
import { RoundSummary as TosRoundSummary, TrickRecord as TosTrickRecord } from "./gameToS/types";
import {
  CardDTO,
  GameStateDTO,
  RankDTO,
  RoomPlayerDTO,
  RoomStateDTO,
  RoundCompletePayload,
  ServerEvents,
  SuitDTO,
  TosCardDTO,
  TosGameStateDTO,
  TosRankDTO,
  TosRoundCompletePayload,
  TosTrickResolvedPayload,
  TrickResolvedPayload,
} from "./shared/socketEvents";

function suitToDTO(suit: Suit): SuitDTO {
  return suit as unknown as SuitDTO;
}
function rankToDTO(rank: Rank): RankDTO {
  return rank as unknown as RankDTO;
}
function cardToDTO(card: Card): CardDTO {
  return { suit: suitToDTO(card.suit), rank: rankToDTO(card.rank), value: card.value };
}
function roundSummaryToDTO(r: RoundSummary): RoundCompletePayload {
  return {
    round: r.round,
    dealerId: r.dealerId,
    trumpPlayerId: r.trumpPlayerId,
    leftPlayerId: r.leftPlayerId,
    trumpSuit: suitToDTO(r.trumpSuit),
    targets: r.targets,
    tricksWon: r.tricksWon,
    differences: r.differences,
    snatches: r.snatches,
    ledgerAfter: r.ledgerAfter,
  };
}

// ---- Lobby (game-agnostic) ----

export function toRoomStateDTO(room: Room): RoomStateDTO {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    gameType: room.gameType,
    matchLength: room.matchLength,
    maxPlayers: room.maxPlayers,
    status: room.status,
    players: room.players.map(
      (p): RoomPlayerDTO => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        ready: p.ready,
        isHost: p.id === room.hostId,
      })
    ),
    allReady:
      !!room.maxPlayers && room.players.length === room.maxPlayers && room.players.every((p) => p.connected && p.ready),
    canStart: !!room.maxPlayers && room.players.length === room.maxPlayers,
  };
}

export function broadcastRoomState(io: Server, room: Room): void {
  io.to(room.code).emit(ServerEvents.RoomState, toRoomStateDTO(room));
}

// ---- 5-3-2 ----

function toGameStateDTO(engine: GameEngine, forPlayerId: string): GameStateDTO {
  const state = engine.getPublicState(forPlayerId) as any;
  return {
    phase: state.phase,
    round: state.round,
    players: state.players,
    trumpPlayerId: state.trumpPlayerId,
    leftPlayerId: state.leftPlayerId,
    dealerId: state.dealerId,
    targets: state.targets,
    trumpSuit: state.trumpSuit ? suitToDTO(state.trumpSuit) : null,
    handSizes: state.handSizes,
    hand: state.hand ? (state.hand as CardDTO[]) : undefined,
    currentTrick: state.currentTrick.map((pc: any) => ({ playerId: pc.playerId, card: pc.card as CardDTO })),
    tricksWon: state.tricksWon,
    ledger: state.ledger,
    roundHistory: (state.roundHistory as RoundSummary[]).map(roundSummaryToDTO),
    currentTurnPlayerId: state.currentTurnPlayerId,
    settlementQueue: state.settlementQueue,
    settlementIndex: state.settlementIndex,
    pendingExchange: state.pendingExchange,
  };
}

/**
 * Broadcasts game state to every connected player in the room. Each player
 * gets their OWN perspective (their own hand contents; everyone else's hand
 * as a count only) — this is why we emit individually per socket rather than
 * a single io.to(room).emit(...).
 */
export function broadcastGameState(io: Server, room: Room): void {
  if (!(room.engine instanceof GameEngine)) return;
  const engine = room.engine;
  room.players.forEach((p) => {
    if (!p.socketId) return; // disconnected; they'll resync in full on rejoin
    io.to(p.socketId).emit(ServerEvents.GameState, toGameStateDTO(engine, p.id));
  });
}

export function broadcastTrickResolved(io: Server, room: Room, trick: TrickRecord): void {
  const payload: TrickResolvedPayload = {
    cards: trick.cards.map((pc) => ({ playerId: pc.playerId, card: cardToDTO(pc.card) })),
    leadSuit: suitToDTO(trick.leadSuit),
    winnerId: trick.winnerId,
  };
  io.to(room.code).emit(ServerEvents.TrickResolved, payload);
}

export function broadcastRoundComplete(io: Server, room: Room): void {
  if (!(room.engine instanceof GameEngine)) return;
  const history = room.engine.getRoundHistory();
  const last = history[history.length - 1];
  if (!last) return;
  io.to(room.code).emit(ServerEvents.RoundComplete, roundSummaryToDTO(last));
}

// ---- Three of Spades ----

function tosSuitToDTO(suit: Suit): SuitDTO {
  return suit as unknown as SuitDTO;
}
function tosRankToDTO(rank: TosRank): TosRankDTO {
  return rank as unknown as TosRankDTO;
}
function tosCardToDTO(card: TosCard): TosCardDTO {
  return { suit: tosSuitToDTO(card.suit), rank: tosRankToDTO(card.rank), value: card.value };
}
function tosRoundSummaryToDTO(r: TosRoundSummary): TosRoundCompletePayload {
  return {
    round: r.round,
    dealerId: r.dealerId,
    declarerId: r.declarerId,
    partnerId: r.partnerId,
    bidAmount: r.bidAmount,
    trumpSuit: tosSuitToDTO(r.trumpSuit),
    partnerCard: { suit: tosSuitToDTO(r.partnerCard.suit), rank: tosRankToDTO(r.partnerCard.rank) },
    teamTotal: r.teamTotal,
    contractSucceeded: r.contractSucceeded,
    // scoreDelta intentionally omitted — hidden score system.
  };
}

function toTosGameStateDTO(engine: ThreeOfSpadesEngine, forPlayerId: string): TosGameStateDTO {
  const state = engine.getPublicState(forPlayerId) as any;
  return {
    phase: state.phase,
    round: state.round,
    matchLength: state.matchLength,
    players: state.players,
    dealerId: state.dealerId,
    handSizes: state.handSizes,
    hand: state.hand ? (state.hand as TosCardDTO[]) : undefined,
    declarerId: state.declarerId,
    bidAmount: state.bidAmount,
    trumpSuit: state.trumpSuit ? tosSuitToDTO(state.trumpSuit) : null,
    partnerCard: state.partnerCard
      ? { suit: tosSuitToDTO(state.partnerCard.suit), rank: tosRankToDTO(state.partnerCard.rank) }
      : null,
    partnerId: state.partnerId,
    partnerRevealed: state.partnerRevealed,
    currentTrick: state.currentTrick.map((pc: any) => ({ playerId: pc.playerId, card: pc.card as TosCardDTO })),
    capturedPoints: state.capturedPoints,
    roundHistory: (state.roundHistory as TosRoundSummary[]).map(tosRoundSummaryToDTO),
    pendingVoteStatus: state.pendingVoteStatus,
    highestBid: state.highestBid,
    activeBidders: state.activeBidders,
    currentBidderId: state.currentBidderId,
    currentTurnPlayerId: state.currentTurnPlayerId,
    finalStandings: state.finalStandings,
  };
}

export function broadcastTosGameState(io: Server, room: Room): void {
  if (!(room.engine instanceof ThreeOfSpadesEngine)) return;
  const engine = room.engine;
  room.players.forEach((p) => {
    if (!p.socketId) return;
    io.to(p.socketId).emit(ServerEvents.TosState, toTosGameStateDTO(engine, p.id));
  });
}

export function broadcastTosTrickResolved(io: Server, room: Room, trick: TosTrickRecord): void {
  const payload: TosTrickResolvedPayload = {
    cards: trick.cards.map((pc) => ({ playerId: pc.playerId, card: tosCardToDTO(pc.card) })),
    leadSuit: tosSuitToDTO(trick.leadSuit),
    winnerId: trick.winnerId,
    points: trick.points,
  };
  io.to(room.code).emit(ServerEvents.TosTrickResolved, payload);
}

export function broadcastTosRoundComplete(io: Server, room: Room): void {
  if (!(room.engine instanceof ThreeOfSpadesEngine)) return;
  const history = room.engine.getRoundHistory();
  const last = history[history.length - 1];
  if (!last) return;
  io.to(room.code).emit(ServerEvents.TosRoundComplete, tosRoundSummaryToDTO(last));
}

/** One-shot: only actually emits if a vote just concluded (see consumeLastReveal). */
export function broadcastTosLeaderboardReveal(io: Server, room: Room): void {
  if (!(room.engine instanceof ThreeOfSpadesEngine)) return;
  const reveal = room.engine.consumeLastReveal();
  if (!reveal) return;
  io.to(room.code).emit(ServerEvents.TosLeaderboardReveal, { standings: reveal.standings });
}
