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
