"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import LogViewer, { type LogEntry } from "@/components/log-viewer";

// Live stdout/stderr of the project's currently running container,
// polled every 5s. Complements DeploymentLogs (persisted pipeline output).
export default function ContainerLogs({ projectId }: { projectId: string }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [meta, setMeta] = useState<{ deploymentId?: number; container?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchLogs() {
      try {
        const r = await api.containerLogs(projectId);
        if (cancelled) return;
        if (r.running) {
          setLines(r.lines || []);
          setMeta({ deploymentId: r.deploymentId, container: r.container });
          setError(null);
        } else {
          setLines(null);
          setMeta(null);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "container_logs_failed");
      }
    }
    fetchLogs();
    const t = setInterval(fetchLogs, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [projectId]);

  const entries: LogEntry[] = useMemo(() => {
    if (!lines) return [];
    return lines.map((line) => {
      const m = line.match(/^\[container\/(stdout|stderr)\] ([\s\S]*)$/);
      if (m) return { source: "container", stream: m[1], text: m[2] };
      return { source: "container", stream: "stdout", text: line };
    });
  }, [lines]);

  return (
    <Card>
      <h2 className="font-semibold">
        Live container logs{" "}
        <span className="ml-1 text-xs font-normal text-gray-400">
          {meta?.container ? (
            <>container <span className="font-mono">{meta.container}</span> · auto-refreshes every 5s</>
          ) : (
            "auto-refreshes every 5s"
          )}
        </span>
      </h2>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!error && lines === null && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          No running container — deploy the project to stream its live output here.
        </p>
      )}
      {!error && lines !== null && (
        <LogViewer
          entries={entries}
          emptyText="Container is running but has not logged anything yet."
          accent="cyan"
        />
      )}
    </Card>
  );
}
