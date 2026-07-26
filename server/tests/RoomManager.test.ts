import { RoomManager, RoomError } from "../src/RoomManager";
import { GamePhase } from "../src/game/types";

/** Convenience: create a room and immediately pick 5-3-2 (3 players, no match length needed). */
function createRoomWith532(rooms: RoomManager, hostName = "Alice") {
  const { room, player: host } = rooms.createRoom(hostName);
  rooms.selectGame(room.code, host.id, "532");
  return { room, host };
}

describe("RoomManager — room creation & game selection", () => {
  it("creates a room with a 6-digit code, the creator as host, and no game chosen yet", () => {
    const rooms = new RoomManager();
    const { room, player } = rooms.createRoom("Alice");

    expect(room.code).toHaveLength(6);
    expect(room.code).toMatch(/^\d{6}$/);
    expect(room.hostId).toBe(player.id);
    expect(room.players).toHaveLength(1);
    expect(room.status).toBe("LOBBY");
    expect(room.gameType).toBeNull();
    expect(room.maxPlayers).toBeNull();
  });

  it("generates unique room codes across many rooms", () => {
    const rooms = new RoomManager();
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(rooms.createRoom(`Host${i}`).room.code);
    }
    expect(codes.size).toBe(50);
  });

  it("blocks joining until the host has chosen a game", () => {
    const rooms = new RoomManager();
    const { room } = rooms.createRoom("Alice");
    expect(() => rooms.joinRoom(room.code, "Bob")).toThrow(RoomError);
  });

  it("selecting 5-3-2 sets maxPlayers to 3 and no match length", () => {
    const rooms = new RoomManager();
    const { room } = createRoomWith532(rooms);
    expect(rooms.getRoom(room.code)!.gameType).toBe("532");
    expect(rooms.getRoom(room.code)!.maxPlayers).toBe(3);
    expect(rooms.getRoom(room.code)!.matchLength).toBeNull();
  });

  it("selecting Three of Spades requires a match length of 7 or 10", () => {
    const rooms = new RoomManager();
    const { room, player: host } = rooms.createRoom("Alice");
    expect(() => rooms.selectGame(room.code, host.id, "threeOfSpades")).toThrow(RoomError);
    expect(() => rooms.selectGame(room.code, host.id, "threeOfSpades", 8 as any)).toThrow(RoomError);
    expect(() => rooms.selectGame(room.code, host.id, "threeOfSpades", 7)).not.toThrow();
    expect(rooms.getRoom(room.code)!.maxPlayers).toBe(4);
    expect(rooms.getRoom(room.code)!.matchLength).toBe(7);
  });

  it("only the host can select the game", () => {
    const rooms = new RoomManager();
    const { room, player: host } = rooms.createRoom("Alice");
    // No one else can join yet (no game chosen), so simulate a non-host id directly.
    expect(() => rooms.selectGame(room.code, "not-the-host", "532")).toThrow(RoomError);
    expect(() => rooms.selectGame(room.code, host.id, "532")).not.toThrow();
  });

  it("rejects changing the game once a second player has joined", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    rooms.joinRoom(room.code, "Bob");
    expect(() => rooms.selectGame(room.code, host.id, "threeOfSpades", 7)).toThrow(RoomError);
  });

  it("allows up to maxPlayers to join once a game is chosen, then rejects further joins", () => {
    const rooms = new RoomManager();
    const { room } = createRoomWith532(rooms);
    rooms.joinRoom(room.code, "Bob");
    rooms.joinRoom(room.code, "Carol");
    expect(rooms.getRoom(room.code)!.players).toHaveLength(3);
    expect(() => rooms.joinRoom(room.code, "Dave")).toThrow(RoomError);
  });

  it("rejects joining a nonexistent room", () => {
    const rooms = new RoomManager();
    expect(() => rooms.joinRoom("ZZZZZZ", "Alice")).toThrow(RoomError);
  });

  it("assigns each player a unique id and a unique reconnection token", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    const { player: bob } = rooms.joinRoom(room.code, "Bob");
    expect(host.id).not.toBe(bob.id);
    expect(host.token).not.toBe(bob.token);
  });
});

