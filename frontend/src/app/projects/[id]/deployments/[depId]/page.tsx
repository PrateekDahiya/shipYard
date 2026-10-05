"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Deployment, type DeployEvent, type DeployLog } from "@/lib/api";
import { Card, PageHeader, ErrorBanner, StatusBadge, btnPrimary, btnSecondary } from "@/components/ui";
import { ProjectLayout } from "@/components/project-nav";

function isFailed(status: string) {
  return status.includes("FAIL");
}

function isActive(status: string) {
  return ["QUEUED", "CLONING", "BUILDING", "IMAGE_CREATED", "STARTING", "HEALTH_CHECKING", "RUNNING"].includes(status);
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function stageDot(status: string) {
  const s = status.toUpperCase();
  if (s.includes("FAIL")) return "bg-red-500";
  if (s === "SUCCESS" || s === "DONE" || s === "COMPLETE") return "bg-green-500";
  if (["RUNNING", "STARTING", "HEALTH_CHECKING", "BUILDING", "CLONING"].includes(s)) return "bg-indigo-500";
  return "bg-gray-300 dark:bg-gray-600";
}

export default function DeploymentDetail({ params }: { params: { id: string; depId: string } }) {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [events, setEvents] = useState<DeployEvent[]>([]);
  const [logs, setLogs] = useState<DeployLog[]>([]);
  const [live, setLive] = useState<string[]>([]);
  const [currentLiveId, setCurrentLiveId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  async function load() {
    try {
      const [depRes, eventsRes, logsRes, listRes] = await Promise.all([
        api.getDeployment(params.id, params.depId),
        api.deploymentEvents(params.id, params.depId).catch(() => ({ events: [] as DeployEvent[] })),
        api.deploymentLogs(params.id, params.depId).catch(() => ({ logs: [] as DeployLog[] })),
        api.listDeployments(params.id).catch(() => ({ deployments: [] as Deployment[] })),
      ]);
      setDeployment(depRes.deployment);
      setEvents(eventsRes.events);
      setLogs(logsRes.logs);
      const current = listRes.deployments.find((d) => d.status === "SUCCESS" || d.status === "RUNNING") ?? null;
      setCurrentLiveId(current ? current.id : null);
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
    if (!deployment) return;
    if (!window.confirm(`Redeploy commit ${deployment.commit_sha.slice(0, 8)} as a new deployment?`)) return;
    setActionBusy(true);
    try {
      const r = await api.rollbackDeployment(params.id, params.depId);
      window.location.href = `/projects/${params.id}/deployments/${r.deployment.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "rollback_failed");
      setActionBusy(false);
    }
  }

  async function cancel() {
    if (!deployment || !isActive(deployment.status)) return;
    if (!window.confirm(`Cancel deployment #${deployment.id}?`)) return;
    setActionBusy(true);
    try {
      await api.cancelDeployment(params.id, params.depId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "cancel_failed");
    } finally {
      setActionBusy(false);
    }
  }

  const isCurrentLive = useMemo(
    () => deployment !== null && currentLiveId !== null && deployment.id === currentLiveId,
    [deployment, currentLiveId]
  );
  const isSuperseded = useMemo(
    () => deployment !== null && deployment.status === "SUCCESS" && currentLiveId !== null && deployment.id !== currentLiveId,
    [deployment, currentLiveId]
  );

  if (error && !deployment) return <div><ErrorBanner message={error} /></div>;
  if (!deployment) return <div><Card><p className="text-sm text-gray-500 dark:text-gray-400">Loading deployment…</p></Card></div>;

  const logText = logs.map((l) => `[${l.source}/${l.stream}] ${l.line}`).join("\n");

  return (
    <ProjectLayout id={params.id} active="deployments">
    <div>
      <PageHeader
        title={`Deployment #${deployment.id}`}
        sub={`${deployment.commit_sha.slice(0, 8)} · ${deployment.branch}`}
        actions={
          <>
            {isActive(deployment.status) && (
              <button className={btnSecondary} onClick={cancel} disabled={actionBusy}>
                {actionBusy ? "Working…" : "Cancel"}
              </button>
            )}
            <button className={btnPrimary} onClick={rollback} disabled={actionBusy}>
              {actionBusy ? "Working…" : "Redeploy this commit"}
            </button>
          </>
        }
        back={{ href: `/projects/${params.id}/deployments`, label: "All deployments" }}
      />
      {error && <ErrorBanner message={error} />}

      {isCurrentLive ? (
        <Card className="mb-4 border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
          <p className="flex items-center gap-2 text-sm font-medium text-green-900 dark:text-green-200">
            <span className="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400" />
            Current live deployment — traffic is serving this build.
          </p>
        </Card>
      ) : isSuperseded ? (
        <Card className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            Superseded — this build succeeded but live traffic has moved to{" "}
            <a className="font-medium underline underline-offset-2" href={`/projects/${params.id}/deployments/${currentLiveId}`}>
              #{currentLiveId}
            </a>
            . The Live URL below now serves that newer build.
          </p>
        </Card>
      ) : isFailed(deployment.status) ? (
        <Card className="mb-4 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm text-red-900 dark:text-red-200">
            This deployment failed. Check the timeline and logs below, then redeploy this commit or push a fix.
          </p>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={deployment.status} />
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400" title={deployment.commit_sha}>
            {deployment.commit_sha}
          </span>
          {deployment.live_url && (
            <a className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400" href={deployment.live_url} target="_blank" rel="noreferrer">
              {isCurrentLive ? "Live ↗" : "Project live URL ↗"}
            </a>
          )}
          {deployment.direct_url && (
            <a className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400" href={deployment.direct_url} target="_blank" rel="noreferrer">
              Direct ↗
            </a>
          )}
        </div>
        {(deployment.commit_message || deployment.commit_author) && (
          <p className="mt-2 truncate text-sm text-gray-600 dark:text-gray-300">
            {deployment.commit_message}
            {deployment.commit_author ? <span className="text-gray-400"> — {deployment.commit_author}</span> : null}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-400">Branch</dt>
            <dd className="font-mono text-xs">{deployment.branch}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Created</dt>
            <dd className="text-xs" title={deployment.created_at}>{formatTime(deployment.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Started</dt>
            <dd className="text-xs" title={deployment.started_at || ""}>{formatTime(deployment.started_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Finished</dt>
            <dd className="text-xs" title={deployment.finished_at || ""}>{formatTime(deployment.finished_at)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Live goes via Traefik (needs wildcard DNS) · Direct works on this machine while the instance runs.
          {isSuperseded ? " Since this build is superseded, Live opens the current build, not this one." : ""}
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Timeline <span className="ml-1 text-xs font-normal text-gray-400">{events.length} events</span></h2>
        {events.length > 0 ? (
          <ol className="mt-3 space-y-0">
            {events.map((e, i) => (
              <li key={i} className="flex gap-3 border-l-2 border-gray-200 py-1.5 pl-3 font-mono text-xs dark:border-gray-700">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${stageDot(e.status)}`} />
                <span className="w-36 shrink-0 text-gray-500 dark:text-gray-400">{formatTime(e.created_at)}</span>
                <span className="min-w-0 flex-1 truncate" title={`${e.stage} — ${e.status}${e.message ? ` (${e.message})` : ""}`}>
                  <span className="font-medium">{e.stage}</span>
                  <span className="text-gray-500"> — {e.status}</span>
                  {e.message ? <span className="text-gray-500"> ({e.message})</span> : null}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No events yet — the worker reports each pipeline stage here.</p>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Logs <span className="ml-1 text-xs font-normal text-gray-400">{logs.length} lines</span></h2>
        <pre className="log-scroll mt-2 max-h-96 overflow-auto rounded-lg bg-gray-950 p-4 font-mono text-xs leading-relaxed text-green-300">
          {logText || "No logs yet."}
        </pre>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Live tail <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs font-normal text-green-700 dark:bg-green-900/40 dark:text-green-300">streaming</span></h2>
        <pre className="log-scroll mt-2 max-h-64 overflow-auto rounded-lg bg-gray-950 p-4 font-mono text-xs leading-relaxed text-amber-200">
          {live.join("\n") || "Waiting for live events…"}
        </pre>
      </Card>
    </div>
    </ProjectLayout>
  );
}
