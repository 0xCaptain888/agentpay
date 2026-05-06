"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function PolicyPanel() {
  const { data } = useSWR("/api/state", fetcher, { refreshInterval: 5000 });

  const vault = data?.vault || {};
  const maxPerTx = (vault.max_per_tx || 500_000) / 1e6;
  const maxPerDay = (vault.max_per_day || 5_000_000) / 1e6;
  const spentToday = (vault.spent_today || 0) / 1e6;

  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <h2 className="text-lg font-semibold mb-4">
        Spending Policy
        <span className="text-xs font-normal text-accent ml-2">on-chain enforced</span>
      </h2>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Max per transaction</span>
          <span className="font-mono">{maxPerTx.toFixed(2)} USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Max per day</span>
          <span className="font-mono">{maxPerDay.toFixed(2)} USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Spent today</span>
          <span className="font-mono">
            ${spentToday.toFixed(2)}
            <span className="text-muted"> / ${maxPerDay.toFixed(2)}</span>
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-border rounded-full h-2">
          <div
            className="bg-accent rounded-full h-2 transition-all"
            style={{ width: `${Math.min((spentToday / maxPerDay) * 100, 100)}%` }}
          />
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Vendors allowlisted</span>
          <span className="font-mono">{vault.allowlist_size ?? 0} vendors</span>
        </div>
      </div>
    </div>
  );
}
