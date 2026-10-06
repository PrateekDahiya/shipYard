'use strict';

// Unit tests for the realtime bus Redis bridge (no Redis/MySQL needed).
// Regression: worker-process publishes must reach API-process subscribers.
// Here both sides share the module, so "remote" delivery is simulated by
// invoking the mocked subscriber's message handler directly.

const mockInstances = [];

const bus = require('../src/realtime/bus');

function mockMakeFake() {
  const handlers = {};
  return {
    handlers,
    published: [],
    subscribed: [],
    on(ev, fn) {
      (handlers[ev] = handlers[ev] || []).push(fn);
      return this;
    },
    publish(ch, msg) {
      this.published.push([ch, msg]);
      return Promise.resolve(1);
    },
    subscribe(ch) {
      this.subscribed.push(ch);
      return Promise.resolve(1);
    },
    unsubscribe() {
      return Promise.resolve(1);
    },
    disconnect() {},
  };
}

jest.mock('ioredis', () => jest.fn().mockImplementation(() => {
  const fake = mockMakeFake();
  mockInstances.push(fake);
  return fake;
}));

function subscriberInstance() {
  return mockInstances.find((i) => i.subscribed.length > 0);
}

function emitRemote(ch, evt) {
  const sub = subscriberInstance();
  expect(sub).toBeDefined();
  for (const fn of sub.handlers.message || []) {
    fn(ch, JSON.stringify(evt));
  }
}

beforeEach(() => {
  mockInstances.length = 0;
});

afterEach(async () => {
  await bus.closeBridge();
  jest.clearAllMocks();
});

test('local publish reaches local subscriber exactly once (no echo)', async () => {
  const seen = [];
  const off = bus.subscribe(512, (e) => seen.push(e));
  bus.publish({ type: 'DEPLOYMENT_LOG', projectId: 512, deploymentId: 1, data: { line: 'hi' } });
  await new Promise((r) => setImmediate(r));
  expect(seen.length).toBe(1);
  expect(seen[0].type).toBe('DEPLOYMENT_LOG');
  expect(seen[0].at).toBeDefined();
  off();
});

test('publish is bridged to redis', async () => {
  const off = bus.subscribe(512, () => {});
  bus.publish({ type: 'DEPLOYMENT_STATUS', projectId: 512, deploymentId: 1, data: {} });
  await new Promise((r) => setImmediate(r));
  const bridged = mockInstances.flatMap((i) => i.published);
  expect(bridged.length).toBeGreaterThanOrEqual(1);
  expect(bridged[0][0]).toBe('project:512');
  expect(JSON.parse(bridged[0][1]).type).toBe('DEPLOYMENT_STATUS');
  off();
});

test('remote (worker-side) event reaches subscriber via redis message', async () => {
  const seen = [];
  const off = bus.subscribe(512, (e) => seen.push(e));
  emitRemote('project:512', { type: 'DEPLOYMENT_LOG', projectId: 512, deploymentId: 7, data: { line: 'from worker' } });
  expect(seen.length).toBe(1);
  expect(seen[0].deploymentId).toBe(7);
  expect(seen[0].data.line).toBe('from worker');
  off();
});

test('events for other projects are not delivered', async () => {
  const seen = [];
  const off = bus.subscribe(512, (e) => seen.push(e));
  emitRemote('project:999', { type: 'DEPLOYMENT_LOG', projectId: 999, data: {} });
  bus.publish({ type: 'DEPLOYMENT_LOG', projectId: 999, data: {} });
  await new Promise((r) => setImmediate(r));
  expect(seen.length).toBe(0);
  off();
});

test('invalid events are ignored, unsubscribe stops delivery', async () => {
  const seen = [];
  const off = bus.subscribe(512, (e) => seen.push(e));
  bus.publish(null);
  bus.publish({ type: 'X' });
  bus.publish({ projectId: 512 });
  await new Promise((r) => setImmediate(r));
  expect(seen.length).toBe(0);
  emitRemote('project:512', { notAnEvent: true });
  emitRemote('project:512', 'not json{{{');
  expect(seen.length).toBe(0);
  off();
  bus.publish({ type: 'DEPLOYMENT_LOG', projectId: 512, data: {} });
  emitRemote('project:512', { type: 'DEPLOYMENT_LOG', projectId: 512, data: {} });
  await new Promise((r) => setImmediate(r));
  expect(seen.length).toBe(0);
});
