'use strict';

const sm = require('../src/deployment/stateMachine');

describe('deployment state machine', () => {
  test('happy path transitions are allowed', () => {
    const path = ['QUEUED', 'CLONING', 'BUILDING', 'IMAGE_CREATED', 'STARTING', 'HEALTH_CHECKING', 'RUNNING', 'SUCCESS'];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(sm.canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  test('failed deployment can never become SUCCESS or RUNNING', () => {
    for (const failed of ['CLONE_FAILED', 'BUILD_FAILED', 'IMAGE_BUILD_FAILED', 'START_FAILED', 'HEALTH_CHECK_FAILED', 'DEPLOYMENT_FAILED']) {
      expect(sm.canTransition(failed, 'SUCCESS')).toBe(false);
      expect(sm.canTransition(failed, 'RUNNING')).toBe(false);
      expect(sm.canTransition(failed, 'CLONING')).toBe(false);
    }
  });

  test('terminal states reject everything; cancel allowed mid-flight', () => {
    expect(sm.isTerminal('SUCCESS')).toBe(true);
    expect(sm.isTerminal('CANCELLED')).toBe(true);
    expect(sm.isTerminal('RUNNING')).toBe(false);
    expect(sm.canTransition('BUILDING', 'CANCELLED')).toBe(true);
    expect(sm.canTransition('QUEUED', 'SUCCESS')).toBe(false);
    expect(() => sm.assertTransition('QUEUED', 'SUCCESS')).toThrow(/invalid_transition/);
  });

  test('failureStateFor maps stage to correct failure', () => {
    expect(sm.failureStateFor('CLONING')).toBe('CLONE_FAILED');
    expect(sm.failureStateFor('HEALTH_CHECKING')).toBe('HEALTH_CHECK_FAILED');
    expect(sm.failureStateFor('UNKNOWN_STAGE')).toBe('DEPLOYMENT_FAILED');
  });
});
