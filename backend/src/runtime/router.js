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

function hostnameFor(project) {
  return `${slugify(project.name)}.${BASE_DOMAIN}`;
}

function liveUrlFor(project) {
  return `http://${hostnameFor(project)}`;
}

module.exports = { BASE_DOMAIN, slugify, hostnameFor, liveUrlFor };
