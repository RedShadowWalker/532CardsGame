/**
 * gameSocket.ts
 * Handles in-game actions for the 5-3-2 game. Every handler follows the same
 * authoritative pattern:
 *   1. Resolve which room/player/engine this socket belongs to.
 *   2. Attempt the mutation on GameEngine — it throws on any illegal move
 *      (wrong turn, wrong phase, doesn't follow suit, wrong settlement
 *      relationship, etc).
 *   3. On success: ack the caller and broadcast the new state to the room.
 *   4. On failure: ack the caller with the error message and broadcast
 *      NOTHING — state hasn't changed, so no one else needs to hear about it.
 */

import { Server, Socket } from "socket.io";
import { RoomManager, Room, RoomPlayer } from "../RoomManager";
import { GameEngine } from "../game/GameEngine";
import { Card, Rank, Suit } from "../game/Card";
import { GamePhase } from "../game/types";
import { broadcastGameState, broadcastRoundComplete, broadcastTrickResolved } from "../broadcast";
import {
  AckResponse,
  ChooseTrumpRequest,
  ClientEvents,
  PlayCardRequest,
  RespondToSettlementRequest,
  SettleDebtRequest,
} from "../shared/socketEvents";

export function registerGameHandlers(io: Server, socket: Socket, rooms: RoomManager): void {
  function requireRoomAndEngine(): { room: Room; player: RoomPlayer; engine: GameEngine } {
    const found = rooms.findBySocket(socket.id);
    if (!found) throw new Error("You are not seated in a room.");
    if (!found.room.engine) throw new Error("The game hasn't started yet.");
    if (!(found.room.engine instanceof GameEngine)) {
      throw new Error("This room isn't playing 5-3-2.");
    }
    return { room: found.room, player: found.player, engine: found.room.engine };
  }

  socket.on(ClientEvents.ChooseTrump, (req: ChooseTrumpRequest, ack: (res: AckResponse) => void) => {
    try {
      const { room, player, engine } = requireRoomAndEngine();
      engine.chooseTrump(player.id, req.suit as unknown as Suit);
      ack({ ok: true });
      broadcastGameState(io, room);
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });

  socket.on(ClientEvents.SettleDebt, (req: SettleDebtRequest, ack: (res: AckResponse) => void) => {
    try {
      const { room, player, engine } = requireRoomAndEngine();
      engine.settleDebt(player.id, req.creditorId, req.method);
      ack({ ok: true });
      broadcastGameState(io, room);
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });

  socket.on(
    ClientEvents.RespondToSettlement,
    (req: RespondToSettlementRequest, ack: (res: AckResponse) => void) => {
      try {
        const { room, player, engine } = requireRoomAndEngine();
        const returnCard = req.returnCard
          ? { suit: req.returnCard.suit as unknown as Suit, rank: req.returnCard.rank as unknown as Rank }
          : undefined;
        engine.respondToSettlement(player.id, req.action, returnCard);
        ack({ ok: true });
        broadcastGameState(io, room);
      } catch (err) {
        ack({ ok: false, error: (err as Error).message });
      }
    }
  );

  socket.on(ClientEvents.PlayCard, (req: PlayCardRequest, ack: (res: AckResponse) => void) => {
    try {
      const { room, player, engine } = requireRoomAndEngine();
      const card = new Card(req.card.suit as unknown as Suit, req.card.rank as unknown as Rank);

      const trick = engine.playCard(player.id, card);
      ack({ ok: true });

      if (trick) {
        broadcastTrickResolved(io, room, trick);
      }
      broadcastGameState(io, room);
      if (engine.getPhase() === GamePhase.RoundComplete) {
        broadcastRoundComplete(io, room);
      }
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });

  /**
   * Advances from a completed round into the next one (rotates trump,
   * reshuffles, deals 5-3-2 again). Not restricted to any one player — any
   * seated player can move things along once everyone's seen the round
   * summary.
   */
  socket.on(ClientEvents.NextRound, (_req: unknown, ack: (res: AckResponse) => void) => {
    try {
      const { room, engine } = requireRoomAndEngine();
      if (engine.getPhase() !== GamePhase.RoundComplete) {
        throw new Error("Can only start the next round after the current one has completed.");
      }
      engine.startRound();
      ack({ ok: true });
      broadcastGameState(io, room);
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });
}
