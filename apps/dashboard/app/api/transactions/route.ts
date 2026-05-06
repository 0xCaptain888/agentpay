export const revalidate = 5;

export async function GET() {
  try {
    const url = process.env.ALPHASCOUT_URL || "http://localhost:8000";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${url}/transactions`, {
      next: { revalidate: 5 },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await res.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ transactions: [] });
  }
}
