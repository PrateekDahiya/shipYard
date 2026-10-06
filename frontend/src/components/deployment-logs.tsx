"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type DeployLog } from "@/lib/api";
import { Card } from "@/components/ui";
import LogViewer from "@/components/log-viewer";

// Persisted build-log viewer for one deployment, polled every 5s so new
// output appears while a build runs.
export default function DeploymentLogs({ projectId, deploymentId }: { projectId: string; deploymentId: string }) {
  const [logs, setLogs] = useState<DeployLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchLogs() {
      try {
        const r = await api.deploymentLogs(projectId, deploymentId);
        if (!cancelled) {
          setLogs(r.logs);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "logs_failed");
      }
    }
    setLogs([]);
    setError(null);
    fetchLogs();
    const t = setInterval(fetchLogs, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [projectId, deploymentId]);

  const entries = useMemo(
    () => logs.map((l) => ({ source: l.source, stream: l.stream, text: l.line })),
    [logs]
  );

  return (
    <Card className="mt-4">
      <h2 className="font-semibold">
        Logs{" "}
        <span className="ml-1 text-xs font-normal text-gray-400">auto-refreshes every 5s</span>
      </h2>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <LogViewer entries={entries} emptyText="No logs yet — run a deployment to stream build output here." accent="green" />
    </Card>
  );
}
