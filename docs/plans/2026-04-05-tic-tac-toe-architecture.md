# Architecture Note

## Summary
Build one standard Sails program with one exported gameplay service. Program-owned state stores lobbies, matches, and leaderboard entries. The frontend uses the generated IDL client for all program interactions and drops to `@gear-js/api` only for voucher issuance and wrapping.

## Program And Service Boundaries
- `#[program] TicTacToeProgram` exposes one constructor and one `game()` service
- `#[service] TicTacToeService` owns all public commands, queries, and event emission
- No separate token or sponsor contract is needed because voucher support is chain-native and frontend-driven

## State Ownership
- Program-owned state
- `next_lobby_id: u64`
- `next_match_id: u64`
- `lobbies: BTreeMap<u64, Lobby>`
- `matches: BTreeMap<u64, Match>`
- `active_match_by_player: BTreeMap<ActorId, u64>`
- `leaderboard: BTreeMap<ActorId, PlayerStats>`
- `leaderboard_finalized_matches: BTreeSet<u64>` guard to avoid double counting

## Message Flow
- Host calls `create_lobby`; program stores an open lobby and emits `LobbyCreated`
- Guest calls `join_lobby`; program converts the lobby into a live match with X/O assignments and emits `LobbyJoined`
- In each round both players call `commit_move` with a precomputed hash
- After both commits, each player calls `reveal_move` with `cell` and `salt`
- `settle_round` verifies both reveals, applies simultaneous move rules, computes terminal status, emits `RoundSettled`, and if finished emits `MatchFinished` plus `LeaderboardUpdated`
- `forfeit_match` provides a manual exit path when a player quits

## Routing And Public Interface
- Existing public routes that must remain stable
  - None, greenfield app
- New routes introduced by this release
  - Lobby: `CreateLobby`, `JoinLobby`, `CancelLobby`, `OpenLobbies`
  - Match commands: `CommitMove`, `RevealMove`, `SettleRound`, `ForfeitMatch`
  - Match queries: `MatchById`, `ActiveMatchByPlayer`
  - Leaderboard queries: `Leaderboard`, `PlayerStats`
- Any intentionally deprecated routes
  - None
- Whether any method signature or reply shape changes are proposed
  - Not applicable, greenfield

## Event Contract
- Existing events that must remain stable
  - None
- Any new event surface introduced by this release
  - Lobby, round, and finalization events listed in the spec
- Whether any existing event payload changes are proposed
  - Not applicable
- Whether event versioning is required
  - No for v1

## Generated Client Or IDL Impact
- Does this release require IDL regeneration
  - Yes, after contract implementation changes
- Which clients, scripts, or tools consume the IDL
  - React frontend and local smoke helpers
- Whether old and new generated clients must coexist during cutover
  - No, greenfield

## Contract Version And Status Surface
- How the contract exposes version information
  - `version()` query returns a static `u32` or string constant for frontend display
- Whether the contract has lifecycle status such as `Active` or `ReadOnly`
  - Match-level status only: lobby open, active round, finished, cancelled
- Whether old-version writes must be disabled after cutover
  - Not applicable

## Off-Chain Components
- Frontend program-id and config impact
  - `.env` holds Vara endpoint and deployed program id
- Indexer subscription or decoder impact
  - Frontend can subscribe to typed events for live match refresh; no dedicated indexer required for v1
- Any automation or scripts affected by the new version
  - Voucher issue helper for local/dev gasless mode
  - Local smoke deploy/call script

## Release And Cutover Plan
- Deploy order
  - Build contract, run `gtest`, deploy `.opt.wasm`, then configure frontend env
- Frontend switch strategy
  - Point frontend to the new program id after successful local deploy
- Indexer switch strategy
  - Not applicable
- Whether the old version remains queryable
  - Not applicable
- Whether writes to the old version are disabled
  - Not applicable

## Failure And Recovery Paths
- Rollback target
  - Revert to previous local build or previous deployed program id
- How to revert frontend and indexer back to the previous version
  - Reset env vars to prior program id and rebuild frontend
- What happens if the new version is deployed but not adopted
  - Existing deployment remains idle; no migration needed

## Open Questions
- Use manual `settle_round` rather than automatic settlement after second reveal to keep execution predictable and testable
- Voucher support stays voucher-only for v1; no signless session flow
