import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  CaretRight,
  CheckCircle,
  CircleNotch,
  Crown,
  Flag,
  GameController,
  Hash,
  ShieldCheck,
  Sparkle,
  Sword,
  Trophy,
  WarningCircle,
} from "@phosphor-icons/react";
import { Header } from "@/components/Header";
import { useChainApi, useWallet } from "@/providers/chain-provider";
import { initSails } from "@/lib/sails-client";
import { hexToU8a, u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";

type Lifecycle = "Active" | "Finished";
type MatchResultKind = "HostWon" | "GuestWon" | "Draw";
type MatchEndReason =
  | "LineCompleted"
  | "BoardFull"
  | "SimultaneousWin"
  | "InvalidCell"
  | "Forfeit";

type Lobby = {
  id: string;
  host: string;
};

type PlayerStats = {
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
};

type LeaderboardEntry = {
  player: string;
  stats: PlayerStats;
};

type RoundView = {
  round: number;
  hostCommitted: boolean;
  guestCommitted: boolean;
  hostRevealed: boolean;
  guestRevealed: boolean;
  settled: boolean;
};

type MatchOutcome = {
  result: MatchResultKind;
  reason: MatchEndReason;
  winner: string | null;
};

type MatchView = {
  id: string;
  host: string;
  guest: string;
  board: string[];
  lifecycle: Lifecycle;
  nextRound: number;
  round: RoundView;
  outcome: MatchOutcome | null;
};

type StoredReveal = {
  matchId: string;
  round: number;
  cell: number;
  saltHex: string;
  account: string;
};

type Notice = {
  kind: "success" | "error";
  text: string;
};

type VoucherState = {
  voucherId: string;
  enabled: boolean;
};

const roundAnimation = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 120, damping: 18 },
  },
};

const STORAGE_PREFIX = "tictactoe.reveal";
const STORAGE_VOUCHER_PREFIX = "tictactoe.voucher";

function getValue<T = unknown>(value: unknown, ...keys: string[]): T | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (key in record) return record[key] as T;
  }
  return undefined;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value && typeof value === "object" && "toString" in value) {
    return String((value as { toString: () => string }).toString());
  }
  return "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length) return Number(value);
  return 0;
}

function asBool(value: unknown): boolean {
  return Boolean(value);
}

function normalizeStats(value: unknown): PlayerStats {
  return {
    matchesPlayed: asNumber(getValue(value, "matches_played", "matchesPlayed")),
    wins: asNumber(getValue(value, "wins")),
    losses: asNumber(getValue(value, "losses")),
    draws: asNumber(getValue(value, "draws")),
  };
}

function normalizeLobby(value: unknown): Lobby {
  return {
    id: asString(getValue(value, "id")),
    host: asString(getValue(value, "host")),
  };
}

function normalizeRound(value: unknown): RoundView {
  return {
    round: asNumber(getValue(value, "round")),
    hostCommitted: asBool(getValue(value, "host_committed", "hostCommitted")),
    guestCommitted: asBool(getValue(value, "guest_committed", "guestCommitted")),
    hostRevealed: asBool(getValue(value, "host_revealed", "hostRevealed")),
    guestRevealed: asBool(getValue(value, "guest_revealed", "guestRevealed")),
    settled: asBool(getValue(value, "settled")),
  };
}

function normalizeOutcome(value: unknown): MatchOutcome | null {
  if (!value) return null;
  return {
    result: asString(getValue(value, "result")) as MatchResultKind,
    reason: asString(getValue(value, "reason")) as MatchEndReason,
    winner: asString(getValue(value, "winner")) || null,
  };
}

function normalizeMatch(value: unknown): MatchView {
  const boardValue = getValue<unknown[]>(value, "board") ?? [];
  return {
    id: asString(getValue(value, "id")),
    host: asString(getValue(value, "host")),
    guest: asString(getValue(value, "guest")),
    board: boardValue.map((cell) => asString(cell)),
    lifecycle: asString(getValue(value, "lifecycle")) as Lifecycle,
    nextRound: asNumber(getValue(value, "next_round", "nextRound")),
    round: normalizeRound(getValue(value, "round")),
    outcome: normalizeOutcome(getValue(value, "outcome")),
  };
}

function normalizeLeaderboardEntry(value: unknown): LeaderboardEntry {
  return {
    player: asString(getValue(value, "player")),
    stats: normalizeStats(getValue(value, "stats")),
  };
}

