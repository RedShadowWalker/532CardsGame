import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Home } from "./Home";

describe("Home", () => {
  it("shows a validation error instead of calling onCreateRoom when name is empty", async () => {
    const onCreateRoom = vi.fn().mockResolvedValue(undefined);
    const onJoinRoom = vi.fn().mockResolvedValue(undefined);
    render(<Home onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />);

    await userEvent.click(screen.getByRole("button", { name: /create a room/i }));

    expect(await screen.findByText(/enter your name first/i)).toBeInTheDocument();
    expect(onCreateRoom).not.toHaveBeenCalled();
  });

  it("calls onCreateRoom with the trimmed name once one is entered", async () => {
    const onCreateRoom = vi.fn().mockResolvedValue(undefined);
    const onJoinRoom = vi.fn().mockResolvedValue(undefined);
    render(<Home onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />);

    await userEvent.type(screen.getByPlaceholderText("Alice"), "  Bob  ");
    await userEvent.click(screen.getByRole("button", { name: /create a room/i }));

    await waitFor(() => expect(onCreateRoom).toHaveBeenCalledWith("Bob"));
  });

  it("switches to join mode and calls onJoinRoom with the uppercased room code", async () => {
    const onCreateRoom = vi.fn().mockResolvedValue(undefined);
    const onJoinRoom = vi.fn().mockResolvedValue(undefined);
    render(<Home onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />);

    await userEvent.type(screen.getByPlaceholderText("Alice"), "Carol");
    await userEvent.click(screen.getByRole("button", { name: /join with a room code/i }));
    await userEvent.type(screen.getByPlaceholderText("ABCD12"), "abcd12");
    await userEvent.click(screen.getByRole("button", { name: /^join room$/i }));

    await waitFor(() => expect(onJoinRoom).toHaveBeenCalledWith("ABCD12", "Carol"));
  });

  it("surfaces an error message when the join call rejects", async () => {
    const onCreateRoom = vi.fn().mockResolvedValue(undefined);
    const onJoinRoom = vi.fn().mockRejectedValue(new Error("Room is full (4 players)."));
    render(<Home onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />);

    await userEvent.type(screen.getByPlaceholderText("Alice"), "Dave");
    await userEvent.click(screen.getByRole("button", { name: /join with a room code/i }));
    await userEvent.type(screen.getByPlaceholderText("ABCD12"), "FULL01");
    await userEvent.click(screen.getByRole("button", { name: /^join room$/i }));

    expect(await screen.findByText(/room is full/i)).toBeInTheDocument();
  });
});
