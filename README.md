# HashTac

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