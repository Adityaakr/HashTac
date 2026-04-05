import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Cube,
  CaretDown,
  CheckCircle,
  CircleNotch,
  HardDrives,
  PlugsConnected,
} from "@phosphor-icons/react";
import {
  useChainApi,
  NETWORKS,
  type Network,
} from "@/providers/chain-provider";


const STORAGE_CUSTOM_PID = "vara-starter.custom.programId";
const STORAGE_CUSTOM_EP = "vara-starter.custom.endpoint";

function isValidProgramId(pid: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(pid.trim());
}

function formatBlockNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function truncatePid(pid: string): string {
  return pid.length > 16 ? `${pid.slice(0, 8)}...${pid.slice(-6)}` : pid;
}

export function NetworkSelector() {
  const { apiStatus, apiError, network, blockNumber, switchNetwork, api, programId, setProgramId } =
    useChainApi();
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customPid, setCustomPid] = useState(
    () => localStorage.getItem(STORAGE_CUSTOM_PID) || ""
  );
  const [customEndpoint, setCustomEndpoint] = useState<"testnet" | "mainnet">(
    () => (localStorage.getItem(STORAGE_CUSTOM_EP) as "testnet" | "mainnet") || "testnet"
  );
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mouseup", handleClick);
    return () => document.removeEventListener("mouseup", handleClick);
  }, []);

  const statusColor =
    apiStatus === "ready"
      ? "bg-emerald-400"
      : apiStatus === "error"
        ? "bg-red-400"
        : "bg-amber-400";

  async function handleCustomConnect() {
    const trimmed = customPid.trim();
    if (!isValidProgramId(trimmed) || !api) return;
    setProbing(true);
    setProbeError(null);
    try {
      // Create a separate Sails instance for probing (don't mutate the shared singleton)
      const [{ Sails }, { SailsIdlParser }] = await Promise.all([
        import("sails-js"),
        import("sails-js-parser"),
      ]);
      const parser = await SailsIdlParser.new();
      const probeSails = new Sails(parser);
      probeSails.setApi(api);
      const { getIdlText } = await import("@/lib/sails-client");
      probeSails.parseIdl(getIdlText());
      probeSails.setProgramId(trimmed as `0x${string}`);
      const service = probeSails.services?.Game ?? probeSails.services?.game;
      if (!service) throw new Error("Service not found in IDL");
      await service.queries.Version().call();

      // Probe succeeded — now update the shared Sails instance
      localStorage.setItem(STORAGE_CUSTOM_PID, trimmed);
      localStorage.setItem(STORAGE_CUSTOM_EP, customEndpoint);
      setProgramId(trimmed);
      // Also update the cached Sails singleton
      const { initSails } = await import("@/lib/sails-client");
      const sails = await initSails(api);
      sails.setProgramId(trimmed as `0x${string}`);
      // Switch to the correct network if needed
      const targetNet = NETWORKS.find((n) =>
        customEndpoint === "mainnet" ? n.id === "mainnet" : n.id === "testnet"
      );
      if (targetNet && targetNet.id !== network.id) {
        switchNetwork(targetNet.id);
      }
      setOpen(false);
      setShowCustom(false);
    } catch {
      setProbeError("Program not found or incompatible with this IDL.");
    } finally {
      setProbing(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-[rgba(19,34,53,0.06)] transition-colors active:scale-[0.97]"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${statusColor} ${apiStatus === "connecting" ? "breathing" : ""}`}
        />
        <span className="text-sm text-[var(--muted)]">{network.name}</span>
        {apiStatus === "ready" && blockNumber !== null && (
          <span className="text-xs font-mono text-[var(--muted)]">
            #{formatBlockNumber(blockNumber)}
          </span>
        )}
        {apiStatus === "connecting" && (
          <CircleNotch size={12} className="animate-spin text-[var(--muted)]" />
        )}
        <CaretDown
          size={10}
          weight="bold"
          className={`text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{
              type: "spring" as const,
              stiffness: 300,
              damping: 30,
            }}
            className="absolute top-full left-0 mt-2 w-72 rounded-2xl border border-zinc-800/60 bg-[#18181b] shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)] overflow-hidden z-50"
          >
            <div className="px-5 py-3 border-b border-zinc-800/50">
              <span className="text-sm text-zinc-400 font-medium">
                Network
              </span>
            </div>

            <div className="p-1.5">
              {NETWORKS.map((n) => {
                const isActive = network.id === n.id;
                return (
                  <NetworkRow
                    key={n.id}
                    network={n}
                    isActive={isActive}
                    currentBlock={isActive ? blockNumber : null}
                    apiStatus={isActive ? apiStatus : null}
                    onClick={() => {
                      if (!isActive) switchNetwork(n.id);
                      setOpen(false);
                    }}
                  />
                );
              })}
            </div>

            {/* Custom Program */}
            <div className="border-t border-zinc-800/50">
              <button
                onClick={() => setShowCustom(!showCustom)}
                className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-zinc-800/50 transition-colors"
              >
                <PlugsConnected
                  size={14}
                  weight="duotone"
                  className="text-violet-400"
                />
                <span className="text-sm text-zinc-400 flex-1 text-left">
                  Custom Program
                </span>
                {programId && programId !== import.meta.env.VITE_PROGRAM_ID && (
                  <span className="text-xs font-mono text-violet-400 truncate max-w-[100px]">
                    {truncatePid(programId)}
                  </span>
                )}
                <CaretDown
                  size={10}
                  weight="bold"
                  className={`text-zinc-400 transition-transform ${showCustom ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {showCustom && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3">
                      <p className="text-xs text-zinc-500">
                        Connect to another deployment of this program.
                      </p>

                      {/* Endpoint toggle */}
                      <div>
                        <label className="text-xs text-zinc-500 mb-1 block">
                          Endpoint
                        </label>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setCustomEndpoint("testnet")}
                            className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
                              customEndpoint === "testnet"
                                ? "bg-amber-600/80 text-white"
                                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            Testnet
                          </button>
                          <button
                            onClick={() => setCustomEndpoint("mainnet")}
                            className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
                              customEndpoint === "mainnet"
                                ? "bg-emerald-600/80 text-white"
                                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            Mainnet
                          </button>
                        </div>
                      </div>

                      {/* Program ID input */}
                      <div>
                        <label className="text-xs text-zinc-500 mb-1 block">
                          Program ID
                        </label>
                        <input
                          type="text"
                          value={customPid}
                          onChange={(e) => {
                            setCustomPid(e.target.value);
                            setProbeError(null);
                          }}
                          placeholder="0x..."
                          className={`w-full text-xs font-mono bg-zinc-950 border rounded-lg px-3 py-2 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-colors ${
                            customPid.trim() && !isValidProgramId(customPid)
                              ? "border-red-500/50"
                              : "border-zinc-800"
                          }`}
                        />
                        {customPid.trim() && !isValidProgramId(customPid) && (
                          <p className="text-xs text-red-400 mt-1">
                            Must be 0x + 64 hex characters
                          </p>
                        )}
                        {probeError && (
                          <p className="text-xs text-red-400 mt-1">
                            {probeError}
                          </p>
                        )}
                      </div>

                      {/* Connect button */}
                      <button
                        onClick={handleCustomConnect}
                        disabled={!isValidProgramId(customPid) || probing || !api}
                        className="w-full text-xs py-2 rounded-lg font-medium transition-colors bg-violet-600/80 hover:bg-violet-600 text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        {probing ? (
                          <>
                            <CircleNotch size={12} className="animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          "Connect"
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {apiStatus === "error" && apiError && (
              <div className="px-4 py-2 border-t border-zinc-800/50">
                <p className="text-sm text-red-400/70 truncate">
                  {apiError}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NetworkRow({
  network,
  isActive,
  currentBlock,
  apiStatus,
  onClick,
}: {
  network: Network;
  isActive: boolean;
  currentBlock: number | null;
  apiStatus: string | null;
  onClick: () => void;
}) {
  const Icon = network.id === "local" ? HardDrives : Globe;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors ${
        isActive
          ? "bg-emerald-500/5 border border-emerald-500/10"
          : "hover:bg-zinc-800/50"
      }`}
    >
      <Icon
        size={14}
        weight="duotone"
        className={isActive ? "text-emerald-500/60" : "text-zinc-400"}
      />
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-sm ${isActive ? "text-zinc-300" : "text-zinc-400"}`}
          >
            {network.name}
          </span>
          {network.isTestnet && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase tracking-wider">
              test
            </span>
          )}
        </div>
        {isActive && apiStatus === "ready" && currentBlock !== null && (
          <div className="flex items-center gap-1 mt-0.5">
            <Cube size={10} weight="fill" className="text-zinc-500" />
            <span className="text-xs font-mono text-zinc-400">
              {formatBlockNumber(currentBlock)}
            </span>
          </div>
        )}
        {isActive && apiStatus === "connecting" && (
          <span className="text-sm text-amber-400/70">Connecting...</span>
        )}
        {isActive && apiStatus === "error" && (
          <span className="text-sm text-red-400/70">Failed</span>
        )}
      </div>
      {isActive && (
        <CheckCircle
          size={14}
          weight="fill"
          className="text-emerald-500/60 flex-shrink-0"
        />
      )}
    </button>
  );
}
