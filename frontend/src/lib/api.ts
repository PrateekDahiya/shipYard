// API origin for the browser. An explicit build-time URL always wins.
// Otherwise use the current UI origin so local preview ports and public
// tunnels both stay same-origin; Next rewrites /api/* to the backend.
export function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured;
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:4000";
}

export interface User {
  id: number;
  email: string;
  name: string | null;
}

export interface Project {
  id: number;
  owner_id: number;
  name: string;
  repository_url: string | null;
  branch: string;
  build_command: string | null;
  run_command: string | null;
  working_directory: string | null;
  app_port: number | null;
  healthcheck_path: string | null;
  healthcheck_timeout: number | null;
  deploy_timeout: number | null;
  cpu_limit: string | null;
  memory_limit: string | null;
  restart_policy?: string | null;
  auto_deploy: number;
  deploy_type?: string;
  output_dir?: string;
  use_dockerfile?: number;
}

export interface EnvVar {
  id: number;
  project_id: number;
  key: string;
  value: string;
  is_secret: number;
  scope: string;
  masked?: boolean;
}

export interface AuditEntry {
  id: number;
  user_id: number | null;
  project_id: number | null;
  action: string;
  metadata: unknown;
  created_at: string;
}

export interface Deployment {
  id: number;
  project_id: number;
  commit_sha: string;
  branch: string;
  commit_message: string | null;
  commit_author: string | null;
  triggered_by: number | null;
  trigger_type: string;
  status: string;
  instance_state?: "STARTING" | "RUNNING" | "UNHEALTHY" | "STOPPED" | null;
  public_health_state?: "UNKNOWN" | "UP" | "DOWN" | null;
  image_tag: string | null;
  container_id: string | null;
  live_url: string | null;
  direct_url?: string | null;
  public_url?: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  environment?: "production" | "preview";
  preview_key?: string | null;
  promoted_from?: number | null;
}

export interface DeployEvent {
  stage: string;
  status: string;
  message: string | null;
  created_at: string;
}

export interface DeployLog {
  source: string;
  stream: string;
  line: string;
  created_at: string;
}

function token(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("shipyard_token");
}

export function setToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t) window.localStorage.setItem("shipyard_token", t);
  else window.localStorage.removeItem("shipyard_token");
  clearApiCache();
}

type CacheEntry = { value: unknown; expiresAt: number };
const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

export function clearApiCache() {
  responseCache.clear();
  inFlight.clear();
}

function cacheTtl(path: string) {
  if (path.includes("/container-logs") || path.includes("/logs") || path.includes("/events")) return 0;
  if (path === "/api/overview") return 5000;
  if (path.includes("/deployments")) return 2500;
  if (path.includes("/metrics/series") || path.endsWith("/metrics")) return 15000;
  if (path.includes("/requests")) return 10000;
  if (path.includes("/runtime")) return 5000;
  return 30000;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const ttl = isGet && init?.cache !== "no-store" ? cacheTtl(path) : 0;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) || {}),
  };
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  const key = `${t || "anonymous"}:${path}`;
  if (ttl > 0) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    const pending = inFlight.get(key);
    if (pending) return pending as Promise<T>;
  }

  const request = (async () => {
    const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error || `request_failed_${res.status}`);
    }
    if (ttl > 0) responseCache.set(key, { value: body, expiresAt: Date.now() + ttl });
    return body as T;
  })();

  if (ttl > 0) {
    inFlight.set(key, request);
    request.finally(() => inFlight.delete(key)).catch(() => {});
  } else if (!isGet) {
    clearApiCache();
  }
  return request;
}

