"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Transaction {
  type: "earned" | "spent";
  label: string;
  amount: number;
  time: string;
}

// Demo transactions for display
const demoTransactions: Transaction[] = [
  { type: "earned", label: "Earned from API call", amount: 0.01, time: "2 min ago" },
  { type: "spent", label: "Paid OpenAI (LLM credits)", amount: 0.50, time: "1 hr ago" },
  { type: "earned", label: "Earned from API call", amount: 0.01, time: "1 hr ago" },
  { type: "spent", label: "Paid Helius (RPC top-up)", amount: 0.20, time: "3 hr ago" },
  { type: "earned", label: "Earned from API call", amount: 0.01, time: "3 hr ago" },
  { type: "earned", label: "Earned from API call", amount: 0.01, time: "4 hr ago" },
  { type: "spent", label: "Paid Twitter Premium", amount: 0.30, time: "6 hr ago" },
  { type: "earned", label: "Earned from API call", amount: 0.01, time: "7 hr ago" },
];

export function TransactionFeed() {
  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
      <div className="space-y-0">
        {demoTransactions.map((tx, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-3 border-b border-border last:border-0"
          >
            <div className="flex items-center gap-3">
              <span
                className={`text-sm font-mono font-bold ${
                  tx.type === "earned" ? "text-positive" : "text-negative"
                }`}
              >
                {tx.type === "earned" ? "+" : "-"}${tx.amount.toFixed(2)}
              </span>
              <span className="text-sm">{tx.label}</span>
            </div>
            <span className="text-xs text-muted">{tx.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
