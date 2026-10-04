"use client";

import { useEffect, useState } from "react";
import { api, type Deployment, type DeployEvent, type DeployLog } from "@/lib/api";
import { Card, PageHeader, ErrorBanner, StatusBadge, btnSecondary } from "@/components/ui";
import { ProjectLayout } from "@/components/project-nav";

export default function DeploymentDetail({ params }: { params: { id: string; depId: string } }) {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [events, setEvents] = useState<DeployEvent[]>([]);
  const [logs, setLogs] = useState<DeployLog[]>([]);
  const [live, setLive] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setDeployment((await api.getDeployment(params.id, params.depId)).deployment);
      setEvents((await api.deploymentEvents(params.id, params.depId)).events);
      setLogs((await api.deploymentLogs(params.id, params.depId)).logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("shipyard_token") : null;
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const src = new EventSource(`${base}/api/projects/${params.id}/events?token=${token}`);
    const onLog = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data);
        if (evt.deploymentId === Number(params.depId)) {
          setLive((prev) => [...prev.slice(-200), `[${evt.data.source}] ${evt.data.line}`].slice(-200));
        }
      } catch { /* ignore */ }
    };
    const onStatus = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data);
        if (evt.deploymentId === Number(params.depId)) load();
      } catch { /* ignore */ }
    };
    src.addEventListener("DEPLOYMENT_LOG", onLog as EventListener);
    src.addEventListener("DEPLOYMENT_STATUS", onStatus as EventListener);
    return () => src.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rollback() {
    try {
      const r = await api.rollbackDeployment(params.id, params.depId);
      window.location.href = `/projects/${params.id}/deployments/${r.deployment.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "rollback_failed");
    }
  }

  if (error && !deployment) return <div><ErrorBanner message={error} /></div>;
  if (!deployment) return <div><Card><p className="text-sm text-gray-500 dark:text-gray-400">Loading deployment…</p></Card></div>;

  return (
    <ProjectLayout id={params.id} active="deployments">
    <div>
      <PageHeader
        title={`Deployment #${deployment.id}`}
        sub={`${deployment.commit_sha} · ${deployment.branch}`}
        actions={<button className={btnSecondary} onClick={rollback}>Rollback to this commit</button>}
        back={{ href: `/projects/${params.id}/deployments`, label: "All deployments" }}
      />
      {error && <ErrorBanner message={error} />}
      <Card>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusBadge status={deployment.status} />
          {deployment.live_url && <a className="font-medium text-indigo-600 dark:text-indigo-400" href={deployment.live_url} target="_blank" rel="noreferrer">Live ↗</a>}
          {deployment.direct_url && <a className="font-medium text-indigo-600 dark:text-indigo-400" href={deployment.direct_url} target="_blank" rel="noreferrer">Direct ↗</a>}
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Live goes via Traefik (needs wildcard DNS) · Direct works on this machine while the instance runs.</p>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Timeline</h2>
        <ol className="mt-2 space-y-0">
          {events.map((e, i) => (
            <li key={i} className="flex gap-3 border-l-2 border-gray-200 py-1.5 pl-3 font-mono text-xs dark:border-gray-700">
              <span className="w-36 shrink-0 text-gray-500 dark:text-gray-400">{e.created_at}</span>
              <span>{e.stage} — {e.status}{e.message ? ` (${e.message})` : ""}</span>
            </li>
          ))}
          {events.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No events yet.</p>}
        </ol>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Logs</h2>
        <pre className="log-scroll mt-2 max-h-96 overflow-auto rounded-lg bg-gray-950 p-4 font-mono text-xs text-green-300">
          {logs.map((l) => `[${l.source}/${l.stream}] ${l.line}`).join("\n") || "No logs yet."}
        </pre>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Live tail <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs font-normal text-green-700 dark:bg-green-900/40 dark:text-green-300">streaming</span></h2>
        <pre className="log-scroll mt-2 max-h-64 overflow-auto rounded-lg bg-gray-950 p-4 font-mono text-xs text-amber-200">
          {live.join("\n") || "Waiting for live events…"}
        </pre>
      </Card>
    </div>
    </ProjectLayout>
  );
}
