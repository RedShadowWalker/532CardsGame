import { useState } from "react";
import type { CardDTO, GameStateDTO, RoomStateDTO, SuitDTO, TrickResolvedPayload } from "../shared/socketEvents";
import { Table } from "../components/Table";
import { Hand } from "../components/Hand";
import { TrumpSelector } from "../components/TrumpSelector";
import { SettlementPanel } from "../components/SettlementPanel";
import { ScoreBoard } from "../components/ScoreBoard";
import { DealingOverlay } from "../components/DealingOverlay";
import { useTrickResolution } from "../hooks/useTrickResolution";

interface GameProps {
  gameState: GameStateDTO;
  roomState: RoomStateDTO;
  myPlayerId: string;
  lastTrick: TrickResolvedPayload | null;
  onChooseTrump: (suit: SuitDTO) => Promise<unknown>;
  onSettleDebt: (creditorId: string, method: "card" | "carryForward") => Promise<unknown>;
  onRespondToSettlement: (action: "keep" | "reject", returnCard?: CardDTO) => Promise<unknown>;
  onPlayCard: (card: CardDTO) => Promise<unknown>;
  onNextRound: () => Promise<unknown>;
  onLeaveRoom: () => void;
}

// Phases where the player already has cards in hand and should see them,
// even though it's not their turn to play yet (they were dealt 5 cards
// before Hukum is even declared, and settlement also happens with a full
// 10-card hand) — only PLAYING actually lets you click a card.
const HAND_VISIBLE_PHASES = new Set(["TRUMP_SELECTION", "SETTLEMENT", "PLAYING"]);

export function Game({
  gameState,
  roomState,
  myPlayerId,
  lastTrick,
  onChooseTrump,
  onSettleDebt,
  onRespondToSettlement,
  onPlayCard,
  onNextRound,
  onLeaveRoom,
}: GameProps) {
  const [playError, setPlayError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const playerNames = Object.fromEntries(roomState.players.map((p) => [p.id, p.name]));
  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId;
  const isTrumpPlayer = gameState.trumpPlayerId === myPlayerId;

  // Holds the last completed hand on screen for a few seconds (with a
  // winner banner) instead of it vanishing the instant the 4th card lands.
  const { phase: trickPhase, activeTrick } = useTrickResolution(lastTrick);

  async function handlePlayCard(card: CardDTO) {
    setPlayError(null);
    try {
      await onPlayCard(card);
    } catch (err) {
      setPlayError((err as Error).message);
    }
  }

  async function handleAdvance(action: () => Promise<unknown>) {
    setBusy(true);
    setPlayError(null);
    try {
      await action();
    } catch (err) {
      setPlayError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="felt-table wood-frame min-h-screen flex flex-col items-center px-3 py-4 text-white gap-3">
      {/* Settlement is a hard gate before play resumes — shown as a blocking
          modal so it's impossible to miss and can't be dismissed until the
          debtor(s) actually resolve every pending item. */}
      {gameState.phase === "SETTLEMENT" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <SettlementPanel
            gameState={gameState}
            myPlayerId={myPlayerId}
            playerNames={playerNames}
            onSettleDebt={onSettleDebt}
            onRespondToSettlement={onRespondToSettlement}
          />
        </div>
      )}

      <div className="flex items-center justify-between w-full max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight">5-3-2</h1>
        <button
          className="flex items-center gap-1 text-xs font-semibold text-red-300 border border-red-400/50 rounded-full px-3 py-1 hover:bg-red-500/10"
          onClick={onLeaveRoom}
        >
          🚪 Leave Room
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-4xl items-start justify-center">
        <div className="flex-1 flex flex-col items-center gap-4 w-full">
          <div className="relative w-full flex flex-col items-center">
            <Table
              gameState={gameState}
              myPlayerId={myPlayerId}
              playerNames={playerNames}
              overrideTrick={trickPhase !== "idle" ? activeTrick?.cards ?? null : null}
              announceWinnerId={activeTrick?.winnerId ?? null}
              showWinnerBanner={trickPhase === "announcing"}
            />
            <DealingOverlay gameState={gameState} />
          </div>

          {gameState.phase === "TRUMP_SELECTION" &&
            (isTrumpPlayer ? (
              <TrumpSelector onChoose={onChooseTrump} />
            ) : (
              <p className="text-white/70 text-sm">
                Waiting for {playerNames[gameState.trumpPlayerId ?? ""] ?? "the Hukum caller"} to declare Hukum…
              </p>
            ))}

          {gameState.phase === "ROUND_COMPLETE" && (
            <div className="animate-banner-in bg-panel/90 border border-white/10 rounded-xl p-5 text-center shadow-xl">
              <p className="text-xs uppercase tracking-widest text-white/50 mb-1">Round Complete</p>
              <p className="text-lg font-bold mb-3">Round {gameState.round}</p>
              <button
                className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-500 font-semibold disabled:opacity-40"
                disabled={busy}
                onClick={() => handleAdvance(onNextRound)}
              >
                Start round {gameState.round + 1}
              </button>
            </div>
          )}

          {HAND_VISIBLE_PHASES.has(gameState.phase) && (
            <Hand gameState={gameState} isMyTurn={isMyTurn} onPlay={handlePlayCard} />
          )}

          {playError && <p className="text-red-300 text-sm">{playError}</p>}
        </div>

        <ScoreBoard gameState={gameState} playerNames={playerNames} />
      </div>
    </div>
  );
}