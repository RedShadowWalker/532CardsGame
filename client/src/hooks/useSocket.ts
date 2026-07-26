/**
 * useSocket.ts
 * Owns the single Socket.IO connection for the whole app. Connects once on
 * mount (to the URL from VITE_SERVER_URL) and reconnects automatically —
 * socket.io-client handles retry/backoff itself; we just expose the current
 * connected state so the UI can show "reconnecting..." when it drops.
 */

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  if (!socketRef.current) {
    socketRef.current = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }

  useEffect(() => {
    const socket = socketRef.current!;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return { socket: socketRef.current, connected };
}
