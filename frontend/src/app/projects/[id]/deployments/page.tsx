"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Deployment } from "@/lib/api";
import { Card, PageHeader, Empty, ErrorBanner, StatusBadge, btnPrimary, inputCls } from "@/components/ui";
import { ProjectLayout } from "@/components/project-nav";

type Filter = "all" | "success" | "failed" | "active";

function isFailed(status: string) {
  return status.includes("FAIL");
}

function isActive(status: string) {
  return ["QUEUED", "CLONING", "BUILDING", "IMAGE_CREATED", "STARTING", "HEALTH_CHECKING", "RUNNING"].includes(status);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function Deployments({ params }: { params: { id: string } }) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [commitSha, setCommitSha] = useState("");
  const [branch, setBranch] = useState("main");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [deploying, setDeploying] = useState(false);

  async function load() {
    try {
      setDeployments((await api.listDeployments(params.id)).deployments);
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

  async function deploy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDeploying(true);
    try {
      await api.createDeployment(params.id, { commitSha: commitSha || undefined, branch });
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

  // Newest-first from API. Only the newest SUCCESS/RUNNING deployment is
  // actually serving traffic — older SUCCESS rows keep their historic
  // live_url in the DB, so they must NOT render a Live link.
  const currentLiveId = useMemo(
    () => deployments.find((d) => d.status === "SUCCESS" || d.status === "RUNNING")?.id ?? null,
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
      else if (isFailed(d.status)) failed += 1;
      else if (isActive(d.status)) active += 1;
    }
    return { total: deployments.length, succeeded, failed, active };
  }, [deployments]);

  const visible = useMemo(() => {
    if (filter === "success") return deployments.filter((d) => d.status === "SUCCESS");
    if (filter === "failed") return deployments.filter((d) => isFailed(d.status));
    if (filter === "active") return deployments.filter((d) => isActive(d.status));
    return deployments;
  }, [deployments, filter]);

  const filters: [Filter, string][] = [
    ["all", `All (${counts.total})`],
    ["active", `Active (${counts.active})`],
    ["success", `Succeeded (${counts.succeeded})`],
    ["failed", `Failed (${counts.failed})`],
  ];

  return (
    <ProjectLayout
      id={params.id}
      active="deployments"
      deployments={deployments}
      currentLiveId={deployments.find((d) => d.status === "SUCCESS" || d.status === "RUNNING")?.id ?? null}
    >
    <div>
      <PageHeader
        title="Deployments"
        sub="Newest first · auto-refreshes every 5s"
        back={{ href: `/projects/${params.id}`, label: "Back to project" }}
      />
      {error && <ErrorBanner message={error} />}

      {currentLive && currentLive.live_url && (
        <Card className="mb-4 border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400" />
            <span className="font-semibold text-green-900 dark:text-green-200">
              Live: #{currentLive.id}
            </span>
            <a
              href={currentLive.live_url}
              target="_blank"
              rel="noreferrer"
              className="max-w-full truncate font-mono text-xs text-green-800 underline-offset-2 hover:underline dark:text-green-300"
            >
              {currentLive.live_url}
            </a>
            <a
              href={`/projects/${params.id}/deployments/${currentLive.id}`}
              className="ml-auto text-xs font-medium text-green-800 hover:underline dark:text-green-300"
            >
              Open deployment →
            </a>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">New deployment</h2>
        <form onSubmit={deploy} className="mt-3 flex flex-wrap gap-2">
          <input className={`${inputCls} w-32 font-mono`} placeholder="branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
          <input className={`${inputCls} min-w-0 flex-1 font-mono`} placeholder="commit SHA (optional — latest branch commit is used)" value={commitSha} onChange={(e) => setCommitSha(e.target.value)} />
          <button className={btnPrimary} type="submit" disabled={deploying}>
            {deploying ? "Deploying…" : "Deploy"}
          </button>
        </form>
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={
              filter === key
                ? "rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-gray-900"
                : "rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            }
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          Only the newest successful deployment is live — older rows are history.
        </span>
      </div>

      <Card className="mt-3 !p-0">
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {visible.map((d) => {
            const isCurrent = d.id === currentLiveId;
            return (
              <li key={d.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <a
                    className="font-mono font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
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
                    {formatTime(d.created_at)}
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
                    className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    href={`/projects/${params.id}/deployments/${d.id}`}
                  >
                    Open →
                  </a>
                  <button
                    className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    title="Deploy this commit again as a new deployment"
                    onClick={() => redeploy(d.id)}
                  >
                    Redeploy
                  </button>
                  {isCurrent && d.live_url && (
                    <a
                      className="font-medium text-green-700 hover:underline dark:text-green-300"
                      href={d.live_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Live ↗
                    </a>
                  )}
                  <span className="ml-auto text-xs text-gray-400 sm:hidden" title={d.created_at}>
                    {formatTime(d.created_at)}
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
      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">New deployments start QUEUED and are picked up automatically by the deployment worker. If one stays QUEUED, the worker or Redis is not running.</p>
    </div>
    </ProjectLayout>
  );
}
