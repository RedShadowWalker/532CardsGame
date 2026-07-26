import type { TosLeaderboardRevealPayload } from "../shared/socketEvents";

interface TosLeaderboardModalProps {
  reveal: TosLeaderboardRevealPayload;
  playerNames: Record<string, string>;
  onDismiss: () => void;
}

export function TosLeaderboardModal({ reveal, playerNames, onDismiss }: TosLeaderboardModalProps) {
  const standings = reveal.standings ? Object.entries(reveal.standings).sort(([, a], [, b]) => b - a) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-slate-900 rounded-xl p-6 w-full max-w-sm text-white text-center border border-white/10">
        {standings ? (
          <>
            <h2 className="text-lg font-bold mb-4">Leaderboard revealed!</h2>
            <ul className="space-y-2 mb-4">
              {standings.map(([playerId, score], i) => (
                <li key={playerId} className="flex items-center justify-between bg-white/5 rounded px-3 py-2">
                  <span>
                    {i === 0 && "🏆 "}
                    {playerNames[playerId] ?? playerId}
                  </span>
                  <span className="font-bold">{score}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-2">Standings stay hidden</h2>
            <p className="text-white/60 text-sm mb-4">
              Not everyone agreed to reveal — the vote wasn't unanimous, so scores remain a secret.
            </p>
          </>
        )}
        <button className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold" onClick={onDismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
