/**
 * RoomManager.ts
 * Owns rooms (lobby + in-progress games) independently of Socket.IO itself,
 * so it can be unit tested without spinning up a real server/socket.
 *
 * Each room holds at most one GameEngine instance. It's created either when
 * the host explicitly starts the game (startGame) or automatically the
 * instant every seated player is connected and ready (setReady) — whichever
 * comes first. Host-only controls (kickPlayer, transferHost) are also
 * enforced here, not in the socket layer, so they're covered by the same
 * unit tests as everything else. The server (sockets/*.ts) is the only
 * thing that ever calls mutating methods here — clients never touch this
 * class directly.
 */

import { v4 as uuidv4 } from "uuid";
import { GameEngine } from "./game/GameEngine";
import { PlayerId } from "./game/types";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easier to read aloud
const ROOM_CODE_LENGTH = 6;

export interface RoomPlayer {
  id: PlayerId;
  name: string;
  token: string;
  socketId: string | null;
  connected: boolean;
  ready: boolean;
}

export interface Room {
  code: string;
  hostId: PlayerId;
  maxPlayers: number;
  players: RoomPlayer[];
  status: "LOBBY" | "IN_GAME";
  engine: GameEngine | null;
  createdAt: number;
  /** Updated whenever a player disconnects; used by sweepIdleRooms(). */
  lastActivityAt: number;
}

