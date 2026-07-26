/**
 * RoomManager.ts
 * Owns rooms (lobby + in-progress games) independently of Socket.IO itself,
 * so it can be unit tested without spinning up a real server/socket.
 *
 * A room is created by the host alone, holding no game and no seat limit
 * yet. The host must selectGame() before anyone else can join — that
 * choice determines the room's maxPlayers (see games.ts) and which engine
 * class gets instantiated once the room fills and starts. Everything after
 * that (readiness, auto-start, host controls) works exactly the same
 * regardless of which game was picked.
 */

import { v4 as uuidv4 } from "uuid";
import { GameEngine } from "./game/GameEngine";
import { PlayerId as Player532Id } from "./game/types";
import { ThreeOfSpadesEngine } from "./gameToS/ThreeOfSpadesEngine";
import { GAME_CATALOG, GameType, MatchLength, MATCH_LENGTHS } from "./games";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easier to read aloud
const ROOM_CODE_LENGTH = 6;

export type PlayerId = Player532Id;
export type AnyEngine = GameEngine | ThreeOfSpadesEngine;

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
  gameType: GameType | null;
  maxPlayers: number | null;
  matchLength: MatchLength | null; // only meaningful for games that need it (Three of Spades)
  players: RoomPlayer[];
  status: "LOBBY" | "IN_GAME";
  engine: AnyEngine | null;
  createdAt: number;
  /** Updated whenever a player disconnects; used by sweepIdleRooms(). */
  lastActivityAt: number;
}

export class RoomError extends Error {}

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** Reverse index for O(1) disconnect handling. */
  private socketIndex = new Map<string, { roomCode: string; playerId: PlayerId }>();

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
      gameType: null,
      maxPlayers: null,
      matchLength: null,
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
   * Host picks which game this room will play. Only allowed while the host
   * is still the only person seated — once a friend has joined, the seat
   * count is locked in, so changing games (and thus maxPlayers) would be
   * confusing. `matchLength` is required for games whose catalog entry
   * says needsMatchLength (currently just Three of Spades: 7 or 10).
   */
  selectGame(roomCode: string, hostId: PlayerId, gameType: GameType, matchLength?: MatchLength): Room {
    const room = this.getRoomOrThrow(roomCode);
    if (room.hostId !== hostId) {
      throw new RoomError("Only the host can choose the game.");
    }
    if (room.status !== "LOBBY") {
      throw new RoomError("Cannot change the game after it has started.");
    }
    if (room.players.length > 1) {
      throw new RoomError("Cannot change the game once other players have joined.");
    }
    const config = GAME_CATALOG[gameType];
    if (!config) {
      throw new RoomError(`Unknown game type: ${gameType}`);
    }
    if (config.needsMatchLength) {
      if (!matchLength || !MATCH_LENGTHS.includes(matchLength)) {
        throw new RoomError(`${config.label} requires a match length of ${MATCH_LENGTHS.join(" or ")} rounds.`);
      }
      room.matchLength = matchLength;
    } else {
      room.matchLength = null;
    }
    room.gameType = gameType;
    room.maxPlayers = config.maxPlayers;
    return room;
  }

  /**
   * Joins a room. If `token` matches an existing seat in the room, this is
   * treated as a reconnection (name/socket refreshed on that seat). If
   * `token` doesn't match anything, this is a new seat — only allowed once
   * the host has picked a game, while the room is still in LOBBY, and has
   * room to spare.
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
    if (!room.gameType || !room.maxPlayers) {
      throw new RoomError("The host hasn't chosen a game for this room yet.");
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

  /** Starts the game: requires a game to have been chosen, exactly maxPlayers seated, and a host request. */
  startGame(roomCode: string, requestingPlayerId: PlayerId): Room {
    const room = this.getRoomOrThrow(roomCode);
    if (room.hostId !== requestingPlayerId) {
      throw new RoomError("Only the host can start the game.");
    }
    if (room.status !== "LOBBY") {
      throw new RoomError("This game has already started.");
    }
    if (!room.gameType || !room.maxPlayers) {
      throw new RoomError("Choose a game before starting.");
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
    if (!room.gameType) {
      throw new RoomError("Choose a game before readying up.");
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
      !!room.maxPlayers &&
      room.players.length === room.maxPlayers &&
      room.players.every((p) => p.connected && p.ready)
    );
  }

  private launch(room: Room): void {
    const playerIds = room.players.map((p) => p.id);
    if (room.gameType === "threeOfSpades") {
      room.engine = new ThreeOfSpadesEngine(playerIds, { matchLength: room.matchLength ?? 7 });
    } else {
      room.engine = new GameEngine(playerIds);
    }
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
