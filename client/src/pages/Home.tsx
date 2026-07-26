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
      await onJoinRoom(roomCode.trim(), name.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-white">
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <div className="relative h-28 w-44">
          <div className="absolute left-4 top-5 h-20 w-14 -rotate-12 rounded-2xl border border-white/50 bg-gradient-to-b from-white to-slate-100 shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
            <div className="flex h-full flex-col items-center justify-between px-2 py-2 text-slate-900">
              <span className="text-sm font-black leading-none">A</span>
              <span className="text-2xl leading-none text-red-500">♥</span>
            </div>
          </div>
          <div className="absolute left-14 top-3 h-20 w-14 rotate-6 rounded-2xl border border-white/50 bg-gradient-to-b from-white to-slate-100 shadow-[0_12px_28px_rgba(0,0,0,0.3)]">
            <div className="flex h-full flex-col items-center justify-between px-2 py-2 text-slate-900">
              <span className="text-sm font-black leading-none">K</span>
              <span className="text-2xl leading-none text-slate-900">♠</span>
            </div>
          </div>
          <div className="absolute left-24 top-5 h-20 w-14 rotate-18 rounded-2xl border border-amber-200/70 bg-gradient-to-b from-amber-100 to-amber-200 shadow-[0_14px_30px_rgba(0,0,0,0.34)]">
            <div className="flex h-full flex-col items-center justify-between px-2 py-2 text-amber-950">
              <span className="text-sm font-black leading-none">Q</span>
              <span className="text-2xl leading-none text-amber-950">♦</span>
            </div>
          </div>
          <div className="absolute bottom-2 left-1/2 h-10 w-28 -translate-x-1/2 rounded-full bg-emerald-400/20 blur-xl" />
        </div>
        <div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">Hukum Ka Ekka</h1>
          <p className="text-white/65 mt-2">Play the card game with friends, anywhere.</p>
        </div>
      </div>

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
              inputMode="numeric"
              pattern="[0-9]*"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
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
