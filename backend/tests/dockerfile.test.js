'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const dockerfile = require('../src/deployment/dockerfile');
const sm = require('../src/deployment/stateMachine');

function mkDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipyard-df-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

describe('Dockerfile buildpack-lite', () => {
  test('existing Dockerfile is respected, never overwritten', () => {
    const dir = mkDir({ Dockerfile: 'FROM custom:1\n', 'package.json': '{}' });
    const r = dockerfile.ensure(dir, { buildCommand: 'npm run build', runCommand: 'npm start', port: 3000 });
    expect(r).toEqual({ used: 'custom', stack: 'custom' });
    expect(fs.readFileSync(path.join(dir, 'Dockerfile'), 'utf8')).toBe('FROM custom:1\n');
  });

  test('node project gets generated Dockerfile with build + run commands', () => {
    const dir = mkDir({ 'package.json': '{}' });
    const r = dockerfile.ensure(dir, { buildCommand: 'npm run build', runCommand: 'npm start', port: 3000 });
    expect(r.used).toBe('generated');
    const content = fs.readFileSync(path.join(dir, 'Dockerfile'), 'utf8');
    expect(content).toContain('FROM node:20-alpine');
    expect(content).toContain('RUN npm run build');
    expect(content).toContain('npm start');
    expect(content).toContain('EXPOSE 3000');
  });

  test('python project detected; unknown stack rejected with 400', () => {
    const py = mkDir({ 'requirements.txt': 'flask\n' });
    expect(dockerfile.detectStack(py)).toBe('python');
    const gen = dockerfile.generate({ stack: 'python', runCommand: 'python app.py', port: 5000 });
    expect(gen).toContain('pip install');
    expect(gen).toContain('EXPOSE 5000');

    const empty = mkDir({});
    expect(() => dockerfile.ensure(empty, {})).toThrow(/no_dockerfile_no_detected_stack/);
  });

  test('static projects get an nginx Dockerfile with SPA fallback', () => {
    const dir = mkDir({ 'package.json': '{}' });
    const r = dockerfile.ensure(dir, { deployType: 'static', buildCommand: 'npm run build', outputDir: 'dist' });
    expect(r.used).toBe('generated-static');
    const content = fs.readFileSync(path.join(dir, 'Dockerfile'), 'utf8');
    expect(content).toContain('FROM nginx:alpine');
    expect(content).toContain('/app/dist');
    expect(content).toContain('try_files');
    expect(content).toContain('EXPOSE 80');
    expect(content).toContain('RUN npm run build');
  });

  test('static without build command skips the RUN step', () => {
    const dir = mkDir({ 'package.json': '{}' });
    dockerfile.ensure(dir, { deployType: 'static', outputDir: 'build' });
    const content = fs.readFileSync(path.join(dir, 'Dockerfile'), 'utf8');
    expect(content).not.toContain('RUN npm run');
    expect(content).toContain('RUN npm install');
    expect(content).toContain('FROM nginx:alpine');
  });

  test('pure static page (no package.json) gets single-stage nginx', () => {
    const dir = mkDir({ 'index.html': '<h1>hi</h1>' });
    const r = dockerfile.ensure(dir, { deployType: 'static', outputDir: 'build' });
    expect(r.used).toBe('generated-static');
    const content = fs.readFileSync(path.join(dir, 'Dockerfile'), 'utf8');
    expect(content).toContain('FROM nginx:alpine');
    expect(content).not.toContain('AS build');
    expect(content).toContain('COPY . /usr/share/nginx/html');
  });

  test('state machine allows BUILDING → IMAGE_BUILD_FAILED (unresolvable image config)', () => {
    expect(sm.canTransition('BUILDING', 'IMAGE_BUILD_FAILED')).toBe(true);
    expect(sm.canTransition('BUILDING', 'SUCCESS')).toBe(false);
  });
});