function shortAddress(value: string): string {
  if (!value) return "Disconnected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function toActorId(address: string | null | undefined): string | null {
  if (!address) return null;
  try {
    return u8aToHex(decodeAddress(address));
  } catch {
    return address;
  }
}

function formatUiError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object"
          ? [
              getValue<string>(error, "message"),
              getValue<string>(error, "error"),
              getValue<string>(error, "details"),
              getValue<string>(error, "description"),
            ].find((value) => typeof value === "string" && value.trim().length > 0) ??
            JSON.stringify(error)
          : String(error);
  if (message.includes("Priority is too low")) {
    return "A previous transaction from this account is still pending in the local node. Wait a few blocks, approve only one request in the wallet, then try again.";
  }
  if (message.includes("Inability to pay some fees")) {
    return "This account cannot currently pay fees on the connected chain. Recheck that you are on Local Node and that the selected account is funded.";
  }
  return message;
}

function markLabel(mark: string): string {
  if (mark === "X") return "X";
  if (mark === "O") return "O";
  return "";
}

function resultLabel(outcome: MatchOutcome | null): string {
  if (!outcome) return "Match active";
  if (outcome.result === "Draw") return `Draw by ${humanizeReason(outcome.reason)}`;
  return `${outcome.result === "HostWon" ? "Host" : "Guest"} won by ${humanizeReason(outcome.reason)}`;
}

function humanizeReason(reason: MatchEndReason): string {
  const labels: Record<MatchEndReason, string> = {
    LineCompleted: "line completion",
    BoardFull: "board fill",
    SimultaneousWin: "simultaneous line",
    InvalidCell: "invalid reveal",
    Forfeit: "forfeit",
  };
  return labels[reason] ?? reason;
}

function getRole(matchView: MatchView | null, account?: string | null): "host" | "guest" | null {
  if (!matchView || !account) return null;
  if (matchView.host === account) return "host";
  if (matchView.guest === account) return "guest";
  return null;
}

function getOpponent(matchView: MatchView | null, account?: string | null): string | null {
  const role = getRole(matchView, account);
  if (!matchView || !role) return null;
  return role === "host" ? matchView.guest : matchView.host;
}

function getRoundStorageKey(account: string, matchId: string, round: number) {
  return `${STORAGE_PREFIX}:${account}:${matchId}:${round}`;
}

function getVoucherStorageKey(account: string) {
  return `${STORAGE_VOUCHER_PREFIX}:${account}`;
}

function isHex32(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}

function sanitizeVoucherState(value: VoucherState): VoucherState {
  const voucherId = value.voucherId.trim();
  if (!isHex32(voucherId)) {
    return { voucherId: "", enabled: false };
  }
  return { voucherId, enabled: value.enabled };
}

function randomSaltHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return u8aToHex(bytes);
}

function decodeBytes32(hex: string): Uint8Array {
  const bytes = hexToU8a(hex);
  if (bytes.length !== 32) throw new Error("Salt must be 32 bytes.");
  return bytes;
}

async function hashCommitment(
  api: NonNullable<ReturnType<typeof useChainApi>["api"]>,
  matchId: string,
  round: number,
  player: string,
  cell: number,
  saltHex: string
) {
  const payload = api.registry
    .createType("(u64,u8,AccountId,u8,[u8;32])", [
      BigInt(matchId),
      round,
      player,
      cell,
      Array.from(decodeBytes32(saltHex)),
    ])
    .toU8a();
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return u8aToHex(new Uint8Array(digest));
}

async function getGameService(api: NonNullable<ReturnType<typeof useChainApi>["api"]>) {
  const sails = await initSails(api);
  return sails?.services?.Game ?? sails?.services?.game;
}

async function callQuery<T>(api: NonNullable<ReturnType<typeof useChainApi>["api"]>, name: string, ...args: unknown[]) {
  const service = await getGameService(api);
  return service.queries[name](...args).call() as Promise<T>;
}

