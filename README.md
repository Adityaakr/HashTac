# HashTac

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