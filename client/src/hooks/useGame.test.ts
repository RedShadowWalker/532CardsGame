import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useGame } from "./useGame";
import { FakeSocket } from "../test/fakeSocket";
import { ClientEvents, ServerEvents } from "../shared/socketEvents";
import type { Socket } from "socket.io-client";

const SESSION_KEY = "532-session";

function asSocket(fake: FakeSocket): Socket {
  return fake as unknown as Socket;
}

beforeEach(() => {
  localStorage.clear();
});

describe("useGame — room creation and joining", () => {
  it("has no session initially when localStorage is empty", () => {
    const fake = new FakeSocket();
    const { result } = renderHook(() => useGame(asSocket(fake), true));
    expect(result.current.session).toBeNull();
    expect(result.current.myPlayerId).toBeNull();
  });

  it("createRoom emits room:create and persists the returned session", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.CreateRoom, () => ({
      ok: true,
      roomCode: "ABC123",
      playerId: "player-1",
      playerToken: "token-1",
    }));

    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await act(async () => {
      await result.current.actions.createRoom("Alice");
    });

    expect(result.current.myPlayerId).toBe("player-1");
    expect(fake.lastEmitted(ClientEvents.CreateRoom)).toEqual({ playerName: "Alice" });

    const stored = JSON.parse(localStorage.getItem(SESSION_KEY)!);
    expect(stored).toEqual({
      roomCode: "ABC123",
      playerId: "player-1",
      playerToken: "token-1",
      playerName: "Alice",
    });
  });

  it("joinRoom rejects (throws) when the server ack reports failure", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.JoinRoom, () => ({ ok: false, error: "Room is full" }));

    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await expect(
      act(async () => {
        await result.current.actions.joinRoom("ABC123", "Bob");
      })
    ).rejects.toThrow("Room is full");

    // No session should be saved on failure.
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(result.current.session).toBeNull();
  });
});

