"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Deployment } from "@/lib/api";
import { Card, PageHeader, Empty, ErrorBanner, HealthBadge, StatusBadge, btnPrimary, inputCls } from "@/components/ui";
import { ProjectLayout } from "@/components/project-nav";
import { usePolling } from "@/lib/use-polling";
import { useProjectEvents } from "@/lib/use-project-events";
import { formatDeploymentTime, isCurrentLiveDeployment, isDeploymentActive, isDeploymentFailed } from "@/lib/deployment";

type Filter = "all" | "success" | "failed" | "active";

export default function Deployments({ params }: { params: { id: string } }) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [commitSha, setCommitSha] = useState("");
  const [branch, setBranch] = useState("main");
  const [environment, setEnvironment] = useState<"production" | "staging" | "preview">("production");
  const [previewKey, setPreviewKey] = useState("preview");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [envFilter, setEnvFilter] = useState<"all" | "production" | "staging" | "preview">("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, pages: 1 });
  const [deploying, setDeploying] = useState(false);

  async function load(pageNumber = page) {
    try {
      const result = await api.listDeployments(params.id, { page: pageNumber, pageSize: 25, status: filter, environment: envFilter === "all" ? undefined : envFilter, search, from, to });
      setDeployments(result.deployments);
      setPagination(result.pagination || { page: pageNumber, pageSize: 25, total: result.deployments.length, pages: 1 });
      setPage(pageNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    }
  }

  useProjectEvents([params.id], load);
  usePolling(load, 30000, deployments.some((d) => isDeploymentActive(d.status)) || deployments.length === 0, params.id);

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, envFilter, search, from, to, params.id]);

  async function deploy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDeploying(true);
    try {
      await api.createDeployment(params.id, { commitSha: commitSha || undefined, branch, environment, previewKey: environment !== "production" ? previewKey : undefined });
      setCommitSha("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "deploy_failed");
    } finally {
      setDeploying(false);
    }
  }

  async function redeploy(depId: number) {
    setError(null);
    try {
      const r = await api.rollbackDeployment(params.id, String(depId));
      window.location.href = `/projects/${params.id}/deployments/${r.deployment.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "redeploy_failed");
    }
  }

  async function promote(depId: number) {
    setError(null);
    try {
      const r = await api.promoteDeployment(params.id, String(depId));
      window.location.href = `/projects/${params.id}/deployments/${r.deployment.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "promote_failed");
    }
  }

  // Newest-first from API. Only the newest SUCCESS/RUNNING deployment is
  // actually serving traffic — older SUCCESS rows keep their historic
  // live_url in the DB, so they must NOT render a Live link.
  const currentLiveId = useMemo(
    () => deployments.find((d) => isCurrentLiveDeployment(d))?.id ?? null,
    [deployments]
  );
  const currentLive = useMemo(
    () => deployments.find((d) => d.id === currentLiveId) ?? null,
    [deployments, currentLiveId]
  );

  const counts = useMemo(() => {
    let succeeded = 0;
    let failed = 0;
    let active = 0;
    for (const d of deployments) {
      if (d.status === "SUCCESS") succeeded += 1;
      else if (isDeploymentFailed(d.status)) failed += 1;
      else if (isDeploymentActive(d.status)) active += 1;
    }
    return { total: deployments.length, succeeded, failed, active };
  }, [deployments]);

  const visible = useMemo(() => {
    if (filter === "success") return deployments.filter((d) => d.status === "SUCCESS");
    if (filter === "failed") return deployments.filter((d) => isDeploymentFailed(d.status));
    if (filter === "active") return deployments.filter((d) => isDeploymentActive(d.status));
    return deployments;
  }, [deployments, filter]);

  const filters: [Filter, string][] = [
    ["all", `All (${counts.total})`],
    ["active", `Active (${counts.active})`],
    ["success", `Succeeded (${counts.succeeded})`],
    ["failed", `Failed (${counts.failed})`],
  ];

  return (
    <ProjectLayout id={params.id} active="deployments">
    <div>
      <PageHeader
        title="Deployments"
        sub="Newest first · auto-refreshes every 5s"
        back={{ href: `/projects/${params.id}`, label: "Back to project" }}
      />
      {error && <ErrorBanner message={error} />}

         {currentLive && (currentLive.public_url || currentLive.live_url) && (
          <Card className="mb-4 border-[var(--success)]/25 bg-[var(--success-subtle)]">
           <div className="flex flex-wrap items-center gap-2 text-sm">
             <span className="h-2 w-2 bg-[var(--success)]" />
              <span className="font-semibold text-[var(--success)]">
               Live: #{currentLive.id}
             </span>
             {currentLive.public_url && <HealthBadge state={currentLive.public_health_state} />}
             <a
              href={currentLive.public_url || currentLive.live_url || "#"}
              target="_blank"
              rel="noreferrer"
               className="max-w-full truncate font-mono text-xs text-[var(--success)] underline-offset-2 hover:underline"
            >
              {currentLive.public_url || currentLive.live_url}
            </a>
            <a
              href={`/projects/${params.id}/deployments/${currentLive.id}`}
               className="ml-auto text-xs font-medium text-[var(--success)] hover:underline"
            >
              Open deployment →
            </a>
          </div>
        </Card>
      )}

       <Card>
         <h2 className="font-semibold">New deployment</h2>
        <form onSubmit={deploy} className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <select className={`${inputCls} w-full sm:w-36`} value={environment} onChange={(e) => setEnvironment(e.target.value as "production" | "staging" | "preview")} aria-label="Deployment environment"><option value="production">Production</option><option value="staging">Staging</option><option value="preview">Preview</option></select>
          <input className={`${inputCls} w-full font-mono sm:w-32`} placeholder="branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
          {environment !== "production" && <input className={`${inputCls} w-full font-mono sm:w-32`} placeholder="staging key" value={previewKey} onChange={(e) => setPreviewKey(e.target.value)} />}
          <input className={`${inputCls} min-w-0 w-full flex-1 font-mono`} placeholder="commit SHA (optional — latest branch commit is used)" value={commitSha} onChange={(e) => setCommitSha(e.target.value)} />
          <button className={`${btnPrimary} w-full sm:w-auto`} type="submit" disabled={deploying}>
            {deploying ? "Deploying…" : "Deploy"}
          </button>
        </form>
      </Card>

       <div className="mt-4 flex flex-col gap-3">
         <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
           <input className={`${inputCls} min-w-0 w-full`} placeholder="Search commit, message, or branch" value={search} onChange={(e) => setSearch(e.target.value)} />
           <input className={`${inputCls} w-full`} type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
           <input className={`${inputCls} w-full`} type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} />
         </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${inputCls} w-full sm:w-40`} value={envFilter} onChange={(e) => setEnvFilter(e.target.value as "all" | "production" | "staging" | "preview")} aria-label="Filter by environment"><option value="all">All environments</option><option value="production">Production</option><option value="staging">Staging</option><option value="preview">Preview</option></select>
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={
              filter === key
                 ? "border border-[var(--foreground)] bg-[var(--foreground)] px-3 py-1.5 text-xs font-medium text-white"
                 : "border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-subtle)]"
            }
          >
            {label}
          </button>
        ))}
           <span className="w-full text-xs text-gray-400 sm:ml-auto sm:w-auto">Showing {deployments.length} of {pagination.total} deployments. Only the newest successful deployment is live.</span>
         </div>
       </div>

      <Card className="mt-3 !p-0">
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {visible.map((d) => {
            const isCurrent = d.id === currentLiveId;
            return (
              <li key={d.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <a
                     className="font-mono font-semibold text-[var(--accent-strong)] hover:underline"
                    href={`/projects/${params.id}/deployments/${d.id}`}
                  >
                    #{d.id}
                  </a>
                   <span className="font-mono text-xs text-gray-500 dark:text-gray-400" title={d.commit_sha}>
                    {d.commit_sha.slice(0, 8)}
                  </span>
                   <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                     {d.branch}
                   </span>
                  {d.environment !== "production" && <span className="border border-[var(--accent)]/30 bg-[var(--accent-subtle)] px-2 py-0.5 text-xs text-[var(--accent-strong)]">{d.environment === "staging" ? "Staging" : "Preview"}{d.preview_key ? ` · ${d.preview_key}` : ""}</span>}
                  <StatusBadge status={d.status} />
                  {isCurrent ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
                      Current live
                    </span>
                  ) : (
                    d.status === "SUCCESS" && (
                      <span className="text-xs text-gray-400" title="Superseded by a newer deployment">
                        Superseded
                      </span>
                    )
                  )}
                  <span className="ml-auto hidden text-xs text-gray-400 sm:inline" title={d.created_at}>
                    {formatDeploymentTime(d.created_at)}
                  </span>
                </div>
                {d.commit_message && (
                  <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                    {d.commit_message}
                    {d.commit_author ? ` — ${d.commit_author}` : ""}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <a
                     className="font-medium text-[var(--accent-strong)] hover:underline"
                    href={`/projects/${params.id}/deployments/${d.id}`}
                  >
                    Open →
                  </a>
                  <button
                     className="font-medium text-[var(--accent-strong)] hover:underline"
                    title="Deploy this commit again as a new deployment"
                    onClick={() => redeploy(d.id)}
                  >
                    Redeploy
                  </button>
                   {isCurrent && (d.public_url || d.live_url) && (
                    <a
                      className="font-medium text-green-700 hover:underline dark:text-green-300"
                      href={d.public_url || d.live_url || "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {d.public_url ? "Public ↗" : "Live ↗"}
                    </a>
                   )}
                   {d.environment !== "production" && d.status === "SUCCESS" && <button className="font-medium text-[var(--accent-strong)] hover:underline" onClick={() => promote(d.id)}>Promote</button>}
                   {d.public_url && <span className={`text-xs ${d.public_health_state === "UP" ? "text-green-700 dark:text-green-300" : d.public_health_state === "DOWN" ? "text-red-700 dark:text-red-300" : "text-gray-400"}`}>Public {d.public_health_state || "CHECKING"}</span>}
                  <span className="ml-auto text-xs text-gray-400 sm:hidden" title={d.created_at}>
                    {formatDeploymentTime(d.created_at)}
                  </span>
                </div>
              </li>
            );
          })}
          {visible.length === 0 && (
            <Empty
              text={
                deployments.length === 0
                  ? "No deployments yet — deploy your first commit above."
                  : "No deployments match this filter."
              }
            />
          )}
       </ul>
      </Card>
      {pagination.pages > 1 && <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--muted)]"><span>Page {pagination.page} of {pagination.pages}</span><div className="flex gap-2"><button className="border border-[var(--border)] px-3 py-1.5 disabled:opacity-40" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>Previous</button><button className="border border-[var(--border)] px-3 py-1.5 disabled:opacity-40" disabled={pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)}>Next</button></div></div>}
      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">New deployments start QUEUED and are picked up automatically by the deployment worker. If one stays QUEUED, the worker or Redis is not running.</p>
    </div>
    </ProjectLayout>
  );
}
