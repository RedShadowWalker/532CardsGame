import { AddressInfo } from "net";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import { createServer } from "../src/index";
import {
  AckResponse,
  ChooseTrumpRequest,
  ClientEvents,
  CreateRoomAck,
  GameStateDTO,
  JoinRoomAck,
  KickedPayload,
  KickPlayerRequest,
  PlayCardRequest,
  RespondToSettlementRequest,
  RoomStateDTO,
  ServerEvents,
  SetReadyRequest,
  SettleDebtRequest,
  TransferHostRequest,
} from "../src/shared/socketEvents";

function emitAck<TReq, TAck>(socket: ClientSocket, event: string, payload: TReq): Promise<TAck> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res: TAck) => resolve(res));
  });
}

function waitFor<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (payload: T) => resolve(payload));
  });
}

function waitForMatching<T>(socket: ClientSocket, event: string, predicate: (payload: T) => boolean): Promise<T> {
  return new Promise((resolve) => {
    const handler = (payload: T) => {
      if (predicate(payload)) {
        socket.off(event, handler);
        resolve(payload);
      }
    };
    socket.on(event, handler);
  });
}

/** Picks a legal-looking card: follow the led suit if possible, else any card. */
function pickCard(hand: GameStateDTO["hand"], currentTrick: GameStateDTO["currentTrick"]) {
  const cards = hand!;
  if (currentTrick.length === 0) return cards[0];
  const leadSuit = currentTrick[0].card.suit;
  return cards.find((c) => c.suit === leadSuit) ?? cards[0];
}

