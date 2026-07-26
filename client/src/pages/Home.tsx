import { useState } from "react";

interface HomeProps {
  onCreateRoom: (playerName: string) => Promise<unknown>;
  onJoinRoom: (roomCode: string, playerName: string) => Promise<unknown>;
}

export function Home({ onCreateRoom, onJoinRoom }: HomeProps) {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState<"choose" | "join">("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Enter your name first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreateRoom(name.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) {
      setError("Enter your name first.");
      return;
    }
    if (!roomCode.trim()) {
      setError("Enter the room code your friend sent you.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onJoinRoom(roomCode.trim().toUpperCase(), name.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-white">
      <h1 className="text-4xl font-bold mb-1">5-3-2</h1>
      <p className="text-white/60 mb-8">Play the card game with friends, anywhere.</p>

      <div className="bg-black/30 rounded-xl p-6 w-full max-w-sm space-y-4">
        <div>
          <label className="text-sm text-white/70 block mb-1">Your name</label>
          <input
            className="w-full rounded-md px-3 py-2 bg-white/10 border border-white/20 focus:outline-none focus:border-white/50"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alice"
            maxLength={20}
          />
        </div>

        {mode === "choose" && (
          <div className="flex flex-col gap-2">
            <button
              className="w-full py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 font-semibold disabled:opacity-40"
              disabled={busy}
              onClick={handleCreate}
            >
              Create a room
            </button>
            <button
              className="w-full py-2 rounded-md bg-white/10 hover:bg-white/20 font-semibold"
              onClick={() => setMode("join")}
            >
              Join with a room code
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/70 block -mb-1">Room code</label>
            <input
              className="w-full rounded-md px-3 py-2 bg-white/10 border border-white/20 focus:outline-none focus:border-white/50 tracking-widest uppercase text-center font-mono text-lg"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ABCD12"
              maxLength={6}
            />
            <button
              className="w-full py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 font-semibold disabled:opacity-40"
              disabled={busy}
              onClick={handleJoin}
            >
              Join room
            </button>
            <button className="text-sm text-white/50 hover:text-white/80" onClick={() => setMode("choose")}>
              ← back
            </button>
          </div>
        )}

        {error && <p className="text-red-300 text-sm">{error}</p>}
      </div>
    </div>
  );
}
