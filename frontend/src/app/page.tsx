"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card, PageHeader, Empty, ErrorBanner, StatusBadge, btnPrimary, btnSecondary } from "@/components/ui";

type Overview = Awaited<ReturnType<typeof api.overview>>;

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

  useEffect(() => {
    api.overview().then(setData).catch((e) => setError(e.message));
    const interval = setInterval(() => {
      api.overview().then(setData).catch((e) => setError(e.message));
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      .sort((a, b) => (a.latest.created_at < b.latest.created_at ? 1 : -1))
      .slice(0, 6);
    return { neverDeployed, server, staticCount, livePct, recentDeployments };
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

  return (
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

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="!p-0 lg:col-span-3">
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

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="!p-0">
            <h2 className="px-4 pt-4 font-semibold">Recent deployments</h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {stats.recentDeployments.map(({ projectId, projectName, latest }) => (
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
            <h2 className="px-4 pt-4 font-semibold">Recent failures</h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.recentFailures.map((f) => (
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
    </div>
  );
}
