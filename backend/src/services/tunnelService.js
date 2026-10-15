'use strict';

// Public tunnels: one agent sidecar per live deployment, forwarding to the
// app container's Docker-network address. Tailscale mode reuses one named
// state volume per project, which keeps its Funnel hostname stable across
// deployments.
//
// Design constraints (all load-bearing):
// - The upstream MUST be the app container's Docker-network IP + container
//   port (resolved via inspect at sidecar start). From inside a sidecar,
//   localhost is the sidecar itself and host-mapped ports live in the host
//   namespace — both would be wrong. Laptop dev servers (`npm run dev`) have
//   no instance row and no container, so they can never get a tunnel.
// - Everything here is best-effort and never throws: a tunnel that fails to
//   come up must never fail the deployment itself.

const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function tunnelsEnabled() {
  const configured = process.env.PUBLIC_TUNNELS_ENABLED
    || (provider() === 'cloudflare' ? process.env.CLOUDFLARE_ENABLED : undefined)
    || 'true';
  return String(configured).toLowerCase() !== 'false';
}

function provider() {
  return String(process.env.PUBLIC_TUNNEL_PROVIDER || 'cloudflare').toLowerCase();
}

function tunnelImage() {
  return process.env.TUNNEL_IMAGE || 'cloudflare/cloudflared:latest';
}

function platformTunnelContainer() {
  return process.env.TUNNEL_CONTAINER_NAME || 'shipyard-tunnel-1';
}

function tailscaleSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function tailscaleUrl(projectSlug) {
  const tailnet = String(process.env.TAILSCALE_TAILNET || '').trim();
  const host = `shipyard-${tailscaleSlug(projectSlug)}`;
  return tailnet && tailscaleSlug(projectSlug) ? `https://${host}.${tailnet}` : null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function logger() {
  return require('../utils/logger');
}

// Start a sidecar for a live deployment and persist its public URL.
// Returns the URL string, or null when tunnels are disabled/unavailable.
async function ensureDeploymentTunnel({ projectId, projectSlug, deploymentId, containerId, appPort, docker, environment = 'production', previewKey = null }) {
  const tailscaleVolume = environment === 'production'
    ? `shipyard-tailscale-project-${projectId}`
    : `shipyard-tailscale-project-${projectId}-${environment}-${tailscaleSlug(previewKey || deploymentId)}`;
  if (!tunnelsEnabled()) {
    return null;
  }
  const log = logger();
  try {
    const deploymentRepo = require('../repositories/deploymentRepo');
    const { parseMemory } = require('../utils/resources');
    const isTailscale = provider() === 'tailscale';
    if (isTailscale && (!process.env.TAILSCALE_AUTHKEY || !process.env.TAILSCALE_TAILNET)) {
      log.warn('tailscale_config_missing', { projectId, deploymentId });
      return null;
    }
    const name = docker.tunnelName(projectId, deploymentId);
    try {
      await docker.pullImage(isTailscale ? (process.env.TAILSCALE_TUNNEL_IMAGE || 'tailscale/tailscale:stable') : tunnelImage());
    } catch (e) {
      log.warn('tunnel_image_pull_failed', { projectId, deploymentId, message: e && e.message });
      return null;
    }
    const ip = await docker.containerIp(containerId);
    const upstream = `http://${ip}:${appPort}`;
    // Drop any stale sidecar with this exact name (e.g. from a retried deploy).
    try {
      await docker.removeContainersByNamePrefix(name);
    } catch {
      /* best effort */
    }
    const image = isTailscale ? (process.env.TAILSCALE_TUNNEL_IMAGE || 'tailscale/tailscale:stable') : tunnelImage();
    const stableUrl = isTailscale ? tailscaleUrl(projectSlug) : null;
    const tsHost = `shipyard-${tailscaleSlug(projectSlug)}`;
    const tsCommand = [
      'sh', '-c',
      'tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock & ' +
      'until test -S /var/run/tailscale/tailscaled.sock; do sleep 1; done; ' +
      'if ! tailscale status --json 2>/dev/null | grep -q \'"BackendState":"Running"\'; then tailscale up --authkey="$TS_AUTHKEY" --hostname="$TS_HOSTNAME" --accept-dns=false; fi; ' +
      `tailscale funnel --bg --https=443 http://${ip}:${appPort}; tail -f /dev/null`,
    ];
    const sidecar = await docker.startContainer({
      name,
      image,
      env: isTailscale ? {
        TS_AUTHKEY: process.env.TAILSCALE_AUTHKEY,
        TS_HOSTNAME: tsHost,
      } : {},
      labels: {
        'shipyard.managed': 'true',
        'shipyard.project': String(projectId),
        'shipyard.deployment': String(deploymentId),
        'shipyard.tunnel-for': `${projectId}/${deploymentId}`,
      },
      memoryBytes: parseMemory('64M'),
      cmd: isTailscale ? tsCommand : ['tunnel', '--url', upstream, '--no-autoupdate'],
      binds: isTailscale ? [`${tailscaleVolume}:/var/lib/tailscale`] : undefined,
      capAdd: isTailscale ? ['NET_ADMIN'] : undefined,
      devices: isTailscale ? [{ PathOnHost: '/dev/net/tun', PathInContainer: '/dev/net/tun', CgroupPermissions: 'rwm' }] : undefined,
    });
    const sidecarId = String(sidecar.id || sidecar.Id);
    if (stableUrl) {
      await deploymentRepo.setPublicUrl(deploymentId, stableUrl);
      log.info('tunnel_ready', { projectId, deploymentId, url: stableUrl, provider: 'tailscale' });
      return stableUrl;
    }
    // The agent prints its assigned URL to its own logs a few seconds in.
    // Poll briefly; on timeout remove the sidecar (an unlinkable tunnel only
    // wastes a tunnel slot) and leave the deployment itself live.
    const pollMs = Math.max(100, parseInt(process.env.TUNNEL_DISCOVERY_POLL_MS || '2000', 10) || 2000);
    const timeoutMs = Math.max(pollMs, parseInt(process.env.TUNNEL_DISCOVERY_TIMEOUT_MS || '60000', 10) || 60000);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(pollMs);
      try {
        const logs = await docker.containerLogsText(sidecarId, { tail: 30 });
        // cloudflared writes the Quick Tunnel banner to stderr in some image
        // versions and stdout in others. Parse both streams.
        const m = `${String(logs.stdout || '')}\n${String(logs.stderr || '')}`.match(TUNNEL_URL_RE);
        if (m) {
          const url = m[0];
          await deploymentRepo.setPublicUrl(deploymentId, url);
          log.info('tunnel_ready', { projectId, deploymentId, url });
          return url;
        }
      } catch {
        /* agent still booting — retry until deadline */
      }
    }
    log.warn('tunnel_url_timeout', { projectId, deploymentId });
    try {
      await docker.removeContainersByNamePrefix(name);
    } catch {
      /* best effort */
    }
    return null;
  } catch (e) {
    log.warn('tunnel_failed', { projectId, deploymentId, message: e && e.message });
    return null;
  }
}

