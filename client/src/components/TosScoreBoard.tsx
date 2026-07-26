import { useState } from "react";
import type { TosGameStateDTO } from "../shared/socketEvents";

interface TosScoreBoardProps {
  gameState: TosGameStateDTO;
  myPlayerId: string;
  playerNames: Record<string, string>;
  onRequestVote: () => Promise<unknown>;
  onCastVote: (vote: boolean) => Promise<unknown>;
}

export function TosScoreBoard({ gameState, myPlayerId, playerNames, onRequestVote, onCastVote }: TosScoreBoardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const voteStatus = gameState.pendingVoteStatus;
  const iHaveVoted = voteStatus ? voteStatus[myPlayerId] : false;
  // Points are only revealed once the whole round is over — not trick by
  // trick during play, which would give away too much too early.
  const pointsRevealed = gameState.phase === "ROUND_COMPLETE" || gameState.phase === "MATCH_COMPLETE";

  return (
    <div className="bg-black/30 rounded-lg p-3 text-white text-sm w-full max-w-xs">
      <h3 className="font-semibold mb-2 text-white/80">
        Round {gameState.round} of {gameState.matchLength}
      </h3>

      {pointsRevealed ? (
        <table className="w-full text-left mb-2">
          <thead>
            <tr className="text-white/50 text-xs">
              <th className="pb-1">Player</th>
              <th className="pb-1 text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {gameState.players.map((playerId) => (
              <tr
                key={playerId}
                className={
                  playerId === gameState.declarerId || (gameState.partnerRevealed && playerId === gameState.partnerId)
                    ? "text-yellow-300"
                    : ""
                }
              >
                <td className="py-0.5">{playerNames[playerId] ?? playerId}</td>
                <td className="py-0.5 text-right font-semibold">{gameState.capturedPoints[playerId] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-white/50 text-xs italic mb-2">
          Points are tallied in secret and revealed once the round ends.
        </p>
      )}

      <p className="text-white/50 text-xs italic mb-2">
        Cumulative standings stay hidden — everyone has to agree to peek.
      </p>

      {gameState.phase === "ROUND_COMPLETE" && !voteStatus && (
        <button
          className="w-full py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs font-semibold disabled:opacity-40"
          disabled={busy}
          onClick={() => run(onRequestVote)}
        >
          Ask everyone to reveal the leaderboard
        </button>
      )}

      {voteStatus && (
        <div className="bg-white/5 rounded p-2 mt-1">
          <p className="text-xs text-white/70 mb-1">
            Vote to reveal: {Object.values(voteStatus).filter(Boolean).length}/{Object.keys(voteStatus).length} voted
          </p>
          {!iHaveVoted && (
            <div className="flex gap-2">
              <button
                className="flex-1 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold disabled:opacity-40"
                disabled={busy}
                onClick={() => run(() => onCastVote(true))}
              >
                Yes, reveal
              </button>
              <button
                className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-semibold disabled:opacity-40"
                disabled={busy}
                onClick={() => run(() => onCastVote(false))}
              >
                No, keep hidden
              </button>
            </div>
          )}
          {iHaveVoted && <p className="text-xs text-white/50 italic">Waiting on the others…</p>}
        </div>
      )}

      {error && <p className="mt-2 text-red-300 text-xs">{error}</p>}

      {gameState.roundHistory.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-white/60 text-xs">
            Round history ({gameState.roundHistory.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-white/70">
            {gameState.roundHistory.map((r) => (
              <li key={r.round}>
                Round {r.round}: {playerNames[r.declarerId] ?? r.declarerId} bid {r.bidAmount} on {r.trumpSuit} —{" "}
                {r.contractSucceeded ? "made it" : "missed it"} ({r.teamTotal} pts)
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}