"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, PageHeader, Empty, ErrorBanner } from "@/components/ui";
import { LineChart, BarChart, fmtBytes } from "@/components/chart";
import { ProjectLayout } from "@/components/project-nav";

type Runtime = Awaited<ReturnType<typeof api.runtime>>["runtime"];

export default function Metrics({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.projectMetrics>> | null>(null);
  const [series, setSeries] = useState<{ bucket: string; total: number; errors: number; avgMs: number | null }[]>([]);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.projectMetrics(params.id).then(setData).catch((e) => setError(e.message));
    api.requestSeries(params.id, 24).then((r) => setSeries(r.points)).catch(() => {});
    api.runtime(params.id).then((r) => setRuntime(r.runtime)).catch(() => setRuntime({ running: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <div><ErrorBanner message={error} /></div>;
  if (!data) return <div><Card><p className="text-sm text-gray-500 dark:text-gray-400">Loading metrics…</p></Card></div>;

  const errRate = data.requests.total ? ((data.requests.errors ?? 0) / data.requests.total) * 100 : 0;

  return (
    <ProjectLayout id={params.id} active="metrics">
    <div>
      <PageHeader
        title="Metrics"
        sub="Live data · requests window: last 60 min · graphs: last 24h"
        back={{ href: `/projects/${params.id}`, label: "Back to project" }}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><div className="text-sm text-gray-500 dark:text-gray-400">Requests</div><div className="mt-1 text-2xl font-bold">{data.requests.total}</div></Card>
        <Card><div className="text-sm text-gray-500 dark:text-gray-400">Error rate</div><div className="mt-1 text-2xl font-bold">{errRate.toFixed(1)}%</div></Card>
        <Card><div className="text-sm text-gray-500 dark:text-gray-400">Avg build time</div><div className="mt-1 text-2xl font-bold">{data.deployments.durations.avg_seconds != null ? `${Number(data.deployments.durations.avg_seconds).toFixed(0)}s` : "—"}</div></Card>
        <Card><div className="text-sm text-gray-500 dark:text-gray-400">Deployments</div><div className="mt-1 text-2xl font-bold">{data.deployments.byStatus.reduce((a, s) => a + Number(s.n), 0)}</div></Card>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Requests per hour</h2>
          {series.length ? <BarChart points={series.map((p) => ({ x: p.bucket, y: p.total }))} /> : <Empty text="No traffic in the last 24h." />}
        </Card>
        <Card>
          <h2 className="font-semibold">Avg latency (ms) per hour</h2>
          {series.some((p) => p.avgMs != null)
            ? <LineChart points={series.filter((p) => p.avgMs != null).map((p) => ({ x: p.bucket, y: Number(p.avgMs) }))} />
            : <Empty text="No latency data in the last 24h." />}
        </Card>
      </div>
      <Card className="mt-4">
        <h2 className="font-semibold">Live container resources</h2>
        {!runtime ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : !runtime.running ? (
          <Empty text="No running container right now." />
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div><div className="text-xs text-gray-500 dark:text-gray-400">CPU</div><div className="text-xl font-bold">{runtime.cpuPercent}%</div></div>
            <div><div className="text-xs text-gray-500 dark:text-gray-400">Memory</div><div className="text-xl font-bold">{fmtBytes(runtime.memoryBytes)}</div></div>
            <div><div className="text-xs text-gray-500 dark:text-gray-400">Memory limit</div><div className="text-xl font-bold">{fmtBytes(runtime.memoryLimitBytes)}</div></div>
            <div><div className="text-xs text-gray-500 dark:text-gray-400">Disk (writable)</div><div className="text-xl font-bold">{fmtBytes(runtime.diskWritableBytes)}</div></div>
            <div><div className="text-xs text-gray-500 dark:text-gray-400">Net RX/TX</div><div className="text-xl font-bold">{fmtBytes(runtime.netRxBytes)} / {fmtBytes(runtime.netTxBytes)}</div></div>
          </div>
        )}
      </Card>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Deployments by status</h2>
          <ul className="mt-2 divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {data.deployments.byStatus.map((s) => (
              <li key={s.status} className="flex py-1.5"><span className="font-mono text-xs">{s.status}</span><span className="ml-auto font-semibold">{s.n}</span></li>
            ))}
            {data.deployments.byStatus.length === 0 && <Empty text="No deployments yet." />}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Requests by status</h2>
          <ul className="mt-2 divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {data.requests.byStatus.map((s) => (
              <li key={s.status_code} className="flex py-1.5"><span className="font-mono text-xs">{s.status_code}</span><span className="ml-3">{s.n} req</span><span className="ml-auto text-gray-500 dark:text-gray-400">avg {Number(s.avg_ms).toFixed(0)} ms</span></li>
            ))}
            {data.requests.byStatus.length === 0 && <Empty text="No requests recorded yet." />}
          </ul>
        </Card>
      </div>
    </div>
    </ProjectLayout>
  );
}
