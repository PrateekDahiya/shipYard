"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card, PageHeader, ErrorBanner, btnPrimary, inputCls } from "@/components/ui";

export default function NewProject() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [deployType, setDeployType] = useState("server");
  const [outputDir, setOutputDir] = useState("build");
  const [buildCommand, setBuildCommand] = useState("");
  const [runCommand, setRunCommand] = useState("");
  const [appPort, setAppPort] = useState("3000");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Project name is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await api.createProject({
        name: trimmed,
        repository_url: repositoryUrl.trim() || undefined,
        branch: branch.trim() || "main",
        deploy_type: deployType,
        output_dir: deployType === "static" ? outputDir.trim() || "build" : undefined,
        build_command: buildCommand.trim() || undefined,
        run_command: runCommand.trim() || undefined,
        app_port: parseInt(appPort, 10) || 3000,
      } as Parameters<typeof api.createProject>[0]);
      router.push(`/projects/${res.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "create_failed");
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New project"
        sub="Set up repository, branch, and deploy defaults up front — no need to fix it after entering."
        back={{ href: "/projects", label: "All projects" }}
      />
      {error && <ErrorBanner message={error} />}

      <form onSubmit={create}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">General</h2>
            <div className="mt-3 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Project name *
                </span>
                <input
                  className={`${inputCls} w-full font-mono`}
                  placeholder="e.g. my-api"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  autoFocus
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Repository URL (https)
                </span>
                <input
                  className={`${inputCls} w-full font-mono`}
                  placeholder="https://github.com/owner/repo.git"
                  value={repositoryUrl}
                  onChange={(e) => setRepositoryUrl(e.target.value)}
                />
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                  You can also connect GitHub later. HTTPS format works for cloning.
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Branch
                </span>
                <input
                  className={`${inputCls} w-44 font-mono`}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                />
              </label>
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Deploy defaults</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["server", "static"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDeployType(t)}
                  className={`rounded-xl border p-3 text-left transition ${
                    deployType === t
                      ? "border-gray-900 bg-gray-50 dark:border-white dark:bg-gray-800"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                  }`}
                >
                  <div className="text-sm font-semibold capitalize">{t}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t === "server" ? "App + health check" : "Nginx static output"}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-3">
              {deployType === "static" && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                    Build output dir
                  </span>
                  <input
                    className={`${inputCls} w-44 font-mono`}
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    placeholder="build"
                  />
                </label>
              )}
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Build command (optional)
                </span>
                <input
                  className={`${inputCls} w-full font-mono`}
                  value={buildCommand}
                  onChange={(e) => setBuildCommand(e.target.value)}
                  placeholder="npm install && npm run build"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  Run command
                </span>
                <input
                  className={`${inputCls} w-full font-mono`}
                  value={runCommand}
                  onChange={(e) => setRunCommand(e.target.value)}
                  placeholder="npm start"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                  App port
                </span>
                <input
                  className={`${inputCls} w-28 font-mono`}
                  value={appPort}
                  onChange={(e) => setAppPort(e.target.value)}
                  placeholder="3000"
                />
              </label>
            </div>
          </Card>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <a
            href="/projects"
            className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Cancel
          </a>
          <button type="submit" className={btnPrimary} disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create & open project"}
          </button>
        </div>
      </form>
    </div>
  );
}
