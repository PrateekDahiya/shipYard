'use strict';

// Deployment worker pipeline: CLONING → BUILDING → IMAGE_CREATED → STARTING →
// HEALTH_CHECKING → RUNNING → SUCCESS, with explicit failure states.
// Deps are injectable so the orchestration is unit-testable without Docker.

const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const deploymentRepo = require('../repositories/deploymentRepo');
const projectRepo = require('../repositories/projectRepo');
const envRepo = require('../repositories/envRepo');
const { getPool } = require('../config/db');

function workRoot() {
  return process.env.SHIPYARD_WORKDIR || path.join(os.tmpdir(), 'shipyard-builds');
}

function runCmd(cmd, { cwd, env, timeoutMs, onData }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, env: { ...process.env, ...env }, shell: true, timeout: timeoutMs });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (d) => {
      stdout += d;
      if (onData) onData('stdout', d.toString());
    });
    child.stderr.on('data', (d) => {
      stderr += d;
      if (onData) onData('stderr', d.toString());
    });
    child.on('error', (e) => resolve({ exitCode: 1, stdout, stderr: stderr + e.message, timedOut: false }));
    child.on('close', (code, signal) => {
      timedOut = signal === 'SIGTERM';
      resolve({ exitCode: code ?? 1, stdout, stderr, timedOut });
    });
  });
}

async function currentStatus(id) {
  const d = await deploymentRepo.getById(id);
  return d && d.status;
}

async function fail(deploymentId, stage, message, docker, containerId) {
  const { failureStateFor } = require('../deployment/stateMachine');
  if (containerId && docker) {
    try {
      await docker.stopAndRemove(containerId);
    } catch {
      /* best effort */
    }
  }
  require('../utils/logger').warn('pipeline_failed', { deploymentId, stage, reason: message });
  return deploymentRepo.transition(deploymentId, failureStateFor(stage), message);
}

