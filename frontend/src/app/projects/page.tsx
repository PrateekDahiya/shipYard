"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Project } from "@/lib/api";
import {
  Card,
  PageHeader,
  Empty,
  ErrorBanner,
  btnPrimary,
  btnSecondary,
  inputCls,
} from "@/components/ui";

export default function Projects() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  async function load() {
    try {
      const r = await api.listProjects();
      setProjects(r.projects);
      setError(null);
      const deployed = await Promise.all(
        r.projects.map(async (p) => {
          try {
            const deps = await api.listDeployments(String(p.id));
            const latest = deps.deployments?.[0];
            return latest?.live_url ? { id: String(p.id), live_url: latest.live_url } : null;
          } catch {
            return null;
          }
        })
      );
      const map: Record<string, string> = {};
      for (const d of deployed) {
        if (d) map[d.id] = d.live_url;
      }
      setDeployments(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openRename(p: Project) {
    setRenaming(p);
    setRenameValue(p.name);
  }

  async function saveRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    const newName = renameValue.trim();
    if (!newName || newName === renaming.name) {
      setRenaming(null);
      return;
    }
    setRenameSaving(true);
    try {
      await api.patchProject(String(renaming.id), { name: newName });
      setRenaming(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    } finally {
      setRenameSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.repository_url || "").toLowerCase().includes(q) ||
        (p.branch || "").toLowerCase().includes(q)
    );
  }, [projects, query]);

  return (
    <div>
      <PageHeader
        title="Projects"
        sub={`${projects.length} project${projects.length === 1 ? "" : "s"}`}
        back={{ href: "/", label: "Dashboard" }}
        actions={
          <a href="/projects/new" className={btnPrimary}>
            + New project
          </a>
        }
      />
      {error && <ErrorBanner message={error} />}

      <Card className="mb-4">
        <input
          className={`${inputCls} w-full`}
          placeholder="Search by name, repository, or branch…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Card>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const liveUrl = deployments[String(p.id)];
            return (
              <article
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}`)}
                className="group flex cursor-pointer flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                      {p.name}
                    </h3>
                    <p className="mt-0.5 truncate font-mono text-xs text-gray-500 dark:text-gray-400">
                      {p.repository_url || "No repository configured"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 font-mono text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {p.branch || "main"}
                  </span>
                </div>

                <div className="mt-4">
                  {liveUrl ? (
                    <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-600 dark:bg-green-400" />
                      <span>Live</span>
                      <a
                        href={liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="max-w-[220px] truncate font-mono font-normal underline-offset-2 hover:underline"
                      >
                        {liveUrl.replace(/^https?:\/\//, "")}
                      </a>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      No live deployment
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                  <button
                    type="button"
                    className={`${btnSecondary} !px-3 !py-1.5 !text-xs`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openRename(p);
                    }}
                  >
                    Rename
                  </button>
                  <span className="ml-auto text-xs font-medium text-indigo-600 opacity-0 transition group-hover:opacity-100 dark:text-indigo-400">
                    Open →
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Card className="p-8 text-center">
          {projects.length === 0 && !error ? (
            <div>
              <Empty text="No projects yet." />
              <a href="/projects/new" className={`${btnPrimary} mt-2 inline-block`}>
                Create your first project
              </a>
            </div>
          ) : (
            <Empty text={`No projects match "${query}".`} />
          )}
        </Card>
      )}

      {renaming && (
        <div
          className="fixed inset-0 z-50 flex overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRenaming(null);
          }}
        >
          <div className="m-auto w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 dark:border dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Rename project
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Renaming &ldquo;{renaming.name}&rdquo;. URLs and deploys keep working.
            </p>
            <form onSubmit={saveRename} className="mt-4 space-y-4">
              <input
                className={`${inputCls} w-full font-mono`}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                required
                autoFocus
                maxLength={100}
                placeholder="my-api"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setRenaming(null)}
                  disabled={renameSaving}
                >
                  Cancel
                </button>
                <button type="submit" className={btnPrimary} disabled={renameSaving || !renameValue.trim()}>
                  {renameSaving ? "Saving…" : "Save name"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
