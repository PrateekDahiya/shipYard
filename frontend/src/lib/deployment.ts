export const DEPLOYMENT_ACTIVE_STATUSES = ["QUEUED", "CLONING", "BUILDING", "IMAGE_CREATED", "STARTING", "HEALTH_CHECKING", "RUNNING"] as const;

export function isDeploymentActive(status: string) {
  return DEPLOYMENT_ACTIVE_STATUSES.includes(status as (typeof DEPLOYMENT_ACTIVE_STATUSES)[number]);
}

export function isDeploymentFailed(status: string) {
  return status.includes("FAIL");
}

export function isCurrentLiveDeployment(deployment: { status: string; instance_state?: string | null; environment?: string | null }) {
  return (deployment.environment || "production") === "production" && (deployment.status === "SUCCESS" || deployment.status === "RUNNING") && deployment.instance_state === "RUNNING";
}

export function currentLiveUrl(deployment?: { status: string; instance_state?: string | null; environment?: string | null; public_url?: string | null; live_url?: string | null } | null) {
  if (!deployment || !isCurrentLiveDeployment(deployment)) return null;
  return deployment.public_url || deployment.live_url || null;
}

export function relativeTime(iso: string) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatDeploymentTime(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
