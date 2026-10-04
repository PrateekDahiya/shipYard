'use strict';

const router = require('../src/runtime/router');
const docker = require('../src/runtime/docker');
const queue = require('../src/queues/deploymentQueue');

describe('routing + docker labels + queue payload', () => {
  test('hostname is stable and slugified', () => {
    expect(router.hostnameFor({ name: 'My App!' })).toBe('my-app.shipyard.localhost');
    expect(router.liveUrlFor({ name: 'My App!' })).toBe('http://my-app.shipyard.localhost');
  });

  test('traefik labels wire hostname to service port', () => {
    const labels = docker.traefikLabels({ hostname: 'my-app.shipyard.localhost', serviceName: 'shipyard-p1', port: 3000 });
    expect(labels['traefik.enable']).toBe('true');
    expect(labels['traefik.http.routers.shipyard-p1.rule']).toContain('my-app.shipyard.localhost');
    expect(labels['traefik.http.services.shipyard-p1.loadbalancer.server.port']).toBe('3000');
    expect(docker.containerName(1, 41)).toBe('shipyard-p1-d41');
  });

  test('queue payload validation', () => {
    expect(queue.validatePayload({ deploymentId: 1, projectId: 2 })).toBe(true);
    expect(queue.validatePayload({ deploymentId: '1', projectId: 2 })).toBe(false);
    expect(queue.validatePayload(null)).toBeFalsy();
  });
});
