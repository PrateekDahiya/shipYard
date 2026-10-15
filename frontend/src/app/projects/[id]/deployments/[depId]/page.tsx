"use client";

import { useEffect, useMemo, useState } from "react";
import { api, apiBase, type Deployment, type DeployEvent } from "@/lib/api";
import { Card, PageHeader, ErrorBanner, HealthBadge, StatusBadge, btnPrimary, btnSecondary } from "@/components/ui";
import { ProjectLayout } from "@/components/project-nav";
import DeploymentLogs from "@/components/deployment-logs";
import { usePolling } from "@/lib/use-polling";
import { formatDeploymentTime, isCurrentLiveDeployment, isDeploymentActive, isDeploymentFailed } from "@/lib/deployment";

function stageDot(status: string) {
  const s = status.toUpperCase();
  if (s.includes("FAIL")) return "bg-red-500";
  if (s === "SUCCESS" || s === "DONE" || s === "COMPLETE") return "bg-green-500";
   if (["RUNNING", "STARTING", "HEALTH_CHECKING", "BUILDING", "CLONING"].includes(s)) return "bg-[var(--accent)]";
  return "bg-gray-300 dark:bg-gray-600";
}

export default function DeploymentDetail({ params }: { params: { id: string; depId: string } }) {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [events, setEvents] = useState<DeployEvent[]>([]);
  const [currentLiveId, setCurrentLiveId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  async function load() {
    try {
      const [depRes, eventsRes, listRes] = await Promise.all([
        api.getDeployment(params.id, params.depId),
        api.deploymentEvents(params.id, params.depId).catch(() => ({ events: [] as DeployEvent[] })),
        api.listDeployments(params.id).catch(() => ({ deployments: [] as Deployment[] })),
      ]);
      setDeployment(depRes.deployment);
      setEvents(eventsRes.events);
       const current = listRes.deployments.find((d) => isCurrentLiveDeployment(d)) ?? null;
      setCurrentLiveId(current ? current.id : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    }
  }

  usePolling(load, 30000, !deployment || isDeploymentActive(deployment.status), `${params.id}:${params.depId}`);

  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("shipyard_token") : null;
    if (!token) return;
    const base = apiBase();
    const src = new EventSource(`${base}/api/projects/${params.id}/events?token=${token}`);
    const onStatus = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data);
        if (evt.deploymentId === Number(params.depId)) load();
      } catch { /* ignore */ }
    };
    src.addEventListener("DEPLOYMENT_STATUS", onStatus as EventListener);
    return () => src.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, params.depId]);

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
    if (!deployment || !isDeploymentActive(deployment.status)) return;
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

  async function promote() {
    if (!deployment) return;
    if (!window.confirm("Promote this preview build to production?")) return;
    setActionBusy(true);
    try {
      const r = await api.promoteDeployment(params.id, params.depId);
      window.location.href = `/projects/${params.id}/deployments/${r.deployment.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "promote_failed");
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

  return (
    <ProjectLayout id={params.id} active="deployments">
    <div>
      <PageHeader
        title={`Deployment #${deployment.id}`}
        sub={`${deployment.commit_sha.slice(0, 8)} · ${deployment.branch}`}
        actions={
          <>
            {isDeploymentActive(deployment.status) && (
              <button className={btnSecondary} onClick={cancel} disabled={actionBusy}>
                {actionBusy ? "Working…" : "Cancel"}
              </button>
            )}
            {deployment.environment !== "production" && deployment.status === "SUCCESS" && deployment.instance_state === "RUNNING" && (
              <button className={btnSecondary} onClick={promote} disabled={actionBusy}>{actionBusy ? "Working…" : "Promote to production"}</button>
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
      ) : isDeploymentFailed(deployment.status) ? (
        <Card className="mb-4 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm text-red-900 dark:text-red-200">
            This deployment failed. Check the timeline and logs below, then redeploy this commit or push a fix.
          </p>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
           {deployment.environment !== "production" && <span className="border border-[var(--accent)]/30 bg-[var(--accent-subtle)] px-2 py-0.5 text-xs text-[var(--accent-strong)]">{deployment.environment === "staging" ? "Staging" : "Preview"}{deployment.preview_key ? ` · ${deployment.preview_key}` : ""}</span>}
           <StatusBadge status={deployment.status} />
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400" title={deployment.commit_sha}>
            {deployment.commit_sha}
          </span>
           {(deployment.public_url || deployment.live_url) && (
             <a className="text-sm font-medium text-[var(--accent-strong)] hover:underline" href={deployment.public_url || deployment.live_url || "#"} target="_blank" rel="noreferrer">
               {deployment.environment !== "production" ? `${deployment.environment === "staging" ? "Staging" : "Preview"} ↗` : deployment.public_url ? "Public ↗" : isCurrentLive ? "Live ↗" : "Project live URL ↗"}
            </a>
           )}
           {deployment.public_url && <HealthBadge state={deployment.public_health_state} />}
          {deployment.direct_url && (
             <a className="text-sm font-medium text-[var(--accent-strong)] hover:underline" href={deployment.direct_url} target="_blank" rel="noreferrer">
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
            <dd className="text-xs" title={deployment.created_at}>{formatDeploymentTime(deployment.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Started</dt>
            <dd className="text-xs" title={deployment.started_at || ""}>{formatDeploymentTime(deployment.started_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Finished</dt>
            <dd className="text-xs" title={deployment.finished_at || ""}>{formatDeploymentTime(deployment.finished_at)}</dd>
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
                <span className="w-36 shrink-0 text-gray-500 dark:text-gray-400">{formatDeploymentTime(e.created_at)}</span>
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

          <DeploymentLogs projectId={params.id} deploymentId={params.depId} poll={isDeploymentActive(deployment.status)} />
    </div>
    </ProjectLayout>
  );
}