async function runDeployment(deploymentId, deps = {}) {
  const docker = deps.docker || require('../runtime/docker');
  const health = deps.health || require('../runtime/healthcheck');
  const exec = deps.exec || runCmd;
  const router = require('../runtime/router');
  const log = require('../utils/logger');

  const deployment = await deploymentRepo.getById(deploymentId);
  if (!deployment || deployment.status !== 'QUEUED') {
    return deployment;
  }
  log.info('pipeline_started', { deploymentId, projectId: deployment.project_id, sha: deployment.commit_sha, trigger: deployment.trigger_type });
  const project = await projectRepo.getById(deployment.project_id);
  const envRows = await envRepo.list(project.id, { includeSecretValues: true });
  const runtimeEnv = {};
  for (const r of envRows) {
    if (r.scope === 'runtime' || r.scope === 'both') {
      runtimeEnv[r.key] = r.value;
    }
  }

  const dir = path.join(workRoot(), `d${deploymentId}`);
  fs.mkdirSync(dir, { recursive: true });
  let newContainerId = null;

  const checkCancelled = async () => (await currentStatus(deploymentId)) === 'CANCELLED';

  try {
    // 1. CLONE
    await deploymentRepo.transition(deploymentId, 'CLONING', 'cloning repository');
    const repoUrl = project.repository_url;
    if (!repoUrl) {
      await deploymentRepo.appendLog(deploymentId, 'clone', 'stderr', 'no repository linked to project — set Repository URL in project settings');
      return fail(deploymentId, 'CLONING', 'no repository linked', docker);
    }
    const cloneEnv = {};
    const token = deps.githubToken || null;
    const authedUrl = token ? repoUrl.replace('https://', `https://x-access-token:${token}@`) : repoUrl;
    const clone = await exec(`git clone ${authedUrl} .`, {
      cwd: dir,
      env: cloneEnv,
      timeoutMs: 5 * 60 * 1000,
      onData: (stream, chunk) => deploymentRepo.appendLog(deploymentId, 'clone', stream, chunk),
    });
    if (await checkCancelled()) return deploymentRepo.getById(deploymentId);
    if (clone.exitCode !== 0) {
      await deploymentRepo.appendLog(deploymentId, 'clone', 'stderr', clone.stderr.slice(-2000));
      return fail(deploymentId, 'CLONING', 'clone failed', docker);
    }
    const checkout = await exec(`git checkout ${deployment.commit_sha}`, { cwd: dir, timeoutMs: 120000 });
    if (checkout.exitCode !== 0) {
      return fail(deploymentId, 'CLONING', 'checkout of pinned commit failed', docker);
    }

    // Dockerfile (or generated buildpack): repos with their own Dockerfile keep
    // full control; otherwise generate one from build/run config. Generated
    // images run the build INSIDE docker build, so skip the worker-side build.
    // Static projects get an nginx image serving the output dir (no app server,
    // health is plain GET /).
    const dockerfile = deps.dockerfile || require('../deployment/dockerfile');
    let dockerfileUsed = 'custom';
    const isStatic = project.deploy_type === 'static';
    try {
      const ensured = dockerfile.ensure(dir, {
        buildCommand: deployment.build_command || project.build_command,
        runCommand: deployment.run_command || project.run_command,
        port: deployment.app_port || project.app_port || 3000,
        deployType: project.deploy_type || 'server',
        outputDir: project.output_dir || 'build',
        envVars: envRows,
      });
      dockerfileUsed = ensured.used;
      if (ensured.used !== 'custom') {
        await deploymentRepo.appendLog(deploymentId, 'image', 'stdout', `no Dockerfile in repo — generated ${isStatic ? 'static nginx' : `one for ${ensured.stack} stack`} from build config`);
      }
    } catch (e) {
      if (e.message === 'no_dockerfile_no_detected_stack' || e.message === 'static_requires_node_project') {
        await deploymentRepo.appendLog(deploymentId, 'image', 'stderr', 'no Dockerfile and no Node.js project detected — add a Dockerfile or use a Node project (static needs package.json)');
        await deploymentRepo.transition(deploymentId, 'BUILDING', 'resolving image build');
        return fail(deploymentId, 'IMAGE_CREATED', 'no Dockerfile and no detected stack', docker);
      }
      throw e;
    }

    // 2. BUILD (worker-side pre-step; skipped when the generated image builds it)
    await deploymentRepo.transition(deploymentId, 'BUILDING', 'running build command');
    const buildCmd = deployment.build_command || project.build_command;
    if (buildCmd && dockerfileUsed === 'custom') {
      const buildEnv = {};
      for (const r of envRows) {
        if (r.scope === 'build' || r.scope === 'both') {
          buildEnv[r.key] = r.value;
        }
      }
      const [b] = await getPool().query(
        'INSERT INTO builds (deployment_id, command, working_directory) VALUES (?, ?, ?)',
        [deploymentId, buildCmd, project.working_directory || '/']
      );
      void b;
      const result = await exec(buildCmd, {
        cwd: path.join(dir, project.working_directory && project.working_directory !== '/' ? project.working_directory : '.'),
        env: buildEnv,
        timeoutMs: (project.deploy_timeout || 600) * 1000,
        onData: (stream, chunk) => deploymentRepo.appendLog(deploymentId, 'build', stream, chunk),
      });
      await getPool().query('UPDATE builds SET exit_code = ?, timed_out = ? WHERE deployment_id = ?', [
        result.exitCode,
        result.timedOut ? 1 : 0,
        deploymentId,
      ]);
      if (await checkCancelled()) return deploymentRepo.getById(deploymentId);
      if (result.exitCode !== 0) {
        return fail(deploymentId, 'BUILDING', result.timedOut ? 'build timed out' : 'build command failed', docker);
      }
    }

    // 3. IMAGE
    const tag = `shipyard/p${project.id}-d${deploymentId}:latest`;
    const hostname = router.hostnameFor(project);
    const serviceName = `shipyard-p${project.id}`;
    // Static sites are always served on nginx :80; servers use configured port.
    const appPort = isStatic ? 80 : deployment.app_port || project.app_port || 3000;
    // Build args for Docker build (only for generated images, not custom Dockerfiles)
    const buildArgs = {};
    if (dockerfileUsed !== 'custom') {
      for (const r of envRows) {
        if (r.scope === 'build' || r.scope === 'both') {
          buildArgs[r.key] = r.value;
        }
      }
    }
    try {
      await docker.buildImage({
        tag,
        contextDir: dir,
        onProgress: (line) => deploymentRepo.appendLog(deploymentId, 'image', 'stdout', line),
        buildArgs,
      });
    } catch (e) {
      await deploymentRepo.appendLog(deploymentId, 'image', 'stderr', String(e.message || e).slice(-2000));
      return fail(deploymentId, 'IMAGE_CREATED', 'docker build failed', docker);
    }
    if (await checkCancelled()) return deploymentRepo.getById(deploymentId);
    await getPool().query('UPDATE deployments SET image_tag = ? WHERE id = ?', [tag, deploymentId]);
    await deploymentRepo.transition(deploymentId, 'IMAGE_CREATED', `image ${tag} created`);

    // 4. START
    await deploymentRepo.transition(deploymentId, 'STARTING', 'starting container');
    const labels = {
      ...docker.baseLabels(project.id, deploymentId),
      ...docker.traefikLabels({ hostname, serviceName, port: appPort }),
    };
    let container;
    try {
      const { parseMemory, parseCpu } = require('../utils/resources');
      container = await docker.startContainer({
        name: docker.containerName(project.id, deploymentId),
        image: tag,
        env: runtimeEnv,
        labels,
        port: appPort,
        memoryBytes: parseMemory(project.memory_limit),
        nanoCpus: parseCpu(project.cpu_limit),
      });
      newContainerId = container.id || (container.Id ? container.Id : String(container));
      if (typeof newContainerId !== 'string') {
        newContainerId = container.id;
      }
    } catch (e) {
      await deploymentRepo.appendLog(deploymentId, 'startup', 'stderr', String(e.message || e).slice(-2000));
      return fail(deploymentId, 'STARTING', 'container start failed', docker);
    }
    await getPool().query(
      "INSERT INTO application_instances (project_id, deployment_id, container_id, state) VALUES (?, ?, ?, 'STARTING')",
    [project.id, deploymentId, String(newContainerId)]
    );
    await getPool().query('UPDATE deployments SET container_id = ? WHERE id = ?', [String(newContainerId), deploymentId]);

    // 5. HEALTH CHECK (via the ephemeral host port mapped at start).
    // Static sites have no app health endpoint: plain GET / on nginx is the check.
    await deploymentRepo.transition(deploymentId, 'HEALTH_CHECKING', isStatic ? 'probing / on static site' : 'probing application health');
    const healthPath = isStatic ? '/' : project.healthcheck_path || '/health';
    const mappedPort = docker.hostPortFor ? await docker.hostPortFor(String(newContainerId), appPort) : null;
    const probeHostPort = mappedPort || appPort;
    if (mappedPort) {
      await getPool().query('UPDATE application_instances SET host_port = ? WHERE deployment_id = ?', [mappedPort, deploymentId]);
    }
    // The worker may itself run in a container (compose), where `localhost`
    // is the worker — not the Docker host publishing the ephemeral port.
    // SHIPYARD_PROBE_HOST overrides the probe host (e.g. host.docker.internal).
    const probeHost = process.env.SHIPYARD_PROBE_HOST || 'localhost';
    const probeUrl = deps.probeUrlFor
      ? await deps.probeUrlFor(newContainerId, probeHostPort, healthPath)
      : `http://${probeHost}:${probeHostPort}${healthPath}`;
    const result = await health.waitHealthy(probeUrl, {
      timeoutMs: (project.healthcheck_timeout || 10) * 1000,
      expectedStatus: 200,
      retries: 12,
      intervalMs: 5000,
      onAttempt: (attempt, r) =>
        getPool().query("INSERT INTO health_checks (deployment_id, path, attempt, result, latency_ms) VALUES (?, ?, ?, ?, ?)", [
          deploymentId,
          healthPath,
          attempt,
          r.ok ? 'pass' : 'fail',
          r.latencyMs || null,
        ]),
    });
    if (!result.healthy) {
      await getPool().query("UPDATE application_instances SET state = 'UNHEALTHY' WHERE deployment_id = ?", [deploymentId]);
      return fail(deploymentId, 'HEALTH_CHECKING', 'health check failed', docker, newContainerId);
    }

    // 6. RUNNING → SUCCESS, retire previous instance
    await deploymentRepo.transition(deploymentId, 'RUNNING', 'application healthy');
    const liveUrl = router.liveUrlFor(project);
    await getPool().query('UPDATE deployments SET live_url = ? WHERE id = ?', [liveUrl, deploymentId]);
    await getPool().query("UPDATE application_instances SET state = 'RUNNING' WHERE deployment_id = ?", [deploymentId]);
    const [oldInstances] = await getPool().query(
      "SELECT container_id FROM application_instances WHERE project_id = ? AND deployment_id != ? AND state IN ('RUNNING','STARTING')",
      [project.id, deploymentId]
    );
    for (const row of oldInstances) {
      try {
        await docker.stopAndRemove(row.container_id);
        await getPool().query("UPDATE application_instances SET state = 'STOPPED', stopped_at = NOW() WHERE container_id = ?", [
          row.container_id,
        ]);
      } catch {
        /* best effort */
      }
    }
    await getPool().query(
      "INSERT INTO domains (project_id, hostname, kind, verified) VALUES (?, ?, 'shipyard', 1) ON DUPLICATE KEY UPDATE project_id = VALUES(project_id)",
      [project.id, hostname]
    );
    log.info('pipeline_succeeded', { deploymentId, projectId: project.id, liveUrl });
    return deploymentRepo.transition(deploymentId, 'SUCCESS', `live at ${liveUrl}`);
  } catch (e) {
    log.error('pipeline_error', { deploymentId, error: e.message });
    return fail(deploymentId, 'STARTING', `unexpected worker error: ${e.message}`, docker, newContainerId);
  }
}

module.exports = { runDeployment, runCmd, workRoot };