export const api = {
  register: (email: string, password: string, name?: string) =>
    req<{ user: User; token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    req<{ user: User; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => req<{ user: User }>("/api/auth/me"),
  listProjects: () => req<{ projects: Project[] }>("/api/projects"),
  createProject: (data: Partial<Project>) =>
    req<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getProject: (id: string) => req<{ project: Project }>(`/api/projects/${id}`),
  patchProject: (id: string, data: Partial<Project>) =>
    req<{ project: Project }>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  listEnv: (id: string, options?: { includeSecretValues?: boolean }) =>
    req<{ variables: EnvVar[] }>(
      `/api/projects/${id}/env${options?.includeSecretValues ? '?includeSecretValues=true' : ''}`,
      options?.includeSecretValues ? { cache: "no-store" } : undefined
    ),
  upsertEnv: (id: string, v: { key: string; value: string; is_secret?: boolean; scope?: string }) =>
    req<{ variable: EnvVar }>(`/api/projects/${id}/env`, {
      method: "POST",
      body: JSON.stringify(v),
    }),
  deleteEnv: (id: string, key: string) =>
    req<{ ok: boolean }>(`/api/projects/${id}/env/${encodeURIComponent(key)}`, {
      method: "DELETE",
    }),
  audit: (id: string) => req<{ audit: AuditEntry[] }>(`/api/projects/${id}/audit`),
  githubStatus: () =>
    req<{ linked: boolean; account: { login: string } | null }>("/api/github/status"),
  githubAuthUrl: () => req<{ url: string }>("/api/github/auth-url"),
  createDeployment: (id: string, data: { commitSha?: string; branch?: string; environment?: "production" | "preview"; previewKey?: string }) =>
    req<{ deployment: Deployment; queued: boolean }>(`/api/projects/${id}/deployments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listDeployments: (id: string, options?: { page?: number; pageSize?: number; status?: string; search?: string; from?: string; to?: string }) => {
    const query = new URLSearchParams();
    Object.entries(options || {}).forEach(([key, value]) => { if (value) query.set(key, String(value)); });
    return req<{ deployments: Deployment[]; pagination?: { page: number; pageSize: number; total: number; pages: number } }>(`/api/projects/${id}/deployments${query.toString() ? `?${query}` : ""}`);
  },
  getDeployment: (projectId: string, depId: string) =>
    req<{ deployment: Deployment }>(`/api/projects/${projectId}/deployments/${depId}`),
  deploymentEvents: (projectId: string, depId: string) =>
    req<{ events: DeployEvent[] }>(`/api/projects/${projectId}/deployments/${depId}/events`, { cache: "no-store" }),
  deploymentLogs: (projectId: string, depId: string) =>
    req<{ logs: DeployLog[] }>(`/api/projects/${projectId}/deployments/${depId}/logs`, { cache: "no-store" }),
  cancelDeployment: (projectId: string, depId: string) =>
    req<{ deployment: Deployment }>(`/api/projects/${projectId}/deployments/${depId}/cancel`, {
      method: "POST",
    }),
  rollbackDeployment: (projectId: string, depId: string) =>
    req<{ deployment: Deployment; queued: boolean }>(`/api/projects/${projectId}/deployments/${depId}/rollback`, {
      method: "POST",
    }),
  promoteDeployment: (projectId: string, depId: string) =>
    req<{ deployment: Deployment; queued: boolean }>(`/api/projects/${projectId}/deployments/${depId}/promote`, { method: "POST" }),
  webhookConfig: (id: string) =>
    req<{ webhookUrl: string; linked: boolean; repository: string | null; secret: string | null }>(`/api/projects/${id}/webhook-config`),
  projectMetrics: (id: string) =>
    req<{ deployments: { byStatus: { status: string; n: number }[]; durations: { avg_seconds: number | null }; recent: Deployment[] }; requests: { byStatus: { status_code: number; n: number; avg_ms: number }[]; total: number; errors: number } }>(`/api/projects/${id}/metrics`),
  projectRequests: (id: string, q?: { method?: string; status?: string; path?: string }) =>
    req<{ requests: { method: string; path: string; status_code: number; latency_ms: number; created_at: string }[] }>(`/api/projects/${id}/requests${q ? `?${new URLSearchParams(q).toString()}` : ""}`),
  getRateLimit: (id: string) =>
    req<{ config: { requests_per_minute: number; requests_per_hour: number; enabled: number } }>(`/api/projects/${id}/rate-limit`),
  putRateLimit: (id: string, cfg: { requests_per_minute: number; requests_per_hour: number; enabled: boolean }) =>
    req<{ config: { requests_per_minute: number; requests_per_hour: number; enabled: number } }>(`/api/projects/${id}/rate-limit`, {
      method: "PUT",
      body: JSON.stringify(cfg),
    }),
  listMembers: (id: string) =>
    req<{ members: { user_id: number; email: string; role: string }[] }>(`/api/projects/${id}/members`),
  addMember: (id: string, m: { email: string; role: string }) =>
    req<{ ok: boolean }>(`/api/projects/${id}/members`, { method: "POST", body: JSON.stringify(m) }),
  removeMember: (id: string, userId: number) =>
    req<{ ok: boolean }>(`/api/projects/${id}/members/${userId}`, { method: "DELETE" }),
  listDomains: (id: string) =>
    req<{ domains: { id: number; hostname: string; kind: string; verified: number }[] }>(`/api/projects/${id}/domains`),
  addDomain: (id: string, hostname: string) =>
    req<{ domain: { id: number; hostname: string }; verificationToken: string }>(`/api/projects/${id}/domains`, {
      method: "POST",
      body: JSON.stringify({ hostname }),
    }),
  verifyDomain: (id: string, domainId: number) =>
    req<{ domain: { id: number; verified: number } }>(`/api/projects/${id}/domains/${domainId}/verify`, { method: "POST" }),
  removeDomain: (id: string, domainId: number) =>
    req<{ removed: boolean }>(`/api/projects/${id}/domains/${domainId}`, { method: "DELETE" }),
  openShell: (id: string) =>
    req<{ session: { id: number; container_id: string }; attachUrl: string }>(`/api/projects/${id}/shell`, { method: "POST" }),
  deleteProject: (id: string) =>
    req<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  overview: () =>
    req<{
      projects: (Project & { latest: { id: number; status: string; environment?: string; instance_state?: string | null; public_health_state?: string | null; commit_sha: string; live_url: string | null; public_url: string | null; created_at: string } | null })[];
      counts: { live: number; failed: number; total: number };
      recentFailures: { id: number; project_id: number; project_name: string; status: string; commit_sha: string; created_at: string }[];
      platformUrl: string | null;
    }>("/api/overview"),
  requestSeries: (id: string, hours = 24) =>
    req<{ points: { bucket: string; total: number; errors: number; avgMs: number | null; maxMs: number | null }[] }>(`/api/projects/${id}/metrics/series?type=requests&hours=${hours}`),
  deploymentSeries: (id: string, days = 14) =>
    req<{ points: { bucket: string; status: string; n: number }[] }>(`/api/projects/${id}/metrics/series?type=deployments&days=${days}`),
  runtime: (id: string) =>
    req<{ runtime: { running: boolean; cpuPercent?: number; memoryBytes?: number; memoryLimitBytes?: number; diskWritableBytes?: number; netRxBytes?: number; netTxBytes?: number } }>(`/api/projects/${id}/runtime`),
  containerLogs: (id: string, tail = 200) =>
    req<{ running: boolean; deploymentId?: number; container?: string; lines?: string[] }>(`/api/projects/${id}/container-logs?tail=${tail}`, { cache: "no-store" }),
};
