/**
 * gameToSSocket.ts
 * Handles in-game actions for Three of Spades. Same authoritative pattern
 * as the 5-3-2 socket layer: validate through the engine, ack, broadcast
 * only on success. See gameSocket.ts for the fuller explanation of that
 * pattern — not repeated here.
 */

import { Server, Socket } from "socket.io";
import { RoomManager, Room, RoomPlayer } from "../RoomManager";
import { ThreeOfSpadesEngine } from "../gameToS/ThreeOfSpadesEngine";
import { Card, Rank, Suit } from "../gameToS/Card";
import { GamePhase } from "../gameToS/types";
import {
  broadcastTosGameState,
  broadcastTosLeaderboardReveal,
  broadcastTosRoundComplete,
  broadcastTosTrickResolved,
} from "../broadcast";
import {
  AckResponse,
  ClientEvents,
  TosCastLeaderboardVoteRequest,
  TosChooseTrumpAndPartnerRequest,
  TosPlaceBidRequest,
  TosPlayCardRequest,
} from "../shared/socketEvents";

export function registerToSGameHandlers(io: Server, socket: Socket, rooms: RoomManager): void {
  function requireRoomAndEngine(): { room: Room; player: RoomPlayer; engine: ThreeOfSpadesEngine } {
    const found = rooms.findBySocket(socket.id);
    if (!found) throw new Error("You are not seated in a room.");
    if (!found.room.engine) throw new Error("The game hasn't started yet.");
    if (!(found.room.engine instanceof ThreeOfSpadesEngine)) {
      throw new Error("This room isn't playing Three of Spades.");
    }
    return { room: found.room, player: found.player, engine: found.room.engine };
  }

  socket.on(ClientEvents.TosPlaceBid, (req: TosPlaceBidRequest, ack: (res: AckResponse) => void) => {
    try {
      const { room, player, engine } = requireRoomAndEngine();
      engine.placeBid(player.id, req.amount);
      ack({ ok: true });
      broadcastTosGameState(io, room);
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });

  socket.on(ClientEvents.TosPass, (_req: unknown, ack: (res: AckResponse) => void) => {
    try {
      const { room, player, engine } = requireRoomAndEngine();
      engine.pass(player.id);
      ack({ ok: true });
      broadcastTosGameState(io, room);
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });

  socket.on(
    ClientEvents.TosChooseTrumpAndPartner,
    (req: TosChooseTrumpAndPartnerRequest, ack: (res: AckResponse) => void) => {
      try {
        const { room, player, engine } = requireRoomAndEngine();
        engine.chooseTrumpAndPartner(player.id, req.suit as unknown as Suit, {
          suit: req.partnerCard.suit as unknown as Suit,
          rank: req.partnerCard.rank as unknown as Rank,
        });
        ack({ ok: true });
        broadcastTosGameState(io, room);
      } catch (err) {
        ack({ ok: false, error: (err as Error).message });
      }
    }
  );

  socket.on(ClientEvents.TosPlayCard, (req: TosPlayCardRequest, ack: (res: AckResponse) => void) => {
    try {
      const { room, player, engine } = requireRoomAndEngine();
      const card = new Card(req.card.suit as unknown as Suit, req.card.rank as unknown as Rank);

      const trick = engine.playCard(player.id, card);
      ack({ ok: true });

      if (trick) {
        broadcastTosTrickResolved(io, room, trick);
      }
      broadcastTosGameState(io, room);
      if (engine.getPhase() === GamePhase.RoundComplete || engine.getPhase() === GamePhase.MatchComplete) {
        broadcastTosRoundComplete(io, room);
      }
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });

  socket.on(ClientEvents.TosRequestLeaderboardVote, (_req: unknown, ack: (res: AckResponse) => void) => {
    try {
      const { room, engine } = requireRoomAndEngine();
      engine.requestLeaderboardVote();
      ack({ ok: true });
      broadcastTosGameState(io, room);
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });

  socket.on(
    ClientEvents.TosCastLeaderboardVote,
    (req: TosCastLeaderboardVoteRequest, ack: (res: AckResponse) => void) => {
      try {
        const { room, player, engine } = requireRoomAndEngine();
        engine.castLeaderboardVote(player.id, req.vote);
        ack({ ok: true });
        broadcastTosGameState(io, room);
        broadcastTosLeaderboardReveal(io, room); // one-shot; no-ops if the vote isn't complete yet
      } catch (err) {
        ack({ ok: false, error: (err as Error).message });
      }
    }
  );

  socket.on(ClientEvents.TosNextRound, (_req: unknown, ack: (res: AckResponse) => void) => {
    try {
      const { room, engine } = requireRoomAndEngine();
      if (engine.getPhase() !== GamePhase.RoundComplete) {
        throw new Error("Can only start the next round after the current one has completed.");
      }
      engine.startRound();
      ack({ ok: true });
      broadcastTosGameState(io, room);
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });
}
