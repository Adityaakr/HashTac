# HashTac

HashTac is an on-chain tic-tac-toe game for Vara built with Sails. Each round uses a commit / reveal flow so players lock in hashed moves first, reveal later, and let the contract settle collisions, invalid reveals, wins, draws, and forfeits deterministically on-chain.

## What It Includes

- Sails smart contract for lobby creation, match state, commit / reveal validation, round settlement, and leaderboard updates
- Rust client crate and generated IDL for typed calls
- `gtest` coverage for the core gameplay paths
- React frontend with wallet connect, lobby flow, board UI, reveal secret storage, and leaderboard views
- Voucher-backed gasless mode for sponsored transactions

## Gameplay Flow

1. Player A opens a lobby.
2. Player B joins the lobby and activates a match.
3. Each player selects a cell and submits a SHA-256 commitment for that move.
4. Both players reveal the cell and salt they committed to.
5. The contract verifies both reveals, applies the round atomically, and updates the board.
6. When the match is finished, player stats and leaderboard records are finalized on-chain.

The move commitment is derived from the SCALE-equivalent payload:

```text
(match_id, round, player, cell, salt[32])
```

The frontend mirrors the same encoding before hashing so the reveal path matches contract verification exactly.

## Workspace Layout

- `app` - Sails program logic and service definitions
- `client` - generated Rust client crate and IDL
- `tests` - `gtest` integration coverage
- `frontend/frontend` - React app for wallet, lobby, board, and gasless UX
- `docs/plans` - spec, architecture, and implementation notes

## Local Development

### Contract tests

```bash
cargo test --test gtest -- --nocapture
```

### Frontend build

```bash
cd frontend/frontend
npm install
npm run build
```

### Frontend preview

```bash
cd frontend/frontend
npm run preview
```

## Frontend Configuration

Create `frontend/frontend/.env.local` with:

```bash
VITE_PROGRAM_ID=0x...
VITE_NODE_ENDPOINT=ws://127.0.0.1:9944
```

The app can connect to a local node or Vara network endpoints, but local development is simplest when the frontend is pinned to a local deployment.

## Voucher-Backed Gasless Mode

The frontend supports program-scoped vouchers so a player can submit gameplay actions without directly paying transaction fees for each call. Voucher support is wired into lobby creation, joining, commit, reveal, settle, and forfeit flows.

Important constraint:

- the voucher field must contain a 32-byte hex voucher id like `0x...`
- wallet addresses must not be pasted into that field

## Local Smoke Checklist

1. Start a local Vara node at `ws://127.0.0.1:9944`.
2. Build and upload the program.
3. Set `VITE_PROGRAM_ID` to the deployed program id.
4. Start the frontend and connect two funded accounts.
5. Create one lobby and join it from the second account.
6. Commit moves, reveal them, and settle the round.
7. Issue a voucher and repeat the same path in gasless mode.

## Current Verification

- `cargo test --test gtest -- --nocapture` passes
- `cd frontend/frontend && npm run build` passes

## Notes

- Local Vara nodes can return noisy dry-run RPC errors during gas estimation; the frontend contains fallback handling for this path.
- If optimized WASM artifacts are needed, install Binaryen so `wasm-opt` is available during builds.