async function removeDeploymentTunnel(projectId, deploymentId, docker) {
  try {
    await docker.removeContainersByNamePrefix(docker.tunnelName(projectId, deploymentId));
  } catch {
    /* best effort */
  }
}

// Remove every tunnel sidecar belonging to a project (project delete path).
// Matched by label (exact pid/dep pair) — never by name prefix, where
// `shipyard-p1-` would also match project 11's sidecars.
async function removeProjectTunnels(projectId, docker) {
  try {
    const list = await docker.listLabeled('shipyard.tunnel-for');
    for (const c of list || []) {
      const labels = (c.Labels || {});
      const tag = labels['shipyard.tunnel-for'];
      if (typeof tag !== 'string') {
        continue;
      }
      const [pid] = tag.split('/');
      if (String(pid) !== String(projectId)) {
        continue;
      }
      try {
        const container = docker.getContainer(c.Id);
        try {
          await container.stop({ t: 5 });
        } catch (e) {
          if (!e || (e.statusCode !== 304 && e.statusCode !== 404)) {
            throw e;
          }
        }
        await container.remove({ force: true });
      } catch {
        /* already gone — best effort */
      }
    }
  } catch {
    /* docker unavailable — best effort */
  }
}

// Public URL of the platform-wide tunnel (the ShipYard UI itself), scraped
// from the tunnel container's logs. Cached briefly; null when absent.
let platformCache = { url: null, at: 0 };
async function getPlatformTunnelUrl(docker, cacheMs = 30000) {
  if (Date.now() - platformCache.at < cacheMs && platformCache.at !== 0) {
    return platformCache.url;
  }
  let url = null;
  if (provider() === 'tailscale' && process.env.TAILSCALE_TAILNET) {
    url = `https://shipyard-platform.${String(process.env.TAILSCALE_TAILNET).trim()}`;
    platformCache = { url, at: Date.now() };
    return url;
  }
  try {
    const logs = await docker.containerLogsText(platformTunnelContainer(), { tail: 30 });
    const m = `${String(logs.stdout || '')}\n${String(logs.stderr || '')}`.match(TUNNEL_URL_RE);
    if (m) {
      url = m[0];
    }
  } catch {
    /* no tunnel container — not configured */
  }
  platformCache = { url, at: Date.now() };
  return url;
}

module.exports = {
  tunnelsEnabled,
  tunnelImage,
  ensureDeploymentTunnel,
  removeDeploymentTunnel,
  removeProjectTunnels,
  getPlatformTunnelUrl,
};
