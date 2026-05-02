"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function StatCard({
  label,
  value,
  delta,
  accent,
}: {
  label: string;
  value: string;
  delta?: "+" | "-";
  accent?: boolean;
}) {
  return (
    <div
      className={`border rounded-lg p-4 ${
        accent ? "border-accent bg-accent-dim glow" : "border-border bg-card"
      }`}
    >
      <div className="text-xs text-muted uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold font-mono">
        {delta && (
          <span
            className={
              delta === "+" ? "text-positive" : "text-negative"
            }
          >
            {delta}
          </span>
        )}
        {value}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border border-border rounded-lg p-4 bg-card animate-pulse">
          <div className="h-3 bg-border rounded w-16 mb-2" />
          <div className="h-7 bg-border rounded w-24" />
        </div>
      ))}
    </div>
  );
}

export function LiveStats() {
  const { data } = useSWR("/api/state", fetcher, { refreshInterval: 5000 });
  if (!data) return <Skeleton />;

  const vault = data.vault || {};
  const balance = (vault.balance || 0) / 1e6;
  const earned = (vault.total_received || 0) / 1e6;
  const spent = (vault.total_spent || 0) / 1e6;

  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard label="BALANCE" value={`$${balance.toFixed(2)}`} accent />
      <StatCard label="EARNED" value={`$${earned.toFixed(2)}`} delta="+" />
      <StatCard label="SPENT" value={`$${spent.toFixed(2)}`} delta="-" />
    </div>
  );
}
