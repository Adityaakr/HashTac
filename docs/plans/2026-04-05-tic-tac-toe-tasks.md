# Task Plan

## Goal
Ship a greenfield Vara Sails tic-tac-toe app with simultaneous commit/reveal rounds, leaderboard tracking, a React frontend, `gtest`, local smoke, and voucher-backed gasless support.

## Preconditions
- Rust toolchain, Wasm targets, `cargo-sails`, and `gear` installed
- Node and npm available
- Local Vara node available for smoke

## Ordered Tasks
1. Bootstrap the standard Sails workspace with `cargo sails new`
2. Replace template program/client/test logic with tic-tac-toe domain types and service methods
3. Implement match state machine, hash verification, settlement rules, and leaderboard updates
4. Build the program to generate IDL and typed clients
5. Add `gtest` coverage for lobby creation, match play, invalid reveals, draws, forfeits, and leaderboard updates
6. Scaffold the React frontend from the generated IDL and customize screens for lobby, gameplay, leaderboard, and wallet states
7. Add voucher-aware transaction handling and local sponsor helper flows
8. Run build/tests and record the gtest report plus local smoke steps

## Dependencies
- Generated IDL depends on a successful Rust build
- Frontend scaffold depends on the generated IDL
- Local smoke depends on green `gtest`

## Verification Steps
- `cargo test`
- target contract build producing `.idl` and `.opt.wasm`
- frontend build
- local deploy/query/command path on a node
- voucher issuance and one voucher-backed command

## Review Checkpoints
- Match rules are deterministic and documented
- Hash input domain includes player, match, and round to prevent replay
- Leaderboard cannot double count the same match
- Frontend handles missing wallet, missing account, and missing voucher states explicitly

## Rollback Notes
- Revert to last known good contract commit if rule changes break tests
- Keep voucher flow isolated to frontend helpers so gameplay contract changes remain independent
