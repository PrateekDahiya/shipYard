"use client";

import { useEffect, useState } from "react";
import { api, type Project } from "@/lib/api";
import { Card, PageHeader, Empty, ErrorBanner, btnPrimary, inputCls } from "@/components/ui";

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<{ id: string; live_url: string }[]>([]);

  async function load() {
    try {
      const r = await api.listProjects();
      setProjects(r.projects);
      setError(null);
      // Fetch latest deployment live_url for each project
      const deployed = await Promise.all(
        r.projects.map(async (p) => {
          const deps = await api.listDeployments(String(p.id));
          const latest = deps.deployments?.[0];
          return latest?.live_url ? { id: String(p.id), live_url: latest.live_url } : null;
        })
      );
      setDeployments(deployed.filter((d): d is { id: string; live_url: string } => d !== null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createProject({ name });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "create_failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        sub={`${projects.length} project${projects.length === 1 ? "" : "s"}`}
        back={{ href: "/", label: "Dashboard" }}
      />
      {error && <ErrorBanner message={error} />}
      <Card>
        <form onSubmit={create} className="flex gap-2">
          <input className={`${inputCls} flex-1`} placeholder="New project name, e.g. my-api" value={name} onChange={(e) => setName(e.target.value)} />
          <button className={btnPrimary} type="submit">New project</button>
        </form>
      </Card>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
{projects.map((p) => {
          const dep = deployments.find((d) => d.id === String(p.id));
          return (
            <a key={p.id} href={`/projects/${p.id}`}>
              <Card className="transition hover:shadow-md">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <span className="ml-auto rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{p.branch}</span>
                  {dep && (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-normal text-green-700 dark:bg-green-900/40 dark:text-green-300">
                      <a className="text-xs font-medium text-indigo-600 dark:text-indigo-400" href={dep.live_url} target="_blank" rel="noreferrer">live ↗</a>{" "}
                      {dep.live_url}
                    </span>
                  )}
                </div>
                {p.repository_url
                  ? <div className="mt-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400">{p.repository_url}</div>
                  : <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">No repository configured</div>}
              </Card>
            </a>
          );
        })}
      </div>
      {projects.length === 0 && !error && <Card className="mt-4"><Empty text="No projects yet — create your first one above." /></Card>}
    </div>
  );
}
