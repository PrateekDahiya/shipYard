"use client";

import { useEffect, useState } from "react";
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<{ id: string; live_url: string }[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingName, setEditingName] = useState<{ projectId: string; currentName: string } | null>(null);

  async function load() {
    try {
      const r = await api.listProjects();
      setProjects(r.projects);
      setError(null);
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
      setShowCreateModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "create_failed");
    }
  }

  function handleEditName(projectId: string, currentName: string) {
    setEditingName({ projectId, currentName });
  }

  async function saveEditedName(data: { projectId: string; newName: string }) {
    setEditingName(null);
    try {
      await api.patchProject(data.projectId, { name: data.newName });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader
        title="Projects"
        sub={`${projects.length} project${projects.length === 1 ? "" : "s"}`}
        back={{ href: "/", label: "Dashboard" }}
      />
      {error && <ErrorBanner message={error} />}

      <main className="pt-6">
        {/* Create Project Section */}
        <Card className="mb-4">
          <form onSubmit={create} className="flex gap-2">
            <input
              className={`${inputCls} flex-1`}
              placeholder="New project name, e.g. my-api"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className={btnPrimary} type="submit">New project</button>
          </form>
        </Card>

        {/* Create Project Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/80" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setShowCreateModal(false)}>
            <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-xl dark:bg-gray-800 p-6">
              <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100" id="modal-title">New Project</h2>
              <form onSubmit={create} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Project name</label>
                  <input className={`${inputCls} w-full`} placeholder="e.g. my-api" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Deploy type</label>
                  <select className={`${inputCls} w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700`}>
                    <option value="server">Server deployment</option>
                    <option value="static">Static site</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:underline" onClick={() => setShowCreateModal(false)}>Cancel</button>
                  <button type="submit" className={btnPrimary}>Create project</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Name Modal */}
        {editingName && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/80" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setEditingName(null)}>
            <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-xl dark:bg-gray-800 p-6">
              <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100" id="edit-name-title">Rename Project</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Rename &ldquo;{editingName.currentName}&rdquo;?</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target as HTMLFormElement);
                  const newName = formData.get('name')?.toString().trim() || '';
                  if (newName) saveEditedName({ projectId: editingName.projectId, newName });
                }}
              >
                <div>
                  <input className={`${inputCls} w-full`} type="text" name="name" value={editingName.currentName} required />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:underline" onClick={() => setEditingName(null)}>Cancel</button>
                  <button type="submit" className={btnPrimary}>Save name</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Projects Grid */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const dep = deployments.find((d) => d.id === String(p.id));
            return (
              <a key={p.id} href={`/projects/${p.id}`} className="group">
                <Card className="transition hover:shadow-md border">
                  <div className="p-4 flex flex-col min-h-[200px]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-lg">{p.name}</span>
                      {editingName?.projectId === String(p.id) ? (
                        <>
                          <input className={`${inputCls} w-full`} type="text" value={editingName.currentName} />
                          <button className={btnSecondary} onClick={() => saveEditedName({ projectId: String(p.id), newName: editingName.currentName })}>Save</button>
                        </>
                      ) : (
                        <button className="text-xs font-medium text-indigo-600 dark:text-indigo-400 group-hover:underline" onClick={() => handleEditName(String(p.id), p.name)}>Edit name</button>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{p.repository_url || "No repository configured"}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">{p.branch || "main"}</span>
                      {dep && (
                        <span className="text-xs font-normal text-green-600 dark:text-green-400">
                          <a className="text-indigo-600 dark:text-indigo-400" href={dep.live_url} target="_blank" rel="noreferrer">live ↗</a> {dep.live_url}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              </a>
            );
          })}
        </div>

        {projects.length === 0 && !error && (
          <Card className="mt-4 p-8 text-center"><Empty text="No projects yet — create your first one above." /></Card>
        )}
      </main>
    </div>
  );
}