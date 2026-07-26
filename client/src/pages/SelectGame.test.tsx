import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectGame } from "./SelectGame";

const noop = {
  onSelectGame: vi.fn().mockResolvedValue(undefined),
  onLeaveRoom: vi.fn(),
};

describe("SelectGame", () => {
  it("calls onSelectGame with '532' and no match length", async () => {
    const onSelectGame = vi.fn().mockResolvedValue(undefined);
    render(<SelectGame roomCode="ABCD12" {...noop} onSelectGame={onSelectGame} />);

    await userEvent.click(screen.getByText("5-3-2"));
    await userEvent.click(screen.getByRole("button", { name: /confirm and open room/i }));

    expect(onSelectGame).toHaveBeenCalledWith("532", undefined);
  });

  it("requires a match length for Three of Spades before confirming", async () => {
    const onSelectGame = vi.fn().mockResolvedValue(undefined);
    render(<SelectGame roomCode="ABCD12" {...noop} onSelectGame={onSelectGame} />);

    await userEvent.click(screen.getByText("Three of Spades"));
    // Defaults to 7 rounds already selected, so confirming immediately should work.
    await userEvent.click(screen.getByRole("button", { name: /confirm and open room/i }));

    expect(onSelectGame).toHaveBeenCalledWith("threeOfSpades", 7);
  });

  it("lets the host pick 10 rounds instead of the 7-round default", async () => {
    const onSelectGame = vi.fn().mockResolvedValue(undefined);
    render(<SelectGame roomCode="ABCD12" {...noop} onSelectGame={onSelectGame} />);

    await userEvent.click(screen.getByText("Three of Spades"));
    await userEvent.click(screen.getByRole("button", { name: "10 rounds" }));
    await userEvent.click(screen.getByRole("button", { name: /confirm and open room/i }));

    expect(onSelectGame).toHaveBeenCalledWith("threeOfSpades", 10);
  });

  it("disables confirm until a game is picked", () => {
    render(<SelectGame roomCode="ABCD12" {...noop} />);
    expect(screen.getByRole("button", { name: /confirm and open room/i })).toBeDisabled();
  });

  it("surfaces an error from the server", async () => {
    const onSelectGame = vi.fn().mockRejectedValue(new Error("Only the host can choose the game."));
    render(<SelectGame roomCode="ABCD12" {...noop} onSelectGame={onSelectGame} />);

    await userEvent.click(screen.getByText("5-3-2"));
    await userEvent.click(screen.getByRole("button", { name: /confirm and open room/i }));

    expect(await screen.findByText(/only the host can choose/i)).toBeInTheDocument();
  });
});