describe("useGame — server broadcasts", () => {
  it("updates roomState when the server pushes room:state", () => {
    const fake = new FakeSocket();
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    act(() => {
      fake.trigger(ServerEvents.RoomState, {
        roomCode: "ABC123",
        players: [{ id: "p1", name: "Alice", connected: true, ready: false, isHost: true }],
        hostId: "p1",
        maxPlayers: 4,
        status: "LOBBY",
        allReady: false,
        canStart: false,
      });
    });

    expect(result.current.roomState?.roomCode).toBe("ABC123");
    expect(result.current.roomState?.players).toHaveLength(1);
  });

  it("updates gameState when the server pushes game:state", () => {
    const fake = new FakeSocket();
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    act(() => {
      fake.trigger(ServerEvents.GameState, {
        phase: "TRUMP_SELECTION",
        round: 1,
        players: ["p1", "p2", "p3"],
        trumpPlayerId: "p1",
        leftPlayerId: "p3",
        dealerId: "p2",
        targets: { p1: 5, p3: 3, p2: 2 },
        handSizes: { p1: 5, p2: 5, p3: 5 },
        hand: [],
        trumpSuit: null,
        currentTrick: [],
        tricksWon: {},
        ledger: {},
        roundHistory: [],
      });
    });

    expect(result.current.gameState?.phase).toBe("TRUMP_SELECTION");
    expect(result.current.gameState?.round).toBe(1);
  });

  it("clears the session and sets kickedMessage on room:kicked", () => {
    const fake = new FakeSocket();
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ roomCode: "ABC123", playerId: "p1", playerToken: "t1", playerName: "Alice" })
    );

    const { result } = renderHook(() => useGame(asSocket(fake), true));
    expect(result.current.session).not.toBeNull();

    act(() => {
      fake.trigger(ServerEvents.Kicked, { message: "The host removed you from the room." });
    });

    expect(result.current.session).toBeNull();
    expect(result.current.kickedMessage).toBe("The host removed you from the room.");
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe("useGame — auto-rejoin on reconnect", () => {
  it("automatically emits room:join with the saved token once connected", async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ roomCode: "ABC123", playerId: "p1", playerToken: "saved-token", playerName: "Alice" })
    );
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.JoinRoom, () => ({
      ok: true,
      roomCode: "ABC123",
      playerId: "p1",
      playerToken: "saved-token",
    }));

    renderHook(() => useGame(asSocket(fake), true));

    await waitFor(() => {
      expect(fake.lastEmitted(ClientEvents.JoinRoom)).toEqual({
        roomCode: "ABC123",
        playerName: "Alice",
        playerToken: "saved-token",
      });
    });
  });

  it("does not attempt to rejoin when not yet connected", () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ roomCode: "ABC123", playerId: "p1", playerToken: "saved-token", playerName: "Alice" })
    );
    const fake = new FakeSocket();

    renderHook(() => useGame(asSocket(fake), false));

    expect(fake.lastEmitted(ClientEvents.JoinRoom)).toBeUndefined();
  });

  it("clears a stale session if rejoining fails (e.g. room no longer exists)", async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ roomCode: "GONE99", playerId: "p1", playerToken: "old-token", playerName: "Alice" })
    );
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.JoinRoom, () => ({ ok: false, error: "Room GONE99 does not exist." }));

    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await waitFor(() => {
      expect(result.current.session).toBeNull();
    });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe("useGame — in-game actions", () => {
  it("wraps chooseTrump/playCard as ack-resolving promises", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.ChooseTrump, () => ({ ok: true }));
    fake.setAckResponder(ClientEvents.PlayCard, () => ({ ok: true }));

    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await act(async () => {
      await result.current.actions.chooseTrump("Spades");
    });
    expect(fake.lastEmitted(ClientEvents.ChooseTrump)).toEqual({ suit: "Spades" });

    await act(async () => {
      await result.current.actions.playCard({ suit: "Spades", rank: "A", value: 7 });
    });
    expect(fake.lastEmitted(ClientEvents.PlayCard)).toEqual({
      card: { suit: "Spades", rank: "A", value: 7 },
    });
  });

  it("wraps settleDebt and respondToSettlement as ack-resolving promises", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.SettleDebt, () => ({ ok: true }));
    fake.setAckResponder(ClientEvents.RespondToSettlement, () => ({ ok: true }));

    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await act(async () => {
      await result.current.actions.settleDebt("player-2", "carryForward");
    });
    expect(fake.lastEmitted(ClientEvents.SettleDebt)).toEqual({
      creditorId: "player-2",
      method: "carryForward",
    });

    await act(async () => {
      await result.current.actions.respondToSettlement("keep", { suit: "Hearts", rank: "K", value: 6 });
    });
    expect(fake.lastEmitted(ClientEvents.RespondToSettlement)).toEqual({
      action: "keep",
      returnCard: { suit: "Hearts", rank: "K", value: 6 },
    });
  });

  it("surfaces the server's rejection message when a settlement action is invalid", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.SettleDebt, () => ({
      ok: false,
      error: "It is not your debt to settle.",
    }));
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await expect(
      act(async () => {
        await result.current.actions.settleDebt("player-2", "card");
      })
    ).rejects.toThrow("It is not your debt to settle.");
  });

  it("surfaces the server's rejection message when a move is illegal", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.PlayCard, () => ({
      ok: false,
      error: "It is not player-1's turn to play.",
    }));
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await expect(
      act(async () => {
        await result.current.actions.playCard({ suit: "Hearts", rank: "K", value: 6 });
      })
    ).rejects.toThrow("It is not player-1's turn to play.");
  });

  it("kickPlayer and transferHost emit with the expected payload", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.KickPlayer, () => ({ ok: true }));
    fake.setAckResponder(ClientEvents.TransferHost, () => ({ ok: true }));
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await act(async () => {
      await result.current.actions.kickPlayer("bob-id");
    });
    expect(fake.lastEmitted(ClientEvents.KickPlayer)).toEqual({ targetPlayerId: "bob-id" });

    await act(async () => {
      await result.current.actions.transferHost("carol-id");
    });
    expect(fake.lastEmitted(ClientEvents.TransferHost)).toEqual({ newHostId: "carol-id" });
  });
});

describe("useGame — leaving a room", () => {
  it("emits room:leave and clears local session/state immediately", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.CreateRoom, () => ({
      ok: true,
      roomCode: "ABC123",
      playerId: "p1",
      playerToken: "t1",
    }));
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await act(async () => {
      await result.current.actions.createRoom("Alice");
    });
    expect(result.current.session).not.toBeNull();

    act(() => {
      result.current.actions.leaveRoom();
    });

    expect(fake.lastEmitted(ClientEvents.LeaveRoom)).toBeUndefined(); // no payload sent
    expect(fake.emitted.some((e) => e.event === ClientEvents.LeaveRoom)).toBe(true);
    expect(result.current.session).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe("useGame — game selection", () => {
  it("emits room:selectGame with gameType and matchLength", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.SelectGame, () => ({ ok: true }));
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await act(async () => {
      await result.current.actions.selectGame("threeOfSpades", 7);
    });
    expect(fake.lastEmitted(ClientEvents.SelectGame)).toEqual({ gameType: "threeOfSpades", matchLength: 7 });
  });

  it("omits matchLength when not provided (5-3-2 doesn't need one)", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.SelectGame, () => ({ ok: true }));
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await act(async () => {
      await result.current.actions.selectGame("532");
    });
    expect(fake.lastEmitted(ClientEvents.SelectGame)).toEqual({ gameType: "532", matchLength: undefined });
  });
});

