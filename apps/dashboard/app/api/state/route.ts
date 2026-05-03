export const revalidate = 5;

export async function GET() {
  const alphaUrl = process.env.ALPHASCOUT_URL || "http://localhost:8000";
  const datasinkUrl = process.env.DATASINK_URL || "http://localhost:8001";

  const [alpha, datasink] = await Promise.allSettled([
    fetch(`${alphaUrl}/status`, { next: { revalidate: 5 }}).then(r => r.json()),
    fetch(`${datasinkUrl}/status`, { next: { revalidate: 5 }}).then(r => r.json()),
  ]);

  return Response.json({
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
