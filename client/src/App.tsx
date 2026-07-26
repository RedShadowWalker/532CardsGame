import { useSocket } from "./hooks/useSocket";
import { useGame } from "./hooks/useGame";
import { Home } from "./pages/Home";
import { SelectGame } from "./pages/SelectGame";
import { Lobby } from "./pages/Lobby";
import { Game } from "./pages/Game";
import { TosGame } from "./pages/TosGame";

function App() {
  const { socket, connected } = useSocket();
  const {
    session,
    roomState,
    gameState,
    lastTrick,
    tosGameState,
    tosLastTrick,
    tosLeaderboardReveal,
    dismissTosLeaderboardReveal,
    kickedMessage,
    dismissKickedMessage,
    myPlayerId,
    actions,
  } = useGame(socket, connected);

  if (kickedMessage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white px-4 text-center">
        <p className="text-xl font-semibold mb-2">You were removed from the room</p>
        <p className="text-white/60 mb-6">{kickedMessage}</p>
        <button
          className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 font-semibold"
          onClick={dismissKickedMessage}
        >
          Back to home
        </button>
      </div>
    );
  }

  const isHost = roomState?.players.find((p) => p.id === myPlayerId)?.isHost ?? false;

  return (
    <>
      {!connected && (
        <div className="fixed top-0 inset-x-0 bg-yellow-600 text-black text-center text-sm py-1 z-50">
          Reconnecting to server…
        </div>
      )}

      {!session || !roomState ? (
        <Home onCreateRoom={actions.createRoom} onJoinRoom={actions.joinRoom} />
      ) : !roomState.gameType ? (
        isHost ? (
          <SelectGame roomCode={roomState.roomCode} onSelectGame={actions.selectGame} onLeaveRoom={actions.leaveRoom} />
        ) : (
          <div className="min-h-screen flex flex-col items-center justify-center text-white px-4 text-center">
            <p className="text-lg">Waiting for the host to choose a game…</p>
          </div>
        )
      ) : roomState.status === "LOBBY" ? (
        <Lobby
          roomState={roomState}
          myPlayerId={myPlayerId!}
          onSetReady={actions.setReady}
          onStartGame={actions.startGame}
          onKickPlayer={actions.kickPlayer}
          onTransferHost={actions.transferHost}
          onLeaveRoom={actions.leaveRoom}
        />
      ) : roomState.gameType === "threeOfSpades" ? (
        tosGameState ? (
          <TosGame
            gameState={tosGameState}
            roomState={roomState}
            myPlayerId={myPlayerId!}
            lastTrick={tosLastTrick}
            leaderboardReveal={tosLeaderboardReveal}
            onDismissLeaderboardReveal={dismissTosLeaderboardReveal}
            onPlaceBid={actions.tosPlaceBid}
            onPass={actions.tosPass}
            onChooseTrumpAndPartner={actions.tosChooseTrumpAndPartner}
            onPlayCard={actions.tosPlayCard}
            onRequestVote={actions.tosRequestLeaderboardVote}
            onCastVote={actions.tosCastLeaderboardVote}
            onNextRound={actions.tosNextRound}
            onLeaveRoom={actions.leaveRoom}
          />
        ) : (
          <div className="min-h-screen flex items-center justify-center text-white">Loading game…</div>
        )
      ) : gameState ? (
        <Game
          gameState={gameState}
          roomState={roomState}
          myPlayerId={myPlayerId!}
          lastTrick={lastTrick}
          onChooseTrump={actions.chooseTrump}
          onSettleDebt={actions.settleDebt}
          onRespondToSettlement={actions.respondToSettlement}
          onPlayCard={actions.playCard}
          onNextRound={actions.nextRound}
          onLeaveRoom={actions.leaveRoom}
        />
      ) : (
        <div className="min-h-screen flex items-center justify-center text-white">Loading game…</div>
      )}
    </>
  );
}

export default App;