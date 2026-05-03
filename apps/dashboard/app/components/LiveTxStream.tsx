"use client";
import useSWR from "swr";
import { useEffect, useRef, useState } from "react";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Tx {
  signature: string;
  type: string;
  label: string;
  amount: number;
  timestamp: number;
}

export function LiveTxStream() {
  const { data } = useSWR<{ transactions: Tx[] }>("/api/transactions", fetcher, {
    refreshInterval: 5000,
  });
  const [newTxIds, setNewTxIds] = useState<Set<string>>(new Set());
  const prevSigsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!data?.transactions) return;
    const currentSigs = new Set(data.transactions.map(t => t.signature));
    const newOnes = new Set<string>();
    for (const sig of currentSigs) {
      if (!prevSigsRef.current.has(sig)) newOnes.add(sig);
    }
    if (newOnes.size > 0) {
      setNewTxIds(newOnes);
      setTimeout(() => setNewTxIds(new Set()), 1500);
    }
    prevSigsRef.current = currentSigs;
  }, [data]);

  if (!data) {
    return (
      <div className="border border-border rounded-lg p-4 bg-card">
        <div className="h-3 bg-border rounded w-32 mb-3 animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="flex justify-between py-2 border-b border-border/50">
            <div className="h-3 bg-border rounded w-24 animate-pulse" />
            <div className="h-3 bg-border rounded w-12 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const txs = data.transactions ?? [];
  const explorerUrl = (sig: string) =>
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <h3 className="text-sm font-mono uppercase tracking-wider text-muted mb-3 flex items-center gap-2">
        Recent transactions
        <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Live" />
      </h3>
      {txs.length === 0 ? (
        <p className="text-xs text-muted py-4">No transactions yet.</p>
      ) : (
        <div className="space-y-1">
          {txs.slice(0, 8).map(tx => (
            <a
              key={tx.signature}
              href={explorerUrl(tx.signature)}
              target="_blank" rel="noopener noreferrer"
              className={`flex items-center justify-between py-2 px-2 rounded text-xs font-mono
                          hover:bg-border/30 transition-all
                          ${newTxIds.has(tx.signature) ? "bg-yellow-500/10" : ""}`}
              style={{
                animation: newTxIds.has(tx.signature) ? "flashIn 1.5s" : undefined,
              }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`flex-shrink-0 w-1.5 h-4 rounded-sm ${
                    tx.type === "earned" ? "bg-green-500" :
                    tx.type === "spent" ? "bg-red-500" : "bg-gray-500"
                  }`}
                />
                <span className="truncate">{tx.label}</span>
              </span>
              <span className="flex-shrink-0 ml-3 text-muted">
                {tx.type === "earned" ? "+" : tx.type === "spent" ? "-" : ""}
                ${Math.abs(tx.amount).toFixed(4)}
              </span>
            </a>
          ))}
        </div>
      )}
      <style jsx>{`
        @keyframes flashIn {
          0% { background: rgba(255, 200, 0, 0.4); transform: translateX(-4px); }
          100% { background: transparent; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
