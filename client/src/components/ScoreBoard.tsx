import type { GameStateDTO } from "../shared/socketEvents";

interface ScoreBoardProps {
  gameState: GameStateDTO;
  playerNames: Record<string, string>;
}

/** Renders the running hand-debt ledger as a short "X owes Y: N" list. */
function LedgerList({
  ledger,
  playerNames,
}: {
  ledger: Record<string, Record<string, number>>;
  playerNames: Record<string, string>;
}) {
  const entries: { debtor: string; creditor: string; amount: number }[] = [];
  Object.entries(ledger).forEach(([debtor, creditors]) => {
    Object.entries(creditors).forEach(([creditor, amount]) => {
      if (amount > 0) entries.push({ debtor, creditor, amount });
    });
  });

  if (entries.length === 0) {
    return <p className="text-white/50 text-xs italic">No outstanding hand debts.</p>;
  }

  return (
    <ul className="space-y-1 text-xs text-white/80">
      {entries.map((e) => (
        <li key={`${e.debtor}-${e.creditor}`}>
          {playerNames[e.debtor] ?? e.debtor} owes {playerNames[e.creditor] ?? e.creditor}:{" "}
          <span className="font-semibold">{e.amount}</span> hand{e.amount === 1 ? "" : "s"}
        </li>
      ))}
    </ul>
  );
}

export function ScoreBoard({ gameState, playerNames }: ScoreBoardProps) {
  return (
    <div className="bg-black/30 rounded-lg p-3 text-white text-sm w-full max-w-xs">
      <h3 className="font-semibold mb-2 text-white/80">Round {gameState.round}</h3>

      <table className="w-full text-left mb-3">
        <thead>
          <tr className="text-white/50 text-xs">
            <th className="pb-1">Player</th>
            <th className="pb-1 text-right">Target</th>
            <th className="pb-1 text-right">Won</th>
          </tr>
        </thead>
        <tbody>
          {gameState.players.map((playerId) => {
            const target = gameState.targets[playerId] ?? 0;
            const won = gameState.tricksWon[playerId] ?? 0;
            const isTrump = playerId === gameState.trumpPlayerId;
            const isDealer = playerId === gameState.dealerId;
            return (
              <tr key={playerId} className={isTrump ? "text-yellow-300" : ""}>
                <td className="py-0.5">
                  {playerNames[playerId] ?? playerId}
                  {isTrump && " (trump)"}
                  {isDealer && " (dealer)"}
                </td>
                <td className="py-0.5 text-right">{target}</td>
                <td className="py-0.5 text-right font-semibold">{won}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h4 className="font-semibold mb-1 text-white/80 text-xs">Hand ledger</h4>
      <LedgerList ledger={gameState.ledger} playerNames={playerNames} />

      {gameState.roundHistory.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-white/60 text-xs">
            Round history ({gameState.roundHistory.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-white/70">
            {gameState.roundHistory.map((r) => (
              <li key={r.round}>
                Round {r.round}: {playerNames[r.trumpPlayerId] ?? r.trumpPlayerId} called {r.trumpSuit}
                {r.snatches.length > 0 && (
                  <>
                    {" — "}
                    {r.snatches
                      .map(
                        (s) =>
                          `${playerNames[s.debtor] ?? s.debtor} owes ${playerNames[s.creditor] ?? s.creditor} ${s.amount}`
                      )
                      .join(", ")}
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
