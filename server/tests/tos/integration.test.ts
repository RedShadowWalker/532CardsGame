import { AddressInfo } from "net";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import { createServer } from "../../src/index";
import {
  AckResponse,
  ClientEvents,
  CreateRoomAck,
  JoinRoomAck,
  SelectGameRequest,
  ServerEvents,
  SetReadyRequest,
  TosCastLeaderboardVoteRequest,
  TosChooseTrumpAndPartnerRequest,
  TosGameStateDTO,
  TosLeaderboardRevealPayload,
  TosPlaceBidRequest,
  TosPlayCardRequest,
} from "../../src/shared/socketEvents";

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

/** Picks a legal-looking card: follow the led suit if possible, else any card. */
function pickCard(hand: TosGameStateDTO["hand"], currentTrick: TosGameStateDTO["currentTrick"]) {
  const cards = hand!;
  if (currentTrick.length === 0) return cards[0];
  const leadSuit = currentTrick[0].card.suit;
  return cards.find((c) => c.suit === leadSuit) ?? cards[0];
}

describe("Socket.IO server — full 4-player Three of Spades game", () => {
  let httpServer: ReturnType<typeof createServer>["httpServer"];
  let baseUrl: string;
  let clients: ClientSocket[] = [];

  beforeAll((done) => {
    const server = createServer();
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

  it("plays a complete round end-to-end: auction, hidden partner, tricks, and a hidden-leaderboard vote", async () => {
    const sockets = [connect(), connect(), connect(), connect()];
    await Promise.all(sockets.map((s) => waitFor(s, "connect")));

    const createRes = (await emitAck<any, AckResponse<CreateRoomAck>>(sockets[0], ClientEvents.CreateRoom, {
      playerName: "Alice",
    })) as CreateRoomAck;
    const roomCode = createRes.roomCode;

    const selectAck = await emitAck<SelectGameRequest, AckResponse>(sockets[0], ClientEvents.SelectGame, {
      gameType: "threeOfSpades",
      matchLength: 7,
    });
    expect(selectAck.ok).toBe(true);

    const playerIdBySocketIndex: string[] = [createRes.playerId];
    for (let i = 1; i < 4; i++) {
      const res = (await emitAck<any, AckResponse<JoinRoomAck>>(sockets[i], ClientEvents.JoinRoom, {
        roomCode,
        playerName: `Player${i}`,
      })) as JoinRoomAck;
      playerIdBySocketIndex.push(res.playerId);
    }
    const socketIndexForPlayer = (playerId: string) => playerIdBySocketIndex.indexOf(playerId);

    const latestState: (TosGameStateDTO | null)[] = [null, null, null, null];
    sockets.forEach((s, i) => {
      s.on(ServerEvents.TosState, (state: TosGameStateDTO) => {
        latestState[i] = state;
      });
    });

    // ---- Ready up (auto-starts once all 4 are ready) ----
    const startPromises = sockets.map((s) => waitFor<TosGameStateDTO>(s, ServerEvents.TosState));
    for (const s of sockets) {
      const ack = await emitAck<SetReadyRequest, AckResponse>(s, ClientEvents.SetReady, { ready: true });
      expect(ack.ok).toBe(true);
    }
    await Promise.all(startPromises);

    latestState.forEach((state) => {
      expect(state!.phase).toBe("AUCTION");
      expect(state!.hand).toHaveLength(13);
    });

    // ---- Auction: first bidder opens at 130, everyone else passes ----
    const firstBidder = latestState[0]!.currentBidderId!;
    const firstBidderIdx = socketIndexForPlayer(firstBidder);

    let bidUpdates = sockets.map((s) => waitFor<TosGameStateDTO>(s, ServerEvents.TosState));
    const bidReq: TosPlaceBidRequest = { amount: 130 };
    const bidAck = await emitAck<TosPlaceBidRequest, AckResponse>(sockets[firstBidderIdx], ClientEvents.TosPlaceBid, bidReq);
    expect(bidAck.ok).toBe(true);
    await Promise.all(bidUpdates);

    while (latestState[0]!.phase === "AUCTION") {
      const currentBidderId = latestState[0]!.currentBidderId!;
      const idx = socketIndexForPlayer(currentBidderId);
      const updates = sockets.map((s) => waitFor<TosGameStateDTO>(s, ServerEvents.TosState));
      const ack = await emitAck<{}, AckResponse>(sockets[idx], ClientEvents.TosPass, {});
      expect(ack.ok).toBe(true);
      await Promise.all(updates);
    }

    latestState.forEach((state) => {
      expect(state!.phase).toBe("TRUMP_AND_PARTNER_SELECTION");
      expect(state!.declarerId).toBe(firstBidder);
      expect(state!.bidAmount).toBe(130);
    });

    // ---- Authoritative validation: only the declarer may choose trump+partner ----
    const notDeclarerIdx = socketIndexForPlayer(firstBidder) === 0 ? 1 : 0;
    const badTrumpAck = await emitAck<TosChooseTrumpAndPartnerRequest, AckResponse>(
      sockets[notDeclarerIdx],
      ClientEvents.TosChooseTrumpAndPartner,
      { suit: "Hearts", partnerCard: { suit: "Clubs", rank: "A" } }
    );
    expect(badTrumpAck.ok).toBe(false);

    // ---- Declarer chooses trump + a partner card (their own last card, to
    // keep this test deterministic — a self-partner is a valid, if
    // degenerate, case per the engine's documented behavior) ----
    const declarerIdx = firstBidderIdx;
    const declarerHand = latestState[declarerIdx]!.hand!;
    const partnerCardChoice = declarerHand[declarerHand.length - 1];

    const trumpUpdates = sockets.map((s) => waitFor<TosGameStateDTO>(s, ServerEvents.TosState));
    const trumpAck = await emitAck<TosChooseTrumpAndPartnerRequest, AckResponse>(
      sockets[declarerIdx],
      ClientEvents.TosChooseTrumpAndPartner,
      { suit: "Hearts", partnerCard: { suit: partnerCardChoice.suit, rank: partnerCardChoice.rank } }
    );
    expect(trumpAck.ok).toBe(true);
    await Promise.all(trumpUpdates);

    latestState.forEach((state) => {
      expect(state!.phase).toBe("PLAYING");
      expect(state!.trumpSuit).toBe("Hearts");
      expect(state!.partnerCard).toEqual({ suit: partnerCardChoice.suit, rank: partnerCardChoice.rank });
      // Partner card is public, but WHO holds it is not, until played.
      expect(state!.partnerId).toBeNull();
      expect(state!.partnerRevealed).toBe(false);
      expect(state!.currentTurnPlayerId).toBe(firstBidder);
    });

    // ---- Authoritative validation: playing out of turn is rejected ----
    const notCurrentIdx = socketIndexForPlayer(latestState[0]!.currentTurnPlayerId!) === 0 ? 1 : 0;
    const someCard = latestState[notCurrentIdx]!.hand![0];
    const illegalPlayAck = await emitAck<TosPlayCardRequest, AckResponse>(sockets[notCurrentIdx], ClientEvents.TosPlayCard, {
      card: someCard,
    });
    expect(illegalPlayAck.ok).toBe(false);

    // ---- Play the entire round to completion ----
    let safety = 0;
    while (latestState[0]!.phase === "PLAYING" && safety < 200) {
      safety++;
      const turnPlayerId = latestState[0]!.currentTurnPlayerId!;
      const idx = socketIndexForPlayer(turnPlayerId);
      const state = latestState[idx]!;
      const card = pickCard(state.hand, state.currentTrick);

      const updates = sockets.map((s) => waitFor<TosGameStateDTO>(s, ServerEvents.TosState));
      const ack = await emitAck<TosPlayCardRequest, AckResponse>(sockets[idx], ClientEvents.TosPlayCard, { card });
      expect(ack.ok).toBe(true);
      await Promise.all(updates);
    }

    // ---- Round complete: partner MUST have been revealed by now (their card was played) ----
    latestState.forEach((state) => {
      expect(state!.phase).toBe("ROUND_COMPLETE");
      expect(state!.partnerRevealed).toBe(true);
      expect(state!.partnerId).not.toBeNull();
      expect(state!.roundHistory).toHaveLength(1);
      // contractSucceeded is public; scoreDelta/cumulative scores must never appear.
      expect(state!.roundHistory[0].contractSucceeded).toBeDefined();
      expect(JSON.stringify(state)).not.toMatch(/scoreDelta/);
      expect(JSON.stringify(state)).not.toMatch(/cumulativeScores/);
    });

    const totalPoints =
      sockets
        .map((_s, i) => latestState[i]!.capturedPoints)
        .reduce((sum, cp) => sum + Object.values(cp).reduce((a, b) => a + b, 0), 0) / 4; // each client reports the same totals
    expect(totalPoints).toBe(270);

    // ---- Hidden leaderboard vote: unanimous yes reveals standings ----
    const voteRevealPromises = sockets.map((s) => waitFor<TosLeaderboardRevealPayload>(s, ServerEvents.TosLeaderboardReveal));
    const requestAck = await emitAck<{}, AckResponse>(sockets[0], ClientEvents.TosRequestLeaderboardVote, {});
    expect(requestAck.ok).toBe(true);

    for (const s of sockets) {
      const voteReq: TosCastLeaderboardVoteRequest = { vote: true };
      const ack = await emitAck<TosCastLeaderboardVoteRequest, AckResponse>(s, ClientEvents.TosCastLeaderboardVote, voteReq);
      expect(ack.ok).toBe(true);
    }
    const reveals = await Promise.all(voteRevealPromises);
    reveals.forEach((r) => {
      expect(r.standings).not.toBeNull();
      expect(Object.keys(r.standings!)).toHaveLength(4);
    });
  }, 30000);

  it("hides standings if even one player votes no", async () => {
    const sockets = [connect(), connect(), connect(), connect()];
    await Promise.all(sockets.map((s) => waitFor(s, "connect")));

    const createRes = (await emitAck<any, AckResponse<CreateRoomAck>>(sockets[0], ClientEvents.CreateRoom, {
      playerName: "Alice",
    })) as CreateRoomAck;
    await emitAck<SelectGameRequest, AckResponse>(sockets[0], ClientEvents.SelectGame, {
      gameType: "threeOfSpades",
      matchLength: 7,
    });
    const roomCode = createRes.roomCode;
    const playerIdBySocketIndex: string[] = [createRes.playerId];
    for (let i = 1; i < 4; i++) {
      const res = (await emitAck<any, AckResponse<JoinRoomAck>>(sockets[i], ClientEvents.JoinRoom, {
        roomCode,
        playerName: `Player${i}`,
      })) as JoinRoomAck;
      playerIdBySocketIndex.push(res.playerId);
    }
    const socketIndexForPlayer = (playerId: string) => playerIdBySocketIndex.indexOf(playerId);

    const latestState: (TosGameStateDTO | null)[] = [null, null, null, null];
    sockets.forEach((s, i) => s.on(ServerEvents.TosState, (state: TosGameStateDTO) => (latestState[i] = state)));

    const startPromises = sockets.map((s) => waitFor<TosGameStateDTO>(s, ServerEvents.TosState));
    for (const s of sockets) {
      await emitAck<SetReadyRequest, AckResponse>(s, ClientEvents.SetReady, { ready: true });
    }
    await Promise.all(startPromises);

    const firstBidder = latestState[0]!.currentBidderId!;
    const firstBidderIdx = socketIndexForPlayer(firstBidder);
    let updates = sockets.map((s) => waitFor<TosGameStateDTO>(s, ServerEvents.TosState));
    await emitAck<TosPlaceBidRequest, AckResponse>(sockets[firstBidderIdx], ClientEvents.TosPlaceBid, { amount: 130 });
    await Promise.all(updates);
    while (latestState[0]!.phase === "AUCTION") {
      const idx = socketIndexForPlayer(latestState[0]!.currentBidderId!);
      updates = sockets.map((s) => waitFor<TosGameStateDTO>(s, ServerEvents.TosState));
      await emitAck<{}, AckResponse>(sockets[idx], ClientEvents.TosPass, {});
      await Promise.all(updates);
    }

    const declarerHand = latestState[firstBidderIdx]!.hand!;
    const partnerCardChoice = declarerHand[declarerHand.length - 1];
    updates = sockets.map((s) => waitFor<TosGameStateDTO>(s, ServerEvents.TosState));
    await emitAck<TosChooseTrumpAndPartnerRequest, AckResponse>(sockets[firstBidderIdx], ClientEvents.TosChooseTrumpAndPartner, {
      suit: "Spades",
      partnerCard: { suit: partnerCardChoice.suit, rank: partnerCardChoice.rank },
    });
    await Promise.all(updates);

    let safety = 0;
    while (latestState[0]!.phase === "PLAYING" && safety < 200) {
      safety++;
      const idx = socketIndexForPlayer(latestState[0]!.currentTurnPlayerId!);
      const state = latestState[idx]!;
      const card = pickCard(state.hand, state.currentTrick);
      updates = sockets.map((s) => waitFor<TosGameStateDTO>(s, ServerEvents.TosState));
      await emitAck<TosPlayCardRequest, AckResponse>(sockets[idx], ClientEvents.TosPlayCard, { card });
      await Promise.all(updates);
    }
    expect(latestState[0]!.phase).toBe("ROUND_COMPLETE");

    const voteRevealPromises = sockets.map((s) => waitFor<TosLeaderboardRevealPayload>(s, ServerEvents.TosLeaderboardReveal));
    await emitAck<{}, AckResponse>(sockets[0], ClientEvents.TosRequestLeaderboardVote, {});
    await emitAck<TosCastLeaderboardVoteRequest, AckResponse>(sockets[0], ClientEvents.TosCastLeaderboardVote, { vote: true });
    await emitAck<TosCastLeaderboardVoteRequest, AckResponse>(sockets[1], ClientEvents.TosCastLeaderboardVote, { vote: true });
    await emitAck<TosCastLeaderboardVoteRequest, AckResponse>(sockets[2], ClientEvents.TosCastLeaderboardVote, { vote: false });
    await emitAck<TosCastLeaderboardVoteRequest, AckResponse>(sockets[3], ClientEvents.TosCastLeaderboardVote, { vote: true });

    const reveals = await Promise.all(voteRevealPromises);
    reveals.forEach((r) => expect(r.standings).toBeNull());
  }, 30000);
});
