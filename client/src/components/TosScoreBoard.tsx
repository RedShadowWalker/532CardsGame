import { useState } from "react";
import type { TosGameStateDTO } from "../shared/socketEvents";
import { PlayerAvatar } from "./PlayerAvatar";

interface TosScoreBoardProps {
  gameState: TosGameStateDTO;
  myPlayerId: string;
  playerNames: Record<string, string>;
  onRequestVote: () => Promise<unknown>;
  onCastVote: (vote: boolean) => Promise<unknown>;
}

function TosScoreBoardBody({ gameState, myPlayerId, playerNames, onRequestVote, onCastVote }: TosScoreBoardProps) {
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
  // Points are only revealed once the whole round is over — not hand by
  // hand during play, which would give away too much too early.
  const pointsRevealed = gameState.phase === "ROUND_COMPLETE" || gameState.phase === "MATCH_COMPLETE";

  return (
    <div className="space-y-2">
      {pointsRevealed ? (
        <div className="space-y-2">
          {gameState.players.map((playerId) => {
            const isTeam =
              playerId === gameState.declarerId || (gameState.partnerRevealed && playerId === gameState.partnerId);
            const name = playerNames[playerId] ?? playerId;
            return (
              <div
                key={playerId}
                className={[
                  "flex items-center gap-3 rounded-lg px-3 py-2",
                  isTeam ? "bg-amber-600/20 ring-1 ring-amber-400/40" : "bg-white/5",
                ].join(" ")}
              >
                <PlayerAvatar playerId={playerId} name={name} size="sm" />
                <p className="flex-1 min-w-0 text-sm font-semibold text-white truncate">{name}</p>
                <p className="text-lg font-bold text-white tabular-nums">{gameState.capturedPoints[playerId] ?? 0}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-white/50 text-xs italic">Points are tallied in secret and revealed once the round ends.</p>
      )}

      <p className="text-white/50 text-[11px] italic pt-1">
        Cumulative standings stay hidden — everyone has to agree to peek.
      </p>

      {gameState.phase === "ROUND_COMPLETE" && !voteStatus && (
        <button
          className="w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold disabled:opacity-40"
          disabled={busy}
          onClick={() => run(onRequestVote)}
        >
          Ask everyone to reveal the leaderboard
        </button>
      )}

      {voteStatus && (
        <div className="bg-white/5 rounded-lg p-2">
          <p className="text-xs text-white/70 mb-1">
            Vote to reveal: {Object.values(voteStatus).filter(Boolean).length}/{Object.keys(voteStatus).length} voted
          </p>
          {!iHaveVoted && (
            <div className="flex gap-2">
              <button
                className="flex-1 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold disabled:opacity-40"
                disabled={busy}
                onClick={() => run(() => onCastVote(true))}
              >
                Yes, reveal
              </button>
              <button
                className="flex-1 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold disabled:opacity-40"
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

      {error && <p className="text-red-300 text-xs">{error}</p>}

      {gameState.roundHistory.length > 0 && (
        <details className="pt-1">
          <summary className="cursor-pointer text-white/50 text-[11px] uppercase tracking-wide">
            Round history ({gameState.roundHistory.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-white/70">
            {gameState.roundHistory.map((r) => (
              <li key={r.round}>
                Round {r.round}: {playerNames[r.declarerId] ?? r.declarerId} bid {r.bidAmount}, Hukum: {r.trumpSuit} —{" "}
                {r.contractSucceeded ? "made it" : "missed it"} ({r.teamTotal} pts)
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function TosScoreBoard(props: TosScoreBoardProps) {
  return (
    <div className="w-full lg:w-72 flex-shrink-0 text-white text-sm">
      <details className="lg:hidden bg-black/30 rounded-xl p-3" open={false}>
        <summary className="cursor-pointer font-bold text-white/90">
          Round {props.gameState.round} of {props.gameState.matchLength} · Scoreboard
        </summary>
        <div className="mt-3">
          <TosScoreBoardBody {...props} />
        </div>
      </details>

      <div className="hidden lg:block bg-black/30 rounded-xl p-3">
        <h3 className="font-bold mb-2 text-white/90">
          Round {props.gameState.round} of {props.gameState.matchLength}
        </h3>
        <TosScoreBoardBody {...props} />
      </div>
    </div>
  );
}