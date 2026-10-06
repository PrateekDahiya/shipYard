"use client";

import { useEffect, useState } from "react";
import { api, type AuditEntry, type Deployment, type EnvVar, type Project } from "@/lib/api";
import { parseEnvBulk } from "@/lib/envBulk";
import { Card, PageHeader, Empty, ErrorBanner, btnPrimary, btnSecondary, inputCls } from "@/components/ui";
import { ProjectLayout } from "@/components/project-nav";
import DeploymentLogs from "@/components/deployment-logs";
import ContainerLogs from "@/components/container-logs";

const VALID_TABS = ["overview", "build", "environment", "logs", "team", "activity"] as const;
type TabKey = (typeof VALID_TABS)[number];

function initialTab(): TabKey {
  if (typeof window === "undefined") return "overview";
  try {
    const t = new URLSearchParams(window.location.search).get("tab");
    return (VALID_TABS as readonly string[]).includes(t || "") ? (t as TabKey) : "overview";
  } catch {
    return "overview";
  }
}

function SectionHeader({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {desc && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{desc}</p>}
      </div>
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </div>
  );
}

export default function ProjectDetail({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [env, setEnv] = useState<EnvVar[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [projectName, setProjectName] = useState("");
  const [branch, setBranch] = useState("");
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [buildCmd, setBuildCmd] = useState("");
  const [runCmd, setRunCmd] = useState("");
  const [appPort, setAppPort] = useState("3000");
  const [healthPath, setHealthPath] = useState("/health");
  const [deployType, setDeployType] = useState("server");
  const [outputDir, setOutputDir] = useState("build");
  const [rpm, setRpm] = useState(100);
  const [rph, setRph] = useState(1000);
  const [cpu, setCpu] = useState("");
  const [memory, setMemory] = useState("");
  const [rlEnabled, setRlEnabled] = useState(false);
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [webhook, setWebhook] = useState<{ webhookUrl: string; linked: boolean; repository: string | null; secret: string | null } | null>(null);
  const [webhookWarn, setWebhookWarn] = useState<string | null>(null);
  const [latestDeployment, setLatestDeployment] = useState<{ live_url: string } | null>(null);
  const [rlWarn, setRlWarn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [actualValues, setActualValues] = useState<Record<string, string>>({});
  const [allDeployments, setAllDeployments] = useState<Deployment[]>([]);
  const [logDepId, setLogDepId] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [showEditValue, setShowEditValue] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function load() {
    // Core data — a failure here is page-level (usually auth or missing project).
    try {
      const p = await api.getProject(params.id);
      setProject(p.project);
      setProjectName(p.project.name);
      setBranch(p.project.branch);
      setAutoDeploy(!!p.project.auto_deploy);
      setRepoUrl(p.project.repository_url || "");
      setBuildCmd(p.project.build_command || "");
      setRunCmd(p.project.run_command || "");
      setAppPort(String(p.project.app_port ?? 3000));
      setHealthPath(p.project.healthcheck_path || "/health");
      setDeployType(p.project.deploy_type || "server");
      setOutputDir(p.project.output_dir || "build");
      setEnv((await api.listEnv(params.id)).variables);
      setAudit((await api.audit(params.id)).audit);
      const deps = await api.listDeployments(params.id);
      const latest = deps.deployments?.[0];
      setAllDeployments(deps.deployments || []);
      if (latest?.live_url) setLatestDeployment({ live_url: latest.live_url });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
      return;
    }
    // Auxiliary sections — failures degrade to inline notes, never blank the page
    // (e.g. when the backend predates the webhook/rate-limit routes).
    try {
      setWebhook(await api.webhookConfig(params.id));
      setWebhookWarn(null);
    } catch (err) {
      setWebhookWarn(err instanceof Error ? err.message : "webhook_unavailable");
    }
    try {
      const rl = await api.getRateLimit(params.id);
      setRpm(rl.config.requests_per_minute);
      setRph(rl.config.requests_per_hour);
      setRlEnabled(!!rl.config.enabled);
      setRlWarn(null);
    } catch (err) {
      setRlWarn(err instanceof Error ? err.message : "ratelimit_unavailable");
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTab(next: TabKey) {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* non-fatal */
    }
  }

  async function revealAll(): Promise<Record<string, string>> {
    const res = await api.listEnv(params.id, { includeSecretValues: true });
    const vars = (res.variables || []).reduce((acc, v) => {
      acc[v.key] = v.value;
      return acc;
    }, {} as Record<string, string>);
    setActualValues((prev) => ({ ...prev, ...vars }));
    return vars;
  }

  async function toggleShow(envKey: string) {
    if (actualValues[envKey] !== undefined) {
      setShowValues((prev) => ({ ...prev, [envKey]: !prev[envKey] }));
      return;
    }
    try {
      await revealAll();
      setShowValues((prev) => ({ ...prev, [envKey]: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "reveal_failed");
    }
  }

  async function startEdit(envKey: string) {
    // Never prefill the editor with the masked "••••••••" value — that would
    // overwrite the real secret with dots on save. Reveal first.
    try {
      let current = actualValues[envKey];
      if (current === undefined) {
        const vars = await revealAll();
        current = vars[envKey] ?? "";
      }
      setEditingKey(envKey);
      setEditKey(envKey);
      setEditValue(current);
      setShowEditValue(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "reveal_failed");
    }
  }

  async function copyValue(envKey: string) {
    try {
      let current = actualValues[envKey];
      if (current === undefined) {
        const vars = await revealAll();
        current = vars[envKey] ?? "";
      }
      await navigator.clipboard.writeText(current);
      setCopiedKey(envKey);
      setTimeout(() => setCopiedKey((prev) => (prev === envKey ? null : prev)), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "copy_failed");
    }
  }

  async function saveEnv(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.upsertEnv(params.id, { key, value, is_secret: true, scope: "both" });
      setKey("");
      setValue("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "env_failed");
    }
  }

  async function updateEnv(oldKey: string, newKey: string, newValue: string) {
    try {
      if (newKey !== oldKey) {
        await api.deleteEnv(params.id, oldKey);
      }
      await api.upsertEnv(params.id, { key: newKey, value: newValue, is_secret: true, scope: "both" });
      setEditingKey(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "env_update_failed");
    }
  }

  async function saveName() {
    const trimmed = projectName.trim();
    if (!trimmed) {
      setError("Project name is required.");
      return;
    }
    try {
      await api.patchProject(params.id, { name: trimmed });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    }
  }

  async function saveBranch() {
    try {
      await api.patchProject(params.id, { branch });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    }
  }

  async function saveBuildConfig() {
    try {
      await api.patchProject(params.id, {
        repository_url: repoUrl || null,
        build_command: buildCmd || null,
        run_command: runCmd || null,
        app_port: parseInt(appPort, 10) || 3000,
        healthcheck_path: healthPath || "/health",
        deploy_type: deployType,
        output_dir: outputDir || "build",
        cpu_limit: cpu || null,
        memory_limit: memory || null,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    }
  }

  async function toggleAutoDeploy() {
    try {
      await api.patchProject(params.id, { auto_deploy: autoDeploy ? 0 : 1 });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    }
  }

  async function saveRateLimit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.putRateLimit(params.id, { requests_per_minute: rpm, requests_per_hour: rph, enabled: rlEnabled });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ratelimit_failed");
    }
  }

  async function deployLatest() {
    try {
      await api.createDeployment(params.id, {});
      window.location.href = `/projects/${params.id}/deployments`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "deploy_failed");
    }
  }

  async function deleteProject() {
    if (!window.confirm(`Delete project "${project?.name}"? This stops its containers and removes all history. This cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteProject(params.id);
      window.location.href = "/projects";
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete_failed");
    }
  }

  if (error && !project) return <div><ErrorBanner message={error} /></div>;
  if (!project) return <div><Card><p className="text-sm text-gray-500 dark:text-gray-400">Loading project…</p></Card></div>;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "build", label: "Build" },
    { key: "environment", label: "Environment", count: env.length },
    { key: "logs", label: "Logs" },
    { key: "team", label: "Team" },
    { key: "activity", label: "Activity", count: audit.length },
  ];

  return (
    <ProjectLayout id={params.id} active="overview" projectName={project.name} tab={tab} onTabSelect={selectTab}>
      <PageHeader
        title={project.name}
        sub={[project.repository_url, `branch ${project.branch}`].filter(Boolean).join(" · ") || "No repository configured yet"}
        actions={
          <>
            <button className={btnSecondary} onClick={deployLatest}>Deploy latest</button>
            <button className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40" onClick={deleteProject}>Delete</button>
          </>
        }
        back={{ href: "/projects", label: "All projects" }}
      />
      {error && <ErrorBanner message={error} />}
      <div role="tablist" aria-label="Project sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
        {tabs.map(({ key: tabKey, label, count }) => (
          <button
            key={tabKey}
            role="tab"
            aria-selected={tab === tabKey}
            onClick={() => selectTab(tabKey)}
            className={tab === tabKey
              ? "flex items-center gap-1.5 whitespace-nowrap border-b-2 border-gray-900 px-3 py-2 text-sm font-medium dark:border-white"
              : "flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader title="General" desc="Rename the project. URLs and deploys keep working." />
          <div className="mt-3 flex gap-2">
            <input
              className={`${inputCls} flex-1 font-mono`}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-api"
              maxLength={100}
            />
            <button className={btnPrimary} onClick={saveName}>
              Save name
            </button>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Live deployment" desc="Newest successful build serving traffic." />
          {latestDeployment ? (
            <p className="mt-2 text-sm">
              <a className="font-medium text-indigo-600 dark:text-indigo-400" href={latestDeployment.live_url} target="_blank" rel="noreferrer">
                live ↗
              </a>{" "}
              <span className="break-all font-mono text-xs">{latestDeployment.live_url}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No live deployment yet.</p>
          )}
        </Card>

        <Card>
          <SectionHeader
            title="Branch & auto-deploy"
            desc="Pushes to this branch deploy automatically via webhook when enabled."
          />
          <div className="mt-3 flex gap-2">
            <input className={`${inputCls} flex-1 font-mono`} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="branch" />
            <button className={btnPrimary} onClick={saveBranch}>Save</button>
          </div>
          <button className={`${btnSecondary} mt-2`} onClick={toggleAutoDeploy}>{autoDeploy ? "Disable auto-deploy" : "Enable auto-deploy"}</button>
          {autoDeploy && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Pushes to <span className="font-mono">{branch}</span> deploy automatically via webhook.</p>}
        </Card>

        <Card>
          <SectionHeader title="Rate limiting" desc="Protect the app from request bursts." />
          <form onSubmit={saveRateLimit} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {rlWarn && <span className="w-full text-gray-500 dark:text-gray-400">Unavailable ({rlWarn}) — restart the backend.</span>}
            <label className="flex items-center gap-1"><input type="checkbox" checked={rlEnabled} onChange={(e) => setRlEnabled(e.target.checked)} /> enabled</label>
            <input className={`${inputCls} w-24`} type="number" value={rpm} onChange={(e) => setRpm(parseInt(e.target.value, 10))} title="requests per minute" />
            <span className="text-gray-400">/min</span>
            <input className={`${inputCls} w-24`} type="number" value={rph} onChange={(e) => setRph(parseInt(e.target.value, 10))} title="requests per hour" />
            <span className="text-gray-400">/hr</span>
            <button className={btnPrimary} type="submit">Save</button>
          </form>
        </Card>

        <Card>
          <SectionHeader title="GitHub webhook" desc="Push events arrive here for auto-deploy." />
          {webhookWarn && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Unavailable ({webhookWarn}) — restart the backend.</p>}
          {webhook ? (
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex gap-2"><dt className="w-14 shrink-0 text-gray-500 dark:text-gray-400">URL</dt><dd className="min-w-0 break-all font-mono text-xs">{webhook.webhookUrl}</dd></div>
              <div className="flex gap-2"><dt className="w-14 shrink-0 text-gray-500 dark:text-gray-400">Repo</dt><dd className="font-mono text-xs">{webhook.repository ?? "not linked"}</dd></div>
              {webhook.secret && <div className="flex gap-2"><dt className="w-14 shrink-0 text-gray-500 dark:text-gray-400">Secret</dt><dd className="min-w-0 break-all font-mono text-xs">{webhook.secret}</dd></div>}
            </dl>
          ) : !webhookWarn && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
        </Card>
      </div>
      )}

      {tab === "build" && (
        <Card>
          <SectionHeader title="Build configuration" desc="Source, build, and runtime defaults for the next deployment." />
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3 text-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Source</h3>
              <label className="block">Repository URL (https)
                <input className={`${inputCls} mt-1 w-full font-mono`} value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo.git" />
              </label>
              <label className="block">Build command (optional)
                <input className={`${inputCls} mt-1 w-full font-mono`} value={buildCmd} onChange={(e) => setBuildCmd(e.target.value)} placeholder="npm install && npm run build" />
              </label>
              <label className="block">Run command
                <input className={`${inputCls} mt-1 w-full font-mono`} value={runCmd} onChange={(e) => setRunCmd(e.target.value)} placeholder="npm start" />
              </label>
            </div>
            <div className="space-y-3 text-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Runtime</h3>
              <div className="flex flex-wrap gap-2">
                <label className="text-sm">Deployment type
                  <select className={`${inputCls} mt-1 block w-48`} value={deployType} onChange={(e) => setDeployType(e.target.value)}>
                    <option value="server">Server (app + health check)</option>
                    <option value="static">Static site (nginx)</option>
                  </select>
                </label>
                {deployType === "static" && (
                  <label className="text-sm">Build output dir
                    <input className={`${inputCls} mt-1 block w-40 font-mono`} value={outputDir} onChange={(e) => setOutputDir(e.target.value)} placeholder="build" />
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="text-sm">App port
                  <input className={`${inputCls} mt-1 block w-28`} value={appPort} onChange={(e) => setAppPort(e.target.value)} placeholder="3000" />
                </label>
                <label className="text-sm">Health path
                  <input className={`${inputCls} mt-1 block w-40`} value={healthPath} onChange={(e) => setHealthPath(e.target.value)} placeholder="/health" />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="text-sm">CPU limit (cores, e.g. 0.5)
                  <input className={`${inputCls} mt-1 block w-28 font-mono`} value={cpu} onChange={(e) => setCpu(e.target.value)} placeholder="0.5" />
                </label>
                <label className="text-sm">Memory limit (e.g. 512M)
                  <input className={`${inputCls} mt-1 block w-40 font-mono`} value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="512M" />
                </label>
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
            <button className={btnPrimary} onClick={saveBuildConfig}>Save configuration</button>
          </div>
        </Card>
      )}

      {tab === "environment" && (
      <Card>
        <SectionHeader
          title="Environment"
          desc={`${env.length} variable${env.length === 1 ? "" : "s"} · values stay masked until revealed`}
          action={
            <button type="button" className={`${btnSecondary} !py-1.5 !text-xs`} onClick={() => setShowBulk((s) => !s)}>
              {showBulk ? "Hide bulk import" : "Bulk import"}
            </button>
          }
        />
        <form onSubmit={saveEnv} className="mt-3 flex gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
          <input className={`${inputCls} w-40 font-mono`} placeholder="KEY" value={key} onChange={(e) => setKey(e.target.value)} />
          <input className={`${inputCls} min-w-0 flex-1 font-mono`} placeholder="value" type={showValues.__new__ ? "text" : "password"} value={value} onChange={(e) => setValue(e.target.value)} />
          <button type="button" className={`${btnSecondary} shrink-0 !py-2`} title={showValues.__new__ ? "Hide value" : "Show value"} onClick={() => setShowValues({...showValues, __new__: !showValues.__new__})}>
            {showValues.__new__ ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            )}
          </button>
          <button className={`${btnPrimary} shrink-0`} type="submit">Add</button>
        </form>
        {showBulk && <BulkImport projectId={params.id} onDone={load} onError={setError} />}
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
          {env.map((v) => {
            const isEditing = editingKey === v.key;
            return (
              <li key={v.key} className="flex items-center gap-2 py-2.5 text-sm sm:gap-3">
                {isEditing ? (
                  <>
                    <input className={`${inputCls} w-36 shrink-0 font-mono sm:w-44`} value={editKey} onChange={(e) => setEditKey(e.target.value)} aria-label="Variable key" />
                    <input className={`${inputCls} min-w-0 flex-1 font-mono`} type={showEditValue ? "text" : "password"} value={editValue} onChange={(e) => setEditValue(e.target.value)} aria-label="Variable value" />
                    <button className={`${btnSecondary} shrink-0 !py-2`} title={showEditValue ? "Hide value" : "Show value"} onClick={() => setShowEditValue(!showEditValue)}>
                      {showEditValue ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      )}
                    </button>
                    <button className={`${btnPrimary} shrink-0`} onClick={() => updateEnv(v.key, editKey, editValue)}>Save</button>
                    <button className="shrink-0 text-sm text-gray-600 dark:text-gray-400" onClick={() => setEditingKey(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="w-32 shrink-0 truncate font-mono font-medium sm:w-44" title={v.key}>{v.key}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400" title={showValues[v.key] ? (actualValues[v.key] || v.value) : undefined}>
                      {showValues[v.key] ? (actualValues[v.key] || v.value || "••••••••") : "••••••••"}
                    </span>
                    <span className="hidden shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-500 md:inline dark:bg-gray-800 dark:text-gray-400">
                      {v.scope}
                    </span>
                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      <button className={`${btnSecondary} !px-2.5 !py-1.5`} title={showValues[v.key] ? "Hide value" : "Reveal value"} onClick={() => toggleShow(v.key)}>
                        {showValues[v.key] ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        )}
                      </button>
                      {showValues[v.key] && (
                        <button className={`${btnSecondary} !px-2.5 !py-1.5 !text-xs`} title="Copy value" onClick={() => copyValue(v.key)}>
                          {copiedKey === v.key ? "Copied" : "Copy"}
                        </button>
                      )}
                      <button className={`${btnSecondary} !px-2.5 !py-1.5 !text-xs`} onClick={() => startEdit(v.key)}>Edit</button>
                      <button className="px-1 text-xs font-medium text-red-600 dark:text-red-400" onClick={() => api.deleteEnv(params.id, v.key).then(load).catch((e) => setError(e.message))}>Delete</button>
                    </div>
                  </>
                )}
              </li>
            )}
          )}
          {env.length === 0 && <Empty text="No variables yet — add your first one above." />}
        </ul>
      </Card>
      )}

      {tab === "logs" && (
      <>
        <div className="mb-4">
          <ContainerLogs projectId={params.id} />
        </div>
        <Card>
          <SectionHeader
            title="Deployment logs"
            desc="Persisted build output plus a live tail while a build runs."
            action={
              allDeployments.length > 0 ? (
                <select
                  className={`${inputCls} font-mono text-xs`}
                  value={logDepId ?? (allDeployments[0] ? String(allDeployments[0].id) : "")}
                  onChange={(e) => setLogDepId(e.target.value)}
                  aria-label="Select deployment"
                >
                  {allDeployments.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      #{d.id} · {d.status} · {d.branch}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          />
          {allDeployments.length === 0 && <Empty text="No deployments yet — deploy first, then read the logs here." />}
        </Card>
        {(logDepId ?? (allDeployments[0] ? String(allDeployments[0].id) : null)) && (
          <DeploymentLogs
            key={logDepId ?? String(allDeployments[0].id)}
            projectId={params.id}
            deploymentId={logDepId ?? String(allDeployments[0].id)}
          />
        )}
      </>
      )}

      {tab === "team" && (
        <Card>
          <SectionHeader title="Team" desc="Invite teammates by email and assign a role." />
          <div className="mt-2">
            <Members projectId={params.id} onError={setError} />
          </div>
        </Card>
      )}

      {tab === "activity" && (
        <Card>
          <SectionHeader title="Activity" desc={`Last ${audit.length} project events.`} />
          <ul className="mt-2 divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-1.5">
                <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs dark:bg-gray-800">{a.action}</span>
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{a.created_at}</span>
              </li>
            ))}
            {audit.length === 0 && <Empty text="No activity yet." />}
          </ul>
        </Card>
      )}
    </ProjectLayout>
  );
}

function BulkImport({ projectId, onDone, onError }: { projectId: string; onDone: () => void; onError: (m: string) => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);

  async function importAll(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    const { pairs, invalid } = parseEnvBulk(text);
    let ok = 0;
    for (const { key, value } of pairs) {
      try {
        await api.upsertEnv(projectId, { key, value, is_secret: true, scope: "both" });
        ok += 1;
      } catch (err) {
        invalid.push(`${key}=<failed: ${err instanceof Error ? err.message : "error"}>`);
      }
    }
    setText("");
    setResult(`Imported ${ok} of ${pairs.length}.${invalid.length ? ` Skipped: ${invalid.join("; ")}` : ""}`);
    onDone();
    if (ok === 0 && pairs.length > 0) onError("bulk_import_failed");
  }

  return (
    <form onSubmit={importAll} className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
      <p className="text-sm text-gray-600 dark:text-gray-300">Paste <span className="font-mono">KEY=value</span> lines (one per line, <span className="font-mono">#</span> comments and <span className="font-mono">export</span> prefixes allowed). Existing keys are overwritten; all imported as secrets.</p>
      <textarea className={`${inputCls} mt-2 h-32 w-full font-mono`} placeholder={"API_KEY=abc123\nDATABASE_URL=postgres://...\n# comment\n export DEBUG=true"} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2"><button className={btnPrimary} type="submit">Import all</button></div>
      {result && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{result}</p>}
    </form>
  );
}

function Members({ projectId, onError }: { projectId: string; onError: (m: string) => void }) {
  const [members, setMembers] = useState<{ user_id: number; email: string; role: string }[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");

  async function load() {
    try {
      setMembers((await api.listMembers(projectId)).members);
    } catch (e) {
      onError(e instanceof Error ? e.message : "members_failed");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{m.email}</span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800">{m.role}</span>
            <button className="text-sm text-red-600 dark:text-red-400" onClick={() => api.removeMember(projectId, m.user_id).then(load).catch((e) => onError(e.message))}>Remove</button>
          </li>
        ))}
        {members.length === 0 && <Empty text="No members yet — invite your first teammate below." />}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); api.addMember(projectId, { email, role }).then(() => { setEmail(""); load(); }).catch((err) => onError(err.message)); }} className="mt-3 flex gap-2">
        <input className={`${inputCls} min-w-0 flex-1`} placeholder="teammate email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className={`${inputCls} shrink-0`} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">viewer</option>
          <option value="developer">developer</option>
          <option value="admin">admin</option>
        </select>
        <button className={`${btnPrimary} shrink-0`} type="submit">Add</button>
      </form>
    </div>
  );
}
