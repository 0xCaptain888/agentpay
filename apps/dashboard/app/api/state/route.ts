export const revalidate = 5;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const network = searchParams.get("network") ?? "devnet";

  const alphaUrl = process.env.ALPHASCOUT_URL || "http://localhost:8000";
  const datasinkUrl = process.env.DATASINK_URL || "http://localhost:8001";

  const rpcUrl = network === "mainnet"
      ? process.env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com"
      : process.env.DEVNET_RPC_URL ?? "https://api.devnet.solana.com";

  const programId = network === "mainnet"
      ? process.env.MAINNET_PROGRAM_ID!
      : process.env.DEVNET_PROGRAM_ID!;

  const [alpha, datasink] = await Promise.allSettled([
    fetch(`${alphaUrl}/status`, { next: { revalidate: 5 }}).then(r => r.json()),
    fetch(`${datasinkUrl}/status`, { next: { revalidate: 5 }}).then(r => r.json()),
  ]);

  return Response.json({
    network,
    rpcUrl,
    programId,
    protocolRevenue: {
        feeBps: 30,
        description: "0.3% protocol fee on all agent withdrawals"
    },
    agents: [
      { name: "AlphaScout", role: "supplier",
        ...(alpha.status === "fulfilled" ? alpha.value : {
          _fallback: true,
          agent: "AlphaScout",
          uptime_hours: 0,
          boot_at: new Date().toISOString(),
          vault: {
            balance: 0,
            total_received: 0,
            total_spent: 0,
            spent_today: 0,
            max_per_day: 5_000_000,
            max_per_tx: 500_000,
            remaining_today: 5_000_000,
          },
          last_research: null,
        }) },
      { name: "DataSink", role: "consumer",
        ...(datasink.status === "fulfilled" ? datasink.value : { _fallback: true }) },
    ],
  });
}
