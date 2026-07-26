/**
 * broadcast.ts
 * Translates authoritative server-side state (Room, GameEngine) into the
 * plain DTOs defined in shared/socketEvents.ts, and pushes them out over
 * Socket.IO. This is the ONLY place that shape-converts engine state for
 * the wire — socket handlers call these helpers rather than emitting raw
 * engine objects themselves, so the DTO contract stays in one place.
 */

import { Server } from "socket.io";
import { Room } from "./RoomManager";
import { Card, Rank, Suit } from "./game/Card";
import { RoundSummary, TrickRecord } from "./game/types";
import {
  CardDTO,
  GameStateDTO,
  RankDTO,
  RoomPlayerDTO,
  RoomStateDTO,
  RoundCompletePayload,
  ServerEvents,
  SuitDTO,
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

export function toRoomStateDTO(room: Room): RoomStateDTO {
  return {
    roomCode: room.code,
    hostId: room.hostId,
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
    allReady: room.players.length === room.maxPlayers && room.players.every((p) => p.connected && p.ready),
    canStart: room.players.length === room.maxPlayers,
  };
}

export function broadcastRoomState(io: Server, room: Room): void {
  io.to(room.code).emit(ServerEvents.RoomState, toRoomStateDTO(room));
}

function toGameStateDTO(room: Room, forPlayerId: string): GameStateDTO {
  if (!room.engine) {
    throw new Error("Room has no active engine.");
  }
  // `any` here because getPublicState()'s return type is a structural object,
  // not one of our named DTOs — it's already JSON-safe (Card.toJSON() shape),
  // so the fields map over directly.
  const state = room.engine.getPublicState(forPlayerId) as any;

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
    currentTrick: state.currentTrick.map((pc: any) => ({
      playerId: pc.playerId,
      card: pc.card as CardDTO,
    })),
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
  if (!room.engine) return;
  room.players.forEach((p) => {
    if (!p.socketId) return; // disconnected; they'll resync in full on rejoin
    io.to(p.socketId).emit(ServerEvents.GameState, toGameStateDTO(room, p.id));
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
  if (!room.engine) return;
  const history = room.engine.getRoundHistory();
  const last = history[history.length - 1];
  if (!last) return;
  io.to(room.code).emit(ServerEvents.RoundComplete, roundSummaryToDTO(last));
}