describe("RoomManager — sockets & disconnection", () => {
  it("attaches a socket id to a player and finds them by socket id", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    rooms.attachSocket(room.code, host.id, "socket-abc");

    const found = rooms.findBySocket("socket-abc");
    expect(found?.player.id).toBe(host.id);
    expect(found?.player.connected).toBe(true);
  });

  it("marks a player disconnected without removing their seat", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    rooms.attachSocket(room.code, host.id, "socket-abc");

    const result = rooms.handleDisconnect("socket-abc");
    expect(result?.player.id).toBe(host.id);
    expect(result?.player.connected).toBe(false);
    expect(rooms.getRoom(room.code)!.players).toHaveLength(1);
    expect(rooms.findBySocket("socket-abc")).toBeNull();
  });

  it("reconnects a returning player via their token instead of creating a new seat", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    rooms.attachSocket(room.code, host.id, "socket-1");
    rooms.handleDisconnect("socket-1");

    const { player: rejoined } = rooms.joinRoom(room.code, "Alice", host.token);
    expect(rejoined.id).toBe(host.id);
    expect(rooms.getRoom(room.code)!.players).toHaveLength(1);
  });

  it("removes an empty room that never started", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    rooms.attachSocket(room.code, host.id, "socket-1");
    rooms.handleDisconnect("socket-1");

    rooms.removeIfEmpty(room.code);
    expect(rooms.getRoom(room.code)).toBeUndefined();
  });

  it("does not remove an in-progress room even if everyone disconnects", () => {
    const rooms = new RoomManager();
    const { room, host: p1 } = createRoomWith532(rooms);
    const { player: p2 } = rooms.joinRoom(room.code, "Bob");
    const { player: p3 } = rooms.joinRoom(room.code, "Carol");
    [p1, p2, p3].forEach((p, i) => rooms.attachSocket(room.code, p.id, `s${i}`));
    rooms.startGame(room.code, p1.id);

    [p1, p2, p3].forEach((p) => rooms.handleDisconnect(p.socketId!));
    rooms.removeIfEmpty(room.code);
    expect(rooms.getRoom(room.code)).toBeDefined();
  });
});

describe("RoomManager — starting the game", () => {
  it("only allows the host to start the game", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    const { player: guest } = rooms.joinRoom(room.code, "Bob");
    rooms.joinRoom(room.code, "Carol");

    expect(() => rooms.startGame(room.code, guest.id)).toThrow(RoomError);
    expect(() => rooms.startGame(room.code, host.id)).not.toThrow();
  });

  it("requires exactly maxPlayers before starting", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    rooms.joinRoom(room.code, "Bob");
    expect(() => rooms.startGame(room.code, host.id)).toThrow(RoomError);
  });

  it("creates and starts a 5-3-2 GameEngine, dealing 5 cards to each player", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    const p2 = rooms.joinRoom(room.code, "Bob").player;
    const p3 = rooms.joinRoom(room.code, "Carol").player;

    const started = rooms.startGame(room.code, host.id);
    expect(started.status).toBe("IN_GAME");
    expect(started.engine).not.toBeNull();
    expect((started.engine as any).getPhase()).toBe(GamePhase.TrumpSelection);
    [host, p2, p3].forEach((p) => {
      expect((started.engine as any).getHand(p.id)).toHaveLength(5);
    });
  });

  it("creates and starts a ThreeOfSpadesEngine, dealing 13 cards to each of 4 players", () => {
    const rooms = new RoomManager();
    const { room, player: host } = rooms.createRoom("Alice");
    rooms.selectGame(room.code, host.id, "threeOfSpades", 7);
    const p2 = rooms.joinRoom(room.code, "Bob").player;
    const p3 = rooms.joinRoom(room.code, "Carol").player;
    const p4 = rooms.joinRoom(room.code, "Dave").player;

    const started = rooms.startGame(room.code, host.id);
    expect(started.status).toBe("IN_GAME");
    [host, p2, p3, p4].forEach((p) => {
      expect((started.engine as any).getHand(p.id)).toHaveLength(13);
    });
  });

  it("rejects starting a room that has already started", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    rooms.joinRoom(room.code, "Bob");
    rooms.joinRoom(room.code, "Carol");
    rooms.startGame(room.code, host.id);
    expect(() => rooms.startGame(room.code, host.id)).toThrow(RoomError);
  });
});

