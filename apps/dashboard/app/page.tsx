import { LiveStats } from "./components/LiveStats";
import { UptimeCounter } from "./components/UptimeCounter";
import { TransactionFeed } from "./components/TransactionFeed";
import { PolicyPanel } from "./components/PolicyPanel";

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
          <h1 className="text-3xl font-bold tracking-tight">AlphaScout</h1>
        </div>
        <p className="text-muted text-sm">
          Autonomous research agent · earning and spending USDC on Solana
        </p>
        <UptimeCounter />
      </div>

      {/* Live Stats */}
      <LiveStats />

      {/* Transaction Feed */}
      <div className="mt-8">
        <TransactionFeed />
      </div>

      {/* Policy Panel */}
      <div className="mt-8">
        <PolicyPanel />
      </div>

      {/* Signals Preview */}
      <div className="mt-8 border border-border rounded-lg p-6 bg-card">
        <h2 className="text-lg font-semibold mb-4">
          Latest Signals
          <span className="text-sm font-normal text-muted ml-2">
            (subscribers only — pay 0.01 USDC)
          </span>
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div className="flex-1">
                <div className="h-4 bg-border rounded w-3/4 mb-1" />
                <div className="h-3 bg-border rounded w-1/2 opacity-50" />
              </div>
              <span className="text-xs text-muted ml-4">
                confidence {Math.floor(Math.random() * 3) + 3}/5
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mt-4">
          Pay 0.01 USDC via the /signals/today endpoint to unlock full signal data.
        </p>
      </div>

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t border-border text-xs text-muted flex flex-wrap gap-3 items-center">
        {process.env.NEXT_PUBLIC_VAULT_PDA && (
          <a
            href={`https://explorer.solana.com/address/${process.env.NEXT_PUBLIC_VAULT_PDA}?cluster=devnet`}
            target="_blank" rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Vault PDA: {process.env.NEXT_PUBLIC_VAULT_PDA.slice(0, 8)}...
          </a>
        )}
        <span>·</span>
        {process.env.NEXT_PUBLIC_VAULT_ATA && (
          <a
            href={`https://explorer.solana.com/address/${process.env.NEXT_PUBLIC_VAULT_ATA}?cluster=devnet`}
            target="_blank" rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Vault ATA: {process.env.NEXT_PUBLIC_VAULT_ATA.slice(0, 8)}...
          </a>
        )}
        <span>·</span>
        <a
          href={`https://explorer.solana.com/address/${process.env.NEXT_PUBLIC_PROGRAM_ID}?cluster=devnet`}
          target="_blank" rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Program: {(process.env.NEXT_PUBLIC_PROGRAM_ID || "not deployed")?.slice(0, 8)}...
        </a>
        <span>·</span>
        <a href="https://github.com/0xCaptain888/agentpay" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
          GitHub
        </a>
        <span>·</span>
        <a href="https://x.com/alphascout_ai" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
          @alphascout_ai
        </a>
        <span className="ml-auto">Built with AgentVault</span>
      </footer>
    </main>
  );
}