describe("Socket.IO server — full 3-player 5-3-2 game", () => {
  let httpServer: ReturnType<typeof createServer>["httpServer"];
  let baseUrl: string;
  let clients: ClientSocket[] = [];

  beforeAll((done) => {
    const server = createServer(3);
    httpServer = server.httpServer;
    httpServer.listen(() => {
      const { port } = httpServer.address() as AddressInfo;
      baseUrl = `http://localhost:${port}`;
      done();
    });
  });

  afterAll((done) => {
    httpServer.close(() => done());
  });

  afterEach(() => {
    clients.forEach((c) => c.disconnect());
    clients = [];
  });

  function connect(): ClientSocket {
    const socket = ioClient(baseUrl, { transports: ["websocket"], forceNew: true });
    clients.push(socket);
    return socket;
  }

  /** Drives any Settlement phase to completion: carryForward when allowed, else card+reject. */
  async function resolveAnySettlement(
    sockets: ClientSocket[],
    latestState: (GameStateDTO | null)[],
    socketIndexForPlayer: (id: string) => number
  ) {
    while (latestState[0]!.phase === "SETTLEMENT") {
      const item = latestState[0]!.settlementQueue?.[latestState[0]!.settlementIndex!];
      if (!item) break;
      const idx = socketIndexForPlayer(item.debtor);

      const updates = sockets.map((s) => waitFor<GameStateDTO>(s, ServerEvents.GameState));
      const req: SettleDebtRequest = { creditorId: item.creditor, method: "carryForward" };
      const ack = await emitAck<SettleDebtRequest, AckResponse>(sockets[idx], ClientEvents.SettleDebt, req);

      if (!ack.ok) {
        // Max-debt rule forced card settlement instead.
        const cardUpdates = sockets.map((s) => waitFor<GameStateDTO>(s, ServerEvents.GameState));
        await emitAck<SettleDebtRequest, AckResponse>(sockets[idx], ClientEvents.SettleDebt, {
          creditorId: item.creditor,
          method: "card",
        });
        await Promise.all(cardUpdates);

        while (latestState[idx]!.pendingExchange) {
          const creditorIdx = socketIndexForPlayer(latestState[idx]!.pendingExchange!.creditor);
          const respUpdates = sockets.map((s) => waitFor<GameStateDTO>(s, ServerEvents.GameState));
          const respReq: RespondToSettlementRequest = { action: "reject" };
          await emitAck<RespondToSettlementRequest, AckResponse>(
            sockets[creditorIdx],
            ClientEvents.RespondToSettlement,
            respReq
          );
          await Promise.all(respUpdates);
        }
      } else {
        await Promise.all(updates);
      }
    }
  }

  it("lets a host create a room and two friends join by code", async () => {
    const host = connect();
    await waitFor(host, "connect");
    const createRes = await emitAck<{ playerName: string }, AckResponse<CreateRoomAck>>(
      host,
      ClientEvents.CreateRoom,
      { playerName: "Alice" }
    );
    expect(createRes.ok).toBe(true);
    if (!createRes.ok) return;
    const { roomCode } = createRes;
    expect(roomCode).toHaveLength(6);

    const bob = connect();
    await waitFor(bob, "connect");
    const joinRes = await emitAck<any, AckResponse<JoinRoomAck>>(bob, ClientEvents.JoinRoom, {
      roomCode,
      playerName: "Bob",
    });
    expect(joinRes.ok).toBe(true);

    const roomStatePromise = waitForMatching<RoomStateDTO>(
      host,
      ServerEvents.RoomState,
      (s) => s.players.length === 3
    );
    const carol = connect();
    await waitFor(carol, "connect");
    await emitAck<any, AckResponse<JoinRoomAck>>(carol, ClientEvents.JoinRoom, {
      roomCode,
      playerName: "Carol",
    });
    const roomState = await roomStatePromise;
    expect(roomState.players.map((p) => p.name)).toEqual(expect.arrayContaining(["Alice", "Bob", "Carol"]));
  });

  it("rejects joining a full room (3 players max)", async () => {
    const host = connect();
    await waitFor(host, "connect");
    const { roomCode } = (await emitAck<any, AckResponse<CreateRoomAck>>(host, ClientEvents.CreateRoom, {
      playerName: "Alice",
    })) as CreateRoomAck;

    for (const name of ["Bob", "Carol"]) {
      const c = connect();
      await waitFor(c, "connect");
      const res = await emitAck<any, AckResponse<JoinRoomAck>>(c, ClientEvents.JoinRoom, {
        roomCode,
        playerName: name,
      });
      expect(res.ok).toBe(true);
    }

    const overflow = connect();
    await waitFor(overflow, "connect");
    const res = await emitAck<any, AckResponse<JoinRoomAck>>(overflow, ClientEvents.JoinRoom, {
      roomCode,
      playerName: "Dave",
    });
    expect(res.ok).toBe(false);
  });

  it("plays a complete authoritative round end-to-end across 3 real socket connections", async () => {
    const sockets = [connect(), connect(), connect()];
    await Promise.all(sockets.map((s) => waitFor(s, "connect")));

    const createRes = (await emitAck<any, AckResponse<CreateRoomAck>>(sockets[0], ClientEvents.CreateRoom, {
      playerName: "Alice",
    })) as CreateRoomAck;
    const roomCode = createRes.roomCode;

    const playerIdBySocketIndex: string[] = [createRes.playerId];
    for (let i = 1; i < 3; i++) {
      const res = (await emitAck<any, AckResponse<JoinRoomAck>>(sockets[i], ClientEvents.JoinRoom, {
        roomCode,
        playerName: `Player${i}`,
      })) as JoinRoomAck;
      playerIdBySocketIndex.push(res.playerId);
    }

    const latestState: (GameStateDTO | null)[] = [null, null, null];
    sockets.forEach((s, i) => {
      s.on(ServerEvents.GameState, (state: GameStateDTO) => {
        latestState[i] = state;
      });
    });
    const socketIndexForPlayer = (playerId: string) => playerIdBySocketIndex.indexOf(playerId);

    // ---- Host starts the game ----
    const startPromises = sockets.map((s) => waitFor<GameStateDTO>(s, ServerEvents.GameState));
    const startAck = await emitAck<any, AckResponse>(sockets[0], ClientEvents.StartGame, {});
    expect(startAck.ok).toBe(true);
    await Promise.all(startPromises);

    latestState.forEach((state) => {
      expect(state).not.toBeNull();
      expect(state!.phase).toBe("TRUMP_SELECTION");
      expect(state!.hand).toHaveLength(5); // spec section 7: first deal is 5 each
      expect(Object.values(state!.handSizes)).toEqual([5, 5, 5]);
    });

    const trumpPlayerId = latestState[0]!.trumpPlayerId!;
    expect(trumpPlayerId).toBe(playerIdBySocketIndex[0]); // round 1 trump = first to join (seat 0)
    expect(latestState[0]!.targets).toEqual({
      [playerIdBySocketIndex[0]]: 5,
      [playerIdBySocketIndex[2]]: 3, // left of seat 0 is seat 2
      [playerIdBySocketIndex[1]]: 2, // right of seat 0 (dealer) is seat 1
    });

    // ---- Authoritative validation: only the Trump Player may choose trump ----
    const notTrumpIdx = socketIndexForPlayer(trumpPlayerId) === 0 ? 1 : 0;
    const badTrumpAck = await emitAck<ChooseTrumpRequest, AckResponse>(sockets[notTrumpIdx], ClientEvents.ChooseTrump, {
      suit: "Spades",
    });
    expect(badTrumpAck.ok).toBe(false);

    // ---- Trump Player chooses trump ----
    const trumpIdx = socketIndexForPlayer(trumpPlayerId);
    const trumpUpdates = sockets.map((s) => waitFor<GameStateDTO>(s, ServerEvents.GameState));
    const trumpAck = await emitAck<ChooseTrumpRequest, AckResponse>(sockets[trumpIdx], ClientEvents.ChooseTrump, {
      suit: "Spades",
    });
    expect(trumpAck.ok).toBe(true);
    await Promise.all(trumpUpdates);

    latestState.forEach((state) => {
      expect(state!.trumpSuit).toBe("Spades");
      expect(state!.hand).toHaveLength(10); // spec section 9: second deal brings everyone to 10
    });

    // Round 1 has no prior debts, so Settlement should be skipped entirely.
    expect(latestState[0]!.phase).toBe("PLAYING");
    expect(latestState[0]!.currentTurnPlayerId).toBe(trumpPlayerId); // Trump Player leads first

    // ---- Authoritative validation: playing out of turn is rejected ----
    const notCurrentIdx = socketIndexForPlayer(latestState[0]!.currentTurnPlayerId!) === 0 ? 1 : 0;
    const someCard = latestState[notCurrentIdx]!.hand![0];
    const illegalPlayAck = await emitAck<PlayCardRequest, AckResponse>(
      sockets[notCurrentIdx],
      ClientEvents.PlayCard,
      { card: someCard }
    );
    expect(illegalPlayAck.ok).toBe(false);

    // ---- Play the entire round to completion ----
    let safety = 0;
    while (latestState[0]!.phase === "PLAYING" && safety < 100) {
      safety++;
      const turnPlayerId = latestState[0]!.currentTurnPlayerId!;
      const idx = socketIndexForPlayer(turnPlayerId);
      const state = latestState[idx]!;
      const card = pickCard(state.hand, state.currentTrick);

      const updates = sockets.map((s) => waitFor<GameStateDTO>(s, ServerEvents.GameState));
      const ack = await emitAck<PlayCardRequest, AckResponse>(sockets[idx], ClientEvents.PlayCard, { card });
      expect(ack.ok).toBe(true);
      await Promise.all(updates);
    }

    // ---- Round should now be complete, identically, for all three clients ----
    latestState.forEach((state) => {
      expect(state!.phase).toBe("ROUND_COMPLETE");
      expect(state!.roundHistory).toHaveLength(1);
      const totalTricks = Object.values(state!.tricksWon).reduce((a, b) => a + b, 0);
      expect(totalTricks).toBe(10);
    });

    // All three clients must agree on the ledger (server is the single source of truth).
    const ledgerStrings = latestState.map((s) => JSON.stringify(s!.ledger));
    expect(new Set(ledgerStrings).size).toBe(1);

    // ---- game:nextRound should deal a fresh round 2, trump rotated to seat 1 ----
    const nextRoundUpdates = sockets.map((s) => waitFor<GameStateDTO>(s, ServerEvents.GameState));
    const nextRoundAck = await emitAck<{}, AckResponse>(sockets[1], ClientEvents.NextRound, {});
    expect(nextRoundAck.ok).toBe(true);
    await Promise.all(nextRoundUpdates);

    latestState.forEach((state) => {
      expect(state!.round).toBe(2);
      expect(state!.trumpPlayerId).toBe(playerIdBySocketIndex[1]); // rotated to seat 1
      expect(state!.hand).toHaveLength(5); // back to first-deal size for round 2
    });

    // Resolve round 2's trump + any settlement it might trigger, to prove
    // the settlement path (if entered) works end-to-end over real sockets.
    const trump2Idx = 1;
    const trump2Updates = sockets.map((s) => waitFor<GameStateDTO>(s, ServerEvents.GameState));
    await emitAck<ChooseTrumpRequest, AckResponse>(sockets[trump2Idx], ClientEvents.ChooseTrump, {
      suit: "Hearts",
    });
    await Promise.all(trump2Updates);

    await resolveAnySettlement(sockets, latestState, socketIndexForPlayer);
    expect(latestState[0]!.phase).toBe("PLAYING");
  }, 30000);

  it("marks a player disconnected and lets them reconnect with their token", async () => {
    const host = connect();
    await waitFor(host, "connect");
    const { roomCode, playerToken, playerId } = (await emitAck<any, AckResponse<CreateRoomAck>>(
      host,
      ClientEvents.CreateRoom,
      { playerName: "Alice" }
    )) as CreateRoomAck;

    host.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    const reconnected = connect();
    await waitFor(reconnected, "connect");
    const rejoinRes = await emitAck<any, AckResponse<JoinRoomAck>>(reconnected, ClientEvents.JoinRoom, {
      roomCode,
      playerName: "Alice",
      playerToken,
    });
    expect(rejoinRes.ok).toBe(true);
    if (rejoinRes.ok) {
      expect(rejoinRes.playerId).toBe(playerId);
    }
  });

  it("auto-starts the game the instant all three players are ready — no host action required", async () => {
    const sockets = [connect(), connect(), connect()];
    await Promise.all(sockets.map((s) => waitFor(s, "connect")));

    const createRes = (await emitAck<any, AckResponse<CreateRoomAck>>(sockets[0], ClientEvents.CreateRoom, {
      playerName: "Alice",
    })) as CreateRoomAck;
    const roomCode = createRes.roomCode;

    for (let i = 1; i < 3; i++) {
      const res = await emitAck<any, AckResponse<JoinRoomAck>>(sockets[i], ClientEvents.JoinRoom, {
        roomCode,
        playerName: `Player${i}`,
      });
      expect(res.ok).toBe(true);
    }

    const gameStartedPromises = sockets.map((s) => waitFor<GameStateDTO>(s, ServerEvents.GameState));

    for (let i = 0; i < 2; i++) {
      const roomStateUpdate = waitForMatching<RoomStateDTO>(
        sockets[0],
        ServerEvents.RoomState,
        (s) => s.players.filter((p) => p.ready).length === i + 1
      );
      const ack = await emitAck<SetReadyRequest, AckResponse>(sockets[i], ClientEvents.SetReady, { ready: true });
      expect(ack.ok).toBe(true);
      const roomState = await roomStateUpdate;
      expect(roomState.status).toBe("LOBBY");
      expect(roomState.allReady).toBe(false);
    }

    const finalReadyAck = await emitAck<SetReadyRequest, AckResponse>(sockets[2], ClientEvents.SetReady, {
      ready: true,
    });
    expect(finalReadyAck.ok).toBe(true);

    const startedStates = await Promise.all(gameStartedPromises);
    startedStates.forEach((state) => {
      expect(state.phase).toBe("TRUMP_SELECTION");
      expect(state.hand).toHaveLength(5);
    });
  }, 15000);

  it("lets the host kick a player, freeing the seat and notifying the removed player", async () => {
    const host = connect();
    const bob = connect();
    await Promise.all([waitFor(host, "connect"), waitFor(bob, "connect")]);

    const createRes = (await emitAck<any, AckResponse<CreateRoomAck>>(host, ClientEvents.CreateRoom, {
      playerName: "Alice",
    })) as CreateRoomAck;
    const roomCode = createRes.roomCode;

    const bobJoin = (await emitAck<any, AckResponse<JoinRoomAck>>(bob, ClientEvents.JoinRoom, {
      roomCode,
      playerName: "Bob",
    })) as JoinRoomAck;

    const kickedPromise = waitFor<KickedPayload>(bob, ServerEvents.Kicked);
    const roomStatePromise = waitForMatching<RoomStateDTO>(
      host,
      ServerEvents.RoomState,
      (s) => s.players.length === 1
    );

    const kickAck = await emitAck<KickPlayerRequest, AckResponse>(host, ClientEvents.KickPlayer, {
      targetPlayerId: bobJoin.playerId,
    });
    expect(kickAck.ok).toBe(true);

    const kickedMsg = await kickedPromise;
    expect(kickedMsg.message).toBeTruthy();

    const roomState = await roomStatePromise;
    expect(roomState.players.map((p) => p.id)).not.toContain(bobJoin.playerId);

    const carol = connect();
    await waitFor(carol, "connect");
    const carolJoin = await emitAck<any, AckResponse<JoinRoomAck>>(carol, ClientEvents.JoinRoom, {
      roomCode,
      playerName: "Carol",
    });
    expect(carolJoin.ok).toBe(true);
  });

  it("rejects a kick from a non-host, and supports transferring host to another player", async () => {
    const host = connect();
    const bob = connect();
    await Promise.all([waitFor(host, "connect"), waitFor(bob, "connect")]);

    const createRes = (await emitAck<any, AckResponse<CreateRoomAck>>(host, ClientEvents.CreateRoom, {
      playerName: "Alice",
    })) as CreateRoomAck;
    const roomCode = createRes.roomCode;
    const bobJoin = (await emitAck<any, AckResponse<JoinRoomAck>>(bob, ClientEvents.JoinRoom, {
      roomCode,
      playerName: "Bob",
    })) as JoinRoomAck;

    const badKick = await emitAck<KickPlayerRequest, AckResponse>(bob, ClientEvents.KickPlayer, {
      targetPlayerId: createRes.playerId,
    });
    expect(badKick.ok).toBe(false);

    const transferAck = await emitAck<TransferHostRequest, AckResponse>(host, ClientEvents.TransferHost, {
      newHostId: bobJoin.playerId,
    });
    expect(transferAck.ok).toBe(true);

    const carol = connect();
    await waitFor(carol, "connect");
    const carolJoin = (await emitAck<any, AckResponse<JoinRoomAck>>(carol, ClientEvents.JoinRoom, {
      roomCode,
      playerName: "Carol",
    })) as JoinRoomAck;

    const staleHostKick = await emitAck<KickPlayerRequest, AckResponse>(host, ClientEvents.KickPlayer, {
      targetPlayerId: carolJoin.playerId,
    });
    expect(staleHostKick.ok).toBe(false);

    const newHostKick = await emitAck<KickPlayerRequest, AckResponse>(bob, ClientEvents.KickPlayer, {
      targetPlayerId: carolJoin.playerId,
    });
    expect(newHostKick.ok).toBe(true);
  });
});
