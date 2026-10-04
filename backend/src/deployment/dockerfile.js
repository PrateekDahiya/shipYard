'use strict';

// Buildpack-lite: generate a Dockerfile when the repo doesn't ship one,
// from the project's build/run commands. Repos WITH a Dockerfile keep full
// control (generated file is never written over an existing one).

const fs = require('fs');
const path = require('path');

function detectStack(contextDir) {
  const has = (f) => fs.existsSync(path.join(contextDir, f));
  if (has('Dockerfile')) {
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

function shellCmd(cmd) {
  return `["sh", "-c", ${JSON.stringify(cmd)}]`;
}

function generate({ stack, buildCommand, runCommand, port }) {
  const appPort = port || 3000;
  if (stack === 'node') {
    const lines = [
      'FROM node:20-alpine',
      'WORKDIR /app',
      'COPY package*.json ./',
      'RUN npm install',
      'COPY . .',
    ];
    if (buildCommand) {
      lines.push(`RUN ${buildCommand}`);
    }
    lines.push(`EXPOSE ${appPort}`);
    if (runCommand) {
      lines.push(`CMD ${shellCmd(runCommand)}`);
    } else {
      lines.push('CMD ["node", "server.js"]');
    }
    return lines.join('\n') + '\n';
  }
  if (stack === 'python') {
    const lines = [
      'FROM python:3.12-slim',
      'WORKDIR /app',
      'COPY requirements.txt ./',
      'RUN pip install --no-cache-dir -r requirements.txt',
      'COPY . .',
    ];
    if (buildCommand) {
      lines.push(`RUN ${buildCommand}`);
    }
    lines.push(`EXPOSE ${appPort}`);
    if (runCommand) {
      lines.push(`CMD ${shellCmd(runCommand)}`);
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
function ensure(contextDir, { buildCommand, runCommand, port, deployType, outputDir }) {
  const stack = detectStack(contextDir);
  if (stack === 'custom') {
    return { used: 'custom', stack };
  }
  if (deployType === 'static') {
    const hasPackageJson = fs.existsSync(path.join(contextDir, 'package.json'));
    const content = generateStatic({ hasPackageJson, buildCommand, outputDir: outputDir || 'build' });
    fs.writeFileSync(path.join(contextDir, 'Dockerfile'), content);
    return { used: 'generated-static', stack: hasPackageJson ? stack : 'static' };
  }
  if (stack === 'unknown') {
    const err = new Error('no_dockerfile_no_detected_stack');
    err.status = 400;
    throw err;
  }
  const content = generate({ stack, buildCommand, runCommand, port });
  fs.writeFileSync(path.join(contextDir, 'Dockerfile'), content);
  return { used: 'generated', stack };
}

function generateStatic({ hasPackageJson, buildCommand, outputDir }) {
  const out = outputDir || 'build';
  if (!hasPackageJson) {
    // Pure static page (plain HTML/CSS/JS): no build stage, serve the files.
    return (
      [
        'FROM nginx:alpine',
        'COPY . /usr/share/nginx/html',
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
    'COPY package*.json ./',
    'RUN npm install',
    'COPY . .',
  ];
  // Empty build command = nothing to compile; never default to `npm run build`
  // (repos without that script would fail).
  if (buildCommand) {
    lines.push(`RUN ${buildCommand}`);
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

module.exports = { detectStack, generate, generateStatic, ensure };
