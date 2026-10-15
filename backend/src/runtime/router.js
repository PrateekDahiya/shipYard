'use strict';

// Routing helpers: stable per-project hostname + Traefik wiring.

const BASE_DOMAIN = process.env.SHIPYARD_BASE_DOMAIN || 'shipyard.localhost';

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function hostnameFor(project, environment = 'production', deploymentId) {
  const slug = slugify(project.name);
  return environment !== 'production'
    ? `${environment}-${slug}-${String(deploymentId || 'latest')}.${BASE_DOMAIN}`
    : `${slug}.${BASE_DOMAIN}`;
}

function liveUrlFor(project, environment = 'production', deploymentId) {
  return `http://${hostnameFor(project, environment, deploymentId)}`;
}

module.exports = { BASE_DOMAIN, slugify, hostnameFor, liveUrlFor };
