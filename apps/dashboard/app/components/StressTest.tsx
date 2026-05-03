"use client";
import { useState } from "react";

interface StressResult {
  ok: boolean;
  txSignature?: string;
  reason?: string;
  attempted: string;
}

export function StressTest() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<StressResult | null>(null);

  const handleStress = async () => {
    setRunning(true);
    setResult(null);

    try {
      const r = await fetch("/api/stress-test", { method: "POST" });
      const data = await r.json();
      setResult(data);
    } catch (e: any) {
      setResult({ ok: false, attempted: "unknown", reason: e.message ?? "request failed" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-red-500/40 rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-sm font-mono uppercase tracking-wider text-red-500 mb-1">
            Stress test
          </h3>
          <p className="text-xs text-muted">
            Click to attempt a $10 USDC withdrawal — well above the on-chain
            <code className="text-foreground"> max_per_tx (0.5 USDC) </code>
            policy. Watch the contract refuse.
          </p>
        </div>
        <button
          onClick={handleStress}
          disabled={running}
          className="px-4 py-2 bg-red-600 text-white text-sm font-mono rounded
                     disabled:opacity-50 hover:bg-red-700 transition-colors flex-shrink-0"
        >
          {running ? "Trying..." : "Try to drain"}
        </button>
      </div>

      {result && (
        <div
          className={`mt-3 p-3 rounded text-xs font-mono ${
            result.ok
              ? "bg-yellow-500/20 text-yellow-400"
              : "bg-green-500/10 text-green-400"
          }`}
        >
          {result.ok ? (
            <>
              Unexpected — withdrawal succeeded:
              <a
                href={`https://explorer.solana.com/tx/${result.txSignature}?cluster=devnet`}
                target="_blank" rel="noopener noreferrer"
                className="block mt-1 underline break-all"
              >
                {result.txSignature}
              </a>
            </>
          ) : (
            <>
              Contract refused (as expected):<br />
              <span className="font-bold">{result.reason}</span><br />
              <span className="text-muted">attempted: {result.attempted}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
