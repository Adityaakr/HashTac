# Feature Spec

## Problem
Standard on-chain turn-based games expose moves before they settle, which enables copycat play and removes hidden-information gameplay. The app also needs a low-friction entry path for users who do not hold VARA for gas.

## User Goal
Two players can create or join a tic-tac-toe match, submit hidden hashed moves, reveal them, settle the board state on-chain, and see persistent leaderboard results from a wallet-connected React frontend. Users can also play through a sponsored voucher-backed gasless path.

## In Scope
- Sails program for lobby, match lifecycle, commit/reveal rounds, winner settlement, and leaderboard accounting
- Simultaneous-move tic-tac-toe rounds where both players commit a move hash, then reveal the chosen cell with salt
- Match creation, join, cancel before start, commit, reveal, settle round, and query methods
- Events for lobby and match updates
- React frontend with wallet connect, lobby, match screen, commit/reveal UX, and leaderboard
- Voucher-backed gasless transaction path in the frontend
- `gtest` coverage for core flows
- Local smoke instructions/scripts for deploy, basic play, and voucher use

## Out of Scope
- Token wagers or escrow
- Matchmaking fees, ranking decay, or tournament brackets
- Off-chain backend sponsor service beyond local/dev voucher issuance helpers
- Signless session keys

## Actors
- Host: creates a lobby and starts as player X
- Guest: joins a lobby and plays as player O
- Sponsor: issues vouchers for gasless mode in local/dev flows
- Viewer: reads lobby, match, and leaderboard state

## State Changes
- Create open lobby
- Join lobby and initialize active match
- Record per-round commitments for both players
- Record reveal payloads and verify hashes
- Apply valid simultaneous moves to the board
- Mark round completion, win, draw, timeout, or invalid reveal loss
- Increment leaderboard totals for wins, losses, draws, matches played

## Messages And Replies
- `create_lobby() -> lobby_id`
- `join_lobby(lobby_id) -> match_id`
- `cancel_lobby(lobby_id)`
- `commit_move(match_id, round, hash)`
- `reveal_move(match_id, round, cell, salt)`
- `settle_round(match_id)`
- `forfeit_match(match_id)`
- `gasless_hint(account)` query surface for frontend voucher UX hints if needed
- Queries for open lobbies, match details, player active match, leaderboard, and player stats

## Events
- `LobbyCreated`
- `LobbyJoined`
- `LobbyCancelled`
- `MoveCommitted`
- `MoveRevealed`
- `RoundSettled`
- `MatchFinished`
- `LeaderboardUpdated`

## Invariants
- Only the two registered players can act on a match
- Each player can submit at most one commitment and one reveal per round
- A reveal is valid only if `hash(cell, salt, player, match_id, round)` matches the stored commitment
- Board cells cannot be overwritten
- Round settlement is deterministic from stored commits and reveals
- Leaderboard updates happen exactly once per finished match

## Edge Cases
- Both players reveal the same empty cell in the same round: conflict, no mark placed for that cell
- A player reveals an occupied cell: invalid reveal, that player loses the match
- One player commits but the other does not: settlement stays blocked until both commits exist or a forfeit path is used
- One player commits and both commit, but only one reveals: settlement stays blocked until both reveals exist or a forfeit path is used
- Both players form a winning line in the same simultaneous round: draw
- Board fills without a winner: draw

## Acceptance Criteria
- Users can create and join a match from the frontend with Vara wallets
- Each round requires both commit hashes before reveal
- Contract rejects invalid reveal payloads and duplicate actions
- Round settlement updates board state and match status correctly
- Final results update a persistent leaderboard
- Frontend exposes disabled, pending, success, and error states for each write action
- Voucher-backed mode can wrap match transactions without requiring the player to spend VARA in local smoke
- `gtest` covers happy paths and failure paths
- Local smoke demonstrates deploy, one match interaction, and one voucher-backed transaction
