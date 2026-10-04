"use client";

import { useEffect, useState } from "react";
import { api, type Deployment } from "@/lib/api";
import { Card, PageHeader, Empty, ErrorBanner, StatusBadge, btnPrimary, inputCls } from "@/components/ui";
import { ProjectLayout } from "@/components/project-nav";

export default function Deployments({ params }: { params: { id: string } }) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [commitSha, setCommitSha] = useState("");
  const [branch, setBranch] = useState("main");
  const [error, setError] = useState<string | null>(null);

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
    try {
      await api.createDeployment(params.id, { commitSha: commitSha || undefined, branch });
      setCommitSha("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "deploy_failed");
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

  return (
    <ProjectLayout id={params.id} active="deployments">
    <div>
      <PageHeader
        title="Deployments"
        sub="Newest first · auto-refreshes every 5s"
        back={{ href: `/projects/${params.id}`, label: "Back to project" }}
      />
      {error && <ErrorBanner message={error} />}
      <Card>
        <form onSubmit={deploy} className="flex flex-wrap gap-2">
          <input className={`${inputCls} w-32`} placeholder="branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
          <input className={`${inputCls} min-w-0 flex-1 font-mono`} placeholder="commit SHA (optional — latest branch commit is used)" value={commitSha} onChange={(e) => setCommitSha(e.target.value)} />
          <button className={btnPrimary} type="submit">Deploy</button>
        </form>
      </Card>
      <Card className="mt-4 !p-0">
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {deployments.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <a className="font-mono font-semibold text-indigo-600 dark:text-indigo-400" href={`/projects/${params.id}/deployments/${d.id}`}>#{d.id}</a>
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{d.commit_sha.slice(0, 8)}</span>
              <StatusBadge status={d.status} />
              <button className="text-xs font-medium text-indigo-600 dark:text-indigo-400" title="Deploy this commit again as a new deployment" onClick={() => redeploy(d.id)}>Redeploy</button>
              {d.live_url && <a className="text-xs font-medium text-indigo-600 dark:text-indigo-400" href={d.live_url} target="_blank" rel="noreferrer">live ↗</a>}
              <span className="ml-auto text-xs text-gray-400">{d.created_at}</span>
            </li>
          ))}
          {deployments.length === 0 && <Empty text="No deployments yet — deploy your first commit above." />}
        </ul>
      </Card>
      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">New deployments start QUEUED and are picked up automatically by the deployment worker. If one stays QUEUED, the worker or Redis is not running.</p>
    </div>
    </ProjectLayout>
  );
}
