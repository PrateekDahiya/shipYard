'use strict';

// Deployment state machine (§14). Guarded transitions; failed deployments
// must never become SUCCESS/RUNNING without passing through the pipeline.

const STATES = Object.freeze([
  'QUEUED',
  'CLONING',
  'BUILDING',
  'IMAGE_CREATED',
  'STARTING',
  'HEALTH_CHECKING',
  'RUNNING',
  'SUCCESS',
  'CLONE_FAILED',
  'BUILD_FAILED',
  'IMAGE_BUILD_FAILED',
  'START_FAILED',
  'HEALTH_CHECK_FAILED',
  'DEPLOYMENT_FAILED',
  'CANCELLED',
  'STOPPED',
]);

const FAILURE_OF = Object.freeze({
  CLONING: 'CLONE_FAILED',
  BUILDING: 'BUILD_FAILED',
  IMAGE_CREATED: 'IMAGE_BUILD_FAILED',
  STARTING: 'START_FAILED',
  HEALTH_CHECKING: 'HEALTH_CHECK_FAILED',
});

const TERMINAL = Object.freeze(
  new Set(['SUCCESS', 'CLONE_FAILED', 'BUILD_FAILED', 'IMAGE_BUILD_FAILED', 'START_FAILED', 'HEALTH_CHECK_FAILED', 'DEPLOYMENT_FAILED', 'CANCELLED'])
);

const TRANSITIONS = Object.freeze({
  QUEUED: ['CLONING', 'CANCELLED'],
  CLONING: ['BUILDING', 'CLONE_FAILED', 'CANCELLED'],
  BUILDING: ['IMAGE_CREATED', 'BUILD_FAILED', 'IMAGE_BUILD_FAILED', 'CANCELLED'],
  IMAGE_CREATED: ['STARTING', 'IMAGE_BUILD_FAILED', 'CANCELLED'],
  STARTING: ['HEALTH_CHECKING', 'START_FAILED', 'CANCELLED'],
  HEALTH_CHECKING: ['RUNNING', 'HEALTH_CHECK_FAILED', 'CANCELLED'],
  RUNNING: ['SUCCESS', 'DEPLOYMENT_FAILED', 'STOPPED'],
  SUCCESS: ['STOPPED'],
  STOPPED: ['QUEUED'],
});

function canTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to)) {
    return false;
  }
  if (TERMINAL.has(from)) {
    return false;
  }
  return (TRANSITIONS[from] || []).includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`invalid_transition_${from}_to_${to}`);
    err.status = 409;
    throw err;
  }
}

function failureStateFor(stage) {
  return FAILURE_OF[stage] || 'DEPLOYMENT_FAILED';
}

function isTerminal(status) {
  return TERMINAL.has(status);
}

module.exports = { STATES, TERMINAL, TRANSITIONS, canTransition, assertTransition, failureStateFor, isTerminal };
