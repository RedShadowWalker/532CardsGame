/**
 * lobbySocket.ts
 * Handles pre-game concerns: creating a room, joining by code (including
 * reconnection via a stored player token), and leaving.
 */

import { Server, Socket } from "socket.io";
import { RoomManager, RoomError } from "../RoomManager";
import { broadcastGameState, broadcastRoomState, broadcastTosGameState } from "../broadcast";
import {
  AckResponse,
  ClientEvents,
  CreateRoomAck,
  CreateRoomRequest,
  JoinRoomAck,
  JoinRoomRequest,
  KickPlayerRequest,
  SelectGameRequest,
  ServerEvents,
  SetReadyRequest,
  TransferHostRequest,
} from "../shared/socketEvents";

export function registerLobbyHandlers(io: Server, socket: Socket, rooms: RoomManager): void {
  socket.on(
    ClientEvents.CreateRoom,
    (req: CreateRoomRequest, ack: (res: AckResponse<CreateRoomAck>) => void) => {
      try {
        const name = (req?.playerName ?? "").trim();
        if (!name) throw new RoomError("Player name is required.");

        const { room, player } = rooms.createRoom(name);
        rooms.attachSocket(room.code, player.id, socket.id);
        socket.join(room.code);

        ack({ ok: true, roomCode: room.code, playerId: player.id, playerToken: player.token });
        broadcastRoomState(io, room);
      } catch (err) {
        ack({ ok: false, error: (err as Error).message });
      }
    }
  );

  socket.on(
    ClientEvents.SelectGame,
    (req: SelectGameRequest, ack: (res: AckResponse) => void) => {
      try {
        const found = rooms.findBySocket(socket.id);
        if (!found) throw new RoomError("You are not seated in a room.");
        const room = rooms.selectGame(
          found.room.code,
          found.player.id,
          req?.gameType,
          req?.matchLength as any
        );
        ack({ ok: true });
        broadcastRoomState(io, room);
      } catch (err) {
        ack({ ok: false, error: (err as Error).message });
      }
    }
  );

  socket.on(
    ClientEvents.JoinRoom,
    (req: JoinRoomRequest, ack: (res: AckResponse<JoinRoomAck>) => void) => {
      try {
        const roomCode = (req?.roomCode ?? "").trim().toUpperCase();
        const name = (req?.playerName ?? "").trim();
        if (!roomCode) throw new RoomError("Room code is required.");

        const { room, player } = rooms.joinRoom(roomCode, name, req?.playerToken);
        rooms.attachSocket(room.code, player.id, socket.id);
        socket.join(room.code);

        ack({ ok: true, roomCode: room.code, playerId: player.id, playerToken: player.token });
        broadcastRoomState(io, room);

        // Rejoining mid-game: immediately resync this player's own game state
        // (their hand, current turn, scores, etc.) rather than making them
        // wait for the next state-changing action from someone else.
        if (room.status === "IN_GAME") {
          if (room.gameType === "threeOfSpades") {
            broadcastTosGameState(io, room);
          } else {
            broadcastGameState(io, room);
          }
        }
      } catch (err) {
        ack({ ok: false, error: (err as Error).message });
      }
    }
  );

  socket.on(ClientEvents.LeaveRoom, () => {
    const found = rooms.findBySocket(socket.id);
    if (!found) return;
    socket.leave(found.room.code);
    rooms.handleDisconnect(socket.id);
    broadcastRoomState(io, found.room);
    rooms.removeIfEmpty(found.room.code);
  });

  socket.on(ClientEvents.StartGame, (_req: unknown, ack: (res: AckResponse) => void) => {
    try {
      const found = rooms.findBySocket(socket.id);
      if (!found) throw new RoomError("You are not seated in a room.");
      const room = rooms.startGame(found.room.code, found.player.id);
      ack({ ok: true });
      if (room.gameType === "threeOfSpades") {
        broadcastTosGameState(io, room);
      } else {
        broadcastGameState(io, room);
      }
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });

  socket.on(ClientEvents.SetReady, (req: SetReadyRequest, ack: (res: AckResponse) => void) => {
    try {
      const found = rooms.findBySocket(socket.id);
      if (!found) throw new RoomError("You are not seated in a room.");

      const { room, autoStarted } = rooms.setReady(found.room.code, found.player.id, !!req?.ready);
      ack({ ok: true });
      broadcastRoomState(io, room);
      // Room is full of ready, connected players — the game just started
      // with no host action required. Push everyone their first game state.
      if (autoStarted) {
        if (room.gameType === "threeOfSpades") {
          broadcastTosGameState(io, room);
        } else {
          broadcastGameState(io, room);
        }
      }
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });

  socket.on(ClientEvents.KickPlayer, (req: KickPlayerRequest, ack: (res: AckResponse) => void) => {
    try {
      const found = rooms.findBySocket(socket.id);
      if (!found) throw new RoomError("You are not seated in a room.");

      const { room, kicked } = rooms.kickPlayer(found.room.code, found.player.id, req?.targetPlayerId);
      ack({ ok: true });

      // Tell the kicked player directly, then remove them from the room's
      // broadcast channel so they stop receiving this room's updates.
      if (kicked.socketId) {
        const kickedSocket = io.sockets.sockets.get(kicked.socketId);
        kickedSocket?.emit(ServerEvents.Kicked, { message: "The host removed you from the room." });
        kickedSocket?.leave(room.code);
      }
      broadcastRoomState(io, room);
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });

  socket.on(ClientEvents.TransferHost, (req: TransferHostRequest, ack: (res: AckResponse) => void) => {
    try {
      const found = rooms.findBySocket(socket.id);
      if (!found) throw new RoomError("You are not seated in a room.");

      const room = rooms.transferHost(found.room.code, found.player.id, req?.newHostId);
      ack({ ok: true });
      broadcastRoomState(io, room);
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });
}
