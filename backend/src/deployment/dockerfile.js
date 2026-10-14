'use strict';

// Buildpack-lite: generate a Dockerfile when the repo doesn't ship one,
// from the project's build/run commands. Repos WITH a Dockerfile keep full
// control (generated file is never written over an existing one).

const fs = require('fs');
const path = require('path');

function cleanDirectory(value) {
  const dir = String(value || '.').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return dir || '.';
}

function detectStack(contextDir, { useDockerfile = true, workingDirectory = '.' } = {}) {
  const root = path.join(contextDir, cleanDirectory(workingDirectory));
  const has = (f) => fs.existsSync(path.join(root, f));
  if (useDockerfile && fs.existsSync(path.join(contextDir, 'Dockerfile'))) {
    return 'custom';
  }
  if (has('package.json')) {
    return 'node';
  }
  if (has('requirements.txt')) {
    return 'python';
  }
  return 'unknown';
}

function staticSourceDir(contextDir, outputDir, workingDirectory = '.') {
  const explicit = cleanDirectory(workingDirectory);
  if (explicit !== '.' && fs.existsSync(path.join(contextDir, explicit))) {
    return explicit;
  }
  const parts = String(outputDir || 'build').replace(/\\/g, '/').split('/');
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const candidate = parts.slice(0, i).join('/');
    if (fs.existsSync(path.join(contextDir, candidate, 'package.json'))) {
      return candidate;
    }
  }
  return '.';
}

function scopedBuildCommand(buildCommand, sourceDir) {
  if (!buildCommand || sourceDir === '.' || /^\s*(cd|pushd)\s+/i.test(buildCommand)) {
    return buildCommand;
  }
  return `cd ${sourceDir} && ${buildCommand}`;
}

function scopedRunCommand(runCommand, sourceDir) {
  return scopedBuildCommand(runCommand, sourceDir);
}

function shellCmd(cmd) {
  return `["sh", "-c", ${JSON.stringify(cmd)}]`;
}

function generate({ stack, buildCommand, runCommand, port, sourceDir = '.' }) {
  const appPort = port || 3000;
  if (stack === 'node') {
    const lines = [
      'FROM node:20-alpine',
      'WORKDIR /app',
      `COPY ${sourceDir === '.' ? 'package*.json ./' : `${sourceDir}/package*.json ${sourceDir}/`}`,
      `RUN ${sourceDir === '.' ? 'npm install' : `cd ${sourceDir} && npm install`}`,
      'COPY . .',
    ];
    const scopedBuild = scopedBuildCommand(buildCommand, sourceDir);
    if (scopedBuild) {
      lines.push(`RUN ${scopedBuild}`);
    }
    lines.push(`EXPOSE ${appPort}`);
    const scopedRun = scopedRunCommand(runCommand, sourceDir);
    if (scopedRun) {
      lines.push(`CMD ${shellCmd(scopedRun)}`);
    } else {
      lines.push('CMD ["node", "server.js"]');
    }
    return lines.join('\n') + '\n';
  }
  if (stack === 'python') {
    const lines = [
      'FROM python:3.12-slim',
      'WORKDIR /app',
      `COPY ${sourceDir === '.' ? 'requirements.txt ./' : `${sourceDir}/requirements.txt ${sourceDir}/`}`,
      `RUN pip install --no-cache-dir -r ${sourceDir === '.' ? 'requirements.txt' : `${sourceDir}/requirements.txt`}`,
      'COPY . .',
    ];
    const scopedBuild = scopedBuildCommand(buildCommand, sourceDir);
    if (scopedBuild) {
      lines.push(`RUN ${scopedBuild}`);
    }
    lines.push(`EXPOSE ${appPort}`);
    const scopedRun = scopedRunCommand(runCommand, sourceDir);
    if (scopedRun) {
      lines.push(`CMD ${shellCmd(scopedRun)}`);
    } else {
      lines.push('CMD ["python", "app.py"]');
    }
    return lines.join('\n') + '\n';
  }
  const err = new Error('no_dockerfile_no_detected_stack');
  err.status = 400;
  throw err;
}

