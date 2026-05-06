"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Transaction {
  type: "earned" | "spent";
  label: string;
  amount: number;
  time: string;
  signature?: string;
}

function relativeTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function TransactionFeed() {
  const { data } = useSWR("/api/transactions", fetcher, { refreshInterval: 10000 });
  const txs: Transaction[] = data?.transactions ?? [];

  if (!data) {
    return (
      <div className="border border-border rounded-lg p-6 bg-card">
        <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
        <div className="text-sm text-muted">Loading...</div>
      </div>
    );
  }

  if (txs.length === 0) {
    return (
      <div className="border border-border rounded-lg p-6 bg-card">
        <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
        <div className="text-sm text-muted">
          No transactions yet. Run a few API calls to start the engine.
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
      <div className="space-y-0">
        {txs.map((tx, i) => {
          const inner = (
            <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-mono font-bold ${
                    tx.type === "earned" ? "text-positive" : "text-negative"
                  }`}
                >
                  {tx.type === "earned" ? "+" : "-"}${tx.amount.toFixed(4)}
                </span>
                <span className="text-sm">{tx.label}</span>
              </div>
              <span className="text-xs text-muted">{tx.time || relativeTime(0)}</span>
            </div>
          );

          if (tx.signature) {
            return (
              <a
                key={tx.signature}
                href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:bg-border/30 transition-colors rounded"
              >
                {inner}
              </a>
            );
          }
          return <div key={i}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
