"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, PageHeader, Empty, ErrorBanner, StatusBadge } from "@/components/ui";

type Overview = Awaited<ReturnType<typeof api.overview>>;

export default function Home() {
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
  if (!data) return <div><Card><p className="text-sm text-gray-500 dark:text-gray-400">Loading overview…</p></Card></div>;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        sub="Live platform state — all numbers are real."
        actions={<a href="/projects" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-900">New project</a>}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><div className="text-sm text-gray-500 dark:text-gray-400">Projects</div><div className="mt-1 text-3xl font-bold">{data.counts.total}</div></Card>
        <Card>
          <div className="text-sm text-gray-500 dark:text-gray-400">Live</div>
          <div className="mt-1 text-3xl font-bold text-green-600 dark:text-green-400">{data.counts.live}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500 dark:text-gray-400">Failed</div>
          <div className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">{data.counts.failed}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500 dark:text-gray-400">Needs attention</div>
          <div className="mt-1 text-3xl font-bold">{data.counts.total - data.counts.live - data.counts.failed}</div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="!p-0">
          <h2 className="px-4 pt-4 font-semibold">Top projects</h2>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.projects.slice(0, 8).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <a href={`/projects/${p.id}`} className="font-semibold text-indigo-600 dark:text-indigo-400">{p.name}</a>
                {p.latest ? <StatusBadge status={p.latest.status} /> : <span className="text-xs text-gray-400">never deployed</span>}
                <span className="ml-auto font-mono text-xs text-gray-400">{p.branch}</span>
              </li>
            ))}
            {data.projects.length === 0 && <Empty text="No projects yet — create one to get started." />}
          </ul>
        </Card>
        <Card className="!p-0">
          <h2 className="px-4 pt-4 font-semibold">Recent failures</h2>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.recentFailures.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <a href={`/projects/${f.project_id}/deployments/${f.id}`} className="font-mono text-indigo-600 dark:text-indigo-400">#{f.id}</a>
                <span className="truncate">{f.project_name}</span>
                <StatusBadge status={f.status} />
                <span className="ml-auto text-xs text-gray-400">{f.created_at}</span>
              </li>
            ))}
            {data.recentFailures.length === 0 && <Empty text="No failures — clean record." />}
          </ul>
        </Card>
      </div>
    </div>
  );
}
