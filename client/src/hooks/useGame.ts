/**
 * useGame.ts
 * The single source of truth on the client side. Wraps every socket event
 * from socketEvents.ts into React state, persists just enough to localStorage
 * to survive a refresh (room code + reconnection token + name), and exposes
 * action functions that return a Promise resolving to the server's ack —
 * components await these and show whatever error comes back rather than
 * guessing locally whether a move is legal. The server is still the only
 * source of truth; this hook just makes talking to it convenient.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { ClientEvents, ServerEvents } from "../shared/socketEvents";
import type {
  AckResponse,
  ChooseTrumpRequest,
  CreateRoomAck,
  CreateRoomRequest,
  GameStateDTO,
  JoinRoomAck,
  JoinRoomRequest,
  KickedPayload,
  KickPlayerRequest,
  PlayCardRequest,
  RespondToSettlementRequest,
  RoomStateDTO,
  RoundCompletePayload,
  SetReadyRequest,
  SettleDebtRequest,
  TransferHostRequest,
  TrickResolvedPayload,
} from "../shared/socketEvents";

const SESSION_KEY = "532-session";

interface SavedSession {
  roomCode: string;
  playerId: string;
  playerToken: string;
  playerName: string;
}

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: SavedSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/** Wraps an emit-with-ack call in a Promise, rejecting on ok:false so callers can just catch(). */
function emitAck<TReq, TAck>(socket: Socket, event: string, payload: TReq): Promise<TAck> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res: AckResponse<TAck>) => {
      if (res.ok) {
        resolve(res as TAck & { ok: true });
      } else {
        reject(new Error(res.error));
      }
    });
  });
}

export function useGame(socket: Socket, connected: boolean) {
  const [session, setSession] = useState<SavedSession | null>(() => loadSession());
  const [roomState, setRoomState] = useState<RoomStateDTO | null>(null);
  const [gameState, setGameState] = useState<GameStateDTO | null>(null);
  const [lastTrick, setLastTrick] = useState<TrickResolvedPayload | null>(null);
  const [lastRound, setLastRound] = useState<RoundCompletePayload | null>(null);
  const [kickedMessage, setKickedMessage] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const rejoinAttempted = useRef(false);

  // ---- Wire up server -> client broadcasts ----
  useEffect(() => {
    const onRoomState = (state: RoomStateDTO) => setRoomState(state);
    const onGameState = (state: GameStateDTO) => setGameState(state);
    const onTrickResolved = (trick: TrickResolvedPayload) => setLastTrick(trick);
    const onRoundComplete = (summary: RoundCompletePayload) => setLastRound(summary);
    const onKicked = (payload: KickedPayload) => {
      clearSession();
      setSession(null);
      setRoomState(null);
      setGameState(null);
      setKickedMessage(payload.message);
    };

    socket.on(ServerEvents.RoomState, onRoomState);
    socket.on(ServerEvents.GameState, onGameState);
    socket.on(ServerEvents.TrickResolved, onTrickResolved);
    socket.on(ServerEvents.RoundComplete, onRoundComplete);
    socket.on(ServerEvents.Kicked, onKicked);

    return () => {
      socket.off(ServerEvents.RoomState, onRoomState);
      socket.off(ServerEvents.GameState, onGameState);
      socket.off(ServerEvents.TrickResolved, onTrickResolved);
      socket.off(ServerEvents.RoundComplete, onRoundComplete);
      socket.off(ServerEvents.Kicked, onKicked);
    };
  }, [socket]);

  // ---- Auto-rejoin once, the first time we connect with a saved session ----
  useEffect(() => {
    if (!connected || rejoinAttempted.current || !session) return;
    rejoinAttempted.current = true;

    emitAck<JoinRoomRequest, JoinRoomAck>(socket, ClientEvents.JoinRoom, {
      roomCode: session.roomCode,
      playerName: session.playerName,
      playerToken: session.playerToken,
    }).catch(() => {
      // Room's gone (server restarted, or it was cleaned up) — clear the
      // stale session so the person just lands back on the home screen.
      clearSession();
      setSession(null);
    });
  }, [connected, session, socket]);

  // ---- Actions ----

  const createRoom = useCallback(
    async (playerName: string) => {
      const res = await emitAck<CreateRoomRequest, CreateRoomAck>(socket, ClientEvents.CreateRoom, { playerName });
      const newSession: SavedSession = {
        roomCode: res.roomCode,
        playerId: res.playerId,
        playerToken: res.playerToken,
        playerName,
      };
      saveSession(newSession);
      setSession(newSession);
      return res;
    },
    [socket]
  );

  const joinRoom = useCallback(
    async (roomCode: string, playerName: string) => {
      const res = await emitAck<JoinRoomRequest, JoinRoomAck>(socket, ClientEvents.JoinRoom, {
        roomCode,
        playerName,
      });
      const newSession: SavedSession = {
        roomCode: res.roomCode,
        playerId: res.playerId,
        playerToken: res.playerToken,
        playerName,
      };
      saveSession(newSession);
      setSession(newSession);
      return res;
    },
    [socket]
  );

  const leaveRoom = useCallback(() => {
    socket.emit(ClientEvents.LeaveRoom);
    clearSession();
    setSession(null);
    setRoomState(null);
    setGameState(null);
  }, [socket]);

  const setReady = useCallback(
    (ready: boolean) => emitAck<SetReadyRequest, {}>(socket, ClientEvents.SetReady, { ready }),
    [socket]
  );

  const startGame = useCallback(() => emitAck<{}, {}>(socket, ClientEvents.StartGame, {}), [socket]);

  const kickPlayer = useCallback(
    (targetPlayerId: string) =>
      emitAck<KickPlayerRequest, {}>(socket, ClientEvents.KickPlayer, { targetPlayerId }),
    [socket]
  );

  const transferHost = useCallback(
    (newHostId: string) => emitAck<TransferHostRequest, {}>(socket, ClientEvents.TransferHost, { newHostId }),
    [socket]
  );

  const chooseTrump = useCallback(
    (suit: ChooseTrumpRequest["suit"]) => emitAck<ChooseTrumpRequest, {}>(socket, ClientEvents.ChooseTrump, { suit }),
    [socket]
  );

  const settleDebt = useCallback(
    (creditorId: string, method: SettleDebtRequest["method"]) =>
      emitAck<SettleDebtRequest, {}>(socket, ClientEvents.SettleDebt, { creditorId, method }),
    [socket]
  );

  const respondToSettlement = useCallback(
    (action: "keep" | "reject", returnCard?: RespondToSettlementRequest["returnCard"]) =>
      emitAck<RespondToSettlementRequest, {}>(socket, ClientEvents.RespondToSettlement, { action, returnCard }),
    [socket]
  );

  const playCard = useCallback(
    (card: PlayCardRequest["card"]) => emitAck<PlayCardRequest, {}>(socket, ClientEvents.PlayCard, { card }),
    [socket]
  );

  const nextRound = useCallback(() => emitAck<{}, {}>(socket, ClientEvents.NextRound, {}), [socket]);

  return {
    session,
    roomState,
    gameState,
    lastTrick,
    lastRound,
    kickedMessage,
    dismissKickedMessage: () => setKickedMessage(null),
    connectionError,
    setConnectionError,
    myPlayerId: session?.playerId ?? null,
    actions: {
      createRoom,
      joinRoom,
      leaveRoom,
      setReady,
      startGame,
      kickPlayer,
      transferHost,
      chooseTrump,
      settleDebt,
      respondToSettlement,
      playCard,
      nextRound,
    },
  };
}
