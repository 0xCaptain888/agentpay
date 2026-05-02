"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function UptimeCounter() {
  const { data } = useSWR("/api/state", fetcher, { refreshInterval: 5000 });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!data?.boot_at) {
    return (
      <div className="font-mono text-lg text-muted mt-2">
        Connecting...
      </div>
    );
  }

  const elapsed = now - new Date(data.boot_at).getTime();
  const d = Math.floor(elapsed / 86400000);
  const h = Math.floor((elapsed % 86400000) / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);

  return (
    <div className="font-mono text-lg text-muted mt-2">
      Running autonomously for{" "}
      <span className="text-foreground font-semibold">
        {d}d {h}h {m}m {s}s
      </span>
    </div>
  );
}
