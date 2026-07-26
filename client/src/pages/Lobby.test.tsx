import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Lobby } from "./Lobby";
import type { RoomStateDTO } from "../shared/socketEvents";

function makeRoomState(overrides: Partial<RoomStateDTO> = {}): RoomStateDTO {
  return {
    roomCode: "ABCD12",
    hostId: "p1",
    gameType: "532",
    matchLength: null,
    maxPlayers: 3,
    status: "LOBBY",
    allReady: false,
    canStart: false,
    players: [
      { id: "p1", name: "Alice", connected: true, ready: false, isHost: true },
      { id: "p2", name: "Bob", connected: true, ready: false, isHost: false },
    ],
    ...overrides,
  };
}

const noop = {
  onSetReady: vi.fn().mockResolvedValue(undefined),
  onStartGame: vi.fn().mockResolvedValue(undefined),
  onKickPlayer: vi.fn().mockResolvedValue(undefined),
  onTransferHost: vi.fn().mockResolvedValue(undefined),
  onLeaveRoom: vi.fn(),
};

describe("Lobby", () => {
  it("shows the room code and both seated players", () => {
    render(<Lobby roomState={makeRoomState()} myPlayerId="p1" {...noop} />);
    expect(screen.getByText(/room abcd12/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it("shows host controls (kick, make host) for the host, not for a non-host", () => {
    const { rerender } = render(<Lobby roomState={makeRoomState()} myPlayerId="p1" {...noop} />);
    // Host viewing the lobby sees a kick control for the other player.
    expect(screen.getByTitle(/remove player/i)).toBeInTheDocument();
    expect(screen.getByTitle(/make host/i)).toBeInTheDocument();

    rerender(<Lobby roomState={makeRoomState()} myPlayerId="p2" {...noop} />);
    // Non-host viewing the lobby sees no host controls at all.
    expect(screen.queryByTitle(/remove player/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/make host/i)).not.toBeInTheDocument();
  });

  it("calls onSetReady(true) when the not-ready player clicks the ready button", async () => {
    const onSetReady = vi.fn().mockResolvedValue(undefined);
    render(<Lobby roomState={makeRoomState()} myPlayerId="p1" {...noop} onSetReady={onSetReady} />);

    await userEvent.click(screen.getByRole("button", { name: /i'm ready/i }));
    expect(onSetReady).toHaveBeenCalledWith(true);
  });

  it("calls onKickPlayer with the target's id when the host clicks remove", async () => {
    const onKickPlayer = vi.fn().mockResolvedValue(undefined);
    render(<Lobby roomState={makeRoomState()} myPlayerId="p1" {...noop} onKickPlayer={onKickPlayer} />);

    await userEvent.click(screen.getByTitle(/remove player/i));
    expect(onKickPlayer).toHaveBeenCalledWith("p2");
  });

  it("disables the host's manual start button until the room is full", () => {
    const { rerender } = render(<Lobby roomState={makeRoomState({ canStart: false })} myPlayerId="p1" {...noop} />);
    expect(screen.getByRole("button", { name: /start now/i })).toBeDisabled();

    rerender(<Lobby roomState={makeRoomState({ canStart: true })} myPlayerId="p1" {...noop} />);
    expect(screen.getByRole("button", { name: /start now/i })).toBeEnabled();
  });

  it("shows the auto-start message once everyone is ready", () => {
    render(<Lobby roomState={makeRoomState({ allReady: true })} myPlayerId="p1" {...noop} />);
    expect(screen.getByText(/everyone's ready — starting/i)).toBeInTheDocument();
  });
});
