export function ComparisonTable() {
  const rows = [
    { label: "Pay-per-call HTTP payments", x402: "Y", mpp: "Y", ap2: "Y", us: "Y" },
    { label: "On-chain spending limits", x402: "-", mpp: "-", ap2: "-", us: "Y", highlight: true },
    { label: "Daily caps + allowlist", x402: "-", mpp: "-", ap2: "-", us: "Y", highlight: true },
    { label: "Owner emergency override", x402: "-", mpp: "-", ap2: "-", us: "Y", highlight: true },
    { label: "Audit trail", x402: "facilitator", mpp: "dashboard", ap2: "dashboard", us: "PDA on-chain" },
    { label: "Open source (MIT)", x402: "Y", mpp: "-", ap2: "-", us: "Y" },
    { label: "Drop-in middleware", x402: "Y", mpp: "Y", ap2: "Y", us: "Y" },
    { label: "MCP server", x402: "-", mpp: "-", ap2: "-", us: "Y", highlight: true },
  ];

  return (
    <div className="border border-border rounded-lg p-4 bg-card overflow-x-auto">
      <h3 className="text-sm font-mono uppercase tracking-wider text-muted mb-3">
        How AgentVault compares
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 font-normal text-muted">Feature</th>
            <th className="text-center py-2 px-2 font-normal">Coinbase x402</th>
            <th className="text-center py-2 px-2 font-normal">Stripe MPP</th>
            <th className="text-center py-2 px-2 font-normal">Google AP2</th>
            <th className="text-center py-2 px-2 font-bold text-accent">AgentVault</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={`border-b border-border/50 ${r.highlight ? "bg-accent/5" : ""}`}
            >
              <td className="py-2 pr-4">{r.label}</td>
              <td className="text-center py-2 px-2 text-muted">{r.x402}</td>
              <td className="text-center py-2 px-2 text-muted">{r.mpp}</td>
              <td className="text-center py-2 px-2 text-muted">{r.ap2}</td>
              <td className={`text-center py-2 px-2 ${r.highlight ? "text-accent font-bold" : ""}`}>
                {r.us}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted mt-3">
        AgentVault is x402-compatible. Use Coinbase&apos;s @x402/fetch client unchanged
        — we speak the same wire format. The difference is on the server side: every
        withdrawal goes through <code className="text-foreground">withdraw_with_policy</code> first.
      </p>
    </div>
  );
}