describe("useGame — Three of Spades actions", () => {
  it("wraps tosPlaceBid and tosPass as ack-resolving promises", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.TosPlaceBid, () => ({ ok: true }));
    fake.setAckResponder(ClientEvents.TosPass, () => ({ ok: true }));
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await act(async () => {
      await result.current.actions.tosPlaceBid(150);
    });
    expect(fake.lastEmitted(ClientEvents.TosPlaceBid)).toEqual({ amount: 150 });

    await act(async () => {
      await result.current.actions.tosPass();
    });
    expect(fake.emitted.some((e) => e.event === ClientEvents.TosPass)).toBe(true);
  });

  it("wraps tosChooseTrumpAndPartner with the correct payload shape", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.TosChooseTrumpAndPartner, () => ({ ok: true }));
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await act(async () => {
      await result.current.actions.tosChooseTrumpAndPartner("Hearts", { suit: "Clubs", rank: "A" });
    });
    expect(fake.lastEmitted(ClientEvents.TosChooseTrumpAndPartner)).toEqual({
      suit: "Hearts",
      partnerCard: { suit: "Clubs", rank: "A" },
    });
  });

  it("wraps tosPlayCard with the ToS card shape (full 2-A rank range)", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.TosPlayCard, () => ({ ok: true }));
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await act(async () => {
      await result.current.actions.tosPlayCard({ suit: "Diamonds", rank: "3", value: 1 });
    });
    expect(fake.lastEmitted(ClientEvents.TosPlayCard)).toEqual({
      card: { suit: "Diamonds", rank: "3", value: 1 },
    });
  });

  it("wraps the leaderboard vote actions", async () => {
    const fake = new FakeSocket();
    fake.setAckResponder(ClientEvents.TosRequestLeaderboardVote, () => ({ ok: true }));
    fake.setAckResponder(ClientEvents.TosCastLeaderboardVote, () => ({ ok: true }));
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    await act(async () => {
      await result.current.actions.tosRequestLeaderboardVote();
    });
    expect(fake.emitted.some((e) => e.event === ClientEvents.TosRequestLeaderboardVote)).toBe(true);

    await act(async () => {
      await result.current.actions.tosCastLeaderboardVote(true);
    });
    expect(fake.lastEmitted(ClientEvents.TosCastLeaderboardVote)).toEqual({ vote: true });
  });

  it("updates tosGameState when the server pushes tos:state", () => {
    const fake = new FakeSocket();
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    act(() => {
      fake.trigger(ServerEvents.TosState, {
        phase: "AUCTION",
        round: 1,
        matchLength: 7,
        players: ["p1", "p2", "p3", "p4"],
        dealerId: "p1",
        handSizes: { p1: 13, p2: 13, p3: 13, p4: 13 },
        hand: [],
        declarerId: null,
        bidAmount: null,
        trumpSuit: null,
        partnerCard: null,
        partnerId: null,
        partnerRevealed: false,
        currentTrick: [],
        capturedPoints: {},
        roundHistory: [],
        pendingVoteStatus: null,
      });
    });

    expect(result.current.tosGameState?.phase).toBe("AUCTION");
    expect(result.current.tosGameState?.round).toBe(1);
  });

  it("updates tosLeaderboardReveal when the server pushes tos:leaderboardReveal, and clears it on dismiss", () => {
    const fake = new FakeSocket();
    const { result } = renderHook(() => useGame(asSocket(fake), true));

    act(() => {
      fake.trigger(ServerEvents.TosLeaderboardReveal, { standings: { p1: 300, p2: -150 } });
    });
    expect(result.current.tosLeaderboardReveal?.standings).toEqual({ p1: 300, p2: -150 });

    act(() => {
      result.current.dismissTosLeaderboardReveal();
    });
    expect(result.current.tosLeaderboardReveal).toBeNull();
  });
});
