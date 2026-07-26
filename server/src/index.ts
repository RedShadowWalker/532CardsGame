/**
 * index.ts
 * Wires up Express (health check only — the client talks to this server
 * almost entirely over Socket.IO) and the Socket.IO server itself.
 *
 * `createServer()` is exported so integration tests can spin up a real
 * server on an ephemeral port without going through `npm start`.
 */

import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { RoomManager } from "./RoomManager";
import { broadcastRoomState } from "./broadcast";
import { registerGameHandlers } from "./sockets/gameSocket";
import { registerToSGameHandlers } from "./sockets/gameToSSocket";
import { registerLobbyHandlers } from "./sockets/lobbySocket";

export function createServer() {
  // CLIENT_ORIGIN lets you lock CORS down to your deployed frontend's URL
  // without touching code — set it as an env var on Railway/Render. Left
  // unset (e.g. local dev), it falls back to allowing any origin. Supports
  // a comma-separated list if you ever need more than one allowed origin
  // (e.g. a preview deploy URL alongside the production one).
  const clientOrigin = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(",").map((s) => s.trim())
    : "*";

  const app = express();
  app.use(cors({ origin: clientOrigin }));
  app.get("/health", (_req, res) => res.json({ ok: true }));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: clientOrigin },
  });

  const rooms = new RoomManager();

  io.on("connection", (socket) => {
    registerLobbyHandlers(io, socket, rooms);
    registerGameHandlers(io, socket, rooms);
    registerToSGameHandlers(io, socket, rooms);

    socket.on("disconnect", () => {
      // A raw disconnect is often just a page refresh or a wifi blip, not an
      // intentional exit — the player's seat is preserved so they can
      // reconnect with their token. We only mark them disconnected and let
      // everyone else know; actual room garbage-collection is handled by
      // sweepIdleRooms() on a grace-period interval (see below), not here.
      const found = rooms.handleDisconnect(socket.id);
      if (found) {
        broadcastRoomState(io, found.room);
      }
    });
  });

  return { app, httpServer, io, rooms };
}

/**
 * Call this once from your process bootstrap to garbage-collect rooms that
 * were abandoned (every player disconnected) for longer than `maxIdleMs`.
 * Not started automatically by createServer() so tests don't pick up a
 * dangling timer; wire it in alongside httpServer.listen() in production:
 *
 *   const { httpServer, rooms } = createServer();
 *   startIdleRoomSweep(rooms, 10 * 60 * 1000); // 10 minute grace period
 */
export function startIdleRoomSweep(rooms: RoomManager, maxIdleMs: number, intervalMs = 60_000) {
  return setInterval(() => rooms.sweepIdleRooms(maxIdleMs), intervalMs);
}

if (require.main === module) {
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
  const { httpServer, rooms } = createServer();
  startIdleRoomSweep(rooms, 10 * 60 * 1000);
  httpServer.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`532 game server listening on port ${PORT}`);
  });
}
