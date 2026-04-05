import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { GearApi } from "@gear-js/api";
import {
  listWallets,
  enableWallet,
  type WalletAccount,
  type EnabledWallet,
} from "@/lib/wallet";

const STORAGE_SOURCE = "frontend.wallet.source";
const STORAGE_ADDR = "frontend.wallet.address";
const STORAGE_NETWORK = "frontend.network";
const STORAGE_PROGRAM_ID = "frontend.custom.programId";

// ---------------------------------------------------------------------------
// Networks
// ---------------------------------------------------------------------------

export type Network = {
  id: string;
  name: string;
  endpoint: string;
  isTestnet?: boolean;
};

export const NETWORKS: Network[] = [
  { id: "testnet", name: "Vara Testnet", endpoint: "wss://testnet.vara.network", isTestnet: true },
  { id: "mainnet", name: "Vara Mainnet", endpoint: "wss://rpc.vara.network" },
  { id: "local", name: "Local Node", endpoint: "ws://127.0.0.1:9944", isTestnet: true },
];

function sameEndpoint(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value.trim().replace("ws://localhost:", "ws://127.0.0.1:");
  return normalize(a) === normalize(b);
}

function resolveInitialNetwork(): Network {
  const envEndpoint = import.meta.env.VITE_NODE_ENDPOINT;
  const storedId = localStorage.getItem(STORAGE_NETWORK);

  if (envEndpoint) {
    const found = NETWORKS.find((n) => sameEndpoint(n.endpoint, envEndpoint));
    if (found) return found;
  }
  if (storedId) {
    const found = NETWORKS.find((n) => n.id === storedId);
    if (found) return found;
  }
  return NETWORKS[0]; // testnet default
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type ApiStatus = "connecting" | "ready" | "error";
type WalletStatus =
  | "loading"
  | "unavailable"
  | "disconnected"
  | "connecting"
  | "connected";

type ChainContextValue = {
  api: GearApi | null;
  apiStatus: ApiStatus;
  apiError: string | null;
  network: Network;
  blockNumber: number | null;
  switchNetwork: (networkId: string) => void;
  programId: string;
  setProgramId: (id: string) => void;
  walletStatus: WalletStatus;
  walletError: string | null;
  wallets: string[];
  account: WalletAccount | null;
  accounts: WalletAccount[];
  signer: unknown | null;
  /** Balance in VARA (human-readable, 12 decimals) */
  balance: string | null;
  connect: () => Promise<void>;
  connectWallet: (source: string) => Promise<void>;
  selectAccount: (account: WalletAccount) => void;
  disconnect: () => void;
};

const ChainContext = createContext<ChainContextValue | null>(null);

export function ChainProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetwork] = useState<Network>(resolveInitialNetwork);
  const [programId, _setProgramId] = useState<string>(
    () => localStorage.getItem(STORAGE_PROGRAM_ID) || import.meta.env.VITE_PROGRAM_ID || ""
  );
  const [api, setApi] = useState<GearApi | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("connecting");
  const [apiError, setApiError] = useState<string | null>(null);
  const [blockNumber, setBlockNumber] = useState<number | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>("loading");
  const [walletError, setWalletError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<string[]>([]);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [signer, setSigner] = useState<unknown | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  // Fetch balance when account or api changes
  useEffect(() => {
    if (!api || apiStatus !== "ready" || !account) {
      setBalance(null);
      return;
    }

    let cancelled = false;

    async function fetchBalance() {
      try {
        const raw = await (
          api as unknown as {
            query: {
              system: {
                account: (addr: string) => Promise<{
                  data: { free: { toString: () => string } };
                }>;
              };
            };
          }
        ).query.system.account(account!.address);
        if (cancelled) return;
        const free = BigInt(raw.data.free.toString());
        const vara = Number(free) / 1e12;
        setBalance(vara.toFixed(vara < 0.01 ? 4 : 2));
      } catch {
        if (!cancelled) setBalance(null);
      }
    }

    fetchBalance();
    // Re-fetch every 12s (roughly 2 blocks)
    const id = setInterval(fetchBalance, 12000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [api, apiStatus, account]);

  // Connect to Vara node (reconnects when network changes)
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    setApiStatus("connecting");
    setApiError(null);
    setBlockNumber(null);

    import("@gear-js/api")
      .then(({ GearApi }) =>
        GearApi.create({ providerAddress: network.endpoint })
      )
      .then(async (nextApi) => {
        if (cancelled) {
          (nextApi as unknown as { disconnect: () => Promise<void> })
            .disconnect()
            .catch(() => undefined);
          return;
        }
        setApi(nextApi);
        setApiStatus("ready");

        // Subscribe to new block headers
        try {
          const sub = await (
            nextApi as unknown as {
              rpc: {
                chain: {
                  subscribeNewHeads: (
                    cb: (header: { number: { toNumber: () => number } }) => void
                  ) => Promise<() => void>;
                };
              };
            }
          ).rpc.chain.subscribeNewHeads((header) => {
            if (!cancelled) setBlockNumber(header.number.toNumber());
          });
          unsub = sub;
        } catch {
          // Block subscription failed, non-critical
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setApi(null);
        setApiStatus("error");
        setApiError(
          error instanceof Error
            ? error.message
            : "Failed to connect to Vara."
        );
      });

    return () => {
      cancelled = true;
      unsub?.();
      setApi((prev) => {
        if (prev)
          (
            prev as unknown as { disconnect: () => Promise<void> }
          )
            .disconnect()
            .catch(() => undefined);
        return null;
      });
    };
  }, [network]);

  const setProgramId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_PROGRAM_ID, id);
    _setProgramId(id);
  }, []);

  const switchNetwork = useCallback((networkId: string) => {
    const found = NETWORKS.find((n) => n.id === networkId);
    if (found) {
      localStorage.setItem(STORAGE_NETWORK, networkId);
      setNetwork(found);
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_SOURCE);
    localStorage.removeItem(STORAGE_ADDR);
    setAccount(null);
    setAccounts([]);
    setSigner(null);
    setWalletError(null);
    setWalletStatus(wallets.length === 0 ? "unavailable" : "disconnected");
  }, [wallets.length]);

  const applyWallet = useCallback(
    (enabled: EnabledWallet, preferredAddr: string | null) => {
      const picked =
        enabled.accounts.find((a) => a.address === preferredAddr) ??
        enabled.accounts[0];
      if (!picked) return false;

      localStorage.setItem(STORAGE_SOURCE, enabled.source);
      localStorage.setItem(STORAGE_ADDR, picked.address);
      setAccounts(enabled.accounts);
      setAccount(picked);
      setSigner(enabled.signer);
      setWalletStatus("connected");
      setWalletError(null);
      return true;
    },
    []
  );

  const connectWallet = useCallback(
    async (source: string) => {
      setWalletStatus("connecting");
      setWalletError(null);
      try {
        const enabled = await enableWallet(source);
        if (enabled.accounts.length === 0) {
          setWalletError(`"${source}" has no accounts.`);
          setWalletStatus("disconnected");
          return;
        }
        const storedAddr = localStorage.getItem(STORAGE_ADDR);
        applyWallet(enabled, storedAddr);
      } catch (err) {
        setWalletError(
          err instanceof Error ? err.message : `Failed to connect "${source}".`
        );
        setWalletStatus("disconnected");
      }
    },
    [applyWallet]
  );

  const selectAccount = useCallback((next: WalletAccount) => {
    setAccount(next);
    localStorage.setItem(STORAGE_ADDR, next.address);
  }, []);

  const connect = useCallback(async () => {
    const available = await listWallets();
    setWallets(available);

    if (available.length === 0) {
      setWalletStatus("unavailable");
      return;
    }

    const storedSource = localStorage.getItem(STORAGE_SOURCE);
    if (!storedSource) {
      setWalletStatus("disconnected");
      return;
    }

    setWalletStatus("connecting");
    setWalletError(null);

    try {
      const enabled = await enableWallet(storedSource);
      const storedAddr = localStorage.getItem(STORAGE_ADDR);
      if (!applyWallet(enabled, storedAddr)) {
        setWalletStatus("disconnected");
      }
    } catch {
      setWalletStatus("disconnected");
    }
  }, [applyWallet]);

  useEffect(() => {
    connect().catch(() => undefined);
  }, [connect]);

  const value = useMemo<ChainContextValue>(
    () => ({
      api,
      apiStatus,
      apiError,
      network,
      blockNumber,
      switchNetwork,
      programId,
      setProgramId,
      walletStatus,
      walletError,
      wallets,
      account,
      accounts,
      signer,
      balance,
      connect,
      connectWallet,
      selectAccount,
      disconnect,
    }),
    [
      api,
      apiStatus,
      apiError,
      network,
      blockNumber,
      switchNetwork,
      programId,
      setProgramId,
      walletStatus,
      walletError,
      wallets,
      account,
      accounts,
      signer,
      balance,
      connect,
      connectWallet,
      selectAccount,
      disconnect,
    ]
  );

  return (
    <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
  );
}

function useChainContext() {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("ChainProvider is required.");
  return ctx;
}

export function useChainApi() {
  const { api, apiError, apiStatus, network, blockNumber, switchNetwork, programId, setProgramId } =
    useChainContext();
  return { api, apiError, apiStatus, network, blockNumber, switchNetwork, programId, setProgramId };
}

export function useWallet() {
  const {
    account,
    accounts,
    connect,
    connectWallet,
    selectAccount,
    disconnect,
    signer,
    balance,
    walletError,
    walletStatus,
    wallets,
  } = useChainContext();
  return {
    account,
    accounts,
    connect,
    connectWallet,
    selectAccount,
    disconnect,
    signer,
    balance,
    walletError,
    walletStatus,
    wallets,
  };
}
