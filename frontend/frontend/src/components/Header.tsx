import { NetworkSelector } from "@/components/NetworkSelector";
import { WalletButton } from "@/components/WalletModal";

export function Header() {
  return (
    <header className="relative z-[2] flex items-center justify-between px-4 lg:px-8 py-5 border-b border-[rgba(19,34,53,0.08)] bg-[rgba(255,248,239,0.48)] backdrop-blur-md">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-black tracking-[-0.08em] text-[var(--accent)]">
          t3
        </h1>
        <NetworkSelector />
      </div>

      <WalletButton />
    </header>
  );
}
