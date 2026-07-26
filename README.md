# Card Game Night

An online card game server hosting two games — pick one per room:

- **5-3-2**: 3 players, custom 30-card deck, trump assigned by rotation, a running hand-debt ledger settled between rounds.
- **Three of Spades**: 4 players, standard 52-card deck, auction bidding, a hidden partner chosen by the auction winner, point-capture scoring, and a hidden cumulative leaderboard revealed only by unanimous vote.

```
532-game/
  server/   Node + Express + Socket.IO backend (authoritative for both games)
  client/   React + TypeScript + Tailwind frontend
```

## Do you need a database?

**No.** Everything runs in memory on the server for as long as it's up — rooms,
hands, tricks, ledgers, cumulative scores. If the server restarts, active games
are lost and everyone needs a new room. That's the right tradeoff for a
friends game night, not a persistent platform.

## How a game works, end to end

1. Host opens the client, creates a room, and gets a 6-character code.
2. **The host picks a game** (5-3-2 or Three of Spades, plus a match length —
   7 or 10 rounds — for Three of Spades). The room isn't joinable until this
   happens; the choice locks in the seat count.
3. Friends join with the room code, everyone clicks **I'm ready** — the game
   starts automatically once every seat is full and ready (or the host can
   force-start early).
4. Play proceeds entirely server-validated; a client can propose an illegal
   move but the server always rejects it.
5. After a round completes, anyone can click through to the next round —
   scores/ledgers accumulate across rounds until the match ends (5-3-2 has no
   fixed end; Three of Spades ends after the chosen number of rounds).

## The rules, as implemented

### 5-3-2
- Trump rotates every round (no bidding) — round 1 is seat 0, round 2 seat 1, seat 2, then wraps.
- Dealer is always to the right of the Trump Player; targets are fixed by role: Trump Player needs 5 tricks, Left Player 3, Dealer 2.
- Deal happens in two stages (5, then 5 more) with trump chosen after only seeing the first 5.
- A hand-debt ledger settles between rounds: debts between the same two players always net together; a debtor picks Card Settlement (random card exchange) or Carry Forward per person they owe; once a player's total debt reaches 4 hands, Carry Forward is no longer available.

See `server/src/game/GameEngine.ts` and `Ledger.ts` for the exact logic and the documented reasoning behind the judgment calls the original spec left as narrative rather than algorithm (confirmed with whoever commissioned the build, not guessed).

### Three of Spades
- Auction: opens at 130, each raise must be at least +5, up to a max of 270; once you pass you're out for the round; last bidder standing is the declarer.
- Declarer names a trump suit and a **partner card** (e.g. "Ace of Clubs") — both are public immediately, but *who holds that card* stays secret until it's actually played.
- Standard follow-suit trick play; trick winner captures every point in that trick (Ace=15, K/Q/J/10=10, 5=5, 3 of Spades=30 uniquely, everything else 0 — totals 270 across the deck).
- Contract succeeds if declarer + partner's combined captured points meet the bid: declarer scores ±2× the bid, partner ±1×, defenders unaffected. Whether the contract succeeded is public immediately.
- **Cumulative scores stay hidden** the whole match — any player can request a leaderboard peek after a round, but it only actually reveals if all 4 players vote yes; otherwise play continues with scores still secret. Final standings are always revealed once the match's last round completes.

See `server/src/gameToS/ThreeOfSpadesEngine.ts` for the exact logic and documented assumptions (follow-suit/trick-winner rules and the auction's starting seat aren't restated in the original spec, but there's only one sensible reading given everything else in it).

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

Open `http://localhost:5173` in several browser tabs to test solo — 3 for 5-3-2, 4 for Three of Spades.

### Running the tests
```bash
cd server && npm test    # unit tests + real Socket.IO integration tests for both games
cd client && npm test    # hook logic + component interaction tests
```

## Deployment

Already set up on Railway (server) and Vercel (client) — nothing about this
update changes deployment configuration, only game logic and UI. If setting
up fresh:

- **Server → Railway**: root directory `server`, build `npm install && npm run build`, start `npm start`. Set `CLIENT_ORIGIN` to your Vercel URL once you have it.
- **Client → Vercel**: root directory `client`, framework Vite (auto-detected), env var `VITE_SERVER_URL` pointing at your Railway URL.

## Known judgment calls (confirmed or clearly forced, not guessed)

**5-3-2** (confirmed explicitly with whoever commissioned the build):
- The 4-hand max-debt cap applies to a player's *total* debt across everyone they owe, checked live at each decision — not a one-time snapshot, and not per-relationship.
- The settlement method (Card Settlement vs. Carry Forward) is chosen separately for each person owed.
- Debts between the same two players always net into one running balance — this is also what makes "extra tricks later settle a previous debt" work automatically.

**Three of Spades** (the spec didn't restate these, but there's no other sensible reading):
- Follow-suit is mandatory; highest trump (if any played) or highest of the led suit wins each trick — implicit in "trump suit" and "trick" meaning anything at all, and consistent with 5-3-2's own rules.
- The auction starts with the player left of the dealer, mirroring how the deal itself starts.
- If everyone passes with no bid ever placed (not addressed in the spec), the round redeals rather than getting stuck.
- If the declarer's own hand happens to hold their chosen partner card, they end up partnered with themselves — the spec doesn't forbid this, so it's allowed as a "solo" round (declarer's ±2× payout applies once, not double-counted).
