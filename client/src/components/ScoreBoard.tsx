import type { GameStateDTO } from "../shared/socketEvents";
import { PlayerAvatar } from "./PlayerAvatar";

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

function ScoreBoardBody({ gameState, playerNames }: ScoreBoardProps) {
  return (
    <div className="space-y-2">
      {gameState.players.map((playerId) => {
        const target = gameState.targets[playerId] ?? 0;
        const won = gameState.tricksWon[playerId] ?? 0;
        const isTrump = playerId === gameState.trumpPlayerId;
        const name = playerNames[playerId] ?? playerId;
        return (
          <div
            key={playerId}
            className={[
              "flex items-center gap-3 rounded-lg px-3 py-2",
              isTrump ? "bg-amber-600/20 ring-1 ring-amber-400/40" : "bg-white/5",
            ].join(" ")}
          >
            <PlayerAvatar playerId={playerId} name={name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {name}
                {isTrump ? <span className="text-amber-300 text-xs ml-1">Hukum</span> : null}
              </p>
              <p className="text-[11px] text-white/50">Target {target}</p>
            </div>
            <p className="text-lg font-bold text-white tabular-nums">{won}</p>
          </div>
        );
      })}

      <div className="pt-1">
        <h4 className="font-semibold mb-1 text-white/70 text-[11px] uppercase tracking-wide">Hand ledger</h4>
        <LedgerList ledger={gameState.ledger} playerNames={playerNames} />
      </div>

      {gameState.roundHistory.length > 0 && (
        <details className="pt-1">
          <summary className="cursor-pointer text-white/50 text-[11px] uppercase tracking-wide">
            Round history ({gameState.roundHistory.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-white/70">
            {gameState.roundHistory.map((r) => (
              <li key={r.round}>
                Round {r.round}: {playerNames[r.trumpPlayerId] ?? r.trumpPlayerId} declared Hukum: {r.trumpSuit}
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

export function ScoreBoard(props: ScoreBoardProps) {
  return (
    <div className="w-full lg:w-72 flex-shrink-0">
      {/* Mobile: collapsible drawer so it doesn't eat vertical space by
          default. Desktop: always expanded, matching the sidebar layout. */}
      <details className="lg:hidden bg-black/30 rounded-xl p-3 text-white text-sm" open={false}>
        <summary className="cursor-pointer font-bold text-white/90">
          Round {props.gameState.round} · Scoreboard
        </summary>
        <div className="mt-3">
          <ScoreBoardBody {...props} />
        </div>
      </details>

      <div className="hidden lg:block bg-black/30 rounded-xl p-3 text-white text-sm">
        <h3 className="font-bold mb-2 text-white/90">Round {props.gameState.round}</h3>
        <ScoreBoardBody {...props} />
      </div>
    </div>
  );
}