async function submitTx(
  api: NonNullable<ReturnType<typeof useChainApi>["api"]>,
  functionName: string,
  args: unknown[],
  account: string,
  signer: unknown,
  voucherId?: string
) {
  const service = await getGameService(api);
  const tx = service.functions[functionName](...args);
  tx.withAccount(account, signer ? { signer } : undefined);
  if (voucherId) {
    if (!isHex32(voucherId)) {
      throw new Error("Voucher id must be a 32-byte hex value.");
    }
    tx.withVoucher(voucherId);
  }
  try {
    await tx.calculateGas();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Local dev nodes can fail the dry-run gas estimator while the actual call still succeeds.
    if (!message.includes("Failed to get last message from the queue")) {
      throw error;
    }
    tx.withGas("max");
  }
  const result = await tx.signAndSend();
  return result.response();
}

function usePersistentVoucher(account: string | null | undefined) {
  const [voucher, setVoucher] = useState<VoucherState>({ voucherId: "", enabled: false });

  useEffect(() => {
    if (!account) {
      setVoucher({ voucherId: "", enabled: false });
      return;
    }
    const raw = localStorage.getItem(getVoucherStorageKey(account));
    if (!raw) {
      setVoucher({ voucherId: "", enabled: false });
      return;
    }
    try {
      setVoucher(sanitizeVoucherState(JSON.parse(raw) as VoucherState));
    } catch {
      setVoucher({ voucherId: "", enabled: false });
    }
  }, [account]);

  const update = (next: VoucherState) => {
    if (!account) return;
    const sanitized = sanitizeVoucherState(next);
    localStorage.setItem(getVoucherStorageKey(account), JSON.stringify(sanitized));
    setVoucher(sanitized);
  };

  return [voucher, update] as const;
}

