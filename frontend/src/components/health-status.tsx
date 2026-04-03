"use client";

import { useEffect, useState } from "react";

interface Health {
  status: string;
  postgres: boolean;
  redis: boolean;
}

export function HealthStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    fetch(`${apiUrl}/health`)
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <p style={{ color: "red" }}>Backend unreachable: {error}</p>;
  }

  if (!health) {
    return <p>Checking backend health...</p>;
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <h2>Backend Health</h2>
      <ul>
        <li>Status: <strong>{health.status}</strong></li>
        <li>PostgreSQL: {health.postgres ? "connected" : "disconnected"}</li>
        <li>Redis: {health.redis ? "connected" : "disconnected"}</li>
      </ul>
    </div>
  );
}
