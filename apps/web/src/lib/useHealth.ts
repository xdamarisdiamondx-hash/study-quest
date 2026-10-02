import { useEffect, useState } from "react";

export interface Health {
  ok: boolean;
  service: string;
  version: string;
  database: { configured: boolean; reachable: boolean; error?: string };
  ai: { provider: string | null; configured: boolean };
  storage: { provider: "r2" | "local"; configured: boolean };
}

/** Health of the local API. Absent until P2 wires the database up. */
export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/health", { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        setHealth((await res.json()) as Health);
        setOffline(false);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setOffline(true);
      }
    }

    void load();
    const timer = setInterval(load, 15_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  return { health, offline };
}
