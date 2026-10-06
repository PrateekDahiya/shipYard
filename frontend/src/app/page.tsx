"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card, PageHeader, Empty, ErrorBanner, StatusBadge, btnPrimary, btnSecondary } from "@/components/ui";
import { SectionLayout } from "@/components/project-nav";

type Overview = Awaited<ReturnType<typeof api.overview>>;
type ViewKey = "overview" | "deployments" | "failures";

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "deployments", label: "Deployments" },
  { key: "failures", label: "Failures" },
];

function initialView(): ViewKey {
  if (typeof window === "undefined") return "overview";
  try {
    const v = new URLSearchParams(window.location.search).get("view");
    return v === "deployments" || v === "failures" ? v : "overview";
  } catch {
    return "overview";
  }
}

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function StatCard({ label, value, sub, accent }: { label: string; value: number; sub: string; accent: "gray" | "green" | "red" | "amber" }) {
  const colors: Record<string, string> = {
    gray: "text-gray-900 dark:text-gray-100",
    green: "text-green-600 dark:text-green-400",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  };
  const dots: Record<string, string> = {
    gray: "bg-gray-400",
    green: "bg-green-500",
    red: "bg-red-500",
    amber: "bg-amber-500",
  };
  return (
    <Card>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dots[accent]}`} />
        <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      </div>
      <div className={`mt-1 text-3xl font-bold tracking-tight ${colors[accent]}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-400">{sub}</div>
    </Card>
  );
}

