import { useState } from "react";
import type {
  RoomStateDTO,
  SuitDTO,
  TosCardDTO,
  TosGameStateDTO,
  TosLeaderboardRevealPayload,
  TosRankDTO,
  TosTrickResolvedPayload,
} from "../shared/socketEvents";
import { TosTable } from "../components/TosTable";
import { TosHand } from "../components/TosHand";
import { TosBiddingPanel } from "../components/TosBiddingPanel";
import { TosTrumpPartnerSelector } from "../components/TosTrumpPartnerSelector";
import { TosScoreBoard } from "../components/TosScoreBoard";
import { TosLeaderboardModal } from "../components/TosLeaderboardModal";
import { DealingOverlay } from "../components/DealingOverlay";
import { useTrickResolution } from "../hooks/useTrickResolution";

interface TosGameProps {
  gameState: TosGameStateDTO;
  roomState: RoomStateDTO;
  myPlayerId: string;
  lastTrick: TosTrickResolvedPayload | null;
  leaderboardReveal: TosLeaderboardRevealPayload | null;
  onDismissLeaderboardReveal: () => void;
  onPlaceBid: (amount: number) => Promise<unknown>;
  onPass: () => Promise<unknown>;
  onChooseTrumpAndPartner: (suit: SuitDTO, partnerCard: { suit: SuitDTO; rank: TosRankDTO }) => Promise<unknown>;
  onPlayCard: (card: TosCardDTO) => Promise<unknown>;
  onRequestVote: () => Promise<unknown>;
  onCastVote: (vote: boolean) => Promise<unknown>;
  onNextRound: () => Promise<unknown>;
  onLeaveRoom: () => void;
}

// Phases where the player already has cards dealt and should see them, even
// before it's their turn to act — only PLAYING actually lets you click one.
const HAND_VISIBLE_PHASES = new Set(["AUCTION", "TRUMP_AND_PARTNER_SELECTION", "PLAYING"]);

export function TosGame({
  gameState,
  roomState,
  myPlayerId,
  lastTrick,
  leaderboardReveal,
  onDismissLeaderboardReveal,
  onPlaceBid,
  onPass,
  onChooseTrumpAndPartner,
  onPlayCard,
  onRequestVote,
  onCastVote,
  onNextRound,
  onLeaveRoom,
}: TosGameProps) {
  const [playError, setPlayError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const playerNames = Object.fromEntries(roomState.players.map((p) => [p.id, p.name]));
  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId;
  const isDeclarer = gameState.declarerId === myPlayerId;

  // Holds each completed trick on screen for a few seconds (with a winner
  // banner) instead of it vanishing the instant the 4th card lands. Per-trick
  // point values are deliberately NOT shown here — captured points only
  // surface once the whole round is over (see TosScoreBoard).
  const { phase: trickPhase, activeTrick } = useTrickResolution(lastTrick);

  async function handlePlayCard(card: TosCardDTO) {
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

  if (gameState.phase === "MATCH_COMPLETE") {
    const standings = gameState.finalStandings
      ? Object.entries(gameState.finalStandings).sort(([, a], [, b]) => b - a)
      : [];
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-white">
        <h1 className="text-2xl font-bold mb-4">Match complete!</h1>
        <ul className="space-y-2 mb-6 w-full max-w-sm">
          {standings.map(([playerId, score], i) => (
            <li key={playerId} className="flex items-center justify-between bg-black/30 rounded px-4 py-2">
              <span>
                {i === 0 && "🏆 "}
                {playerNames[playerId] ?? playerId}
              </span>
              <span className="font-bold">{score}</span>
            </li>
          ))}
        </ul>
        <button className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold" onClick={onLeaveRoom}>
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-3 py-6 text-white gap-4">
      {leaderboardReveal && (
        <TosLeaderboardModal
          reveal={leaderboardReveal}
          playerNames={playerNames}
          onDismiss={onDismissLeaderboardReveal}
        />
      )}

      <div className="flex items-center justify-between w-full max-w-4xl">
        <h1 className="text-xl font-bold">Three of Spades — Round {gameState.round}</h1>
        <button className="text-sm text-white/40 hover:text-white/70" onClick={onLeaveRoom}>
          Leave room
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-4xl items-start justify-center">
        <div className="flex-1 flex flex-col items-center gap-4">
          <div className="relative w-full">
            <TosTable
              gameState={gameState}
              myPlayerId={myPlayerId}
              playerNames={playerNames}
              overrideTrick={trickPhase !== "idle" ? activeTrick?.cards ?? null : null}
              announceWinnerId={activeTrick?.winnerId ?? null}
              showWinnerBanner={trickPhase === "announcing"}
            />
            <DealingOverlay gameState={gameState as any} />
          </div>

          {gameState.phase === "AUCTION" && (
            <TosBiddingPanel
              gameState={gameState}
              myPlayerId={myPlayerId}
              playerNames={playerNames}
              onBid={onPlaceBid}
              onPass={onPass}
            />
          )}

          {gameState.phase === "TRUMP_AND_PARTNER_SELECTION" &&
            (isDeclarer ? (
              <TosTrumpPartnerSelector bidAmount={gameState.bidAmount} onChoose={onChooseTrumpAndPartner} />
            ) : (
              <p className="text-white/70 text-sm">
                Waiting for {playerNames[gameState.declarerId ?? ""] ?? "the declarer"} to choose trump and a
                partner…
              </p>
            ))}

          {gameState.phase === "ROUND_COMPLETE" && (
            <div className="bg-black/30 rounded-lg p-4 text-center">
              <p className="mb-2">
                Round {gameState.round} complete —{" "}
                {gameState.roundHistory[gameState.roundHistory.length - 1]?.contractSucceeded
                  ? "contract made!"
                  : "contract failed."}
              </p>
              <button
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold disabled:opacity-40"
                disabled={busy}
                onClick={() => handleAdvance(onNextRound)}
              >
                Start round {gameState.round + 1}
              </button>
            </div>
          )}

          {HAND_VISIBLE_PHASES.has(gameState.phase) && (
            <TosHand gameState={gameState} isMyTurn={isMyTurn} onPlay={handlePlayCard} />
          )}

          {playError && <p className="text-red-300 text-sm">{playError}</p>}
        </div>

        <TosScoreBoard
          gameState={gameState}
          myPlayerId={myPlayerId}
          playerNames={playerNames}
          onRequestVote={onRequestVote}
          onCastVote={onCastVote}
        />
      </div>
    </div>
  );
}