export function App() {
  const { api, apiStatus, apiError, blockNumber, network, programId } = useChainApi();
  const { account, signer, walletStatus, balance } = useWallet();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [matchView, setMatchView] = useState<MatchView | null>(null);
  const [selectedLobbyId, setSelectedLobbyId] = useState("");
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [storedReveal, setStoredReveal] = useState<StoredReveal | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [issuingVoucher, setIssuingVoucher] = useState(false);
  const [voucherBudget, setVoucherBudget] = useState("4");
  const [voucherBlocks, setVoucherBlocks] = useState("600");
  const [voucher, setVoucher] = usePersistentVoucher(account?.address);
  const clearTimer = useRef<number | null>(null);
  const activeVoucherId = isHex32(voucher.voucherId) ? voucher.voucherId : undefined;

  const isActiveMatch = matchView?.lifecycle === "Active";
  const accountAddress = account?.address ?? null;
  const accountActorId = useMemo(() => toActorId(accountAddress), [accountAddress]);
  const role = useMemo(() => getRole(matchView, accountActorId), [matchView, accountActorId]);
  const currentRound = matchView?.round.round ?? 0;
  const canCommit = Boolean(isActiveMatch && accountAddress && role && selectedCell !== null);
  const canReveal = Boolean(
    isActiveMatch &&
      storedReveal &&
      currentRound === storedReveal.round &&
      matchView?.round &&
      ((role === "host" && matchView.round.hostCommitted) || (role === "guest" && matchView.round.guestCommitted))
  );
  const canSettle = Boolean(
    isActiveMatch &&
      matchView?.round.hostRevealed &&
      matchView?.round.guestRevealed &&
      !matchView?.round.settled
  );
  const commitHint = !matchView
    ? "Join or create a match first."
    : selectedCell === null
      ? "Select an empty board cell to commit your move."
      : !role
        ? "Only match participants can commit moves."
        : !isActiveMatch
          ? "The match is no longer active."
          : "Ready to submit your commitment.";

  useEffect(() => {
    if (!notice) return;
    if (clearTimer.current) window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => setNotice(null), 4500);
    return () => {
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
    };
  }, [notice]);

  useEffect(() => {
    if (!accountAddress || !matchView) {
      setStoredReveal(null);
      return;
    }
    const raw = localStorage.getItem(
      getRoundStorageKey(accountAddress, matchView.id, matchView.round.round)
    );
    if (!raw) {
      setStoredReveal(null);
      return;
    }
    try {
      setStoredReveal(JSON.parse(raw) as StoredReveal);
    } catch {
      setStoredReveal(null);
    }
  }, [accountAddress, matchView?.id, matchView?.round.round]);

  async function refreshState() {
    if (!api) return;
    try {
      const [openLobbies, topPlayers] = await Promise.all([
        callQuery<unknown[]>(api, "OpenLobbies"),
        callQuery<unknown[]>(api, "Leaderboard", 8),
      ]);
      setLobbies((openLobbies ?? []).map(normalizeLobby));
      setLeaderboard((topPlayers ?? []).map(normalizeLeaderboardEntry));

      if (accountActorId) {
        const [playerStats, activeMatch] = await Promise.all([
          callQuery(api, "PlayerStats", accountActorId),
          callQuery(api, "ActiveMatch", accountActorId),
        ]);
        setStats(normalizeStats(playerStats));
        if (activeMatch) {
          setMatchView(normalizeMatch(activeMatch));
        } else {
          setMatchView(null);
        }
      } else {
        setStats(null);
        setMatchView(null);
      }
    } catch (error) {
      setNotice({
        kind: "error",
        text: formatUiError(error) || "Failed to refresh game state.",
      });
    }
  }

  useEffect(() => {
    if (apiStatus !== "ready" || !api) return;
    refreshState().catch(() => undefined);
    const id = window.setInterval(() => {
      refreshState().catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(id);
  }, [api, apiStatus, accountActorId]);

  async function runAction(action: () => Promise<void>, success: string) {
    setLoading(true);
    try {
      await action();
      await refreshState();
      setNotice({ kind: "success", text: success });
    } catch (error) {
      setNotice({
        kind: "error",
        text: formatUiError(error) || "Transaction failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function createLobby() {
    if (!api || !accountAddress) throw new Error("Connect a wallet first.");
    await submitTx(
      api,
      "CreateLobby",
      [],
      accountAddress,
      signer,
      voucher.enabled ? activeVoucherId : undefined
    );
  }

  async function joinLobby(lobbyId: string) {
    if (!api || !accountAddress) throw new Error("Connect a wallet first.");
    await submitTx(
      api,
      "JoinLobby",
      [BigInt(lobbyId)],
      accountAddress,
      signer,
      voucher.enabled ? activeVoucherId : undefined
    );
  }

  async function cancelLobby(lobbyId: string) {
    if (!api || !accountAddress) throw new Error("Connect a wallet first.");
    await submitTx(
      api,
      "CancelLobby",
      [BigInt(lobbyId)],
      accountAddress,
      signer,
      voucher.enabled ? activeVoucherId : undefined
    );
  }

  async function commitMove() {
    if (!api || !accountAddress || !matchView || selectedCell === null) {
      throw new Error("Select a board cell first.");
    }
    const round = matchView.round.round;
    const saltHex = randomSaltHex();
    const hash = await hashCommitment(api, matchView.id, round, accountAddress, selectedCell, saltHex);
    const payload: StoredReveal = {
      matchId: matchView.id,
      round,
      cell: selectedCell,
      saltHex,
      account: accountAddress,
    };
    localStorage.setItem(
      getRoundStorageKey(accountAddress, matchView.id, round),
      JSON.stringify(payload)
    );
    setStoredReveal(payload);
    await submitTx(
      api,
      "CommitMove",
      [BigInt(matchView.id), round, { hash: Array.from(hexToU8a(hash)) }],
      accountAddress,
      signer,
      voucher.enabled ? activeVoucherId : undefined
    );
  }

  async function revealMove() {
    if (!api || !accountAddress || !matchView || !storedReveal) {
      throw new Error("No stored reveal secret for this round.");
    }
    await submitTx(
      api,
      "RevealMove",
      [
        BigInt(matchView.id),
        storedReveal.round,
        { cell: storedReveal.cell, salt: Array.from(decodeBytes32(storedReveal.saltHex)) },
      ],
      accountAddress,
      signer,
      voucher.enabled ? activeVoucherId : undefined
    );
  }

  async function settleRound() {
    if (!api || !accountAddress || !matchView) throw new Error("No active match.");
    await submitTx(
      api,
      "SettleRound",
      [BigInt(matchView.id)],
      accountAddress,
      signer,
      voucher.enabled ? activeVoucherId : undefined
    );
    const nextKey = getRoundStorageKey(accountAddress, matchView.id, matchView.round.round);
    localStorage.removeItem(nextKey);
    setStoredReveal(null);
    setSelectedCell(null);
  }

  async function forfeitMatch() {
    if (!api || !accountAddress || !matchView) throw new Error("No active match.");
    await submitTx(
      api,
      "ForfeitMatch",
      [BigInt(matchView.id)],
      accountAddress,
      signer,
      voucher.enabled ? activeVoucherId : undefined
    );
  }

  async function issueVoucher() {
    if (!api || !accountAddress || !programId) throw new Error("Program ID is required.");
    if (!signer) throw new Error("Wallet signer not available.");
    setIssuingVoucher(true);
    try {
      const value = BigInt(Math.max(1, Number(voucherBudget)) * 1_000_000_000_000);
      const duration = Math.max(100, Number(voucherBlocks));
      const voucherApi = (api as unknown as {
        voucher: {
          issue: (
            spender: string,
            value: bigint,
            duration: number,
            programs: string[],
            codeUploading: boolean
          ) => Promise<{ voucherId: string; extrinsic: { signAndSend: (account: string, opts: { signer: unknown }) => Promise<unknown> } }>;
        };
      }).voucher;
      const { voucherId, extrinsic } = await voucherApi.issue(
        accountAddress,
        value,
        duration,
        [programId],
        false
      );
      await extrinsic.signAndSend(accountAddress, { signer });
      if (!isHex32(voucherId)) {
        throw new Error("Wallet returned an invalid voucher id.");
      }
      setVoucher({ voucherId, enabled: true });
      setNotice({ kind: "success", text: `Voucher ${shortAddress(voucherId)} issued for gasless mode.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: formatUiError(error) || "Voucher issuance failed.",
      });
    } finally {
      setIssuingVoucher(false);
    }
  }

  const opponent = getOpponent(matchView, accountActorId);

  return (
    <div className="app-shell">
      <div className="app-backdrop" />
      <Header />

      <main className="app-main">
        <motion.section
          variants={roundAnimation}
          initial="hidden"
          animate="show"
          className="hero-card"
        >
          <div className="hero-copy">
            <span className="hero-kicker">Vara Sails Commit / Reveal Arena</span>
            <h1>Tic-tac-toe with sealed turns, atomic settlement, and an on-chain leaderboard.</h1>
            <p>
              Players commit hashed moves first, reveal later, and let the contract resolve collisions,
              invalid cells, wins, draws, and forfeits. Voucher mode can sponsor gameplay after one setup call.
            </p>
            <div className="hero-stats">
              <InfoPill icon={<Hash size={14} />} label={`Network ${network.name}`} />
              <InfoPill icon={<ShieldCheck size={14} />} label={programId ? shortAddress(programId) : "Set VITE_PROGRAM_ID"} />
              <InfoPill icon={<Sparkle size={14} />} label={blockNumber ? `Block ${blockNumber}` : "Waiting for blocks"} />
            </div>
          </div>

          <div className="hero-aside">
            <StatusCard
              title="Wallet"
              value={
                walletStatus === "connected" && accountAddress
                  ? `${shortAddress(accountAddress)}${balance ? ` • ${balance} VARA` : ""}`
                  : "Connect a wallet"
              }
              tone={walletStatus === "connected" ? "good" : "muted"}
            />
            <StatusCard
              title="Gasless"
              value={
                activeVoucherId
                  ? `${voucher.enabled ? "Voucher armed" : "Voucher saved"} • ${shortAddress(voucher.voucherId)}`
                  : "No voucher configured"
              }
              tone={voucher.enabled ? "good" : "muted"}
            />
            <StatusCard
              title="Match"
              value={matchView ? `#${matchView.id} • ${resultLabel(matchView.outcome)}` : "No active match"}
              tone={matchView ? "accent" : "muted"}
            />
          </div>
        </motion.section>

        {notice && (
          <div className={`notice notice-${notice.kind}`}>
            {notice.kind === "success" ? <CheckCircle size={18} /> : <WarningCircle size={18} />}
            <span>{notice.text}</span>
          </div>
        )}

        <section className="dashboard-grid">
          <motion.div variants={roundAnimation} initial="hidden" animate="show" className="panel panel-tall">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Lobby</span>
                <h2>Open matches</h2>
              </div>
              <button
                className="button button-primary"
                disabled={loading || !accountAddress || !api}
                onClick={() => runAction(createLobby, "Lobby created.")}
              >
                {loading ? <CircleNotch size={16} className="spin" /> : <GameController size={16} />}
                Create lobby
              </button>
            </div>

            <div className="lobby-list">
              {lobbies.length === 0 && <EmptyState title="No open lobbies" copy="Create one and wait for an opponent to join." />}
              {lobbies.map((lobby) => (
                <div key={lobby.id} className="lobby-row">
                  <div>
                    <strong>Lobby #{lobby.id}</strong>
                    <span>{shortAddress(lobby.host)}</span>
                  </div>
                  <div className="row-actions">
                    {lobby.host === accountAddress ? (
                      <button
                        className="button button-quiet"
                        disabled={loading}
                        onClick={() => runAction(() => cancelLobby(lobby.id), "Lobby cancelled.")}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        className="button button-quiet"
                        disabled={loading}
                        onClick={() => runAction(() => joinLobby(lobby.id), `Joined lobby #${lobby.id}.`)}
                      >
                        Join
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="manual-join">
              <input
                value={selectedLobbyId}
                onChange={(event) => setSelectedLobbyId(event.target.value)}
                inputMode="numeric"
                placeholder="Join by lobby id"
              />
              <button
                className="button button-secondary"
                disabled={!selectedLobbyId || loading}
                onClick={() => runAction(() => joinLobby(selectedLobbyId), `Joined lobby #${selectedLobbyId}.`)}
              >
                <CaretRight size={16} />
                Join
              </button>
            </div>
          </motion.div>

          <motion.div variants={roundAnimation} initial="hidden" animate="show" className="panel panel-tall">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Board</span>
                <h2>{matchView ? `Match #${matchView.id}` : "Awaiting a match"}</h2>
              </div>
              <div className="match-meta">
                <span>{role ? `You are ${role === "host" ? "X" : "O"}` : "Spectator"}</span>
                {opponent && <span>vs {shortAddress(opponent)}</span>}
              </div>
            </div>

            {matchView ? (
              <>
                <div className="round-strip">
                  <InfoPill icon={<Sword size={14} />} label={`Round ${matchView.round.round}`} />
                  <InfoPill icon={<Trophy size={14} />} label={resultLabel(matchView.outcome)} />
                  <InfoPill
                    icon={<Hash size={14} />}
                    label={`Commits ${Number(matchView.round.hostCommitted) + Number(matchView.round.guestCommitted)}/2`}
                  />
                </div>

                <div className="board-grid">
                  {matchView.board.map((cell, index) => {
                    const occupied = cell !== "Empty";
                    const selected = selectedCell === index;
                    return (
                      <button
                        key={`${matchView.id}-${index}`}
                        className={`board-cell ${occupied ? "board-cell-locked" : ""} ${selected ? "board-cell-selected" : ""}`}
                        disabled={occupied || !isActiveMatch}
                        onClick={() => setSelectedCell(index)}
                      >
                        <span>{markLabel(cell)}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="action-stack">
                  <div className="selection-box">
                    <div>
                      <span className="selection-label">Selected cell</span>
                      <strong>{selectedCell !== null ? selectedCell : "None"}</strong>
                    </div>
                    <div>
                      <span className="selection-label">Stored reveal</span>
                      <strong>{storedReveal ? `round ${storedReveal.round}` : "Missing"}</strong>
                    </div>
                  </div>

                  <div className="action-row">
                    <button
                      className="button button-primary"
                      disabled={!canCommit || loading}
                      onClick={() => runAction(commitMove, "Commit submitted and reveal secret saved locally.")}
                    >
                      Commit move
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={!canReveal || loading}
                      onClick={() => runAction(revealMove, "Reveal submitted.")}
                    >
                      Reveal move
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={!canSettle || loading}
                      onClick={() => runAction(settleRound, "Round settled.")}
                    >
                      Settle round
                    </button>
                  </div>
                  <p className="panel-copy">{commitHint}</p>

                  <button
                    className="button button-danger"
                    disabled={!isActiveMatch || loading}
                    onClick={() => runAction(forfeitMatch, "Match forfeited.")}
                  >
                    <Flag size={16} />
                    Forfeit
                  </button>
                </div>

                <div className="reveal-hints">
                  <ProgressHint label="Host committed" active={matchView.round.hostCommitted} />
                  <ProgressHint label="Guest committed" active={matchView.round.guestCommitted} />
                  <ProgressHint label="Host revealed" active={matchView.round.hostRevealed} />
                  <ProgressHint label="Guest revealed" active={matchView.round.guestRevealed} />
                </div>
              </>
            ) : (
              <EmptyState
                title="No active match"
                copy="Create a lobby or join one from the list. The contract returns your active match if you are a participant."
              />
            )}
          </motion.div>

          <motion.div variants={roundAnimation} initial="hidden" animate="show" className="panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Leaderboard</span>
                <h2>Top players</h2>
              </div>
              <Crown size={18} className="panel-icon" />
            </div>

            <div className="leaderboard-list">
              {leaderboard.length === 0 && (
                <EmptyState title="No completed matches" copy="Finish a game to populate the leaderboard." />
              )}
              {leaderboard.map((entry, index) => (
                <div className="leaderboard-row" key={entry.player}>
                  <strong>#{index + 1}</strong>
                  <div>
                    <span>{shortAddress(entry.player)}</span>
                    <small>
                      {entry.stats.wins}W / {entry.stats.draws}D / {entry.stats.losses}L
                    </small>
                  </div>
                  <span>{entry.stats.matchesPlayed} matches</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={roundAnimation} initial="hidden" animate="show" className="panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Player</span>
                <h2>Your record</h2>
              </div>
              <ShieldCheck size={18} className="panel-icon" />
            </div>

            {stats ? (
              <div className="stats-grid">
                <Metric title="Played" value={stats.matchesPlayed} />
                <Metric title="Wins" value={stats.wins} />
                <Metric title="Losses" value={stats.losses} />
                <Metric title="Draws" value={stats.draws} />
              </div>
            ) : (
              <EmptyState title="Connect to load stats" copy="Your personal counters are fetched by account address." />
            )}
          </motion.div>

          <motion.div variants={roundAnimation} initial="hidden" animate="show" className="panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Voucher</span>
                <h2>Gasless mode</h2>
              </div>
              <Sparkle size={18} className="panel-icon" />
            </div>

            <p className="panel-copy">
              Issue a program-scoped voucher for the connected account, then route commits, reveals, lobby actions, and forfeits through it.
            </p>
            <div className="voucher-grid">
              <label>
                <span>Budget in VARA</span>
                <input value={voucherBudget} onChange={(event) => setVoucherBudget(event.target.value)} />
              </label>
              <label>
                <span>Duration in blocks</span>
                <input value={voucherBlocks} onChange={(event) => setVoucherBlocks(event.target.value)} />
              </label>
              <label className="voucher-wide">
                <span>Voucher id</span>
                <input
                  value={voucher.voucherId}
                  onChange={(event) =>
                    setVoucher({
                      voucherId: event.target.value.trim(),
                      enabled: voucher.enabled && isHex32(event.target.value),
                    })
                  }
                  placeholder="0x..."
                />
              </label>
            </div>
            {voucher.voucherId && !activeVoucherId && (
              <p className="panel-copy">
                Voucher id must be a 32-byte hex value like `0x...`, not a wallet address.
              </p>
            )}
            <div className="voucher-actions">
              <button
                className="button button-primary"
                disabled={issuingVoucher || !accountAddress || !programId}
                onClick={() => issueVoucher()}
              >
                {issuingVoucher ? <CircleNotch size={16} className="spin" /> : <Sparkle size={16} />}
                Issue voucher
              </button>
              <button
                className={`button ${voucher.enabled ? "button-secondary" : "button-primary"}`}
                disabled={!activeVoucherId}
                onClick={() =>
                  setVoucher({ voucherId: activeVoucherId ?? "", enabled: !voucher.enabled })
                }
              >
                {voucher.enabled ? "Disable voucher routing" : "Enable voucher routing"}
              </button>
            </div>
          </motion.div>
        </section>

        {(apiError || apiStatus !== "ready") && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Node status</span>
                <h2>Connection</h2>
              </div>
            </div>
            <p className="panel-copy">
              {apiError ?? `Current status: ${apiStatus}.`} Switch to Local Node when you want to run local smoke against a local Vara devnet.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

function InfoPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="info-pill">
      {icon}
      {label}
    </span>
  );
}

function StatusCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "good" | "accent" | "muted";
}) {
  return (
    <div className={`status-card status-card-${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProgressHint({ label, active }: { label: string; active: boolean }) {
  return <span className={`progress-hint ${active ? "progress-hint-live" : ""}`}>{label}</span>;
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="metric">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}