export default function Home() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>(initialView);

  useEffect(() => {
    api.overview().then(setData).catch((e) => setError(e.message));
    const interval = setInterval(() => {
      api.overview().then(setData).catch((e) => setError(e.message));
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectView(next: ViewKey) {
    setView(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* non-fatal */
    }
  }

  const stats = useMemo(() => {
    if (!data) return null;
    const neverDeployed = data.projects.filter((p) => !p.latest).length;
    const server = data.projects.filter((p) => (p.deploy_type || "server") === "server").length;
    const staticCount = data.projects.length - server;
    const withLatest = data.projects.filter((p) => p.latest).length;
    const livePct = withLatest ? Math.round((data.counts.live / withLatest) * 100) : 0;
    const recentDeployments = data.projects
      .filter((p) => p.latest)
      .map((p) => ({ projectId: p.id, projectName: p.name, latest: p.latest! }))
      .sort((a, b) => (a.latest.created_at < b.latest.created_at ? 1 : -1));
    const succeeded = recentDeployments.filter((d) => d.latest.status === "SUCCESS").length;
    const failedBuilds = recentDeployments.filter((d) => d.latest.status.includes("FAIL")).length;
    const inProgress = recentDeployments.length - succeeded - failedBuilds;
    const failuresByProject = data.recentFailures.reduce((acc, f) => {
      acc[f.project_name] = (acc[f.project_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const worstProject = Object.entries(failuresByProject).sort((a, b) => b[1] - a[1])[0] ?? null;
    return { neverDeployed, server, staticCount, livePct, recentDeployments, succeeded, failedBuilds, inProgress, failuresByProject, worstProject };
  }, [data]);

  if (error === "unauthorized") {
    return (
      <div>
        <PageHeader title="Dashboard" sub="Your ShipYard at a glance." />
        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Not logged in. <a className="font-medium text-indigo-600 underline dark:text-indigo-400" href="/login">Login</a> or{" "}
            <a className="font-medium text-indigo-600 underline dark:text-indigo-400" href="/register">register</a> to see your projects.
          </p>
        </Card>
      </div>
    );
  }
  if (error) return <div><ErrorBanner message={error} /></div>;
  if (!data || !stats) return <div><Card><p className="text-sm text-gray-500 dark:text-gray-400">Loading overview…</p></Card></div>;

  const sidebar = (
    <nav className="flex flex-col gap-0.5" aria-label="Dashboard navigation">
      <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Views</div>
      {VIEWS.map((v) => {
        const count = v.key === "deployments" ? stats.recentDeployments.length : v.key === "failures" ? data.recentFailures.length : undefined;
        const isActive = view === v.key;
        return (
          <button
            key={v.key}
            type="button"
            onClick={() => selectView(v.key)}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "flex w-full items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-900"
                : "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            }
          >
            {v.label}
            {count !== undefined && count > 0 && (
              <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-medium ${isActive ? "bg-white/20 text-white dark:bg-gray-900/10 dark:text-gray-900" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
      <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Projects</div>
      {data.projects.slice(0, 8).map((p) => (
        <a
          key={p.id}
          href={`/projects/${p.id}`}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          title={p.repository_url || p.name}
        >
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          {p.latest && (p.latest.status === "SUCCESS" || p.latest.status === "RUNNING") && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" title="Live" />
          )}
          {p.latest && p.latest.status.includes("FAIL") && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" title="Failed" />
          )}
        </a>
      ))}
      {data.projects.length === 0 && (
        <p className="px-3 py-2 text-xs text-gray-400">No projects yet.</p>
      )}
      {data.projects.length > 8 && (
        <a href="/projects" className="px-3 py-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          All {data.projects.length} projects →
        </a>
      )}
    </nav>
  );

  return (
    <SectionLayout sidebar={sidebar}>
      <div>
        <PageHeader
          title="Dashboard"
          sub="Live platform state — auto-refreshes every 5s."
          actions={
            <>
              <a href="/projects" className={btnSecondary}>All projects</a>
              <a href="/projects/new" className={btnPrimary}>+ New project</a>
            </>
          }
        />

        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800 lg:hidden" aria-label="Dashboard views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => selectView(v.key)}
              aria-current={view === v.key ? "page" : undefined}
              className={
                view === v.key
                  ? "whitespace-nowrap border-b-2 border-gray-900 px-3 py-2 text-sm font-medium dark:border-white"
                  : "whitespace-nowrap px-3 py-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }
            >
              {v.label}
            </button>
          ))}
        </div>

        {view === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Projects" value={data.counts.total} sub={data.counts.total === 1 ? "1 project tracked" : `${data.counts.total} projects tracked`} accent="gray" />
              <StatCard label="Live now" value={data.counts.live} sub={data.counts.total ? `${stats.livePct}% of deployed projects` : "no projects yet"} accent="green" />
              <StatCard label="Failed latest" value={data.counts.failed} sub="newest build failed" accent="red" />
              <StatCard label="Never deployed" value={stats.neverDeployed} sub="no builds yet" accent="amber" />
            </div>

            <Card className="mt-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="font-semibold text-gray-900 dark:text-gray-100">Fleet mix</span>
                <span className="text-gray-500 dark:text-gray-400">
                  <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{stats.server}</span> server
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{stats.staticCount}</span> static
                </span>
                <span className="ml-auto text-xs text-gray-400">
                  {data.recentFailures.length === 0 ? "No failures on record — clean." : `${data.recentFailures.length} recent failure${data.recentFailures.length === 1 ? "" : "s"} need a look.`}
                </span>
              </div>
            </Card>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
              <Card className="!p-0 xl:col-span-3">
                <div className="flex items-center gap-2 px-4 pt-4">
                  <h2 className="font-semibold">Projects</h2>
                  <a href="/projects" className="ml-auto text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                    Manage all →
                  </a>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.projects.slice(0, 8).map((p) => (
                    <li
                      key={p.id}
                      onClick={() => router.push(`/projects/${p.id}`)}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-gray-900 dark:text-gray-100">{p.name}</span>
                          {p.deploy_type && (
                            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                              {p.deploy_type}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-xs text-gray-400">
                          {p.repository_url || "No repository configured"}
                        </div>
                      </div>
                      {p.latest ? (
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge status={p.latest.status} />
                          <span className="font-mono text-[11px] text-gray-400" title={p.latest.created_at}>
                            {timeAgo(p.latest.created_at)}
                          </span>
                        </div>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-400">never deployed</span>
                      )}
                    </li>
                  ))}
                  {data.projects.length === 0 && (
                    <div className="px-4 pb-2">
                      <Empty text="No projects yet." />
                      <div className="pb-4 text-center">
                        <a href="/projects/new" className={`${btnPrimary} inline-block`}>
                          Create your first project
                        </a>
                      </div>
                    </div>
                  )}
                </ul>
              </Card>

              <div className="flex flex-col gap-4 xl:col-span-2">
                <Card className="!p-0">
                  <div className="flex items-center gap-2 px-4 pt-4">
                    <h2 className="font-semibold">Recent deployments</h2>
                    <button type="button" onClick={() => selectView("deployments")} className="ml-auto text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                      View all →
                    </button>
                  </div>
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {stats.recentDeployments.slice(0, 6).map(({ projectId, projectName, latest }) => (
                      <li
                        key={latest.id}
                        onClick={() => router.push(`/projects/${projectId}/deployments/${latest.id}`)}
                        className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">#{latest.id}</span>
                        <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">{projectName}</span>
                        <StatusBadge status={latest.status} />
                        <span className="shrink-0 text-xs text-gray-400" title={latest.created_at}>
                          {timeAgo(latest.created_at)}
                        </span>
                      </li>
                    ))}
                    {stats.recentDeployments.length === 0 && <Empty text="No deployments yet." />}
                  </ul>
                </Card>

                <Card className="!p-0">
                  <div className="flex items-center gap-2 px-4 pt-4">
                    <h2 className="font-semibold">Recent failures</h2>
                    <button type="button" onClick={() => selectView("failures")} className="ml-auto text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                      View all →
                    </button>
                  </div>
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {data.recentFailures.slice(0, 5).map((f) => (
                      <li
                        key={f.id}
                        onClick={() => router.push(`/projects/${f.project_id}/deployments/${f.id}`)}
                        className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">#{f.id}</span>
                        <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">{f.project_name}</span>
                        <StatusBadge status={f.status} />
                        <span className="shrink-0 font-mono text-[11px] text-gray-400" title={f.created_at}>
                          {timeAgo(f.created_at)}
                        </span>
                      </li>
                    ))}
                    {data.recentFailures.length === 0 && <Empty text="No failures — clean record." />}
                  </ul>
                </Card>
              </div>
            </div>
          </>
        )}

        {view === "deployments" && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Tracked builds" value={stats.recentDeployments.length} sub="latest per project" accent="gray" />
              <StatCard label="Succeeded" value={stats.succeeded} sub="currently healthy" accent="green" />
              <StatCard label="Failed" value={stats.failedBuilds} sub="need attention" accent="red" />
              <StatCard label="In progress" value={stats.inProgress} sub="queued or running" accent="amber" />
            </div>
            <Card className="mt-4 !p-0">
              <h2 className="px-4 pt-4 font-semibold">Latest build per project</h2>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {stats.recentDeployments.map(({ projectId, projectName, latest }) => (
                  <li
                    key={latest.id}
                    onClick={() => router.push(`/projects/${projectId}/deployments/${latest.id}`)}
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">#{latest.id}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-gray-900 dark:text-gray-100">{projectName}</div>
                      <div className="truncate font-mono text-xs text-gray-400">{latest.commit_sha}</div>
                    </div>
                    <StatusBadge status={latest.status} />
                    <span className="shrink-0 text-xs text-gray-400" title={latest.created_at}>
                      {timeAgo(latest.created_at)}
                    </span>
                  </li>
                ))}
                {stats.recentDeployments.length === 0 && <Empty text="No deployments yet — deploy a project to see it here." />}
              </ul>
            </Card>
          </>
        )}

        {view === "failures" && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard label="Recent failures" value={data.recentFailures.length} sub="last 10 builds" accent="red" />
              <StatCard
                label="Projects affected"
                value={Object.keys(stats.failuresByProject).length}
                sub={stats.worstProject ? `worst: ${stats.worstProject[0]} (${stats.worstProject[1]})` : "none — clean"}
                accent="amber"
              />
              <StatCard label="Live now" value={data.counts.live} sub="still serving traffic" accent="green" />
            </div>
            <Card className="mt-4 !p-0">
              <h2 className="px-4 pt-4 font-semibold">Failure history</h2>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.recentFailures.map((f) => (
                  <li
                    key={f.id}
                    onClick={() => router.push(`/projects/${f.project_id}/deployments/${f.id}`)}
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">#{f.id}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-gray-900 dark:text-gray-100">{f.project_name}</div>
                      <div className="truncate font-mono text-xs text-gray-400">{f.commit_sha}</div>
                    </div>
                    <StatusBadge status={f.status} />
                    <span className="shrink-0 font-mono text-[11px] text-gray-400" title={f.created_at}>
                      {timeAgo(f.created_at)}
                    </span>
                  </li>
                ))}
                {data.recentFailures.length === 0 && <Empty text="No failures — clean record." />}
              </ul>
            </Card>
            {data.recentFailures.length > 0 && (
              <Card className="mt-4 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  Fix forward: open a failed build to read the timeline and logs, then redeploy the commit or push a fix.
                  A newer successful build automatically becomes the live one.
                </p>
              </Card>
            )}
          </>
        )}
      </div>
    </SectionLayout>
  );
}