// Returns { used: 'custom' } or writes a generated Dockerfile and returns
// { used: 'generated', stack }. Throws no_dockerfile_no_detected_stack when
// neither a Dockerfile nor a known stack exists.
function ensure(contextDir, { buildCommand, runCommand, port, deployType, outputDir, envVars = [], useDockerfile = true, workingDirectory = '.' }) {
  const sourceDir = cleanDirectory(workingDirectory);
  const stack = detectStack(contextDir, { useDockerfile, workingDirectory: sourceDir });
  if (useDockerfile && stack === 'custom') {
    return { used: 'custom', stack };
  }
  if (deployType === 'static') {
    const staticOutputDir = outputDir || 'build';
    const staticDir = staticSourceDir(contextDir, staticOutputDir, sourceDir);
    const hasPackageJson = fs.existsSync(path.join(contextDir, staticDir, 'package.json'));
    const staticOutputPath = staticDir !== '.' && !staticOutputDir.startsWith(`${staticDir}/`)
      ? `${staticDir}/${staticOutputDir}`
      : staticOutputDir;
    const staticContent = generateStatic({ hasPackageJson, buildCommand, outputDir: staticOutputPath, sourceDir: staticDir });
    // Build args for static site: inject ALL build-time env vars (scope 'build' or 'both')
    const buildArgs = {};
    for (const r of envVars) {
      if (r.scope === 'build' || r.scope === 'both') {
        buildArgs[r.key] = r.value;
      }
    }
    const buildArgLines = getStaticBuildArgs(buildArgs);
    const finalContent = staticContent.replace(
      'FROM node:20-alpine AS build',
      ['FROM node:20-alpine AS build', ...buildArgLines].join('\n')
    );
    fs.writeFileSync(path.join(contextDir, 'Dockerfile'), finalContent);
    return { used: 'generated-static', stack: hasPackageJson ? stack : 'static' };
  }
  if (stack === 'unknown') {
    const err = new Error('no_dockerfile_no_detected_stack');
    err.status = 400;
    throw err;
  }
  const content = generate({ stack, buildCommand, runCommand, port, sourceDir });
  fs.writeFileSync(path.join(contextDir, 'Dockerfile'), content);
  return { used: 'generated', stack };
}

function generateStatic({ hasPackageJson, buildCommand, outputDir, sourceDir = '.' }) {
  const out = outputDir || 'build';
  if (!hasPackageJson) {
    // Pure static page (plain HTML/CSS/JS): no build stage, serve the files.
    return (
      [
        'FROM nginx:alpine',
        `COPY ${sourceDir === '.' ? '.' : sourceDir} /usr/share/nginx/html`,
        // SPA fallback so deep links don't 404 on refresh.
        'RUN printf \'server{listen 80;location /{root /usr/share/nginx/html;index index.html;try_files $uri $uri/ /index.html;}}\' > /etc/nginx/conf.d/default.conf',
        'EXPOSE 80',
        'CMD ["nginx", "-g", "daemon off;"]',
      ].join('\n') + '\n'
    );
  }
  const lines = [
    'FROM node:20-alpine AS build',
    'WORKDIR /app',
    `COPY ${sourceDir === '.' ? 'package*.json ./' : `${sourceDir}/package*.json ${sourceDir}/`}`,
    `RUN ${sourceDir === '.' ? 'npm install' : `cd ${sourceDir} && npm install`}`,
    'COPY . .',
  ];
  // Empty build command = nothing to compile; never default to `npm run build`
  // (repos without that script would fail).
  const scopedCommand = scopedBuildCommand(buildCommand, sourceDir);
  if (scopedCommand) {
    lines.push(`RUN ${scopedCommand}`);
  }
  return (
    lines.concat([
      'FROM nginx:alpine',
      `COPY --from=build /app/${out} /usr/share/nginx/html`,
      // SPA fallback so deep links don't 404 on refresh.
      'RUN printf \'server{listen 80;location /{root /usr/share/nginx/html;index index.html;try_files $uri $uri/ /index.html;}}\' > /etc/nginx/conf.d/default.conf',
      'EXPOSE 80',
      'CMD ["nginx", "-g", "daemon off;"]',
    ]).join('\n') + '\n'
  );
}

// Build args for static site Dockerfile - injects ALL build-time env vars dynamically
function getStaticBuildArgs(buildArgs = {}) {
  const lines = [];
  for (const key of Object.keys(buildArgs)) {
    const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`ARG ${safeKey}`);
    lines.push(`ENV ${safeKey}=\${${safeKey}}`);
  }
  return lines;
}

module.exports = { detectStack, generate, generateStatic, staticSourceDir, scopedBuildCommand, scopedRunCommand, ensure };
