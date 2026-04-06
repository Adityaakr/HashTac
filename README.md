# HashTac

[![CI](https://github.com/gear-tech/tic-tac-toe-sails/actions/workflows/ci.yml/badge.svg)](https://github.com/gear-tech/tic-tac-toe-sails/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.91+-orange.svg)](https://www.rust-lang.org)
[![Sails](https://img.shields.io/badge/Sails-0.10.3-blue.svg)](https://github.com/gear-tech/sails)

**HashTac** is an on-chain tic-tac-toe game built for the [Vara Network](https://vara.network) using the [Sails](https://github.com/gear-tech/sails) framework. It implements a commit-and-reveal game flow so both players lock in hashed moves before revealing them, eliminating front-running and copycat play. The smart contract settles collisions, validates reveals, detects wins and draws, and maintains a persistent on-chain leaderboard.

## Features

- **Commit / Reveal Gameplay** - Players submit SHA-256 commitments for their moves, then reveal the cell and salt. The contract verifies every reveal against the stored hash.
- **Simultaneous Moves** - Both players commit independently each round; the contract applies both moves atomically on settlement.
- **Voucher-Backed Gasless Mode** - Program-scoped vouchers let players submit actions without paying transaction fees directly.
- **Persistent Leaderboard** - Wins, losses, draws, and total matches are tracked on-chain per player.
- **React Frontend** - Wallet connection, lobby browser, live board UI, reveal secret management, and leaderboard views.
- **Typed Client** - Auto-generated Rust client and IDL for type-safe program interaction.
- **Comprehensive Tests** - `gtest` coverage for happy paths, invalid reveals, simultaneous wins, and leaderboard updates.

## Architecture

```
tic-tac-toe/
├── app/                      # Sails program logic and service definitions
├── client/                   # Generated Rust client crate and IDL
│   ├── src/
│   │   ├── lib.rs
│   │   └── tic_tac_toe_sails_client.rs
│   └── tic_tac_toe_sails_client.idl
├── tests/
│   └── gtest.rs              # Integration test coverage
├── frontend/
│   ├── frontend/             # React application (Vite + TypeScript + Tailwind)
│   └── scripts/              # Client scaffolding and type generation
├── docs/plans/               # Architecture, spec, and task documentation
├── src/lib.rs                # WASM binary entry point
├── Cargo.toml                # Workspace manifest
└── build.rs                  # WASM build script
```

## Gameplay Flow

1. **Create Lobby** - Player A opens a lobby on-chain.
2. **Join Lobby** - Player B joins, activating a match with X (host) and O (guest) assignments.
3. **Commit Moves** - Each player selects a cell and submits a SHA-256 commitment derived from:
   ```
   SHA-256( SCALE(match_id, round, player, cell, salt[32]) )
   ```
4. **Reveal Moves** - Both players reveal their chosen cell and salt. The contract verifies each reveal against the stored commitment.
5. **Settle Round** - The contract applies both moves atomically, evaluates the board for wins/draws, and advances or finishes the match.
6. **Leaderboard Update** - On match completion, player statistics are finalized on-chain.

### Edge Cases Handled

| Scenario | Outcome |
|---|---|
| Both players reveal the same empty cell | Conflict - no mark placed for that cell |
| A player reveals an occupied cell | Invalid reveal - that player forfeits the match |
| Both players form a winning line in the same round | Draw |
| Board fills without a winner | Draw |
| One player forfeits | Opponent wins |

## Smart Contract API

### Commands

| Method | Description |
|---|---|
| `CreateLobby()` | Create an open lobby |
| `JoinLobby(lobby_id)` | Join a lobby and start a match |
| `CancelLobby(lobby_id)` | Cancel an open lobby (host only) |
| `CommitMove(match_id, round, hash)` | Submit a move commitment |
| `RevealMove(match_id, round, cell, salt)` | Reveal a committed move |
| `SettleRound(match_id)` | Settle the current round |
| `ForfeitMatch(match_id)` | Forfeit an active match |

### Queries

| Method | Returns |
|---|---|
| `OpenLobbies()` | List of open lobbies |
| `MatchById(match_id)` | Full match state |
| `ActiveMatch(player)` | Active match for a player, if any |
| `Leaderboard(limit)` | Top players sorted by wins |
| `PlayerStats(player)` | Stats for a specific player |
| `Version()` | Contract version |

### Events

`LobbyCreated`, `LobbyJoined`, `LobbyCancelled`, `MoveCommitted`, `MoveRevealed`, `RoundSettled`, `MatchFinished`, `LeaderboardUpdated`

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Rust, Sails 0.10.3, SHA-256 |
| Client | Generated Rust crate + IDL |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| Wallet / Chain | @polkadot/api, @gear-js/api, sails-js |
| Testing | sails-rs gtest, tokio |
| CI | GitHub Actions (fmt, clippy, build, test) |

## Getting Started

### Prerequisites

- **Rust 1.91+** (managed via `rust-toolchain.toml`)
- **Binaryen** (`wasm-opt` for optimized WASM builds)
- **Node.js 18+** and npm
- A local Vara node or access to a Vara network endpoint

### Contract Tests

```bash
cargo test --test gtest -- --nocapture
```

### Build the Contract

```bash
cargo build --release
```

### Frontend Setup

```bash
cd frontend/frontend
npm install
```

Create `.env.local`:

```env
VITE_PROGRAM_ID=0x...
VITE_NODE_ENDPOINT=ws://127.0.0.1:9944
```

### Development Server

```bash
cd frontend/frontend
npm run dev
```

### Production Build

```bash
cd frontend/frontend
npm run build
npm run preview
```

## Local Smoke Test

1. Start a local Vara node at `ws://127.0.0.1:9944`.
2. Build and upload the compiled WASM program.
3. Set `VITE_PROGRAM_ID` in the frontend `.env.local` to the deployed program ID.
4. Start the frontend and connect two funded accounts.
5. Create a lobby from account A, join from account B.
6. Commit moves, reveal them, and settle the round.
7. (Optional) Issue a voucher and repeat the flow in gasless mode.

## Voucher Configuration

The voucher field in the frontend expects a **32-byte hex voucher ID** (e.g. `0x...`). Do not paste wallet addresses into this field. Voucher support is wired into lobby creation, joining, commit, reveal, settle, and forfeit flows.

## CI Pipeline

The project uses GitHub Actions with the following checks on every push and pull request:

- `cargo fmt` - formatting compliance
- `cargo clippy` - lint with warnings as errors
- `cargo build --release` - release build
- `cargo test --release` - full test suite
- Generated client file integrity check (IDL and Rust client must be committed and unchanged)

## License

This project is licensed under the [MIT License](LICENSE).
