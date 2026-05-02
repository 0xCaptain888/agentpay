export const revalidate = 5;

export async function GET() {
  try {
    const url = process.env.ALPHASCOUT_URL || "http://localhost:8000";
    const res = await fetch(`${url}/status`, {
      next: { revalidate: 5 },
    });
    const data = await res.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({
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
    });
  }
}
