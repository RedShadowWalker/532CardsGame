# 5-3-2 Card Game

A 3-player online implementation of the 5-3-2 card game, built to an exact
house-rules specification: a custom 30-card deck, trump assigned by
rotation (not bidding), and a running hand-debt ledger settled between
rounds.

```
532-game/
  server/   Node + Express + Socket.IO backend (authoritative game engine)
  client/   React + TypeScript + Tailwind frontend
```

## Do you need a database?

**No.** Everything runs in memory on the server for as long as it's up —
rooms, hands, the trick count, and the running debt ledger. If the server
restarts, active games are lost and everyone needs a new room. That's the
right tradeoff for a friends game night, not a persistent platform.

## The rules, as implemented

- **Exactly 3 players**, no teams.
- **Custom 30-card deck**: Spades and Hearts carry all 8 ranks (7,8,9,10,J,Q,K,A);
  Diamonds and Clubs carry only 7 (no 7 of Diamonds/Clubs exists).
- **Trump rotates every round** — round 1 is seat 0, round 2 is seat 1, round 3 is
  seat 2, then back to seat 0. The Trump Player directly names the suit — there's
  no bidding auction in this variant.
- **Dealer is always the player to the right of the Trump Player**; the player to
  their left gets the Left Player role. Targets are fixed by role: Trump Player
  needs 5 tricks, Left Player needs 3, Dealer needs 2.
- **Deal happens in two stages**: 5 cards each (trump is chosen having seen only
  these), then 5 more once trump is set — 10 cards total, deck fully exhausted.
- **Hand-debt settlement**, between the second deal and the first trick, for any
  debts left over from previous rounds:
  - Debts between the same two players always net into a single running balance.
  - A debtor picks Card Settlement (a random card exchange the creditor can keep
    — returning a different card, never their last of a suit — or reject) or
    Carry Forward, decided separately for each person they owe.
  - Once a player's *total* debt (summed across everyone they owe) reaches 4
    hands, Carry Forward is no longer available — Card Settlement is forced.
- **Standard trick play**: follow suit if you can; if you can't, play anything,
  including trump; highest trump (if any was played) or highest of the led suit
  wins; trick winner leads next.
- **Round end**: each player's tricks-won-minus-target difference is computed;
  players who beat their target snatch hands from players who missed theirs;
  the ledger updates accordingly, trump rotates, and the next round begins.

Every one of these rules is implemented and tested in
`server/src/game/` — see `GameEngine.ts`, `Ledger.ts`, and `Seating.ts` for the
exact logic and the reasoning behind a couple of judgment calls the original
spec described narratively without pinning down as an algorithm (documented
inline, and confirmed with the person who commissioned this build).

## Local development

**Server:**
```bash
cd server
npm install
npm run dev        # starts on http://localhost:3001
```

**Client:**
```bash
cd client
npm install
cp .env.example .env    # then edit VITE_SERVER_URL if needed (defaults to localhost:3001)
npm run dev              # starts on http://localhost:5173
```

Open `http://localhost:5173` in three browser tabs to test solo — create a
room in one, join with the code in the other two.

### Running the tests
```bash
cd server && npm test    # unit tests + a real Socket.IO integration test
cd client && npm test    # hook logic + component interaction tests
```

## Deployment

Already set up on Railway (server) and Vercel (client) — this update only
changes game logic and UI, not deployment configuration. If you're setting
it up fresh:

- **Server → Railway**: root directory `server`, build `npm install && npm run build`,
  start `npm start`. Set `CLIENT_ORIGIN` to your Vercel URL once you have it
  (locks down Socket.IO's CORS to just your frontend).
- **Client → Vercel**: root directory `client`, framework Vite (auto-detected),
  env var `VITE_SERVER_URL` pointing at your Railway URL.

## How a game works, end to end

1. Host creates a room, gets a 6-character code; two friends join with it.
2. Everyone clicks **I'm ready** — the game starts automatically once all 3
   are ready (no one has to click "start"), or the host can force-start early.
3. First 5 cards are dealt; the Trump Player (rotates each round) names the suit;
   the remaining 5 are dealt, bringing everyone to 10.
4. If any hand debts are pending from previous rounds, each debtor works through
   them one at a time (Card Settlement or Carry Forward) before play begins.
5. Trump Player leads the first trick; play proceeds with mandatory follow-suit,
   validated entirely server-side.
6. After 10 tricks, targets are checked, the ledger updates, and anyone can click
   **Start next round** to keep going — trump has rotated to the next seat.

## Known judgment calls (confirmed, not guessed)

The original spec described the settlement/ledger system narratively without
fully specifying it as an algorithm. These three points were confirmed
explicitly rather than assumed:

- The 4-hand max-debt cap applies to a player's **total** debt across everyone
  they owe, not per relationship.
- The settlement method (Card Settlement vs. Carry Forward) is chosen
  **separately for each person owed**, not once for everything.
- Debts between the same two players **always net** into one running balance
  — this is also what makes "extra tricks later settle a previous debt" (spec
  section 11) work automatically, with no separate mechanic needed.

See the doc comments at the top of `server/src/game/Ledger.ts` for the full
reasoning.
