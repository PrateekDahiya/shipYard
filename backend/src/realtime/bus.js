'use strict';

// In-process project-scoped event bus for realtime dashboard updates.
// Event: { type, projectId, deploymentId?, data?, at }
// NOTE: single-process fan-out. Multi-worker fan-out via Redis pub/sub is
// tracked for Phase 06 hardening; the worker currently runs the pipeline
// through this same codebase, so local delivery covers the dev topology.

const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(100);

function channel(projectId) {
  return `project:${projectId}`;
}

function publish(event) {
  if (!event || !event.projectId || !event.type) {
    return;
  }
  bus.emit(channel(event.projectId), { ...event, at: new Date().toISOString() });
}

function subscribe(projectId, listener) {
  const ch = channel(projectId);
  bus.on(ch, listener);
  return () => bus.off(ch, listener);
}

module.exports = { publish, subscribe };
