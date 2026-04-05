import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  CaretLeft,
  CircleNotch,
  CheckCircle,
  SignOut,
  CaretDown,
} from "@phosphor-icons/react";
import { useWallet } from "@/providers/chain-provider";
import type { WalletAccount } from "@/lib/wallet";

function truncateAddress(addr: string) {
  return addr.length > 16 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr;
}

const WALLET_META: Record<string, { name: string; color: string }> = {
  "subwallet-js": { name: "SubWallet", color: "#004BFF" },
  "polkadot-js": { name: "Polkadot.js", color: "#E6007A" },
  talisman: { name: "Talisman", color: "#D5FF5C" },
  enkrypt: { name: "Enkrypt", color: "#7C3AED" },
  nova: { name: "Nova Wallet", color: "#3BD9AE" },
};

function walletDisplayName(source: string): string {
  return WALLET_META[source]?.name ?? source.charAt(0).toUpperCase() + source.slice(1).replace(/-/g, " ");
}

function WalletIcon({ source, size = 20 }: { source: string; size?: number }) {
  const meta = WALLET_META[source];
  const displayName = meta?.name ?? source;
  const color = meta?.color ?? "#71717a";
  const letter = displayName.charAt(0).toUpperCase();

  return (
    <div
      className="flex-shrink-0 rounded-md flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        backgroundColor: color + "18",
        color: color,
        fontSize: size * 0.5,
      }}
    >
      {letter}
    </div>
  );
}

type Step = "extensions" | "accounts";

function WalletDropdown({ onClose }: { onClose: () => void }) {
  const {
    wallets,
    accounts,
    account,
    walletStatus,
    walletError,
    connectWallet,
    selectAccount,
    disconnect,
  } = useWallet();
  const [step, setStep] = useState<Step>(
    walletStatus === "connected" ? "accounts" : "extensions"
  );
  const [connecting, setConnecting] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mouseup", handleClick);
    return () => document.removeEventListener("mouseup", handleClick);
  }, [onClose]);

  async function handleSelectExtension(source: string) {
    setConnecting(source);
    await connectWallet(source);
    setConnecting(null);
    setStep("accounts");
  }

  function handleSelectAccount(acc: WalletAccount) {
    selectAccount(acc);
    onClose();
  }

  function handleDisconnect() {
    disconnect();
    onClose();
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ type: "spring" as const, stiffness: 300, damping: 30 }}
      className="absolute top-full right-0 mt-2 w-80 rounded-2xl border border-zinc-800/60 bg-[#18181b] shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)] overflow-hidden z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/50">
        {step === "accounts" && wallets.length > 1 ? (
          <button
            onClick={() => setStep("extensions")}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <CaretLeft size={14} weight="bold" />
            Switch wallet
          </button>
        ) : (
          <span className="text-sm text-zinc-400 font-medium">
            {step === "extensions" ? "Select Wallet" : "Accounts"}
          </span>
        )}
        {walletStatus === "connected" && (
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-red-400 transition-colors"
          >
            <SignOut size={14} weight="bold" />
            Disconnect
          </button>
        )}
      </div>

      {/* Extensions list */}
      {step === "extensions" && (
        <div className="p-2">
          {wallets.length === 0 ? (
            <div className="py-6 text-center">
              <Wallet size={24} weight="duotone" className="mx-auto text-zinc-700 mb-2" />
              <p className="text-sm text-zinc-400">No wallets detected.</p>
              <a
                href="https://www.subwallet.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-sm text-emerald-500/70 hover:text-emerald-400 underline underline-offset-2"
              >
                Install SubWallet
              </a>
            </div>
          ) : (
            wallets.map((source) => (
              <button
                key={source}
                onClick={() => handleSelectExtension(source)}
                disabled={connecting !== null}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-300 hover:bg-zinc-800/50 transition-colors disabled:opacity-40"
              >
                <WalletIcon source={source} size={20} />
                <span className="flex-1 text-left">{walletDisplayName(source)}</span>
                {connecting === source ? (
                  <CircleNotch size={14} className="animate-spin text-zinc-400" />
                ) : (
                  <CaretDown size={12} className="text-zinc-700 -rotate-90" />
                )}
              </button>
            ))
          )}
          {walletError && (
            <p className="px-4 py-2 text-sm text-red-400/70">{walletError}</p>
          )}
        </div>
      )}

      {/* Accounts list */}
      {step === "accounts" && (
        <div className="p-2 max-h-64 overflow-y-auto">
          {accounts.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-zinc-400">No accounts in this wallet.</p>
            </div>
          ) : (
            accounts.map((acc) => {
              const isActive = account?.address === acc.address;
              return (
                <button
                  key={acc.address}
                  onClick={() => handleSelectAccount(acc)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                    isActive
                      ? "bg-emerald-500/5 border border-emerald-500/10"
                      : "hover:bg-zinc-800/50"
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      isActive ? "bg-emerald-500/60" : "bg-zinc-700"
                    }`}
                  />
                  <div className="text-left min-w-0">
                    {acc.meta.name && (
                      <div className="text-sm text-zinc-300 truncate">
                        {acc.meta.name}
                      </div>
                    )}
                    <div className="text-sm font-mono text-zinc-400 truncate">
                      {truncateAddress(acc.address)}
                    </div>
                  </div>
                  {isActive && (
                    <CheckCircle
                      size={14}
                      weight="fill"
                      className="text-emerald-500/60 ml-auto flex-shrink-0"
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </motion.div>
  );
}

export function WalletButton() {
  const { account, walletStatus, wallets, balance } = useWallet();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {walletStatus === "connected" && account ? (
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800/50 hover:border-zinc-700 transition-colors active:scale-[0.97]"
        >
          <WalletIcon source={account.meta.source} size={16} />
          <span className="font-mono text-sm text-zinc-400">
            {account.meta.name ?? truncateAddress(account.address)}
          </span>
          {balance !== null && (
            <span className="text-sm font-mono text-zinc-400">
              {balance} VARA
            </span>
          )}
          <CaretDown
            size={10}
            weight="bold"
            className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      ) : walletStatus === "unavailable" || wallets.length === 0 ? (
        <a
          href="https://www.subwallet.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-emerald-500/10 text-emerald-500/70 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors active:scale-[0.97]"
        >
          <Wallet size={14} weight="duotone" />
          Install Wallet
        </a>
      ) : (
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-emerald-600/80 text-emerald-50 hover:bg-emerald-600 transition-colors active:scale-[0.97]"
        >
          <Wallet size={16} weight="bold" />
          Connect
        </button>
      )}

      <AnimatePresence>
        {open && <WalletDropdown onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