describe("RoomManager — readiness & auto-start", () => {
  function seatThreeConnected(rooms: RoomManager) {
    const { room, host } = createRoomWith532(rooms);
    const p2 = rooms.joinRoom(room.code, "Bob").player;
    const p3 = rooms.joinRoom(room.code, "Carol").player;
    [host, p2, p3].forEach((p, i) => rooms.attachSocket(room.code, p.id, `socket-${i}`));
    return { room, host, p2, p3 };
  }

  it("does not auto-start with fewer than maxPlayers ready", () => {
    const rooms = new RoomManager();
    const { room } = createRoomWith532(rooms);
    rooms.joinRoom(room.code, "Bob");

    const result = rooms.setReady(room.code, room.players[0].id, true);
    expect(result.autoStarted).toBe(false);
    expect(result.room.status).toBe("LOBBY");
  });

  it("does not auto-start until every seated player is ready", () => {
    const rooms = new RoomManager();
    const { room, host, p2 } = seatThreeConnected(rooms);
    expect(rooms.setReady(room.code, host.id, true).autoStarted).toBe(false);
    expect(rooms.setReady(room.code, p2.id, true).autoStarted).toBe(false);
    expect(rooms.getRoom(room.code)!.status).toBe("LOBBY");
  });

  it("auto-starts the instant the third player becomes ready", () => {
    const rooms = new RoomManager();
    const { room, host, p2, p3 } = seatThreeConnected(rooms);
    rooms.setReady(room.code, host.id, true);
    rooms.setReady(room.code, p2.id, true);
    const result = rooms.setReady(room.code, p3.id, true);

    expect(result.autoStarted).toBe(true);
    expect(result.room.status).toBe("IN_GAME");
    [host, p2, p3].forEach((p) => {
      expect((result.room.engine as any).getHand(p.id)).toHaveLength(5);
    });
  });

  it("does not auto-start if a ready player is disconnected", () => {
    const rooms = new RoomManager();
    const { room, host, p2, p3 } = seatThreeConnected(rooms);
    rooms.setReady(room.code, host.id, true);
    rooms.setReady(room.code, p2.id, true);
    rooms.handleDisconnect("socket-2");
    const result = rooms.setReady(room.code, p3.id, true);
    expect(result.autoStarted).toBe(false);
  });

  it("un-readying a player prevents auto-start even if others are ready", () => {
    const rooms = new RoomManager();
    const { room, host, p2, p3 } = seatThreeConnected(rooms);
    rooms.setReady(room.code, host.id, true);
    rooms.setReady(room.code, p2.id, true);
    rooms.setReady(room.code, host.id, false);
    const result = rooms.setReady(room.code, p3.id, true);
    expect(result.autoStarted).toBe(false);
    expect(result.room.status).toBe("LOBBY");
  });

  it("resets readiness to false when a player disconnects", () => {
    const rooms = new RoomManager();
    const { room, host } = seatThreeConnected(rooms);
    rooms.setReady(room.code, host.id, true);
    rooms.handleDisconnect("socket-0");
    const rejoined = rooms.joinRoom(room.code, "Alice", host.token).player;
    expect(rejoined.ready).toBe(false);
  });

  it("rejects setting readiness once the game has started", () => {
    const rooms = new RoomManager();
    const { room, host, p2 } = seatThreeConnected(rooms);
    rooms.startGame(room.code, host.id);
    expect(() => rooms.setReady(room.code, p2.id, true)).toThrow(RoomError);
  });

  it("rejects setting readiness before a game has been chosen", () => {
    const rooms = new RoomManager();
    const { room, player: host } = rooms.createRoom("Alice");
    expect(() => rooms.setReady(room.code, host.id, true)).toThrow(RoomError);
  });

  it("rejects setting readiness for a player not seated in the room", () => {
    const rooms = new RoomManager();
    const { room } = createRoomWith532(rooms);
    expect(() => rooms.setReady(room.code, "not-a-real-id", true)).toThrow(RoomError);
  });
});

describe("RoomManager — host controls", () => {
  it("lets the host kick a player, freeing their seat", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    const bob = rooms.joinRoom(room.code, "Bob").player;

    const { kicked } = rooms.kickPlayer(room.code, host.id, bob.id);
    expect(kicked.id).toBe(bob.id);
    expect(rooms.getRoom(room.code)!.players).toHaveLength(1);

    const dave = rooms.joinRoom(room.code, "Dave").player;
    expect(rooms.getRoom(room.code)!.players.map((p) => p.id)).toContain(dave.id);
  });

  it("rejects a kick attempt from a non-host", () => {
    const rooms = new RoomManager();
    const { room } = createRoomWith532(rooms);
    const bob = rooms.joinRoom(room.code, "Bob").player;
    const carol = rooms.joinRoom(room.code, "Carol").player;
    expect(() => rooms.kickPlayer(room.code, bob.id, carol.id)).toThrow(RoomError);
  });

  it("rejects the host trying to kick themself", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    expect(() => rooms.kickPlayer(room.code, host.id, host.id)).toThrow(RoomError);
  });

  it("rejects kicking once the game has started", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    const bob = rooms.joinRoom(room.code, "Bob").player;
    rooms.joinRoom(room.code, "Carol");
    rooms.startGame(room.code, host.id);
    expect(() => rooms.kickPlayer(room.code, host.id, bob.id)).toThrow(RoomError);
  });

  it("transfers host to another seated player", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    const bob = rooms.joinRoom(room.code, "Bob").player;

    const updated = rooms.transferHost(room.code, host.id, bob.id);
    expect(updated.hostId).toBe(bob.id);
    expect(() => rooms.transferHost(room.code, host.id, bob.id)).toThrow(RoomError);
    const carol = rooms.joinRoom(room.code, "Carol").player;
    expect(() => rooms.kickPlayer(room.code, bob.id, carol.id)).not.toThrow();
  });

  it("rejects transferring host to someone not seated in the room", () => {
    const rooms = new RoomManager();
    const { room, host } = createRoomWith532(rooms);
    expect(() => rooms.transferHost(room.code, host.id, "not-a-real-id")).toThrow(RoomError);
  });
});
