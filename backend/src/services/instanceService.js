'use strict';

// Lifecycle ops on the project's current instance (stop/start/restart).
// Acts on the latest RUNNING/STARTING instance row; Docker calls are faked
// in tests via docker.setClientForTests.

const { getPool } = require('../config/db');
const auditRepo = require('../repositories/auditRepo');

async function currentInstance(projectId) {
  const [rows] = await getPool().query(
    "SELECT * FROM application_instances WHERE project_id = ? AND state IN ('RUNNING','STARTING','UNHEALTHY') ORDER BY id DESC LIMIT 1",
    [projectId]
  );
  return rows[0] || null;
}

// Best-effort teardown of every live container of a project (used when a
// project is deleted so containers cannot be orphaned). Never throws.
async function stopAllForProject(projectId, docker) {
  const [rows] = await getPool().query(
    "SELECT container_id FROM application_instances WHERE project_id = ? AND state IN ('RUNNING','STARTING','UNHEALTHY')",
    [projectId]
  );
  for (const row of rows) {
    try {
      await docker.stopAndRemove(row.container_id);
    } catch {
      /* container may already be gone */
    }
    await getPool().query("UPDATE application_instances SET state = 'STOPPED', stopped_at = NOW() WHERE container_id = ?", [
      row.container_id,
    ]);
  }
  return { stopped: rows.length };
}

async function stop(userId, projectId, docker) {
  const inst = await currentInstance(projectId);
  if (!inst) {
    const err = new Error('no_running_instance');
    err.status = 409;
    throw err;
  }
  await docker.stopAndRemove(inst.container_id);
  await getPool().query("UPDATE application_instances SET state = 'STOPPED', stopped_at = NOW() WHERE id = ?", [inst.id]);
  await getPool().query("UPDATE deployments SET status = 'STOPPED' WHERE id = ? AND status = 'SUCCESS'", [inst.deployment_id]);
  await auditRepo.record({ userId, projectId, action: 'application.stopped', metadata: { deploymentId: inst.deployment_id } });
  return { stopped: true };
}

async function start(userId, projectId, docker) {
  const [rows] = await getPool().query(
    'SELECT * FROM deployments WHERE project_id = ? AND image_tag IS NOT NULL ORDER BY id DESC LIMIT 1',
    [projectId]
  );
  const dep = rows[0];
  if (!dep) {
    const err = new Error('nothing_to_start');
    err.status = 409;
    throw err;
  }
  const projectRepo = require('../repositories/projectRepo');
  const router = require('../runtime/router');
  const project = await projectRepo.getById(projectId);
  const appPort = dep.app_port || project.app_port || 3000;
  const container = await docker.startContainer({
    name: docker.containerName(projectId, dep.id),
    image: dep.image_tag,
    env: {},
    labels: {
      ...docker.baseLabels(projectId, dep.id),
      ...docker.traefikLabels({ hostname: router.hostnameFor(project), serviceName: `shipyard-p${projectId}`, port: appPort }),
    },
    port: appPort,
  });
  const cid = String(container.id || container.Id);
  let hostPort = null;
  if (docker.hostPortFor) {
    try {
      hostPort = await docker.hostPortFor(cid, appPort);
    } catch {
      /* probe-time discovery only */
    }
  }
  await getPool().query(
    "INSERT INTO application_instances (project_id, deployment_id, container_id, state, host_port) VALUES (?, ?, ?, 'RUNNING', ?)",
    [projectId, dep.id, cid, hostPort]
  );
  await auditRepo.record({ userId, projectId, action: 'application.started', metadata: { deploymentId: dep.id } });
  return { started: true, containerId: cid, hostPort };
}

module.exports = { currentInstance, stop, start, stopAllForProject };
