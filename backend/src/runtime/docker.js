'use strict';

// Docker runtime wrapper (lazy client so the API boots without a daemon).
// All methods are small, auditable, and injectable for tests.

function createClient() {
  const Docker = require('dockerode');
  const opts = {};
  if (process.env.DOCKER_HOST) {
    opts.host = process.env.DOCKER_HOST;
    opts.port = process.env.DOCKER_PORT ? parseInt(process.env.DOCKER_PORT, 10) : 2375;
  } else if (process.env.DOCKER_SOCKET) {
    opts.socketPath = process.env.DOCKER_SOCKET;
  } else if (process.platform === 'win32') {
    opts.socketPath = '//./pipe/docker_engine';
  } else {
    opts.socketPath = '/var/run/docker.sock';
  }
  return new Docker(opts);
}

let client = null;
function getClient() {
  if (!client) {
    client = createClient();
  }
  return client;
}

function setClientForTests(fake) {
  client = fake;
}

function getContainer(containerId) {
  return getClient().getContainer(containerId);
}

async function ping() {
  await getClient().ping();
  return true;
}

function baseLabels(projectId, deploymentId) {
  return {
    'shipyard.managed': 'true',
    'shipyard.project': String(projectId),
    'shipyard.deployment': String(deploymentId),
  };
}

function traefikLabels({ hostname, serviceName, port }) {
  const labels = {};
  labels[`traefik.enable`] = 'true';
  labels[`traefik.http.routers.${serviceName}.rule`] = `Host(\`${hostname}\`)`;
  labels[`traefik.http.routers.${serviceName}.entrypoints`] = 'web';
  labels[`traefik.http.services.${serviceName}.loadbalancer.server.port`] = String(port);
  return labels;
}

function containerName(projectId, deploymentId) {
  return `shipyard-p${projectId}-d${deploymentId}`;
}

function buildErrorOf(output) {
  const failed = (output || []).find((e) => e && (e.error || e.errorDetail));
  if (!failed) {
    return null;
  }
  const detail = failed.errorDetail && failed.errorDetail.message;
  return new Error(String(failed.error || detail || 'docker build failed'));
}

async function buildImage({ tag, contextDir, dockerfile = 'Dockerfile', onProgress, buildArgs }) {
  // Pack the whole build context (minus heavy/secret-prone dirs). An allowlist
  // of filenames breaks real apps that lack e.g. package-lock.json; full
  // .dockerignore semantics are a documented hardening follow-up.
  const tar = require('tar-fs');
  const skip = new Set(['node_modules', '.git']);
  const pack = tar.pack(contextDir, {
    ignore: (name) => String(name).split(/[\\/]/).some((part) => skip.has(part)),
  });
  const stream = await getClient().buildImage(pack, { t: tag, dockerfile, rm: true, forcerm: true, buildargs: buildArgs });
  return new Promise((resolve, reject) => {
    getClient().modem.followProgress(
      stream,
      (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        // followProgress only surfaces transport errors. A failed build step
        // arrives as an ordinary event carrying error/errorDetail, followed by
        // a clean stream end — without this scan, failures resolve as success
        // (observed live: phantom IMAGE_CREATED, then 404 at container start).
        const buildErr = buildErrorOf(res);
        if (buildErr) {
          reject(buildErr);
          return;
        }
        resolve(res);
      },
      (event) => {
        if (onProgress && (event.stream || event.error)) {
          onProgress(event.stream || event.error);
        }
      }
    );
  });
}

async function startContainer({ name, image, env = {}, labels = {}, port, memoryBytes, nanoCpus }) {
  const Env = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  const HostConfig = {
    Memory: memoryBytes || undefined,
    NanoCpus: nanoCpus || undefined,
    AutoRemove: false,
    NetworkMode: process.env.SHIPYARD_NETWORK || undefined,
  };
  // Publish the app port on an ephemeral host port so the worker can health-
  // check it. Traefik still routes to the container port on the docker network.
  if (port) {
    HostConfig.PortBindings = { [`${port}/tcp`]: [{ HostPort: '' }] };
  }
  const container = await getClient().createContainer({
    name,
    Image: image,
    Env,
    Labels: labels,
    ExposedPorts: port ? { [`${port}/tcp`]: {} } : undefined,
    HostConfig,
  });
  await container.start();
  return container;
}

async function stopAndRemove(containerId, { timeoutSeconds = 10 } = {}) {
  const container = getClient().getContainer(containerId);
  try {
    await container.stop({ t: timeoutSeconds });
  } catch (e) {
    if (!e || e.statusCode !== 304) {
      throw e;
    }
  }
  await container.remove({ force: true });
}

async function containerLogs(containerId, { tail = 200 } = {}) {
  const container = getClient().getContainer(containerId);
  const stream = await container.logs({ stdout: true, stderr: true, tail });
  return stream.toString('utf8');
}

async function inspectState(containerId) {
  const data = await getClient().getContainer(containerId).inspect();
  return { running: !!data.State.Running, status: data.State.Status, exitCode: data.State.ExitCode };
}

async function hostPortFor(containerId, containerPort) {
  const data = await getClient().getContainer(containerId).inspect();
  const bindings = data.NetworkSettings && data.NetworkSettings.Ports && data.NetworkSettings.Ports[`${containerPort}/tcp`];
  if (bindings && bindings[0] && bindings[0].HostPort) {
    return parseInt(bindings[0].HostPort, 10);
  }
  return null;
}

module.exports = {
  getClient,
  setClientForTests,
  getContainer,
  ping,
  baseLabels,
  traefikLabels,
  containerName,
  buildImage,
  startContainer,
  stopAndRemove,
  containerLogs,
  inspectState,
  hostPortFor,
  buildErrorOf,
};