export class RoomError extends Error {}

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** Reverse index for O(1) disconnect handling. */
  private socketIndex = new Map<string, { roomCode: string; playerId: PlayerId }>();

  constructor(private readonly maxPlayers = 3) {}

  private generateRoomCode(): string {
    let code: string;
    do {
      code = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostName: string): { room: Room; player: RoomPlayer } {
    const code = this.generateRoomCode();
    const player: RoomPlayer = {
      id: uuidv4(),
      name: hostName,
      token: uuidv4(),
      socketId: null,
      connected: false,
      ready: false,
    };
    const room: Room = {
      code,
      hostId: player.id,
      maxPlayers: this.maxPlayers,
      players: [player],
      status: "LOBBY",
      engine: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    this.rooms.set(code, room);
    return { room, player };
  }

  /**
   * Joins a room. If `token` matches an existing seat in the room, this is
   * treated as a reconnection (name/socket refreshed on that seat). If
   * `token` doesn't match anything, this is a new seat — only allowed while
   * the room is still in LOBBY and has room to spare.
   */
  joinRoom(roomCode: string, playerName: string, token?: string): { room: Room; player: RoomPlayer } {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new RoomError(`Room ${roomCode} does not exist.`);
    }

    if (token) {
      const existing = room.players.find((p) => p.token === token);
      if (existing) {
        existing.name = playerName || existing.name;
        return { room, player: existing };
      }
      // Token supplied but not recognized — fall through to treat as a new join.
    }

    if (room.status !== "LOBBY") {
      throw new RoomError(`Room ${roomCode} has already started; rejoin requires your original seat token.`);
    }
    if (room.players.length >= room.maxPlayers) {
      throw new RoomError(`Room ${roomCode} is full (${room.maxPlayers} players).`);
    }

    const player: RoomPlayer = {
      id: uuidv4(),
      name: playerName,
      token: uuidv4(),
      socketId: null,
      connected: false,
      ready: false,
    };
    room.players.push(player);
    return { room, player };
  }

  attachSocket(roomCode: string, playerId: PlayerId, socketId: string): void {
    const room = this.getRoomOrThrow(roomCode);
    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      throw new RoomError(`Player ${playerId} is not seated in room ${roomCode}.`);
    }
    player.socketId = socketId;
    player.connected = true;
    this.socketIndex.set(socketId, { roomCode, playerId });
  }

  /** Looks up which room/player a given socket belongs to, if any. */
  findBySocket(socketId: string): { room: Room; player: RoomPlayer } | null {
    const entry = this.socketIndex.get(socketId);
    if (!entry) return null;
    const room = this.rooms.get(entry.roomCode);
    if (!room) return null;
    const player = room.players.find((p) => p.id === entry.playerId);
    if (!player) return null;
    return { room, player };
  }

  /**
   * Marks a player disconnected without removing their seat (they can
   * rejoin later with their token). A raw network disconnect is NOT the
   * same event as an intentional "leave room" — it's routinely a page
   * refresh or a dropped wifi connection, so the room must survive it.
   * Actual cleanup of abandoned rooms happens via sweepIdleRooms().
   *
   * ASSUMPTION: readiness is reset to false on disconnect. Otherwise a
   * stale "ready" from before a drop could combine with the others' ready
   * flags to auto-start the instant they reconnect, with no fresh
   * confirmation from them that they're actually at the table again.
   */
  handleDisconnect(socketId: string): { room: Room; player: RoomPlayer } | null {
    const found = this.findBySocket(socketId);
    if (!found) return null;
    found.player.connected = false;
    found.player.ready = false;
    found.player.socketId = null;
    found.room.lastActivityAt = Date.now();
    this.socketIndex.delete(socketId);
    return found;
  }

  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  getRoomOrThrow(roomCode: string): Room {
    const room = this.rooms.get(roomCode);
    if (!room) throw new RoomError(`Room ${roomCode} does not exist.`);
    return room;
  }

  /** Starts the game: requires exactly `maxPlayers` seated and a host request. */
  startGame(roomCode: string, requestingPlayerId: PlayerId): Room {
    const room = this.getRoomOrThrow(roomCode);
    if (room.hostId !== requestingPlayerId) {
      throw new RoomError("Only the host can start the game.");
    }
    if (room.status !== "LOBBY") {
      throw new RoomError("This game has already started.");
    }
    if (room.players.length !== room.maxPlayers) {
      throw new RoomError(`Need exactly ${room.maxPlayers} players to start (have ${room.players.length}).`);
    }

    this.launch(room);
    return room;
  }

  /**
   * Sets a player's ready state. If this completes the "all seated, all
   * connected, all ready" condition, the game starts automatically — no
   * host action required. Returns whether that happened, so the socket
   * layer knows to also broadcast the initial game state.
   */
  setReady(roomCode: string, playerId: PlayerId, ready: boolean): { room: Room; autoStarted: boolean } {
    const room = this.getRoomOrThrow(roomCode);
    if (room.status !== "LOBBY") {
      throw new RoomError("Cannot change readiness after the game has started.");
    }
    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      throw new RoomError(`Player ${playerId} is not seated in room ${roomCode}.`);
    }
    player.ready = ready;

    const autoStarted = this.allReady(room);
    if (autoStarted) {
      this.launch(room);
    }
    return { room, autoStarted };
  }

  /** True once the room is full and every seated player is connected and ready. */
  allReady(room: Room): boolean {
    return (
      room.players.length === room.maxPlayers && room.players.every((p) => p.connected && p.ready)
    );
  }

  private launch(room: Room): void {
    room.engine = new GameEngine(room.players.map((p) => p.id));
    room.engine.startRound();
    room.status = "IN_GAME";
  }

  /**
   * Host control: removes a seated player from the lobby, freeing their
   * spot for someone else to join. Only valid pre-game — once a game is
   * underway, seats are fixed (a disconnect + reconnect is the intended
   * path for a player dropping out mid-round, not a kick).
   */
  kickPlayer(roomCode: string, hostId: PlayerId, targetPlayerId: PlayerId): { room: Room; kicked: RoomPlayer } {
    const room = this.getRoomOrThrow(roomCode);
    if (room.hostId !== hostId) {
      throw new RoomError("Only the host can remove players.");
    }
    if (room.status !== "LOBBY") {
      throw new RoomError("Players can only be removed before the game starts.");
    }
    if (targetPlayerId === hostId) {
      throw new RoomError("The host can't kick themself — use leave room instead.");
    }
    const idx = room.players.findIndex((p) => p.id === targetPlayerId);
    if (idx === -1) {
      throw new RoomError("That player is not in this room.");
    }
    const [kicked] = room.players.splice(idx, 1);
    if (kicked.socketId) {
      this.socketIndex.delete(kicked.socketId);
    }
    return { room, kicked };
  }

  /** Host control: hands host privileges to another seated player. */
  transferHost(roomCode: string, currentHostId: PlayerId, newHostId: PlayerId): Room {
    const room = this.getRoomOrThrow(roomCode);
    if (room.hostId !== currentHostId) {
      throw new RoomError("Only the current host can transfer host.");
    }
    if (room.status !== "LOBBY") {
      throw new RoomError("Host can only be transferred before the game starts.");
    }
    if (!room.players.some((p) => p.id === newHostId)) {
      throw new RoomError("That player is not seated in this room.");
    }
    room.hostId = newHostId;
    return room;
  }

  /**
   * Removes a room immediately if nobody is connected and it never started.
   * Intended for the explicit "leave room" action (the user chose to leave,
   * so there's nothing to preserve) — NOT for raw disconnects, where the
   * player may just be reconnecting after a refresh. See sweepIdleRooms()
   * for that case.
   */
  removeIfEmpty(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const anyoneConnected = room.players.some((p) => p.connected);
    if (!anyoneConnected && room.status === "LOBBY") {
      this.rooms.delete(roomCode);
    }
  }

  /**
   * Removes rooms where every player has been disconnected for longer than
   * `maxIdleMs`, regardless of LOBBY/IN_GAME status. Call this on an
   * interval from your server bootstrap (see index.ts) to garbage-collect
   * rooms abandoned after a network drop, without punishing players who
   * reconnect within a reasonable window. Returns the codes removed.
   */
  sweepIdleRooms(maxIdleMs: number): string[] {
    const now = Date.now();
    const removed: string[] = [];
    for (const [code, room] of this.rooms) {
      const anyoneConnected = room.players.some((p) => p.connected);
      if (!anyoneConnected && now - room.lastActivityAt > maxIdleMs) {
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }
}
