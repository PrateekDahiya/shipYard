"use client";

import { useEffect, useState } from "react";
import { api, type AuditEntry, type EnvVar, type Project } from "@/lib/api";
import { parseEnvBulk } from "@/lib/envBulk";
import { Card, PageHeader, Empty, ErrorBanner, btnPrimary, btnSecondary, inputCls } from "@/components/ui";
import { ProjectLayout } from "@/components/project-nav";

export default function ProjectDetail({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [env, setEnv] = useState<EnvVar[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
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
  const [tab, setTab] = useState("overview");
  const [webhook, setWebhook] = useState<{ webhookUrl: string; linked: boolean; repository: string | null; secret: string | null } | null>(null);
  const [webhookWarn, setWebhookWarn] = useState<string | null>(null);
  const [latestDeployment, setLatestDeployment] = useState<{ live_url: string } | null>(null);
  const [rlWarn, setRlWarn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    // Core data — a failure here is page-level (usually auth or missing project).
    try {
      const p = await api.getProject(params.id);
      setProject(p.project);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const tabs: [string, string][] = [
    ["overview", "Overview"],
    ["build", "Build"],
    ["environment", "Environment"],
    ["team", "Team"],
    ["activity", "Activity"],
  ];

  return (
    <ProjectLayout id={params.id} active="overview">
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
      <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={tab === key
              ? "border-b-2 border-gray-900 px-3 py-2 text-sm font-medium dark:border-white"
              : "px-3 py-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Branch & auto-deploy</h2>
          <div className="mt-3 flex gap-2">
            <input className={`${inputCls} flex-1`} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="branch" />
            <button className={btnPrimary} onClick={saveBranch}>Save</button>
          </div>
          <button className={`${btnSecondary} mt-2`} onClick={toggleAutoDeploy}>{autoDeploy ? "Disable auto-deploy" : "Enable auto-deploy"}</button>
          {autoDeploy && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Pushes to {branch} deploy automatically via webhook.</p>}
        </Card>

        <Card>
          <h2 className="font-semibold">Live deployment</h2>
          {latestDeployment && (
            <p className="mt-2 text-sm">
              <a className="font-medium text-indigo-600 dark:text-indigo-400" href={latestDeployment.live_url} target="_blank" rel="noreferrer">
                live ↗
              </a>{" "}
              {latestDeployment.live_url}
            </p>
          )}
          {!latestDeployment && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No live deployment yet.</p>}
        </Card>

        <Card>
          <h2 className="font-semibold">GitHub webhook</h2>
          {webhookWarn && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Unavailable ({webhookWarn}) — restart the backend.</p>}
          {webhook ? (
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex gap-2"><dt className="text-gray-500 dark:text-gray-400">URL</dt><dd className="break-all font-mono text-xs">{webhook.webhookUrl}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-500 dark:text-gray-400">Repo</dt><dd className="font-mono text-xs">{webhook.repository ?? "not linked"}</dd></div>
              {webhook.secret && <div className="flex gap-2"><dt className="text-gray-500 dark:text-gray-400">Secret</dt><dd className="break-all font-mono text-xs">{webhook.secret}</dd></div>}
            </dl>
          ) : !webhookWarn && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
        </Card>

        <Card>
          <h2 className="font-semibold">Rate limiting</h2>
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
      </div>
      )}

      {tab === "build" && (
        <Card>
          <h2 className="font-semibold">Build configuration</h2>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <label>Repository URL (https)
              <input className={`${inputCls} mt-1 w-full font-mono`} value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo.git" />
            </label>
            <label>Build command (optional)
              <input className={`${inputCls} mt-1 w-full font-mono`} value={buildCmd} onChange={(e) => setBuildCmd(e.target.value)} placeholder="npm install && npm run build" />
            </label>
            <label>Run command
              <input className={`${inputCls} mt-1 w-full font-mono`} value={runCmd} onChange={(e) => setRunCmd(e.target.value)} placeholder="npm start" />
            </label>
            <div className="flex gap-2">
              <label className="text-sm">CPU limit (cores, e.g. 0.5, 1, 2)
                <input className={`${inputCls} mt-1 w-20 font-mono`} value={cpu} onChange={(e) => setCpu(e.target.value)} placeholder="0.5" />
              </label>
              <label className="text-sm">Memory limit (bytes or human, e.g. 512M, 1G, 536870912)
                <input className={`${inputCls} mt-1 w-40 font-mono`} value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="512M" />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="text-sm">Deployment type
                <select className={`${inputCls} mt-1 w-44`} value={deployType} onChange={(e) => setDeployType(e.target.value)}>
                  <option value="server">Server (app + health check)</option>
                  <option value="static">Static site (nginx)</option>
                </select>
              </label>
              {deployType === "static" && (
                <label className="text-sm">Build output dir
                  <input className={`${inputCls} mt-1 w-40 font-mono`} value={outputDir} onChange={(e) => setOutputDir(e.target.value)} placeholder="build" />
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <label>App port
                <input className={`${inputCls} mt-1 w-28`} value={appPort} onChange={(e) => setAppPort(e.target.value)} placeholder="3000" />
              </label>
              <label>Health path
                <input className={`${inputCls} mt-1 w-40`} value={healthPath} onChange={(e) => setHealthPath(e.target.value)} placeholder="/health" />
              </label>
            </div>
            <div><button className={btnPrimary} onClick={saveBuildConfig}>Save configuration</button></div>
          </div>
        </Card>
      )}

      {tab === "environment" && (
      <Card>
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Environment</h2>
          <span className="text-xs text-gray-400">secrets masked</span>
          <button type="button" className={`${btnSecondary} ml-auto !py-1 text-xs`} onClick={() => setShowBulk((s) => !s)}>{showBulk ? "Hide bulk import" : "Bulk import"}</button>
        </div>
        <form onSubmit={saveEnv} className="mt-3 flex gap-2">
          <input className={`${inputCls} w-40 font-mono`} placeholder="KEY" value={key} onChange={(e) => setKey(e.target.value)} />
          <input className={`${inputCls} flex-1 font-mono`} placeholder="value" type="password" value={value} onChange={(e) => setValue(e.target.value)} />
          <button className={btnPrimary} type="submit">Save</button>
        </form>
        {showBulk && <BulkImport projectId={params.id} onDone={load} onError={setError} />}
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
          {env.map((v) => (
            <li key={v.key} className="flex items-center gap-3 py-2 text-sm">
              <span className="font-mono font-medium">{v.key}</span>
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{v.value}</span>
              <button
                className="ml-auto text-sm text-red-600 dark:text-red-400"
                onClick={() => api.deleteEnv(params.id, v.key).then(load).catch((e) => setError(e.message))}
              >
                Delete
              </button>
            </li>
          ))}
          {env.length === 0 && <Empty text="No variables." />}
        </ul>
      </Card>
      )}

      {tab === "team" && (
        <Card>
          <h2 className="font-semibold">Team</h2>
          <Members projectId={params.id} onError={setError} />
        </Card>
      )}

      {tab === "activity" && (
        <Card>
          <h2 className="font-semibold">Activity</h2>
          <ul className="mt-2 divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {audit.map((a) => (
              <li key={a.id} className="py-1.5">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{a.created_at}</span>
              </li>
            ))}
            {audit.length === 0 && <Empty text="No activity." />}
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
            <span>{m.email}</span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800">{m.role}</span>
            <button className="ml-auto text-sm text-red-600 dark:text-red-400" onClick={() => api.removeMember(projectId, m.user_id).then(load).catch((e) => onError(e.message))}>Remove</button>
          </li>
        ))}
        {members.length === 0 && <Empty text="No members." />}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); api.addMember(projectId, { email, role }).then(() => { setEmail(""); load(); }).catch((err) => onError(err.message)); }} className="mt-2 flex gap-2">
        <input className={`${inputCls} flex-1`} placeholder="teammate email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">viewer</option>
          <option value="developer">developer</option>
          <option value="admin">admin</option>
        </select>
        <button className={btnPrimary} type="submit">Add</button>
      </form>
    </div>
  );
}
