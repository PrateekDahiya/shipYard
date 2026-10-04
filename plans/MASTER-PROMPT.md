# ShipYard — Harness Master Development Prompt

You are the principal engineer responsible for building **ShipYard**, a self-hosted application deployment platform similar in concept to Render/Heroku, but designed to be self-hosted, always-on, developer-friendly, and production-oriented.

ShipYard allows developers to connect a GitHub repository, configure how their application is built and run, deploy it to isolated containers, receive a live URL, monitor the application, inspect logs and metrics, roll back deployments, and manage the application lifecycle.

Your responsibility is not merely to generate code.

You must own the complete engineering lifecycle:

**Understand → Research → Design → Plan → Implement → Test → Run → Inspect → Diagnose → Fix → Retest → Review → Improve**

Repeat this loop continuously until the current milestone satisfies its acceptance criteria.

Do not stop after creating a plan.

Do not assume the implementation is correct because it compiles.

Actually run the system, test functionality, inspect failures, identify root causes, fix them, and run the tests again.

Do not ask unnecessary clarification questions. Make reasonable engineering decisions, document important assumptions, and continue.

---

# 1. PRODUCT

Build **ShipYard** as a self-hosted platform where users can deploy and manage their own web applications.

Primary user flow:

```text
GitHub Repository
       ↓
Connect to ShipYard
       ↓
Select Repository
       ↓
Select Branch
       ↓
Configure Build
       ↓
Configure Environment Variables
       ↓
Deploy
       ↓
Clone Repository
       ↓
Build
       ↓
Create Docker Image
       ↓
Start Container
       ↓
Health Check
       ↓
Register Route
       ↓
Application Goes Live
       ↓
https://<app>.shipyard.<domain>
```

Applications should remain running after successful deployment unless the user explicitly stops them or a deployment replaces them.

ShipYard should not implement an automatic sleep mechanism.

---

# 2. REQUIRED TECHNOLOGY STACK

Use the following technologies unless there is a strong technical reason to change one.

## Frontend

- Next.js
- TypeScript
- Tailwind CSS

Use a modern Next.js architecture and keep frontend code strongly typed.

## Backend

- Node.js
- Express.js
- JavaScript

The backend must be a separate service from the Next.js frontend.

Do not introduce TypeScript into the backend unless there is a compelling documented reason to do so.

## Database

- MySQL

Use a proper migration system.

Use indexes deliberately.

Use transactions where necessary.

Do not store ephemeral runtime state unnecessarily in MySQL.

## Queue / Cache / Coordination

- Redis

Use Redis for appropriate transient and coordination workloads such as:

- deployment jobs
- job queues
- rate limiting
- real-time coordination
- caching where useful
- worker coordination

Do not use Redis as the primary persistent database for core platform data.

## Application Runtime

- Docker

Each customer application should run inside an isolated container.

## Reverse Proxy / Routing

- Traefik

Use Traefik to route public traffic from ShipYard URLs to the correct application containers.

## Metrics

- Prometheus

Collect metrics from ShipYard and deployed applications where possible.

## Logs

- Loki

Centralize relevant ShipYard and application logs.

## Tracing

- OpenTelemetry

Use OpenTelemetry where practical for distributed tracing and request correlation.

## Git Provider

- GitHub API
- GitHub Webhooks

Use GitHub OAuth where appropriate.

## Real-Time Communication

Prefer:

- WebSocket

or:

- Server-Sent Events

for deployment progress, live logs, runtime status, and other real-time dashboard updates.

---

# 3. HIGH-LEVEL ARCHITECTURE

ShipYard should have clearly separated components.

```text
                           ShipYard
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
       Frontend            API Server       Workers
       Next.js             Node.js           Node.js
       TypeScript          Express
            │                 │                 │
            └─────────────────┼─────────────────┘
                              │
                   ┌──────────┴──────────┐
                   │                     │
                  MySQL                Redis
                   │                     │
                   └──────────┬──────────┘
                              │
                       Deployment Engine
                              │
                           Docker
                              │
                           Traefik
                              │
                     User Applications
```

Observability:

```text
ShipYard + Applications
         │
   ┌─────┼─────┐
   │     │     │
 Logs Metrics Traces
   │     │     │
 Loki Prometheus OpenTelemetry
```

---

# 4. CONTROL PLANE / DATA PLANE

Maintain a conceptual and preferably architectural separation between:

## Control Plane

Responsible for:

- users
- authentication
- authorization
- projects
- GitHub repositories
- deployment configuration
- environment variables
- domains
- deployment metadata
- dashboard
- APIs
- deployment requests
- audit history

## Data Plane

Responsible for:

- source checkout
- build execution
- Docker image creation
- containers
- application networking
- routing
- health checks
- runtime logs
- application metrics
- request monitoring
- shell sessions

Document this architecture.

---

# 5. FRONTEND REQUIREMENTS

Build a professional developer-focused dashboard using:

- Next.js
- TypeScript
- Tailwind CSS

The UI must prioritize functionality and usability over visual decoration.

Main navigation:

```text
Dashboard
Projects
Deployments
Logs
Metrics
Requests
Domains
Settings
```

Project-level navigation can include:

```text
Overview
Deployments
Logs
Requests
Metrics
Environment
Domains
Settings
Shell
```

The dashboard should provide real data from the backend.

Do not create fake charts or placeholder success states to make the application appear complete.

---

# 6. FRONTEND PAGES

At minimum implement:

## Authentication

- Login
- Registration if required
- Session handling
- Logout

## Dashboard

Show:

- project count
- active deployments
- deployment failures
- currently running applications
- system status

## Project List

Show:

- project name
- status
- repository
- current branch
- current deployment
- live URL

## Project Overview

Show:

- application status
- live URL
- current deployment
- current commit
- CPU usage
- memory usage
- request count
- error rate
- latency
- latest deployment
- recent deployments
- recent logs

## Deployments

Show:

- deployment ID
- commit SHA
- commit message
- branch
- author
- triggered by
- status
- duration
- created time

Actions:

- Deploy
- Rollback
- Cancel
- Restart
- View logs
- Open application
- Shell

## Logs

Support:

- build logs
- runtime logs
- deployment logs
- system logs where appropriate

Provide:

- live streaming
- timestamps
- filtering
- severity
- search where practical

## Requests

Show request data such as:

- timestamp
- HTTP method
- path
- status
- latency
- response size

Provide filters by:

- method
- status
- path
- time range

## Metrics

Show:

- CPU
- memory
- request rate
- response time
- error rate
- HTTP status distribution
- container restarts
- uptime

## Environment

Allow:

- adding variables
- editing variables
- deleting variables
- masking secrets
- triggering redeployment when required

## Settings

Allow:

- build command
- run command
- branch
- port
- health check
- deployment configuration
- resource limits
- rate limiting

## Shell

Provide controlled shell access into the application's own running container.

This must be treated as security-critical.

---

# 7. BACKEND ARCHITECTURE

Use:

- Node.js
- Express.js
- JavaScript

Organize the backend by clear responsibilities.

A possible structure:

```text
backend/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── repositories/
│   ├── middleware/
│   ├── models/
│   ├── workers/
│   ├── queues/
│   ├── integrations/
│   ├── deployment/
│   ├── runtime/
│   ├── monitoring/
│   ├── logging/
│   ├── security/
│   └── utils/
└── tests/
```

Do not put business logic directly inside Express route handlers.

Controllers should coordinate requests.

Services should contain business logic.

Repositories/data-access modules should handle persistence.

---

# 8. DATABASE

Use MySQL.

Design a proper relational schema.

Initial domain entities may include:

```text
users
projects
project_members
github_accounts
repositories
deployments
deployment_events
builds
build_logs
environment_variables
application_instances
domains
health_checks
request_logs
audit_logs
rate_limit_configs
shell_sessions
```

Do not create every table blindly at the beginning.

Design the domain carefully and implement incrementally.

Use:

- foreign keys where appropriate
- indexes
- unique constraints
- timestamps
- transactions
- migration scripts

Deployment records must be immutable historical records except for controlled metadata/state updates.

Never destroy deployment history as part of a rollback.

---

# 9. USER / PROJECT MODEL

A user can own or access multiple projects.

A project represents one deployable application.

Example:

```text
User
 └── Project
      ├── GitHub Repository
      ├── Environment Variables
      ├── Deployments
      ├── Domains
      ├── Runtime Configuration
      ├── Metrics
      ├── Logs
      └── Requests
```

Prepare the system for future team/RBAC functionality even if full team management is not implemented immediately.

---

# 10. GITHUB INTEGRATION

Implement GitHub integration.

Required capabilities:

- GitHub OAuth
- repository listing
- branch listing
- commit listing
- repository selection
- webhook creation
- webhook validation
- push-event handling

When a GitHub push event is received:

```text
GitHub
   ↓
Webhook
   ↓
Verify Signature
   ↓
Identify ShipYard Project
   ↓
Identify Commit
   ↓
Create Deployment
   ↓
Queue Deployment
```

The webhook must be authenticated/validated.

Do not blindly trust webhook payloads.

Avoid accidentally creating duplicate deployments for the same repository and commit.

---

# 11. MANUAL DEPLOYMENT

Users should be able to deploy:

- latest branch commit
- a specific commit
- a previous deployment

Example:

```text
main
 ├── commit A
 ├── commit B
 ├── commit C
 └── commit D
```

The user should be able to explicitly select:

```text
Deploy commit B
```

The deployed commit must be persisted.

---

# 12. DEPLOYMENT CONFIGURATION

A project should support configurable:

- repository
- branch
- build command
- run command
- working directory
- application port
- health check path
- health check timeout
- environment variables
- deployment timeout
- CPU limits
- memory limits
- replica count if supported
- rate limiting
- auto deployment on push

Examples:

```text
Build command:
npm install && npm run build

Run command:
npm start

Port:
3000

Health check:
GET /health
```

Do not make assumptions about application frameworks.

The platform should be generic enough to run different applications.

---

# 13. DEPLOYMENT ENGINE

Deployment must be asynchronous.

Never keep an API request open while the entire deployment executes.

Use:

```text
API
 ↓
Redis Queue
 ↓
Deployment Worker
 ↓
Build
 ↓
Docker
 ↓
Health Check
 ↓
Routing
```

The worker should handle:

1. Clone repository
2. Checkout exact commit
3. Prepare build environment
4. Build application
5. Capture output
6. Build Docker image
7. Start container
8. Apply runtime configuration
9. Perform health check
10. Register/reconfigure routing
11. Mark deployment successful
12. Clean up old runtime resources when appropriate

Every stage must have explicit state and logging.

---

# 14. DEPLOYMENT STATE MACHINE

Use an explicit deployment state machine.

Example:

```text
QUEUED
  ↓
CLONING
  ↓
BUILDING
  ↓
IMAGE_CREATED
  ↓
STARTING
  ↓
HEALTH_CHECKING
  ↓
RUNNING
  ↓
SUCCESS
```

Possible failure states:

```text
CLONE_FAILED
BUILD_FAILED
IMAGE_BUILD_FAILED
START_FAILED
HEALTH_CHECK_FAILED
DEPLOYMENT_FAILED
CANCELLED
```

The state machine must prevent invalid transitions.

For example:

A failed deployment must never accidentally be shown as successfully running.

---

# 15. DOCKER RUNTIME

Each customer application should run in its own isolated container.

Support:

- build image
- start container
- stop container
- restart container
- inspect container
- health checks
- logs
- resource limits
- environment variables
- labels
- network configuration
- cleanup

Containers must not be given unnecessary privileges.

Never expose the Docker socket to deployed user applications.

Never run untrusted workloads directly on the host.

---

# 16. BUILD EXECUTION

Build commands are user-provided and therefore untrusted.

Build execution must happen in an isolated environment.

Support:

- build command
- working directory
- environment variables
- timeout
- stdout
- stderr
- exit code

Persist build logs.

Stream logs to the dashboard when practical.

Handle:

- build timeout
- failed command
- missing dependency
- network error
- resource exhaustion
- worker crash

Do not mark a build successful merely because the Docker container started.

---

# 17. RUNTIME COMMAND

Allow the application owner to specify how the application starts.

Example:

```text
npm start
```

or:

```text
node server.js
```

or:

```text
python app.py
```

The platform should not assume every application uses Node.js.

The runtime configuration should support generic containerized workloads.

---

# 18. LIVE APPLICATION URL

Every successfully deployed project should receive a stable URL.

Example:

```text
https://my-app.shipyard.example.com
```

Routing should be handled through Traefik.

The user application should not need to expose its own public IP.

Map:

```text
Hostname
   ↓
Traefik
   ↓
Project
   ↓
Current Deployment
   ↓
Container
   ↓
Application Port
```

Prepare the architecture so custom domains can be supported.

---

# 19. ALWAYS-ON BEHAVIOR

ShipYard should not automatically sleep successful applications.

At minimum:

```text
successful deployment
        ↓
container remains running
        ↓
health monitoring
        ↓
automatic restart when appropriate
```

Support a clear distinction between:

- RUNNING
- STOPPED
- CRASHED
- DEPLOYING
- FAILED
- UNHEALTHY

A crashed application should not be shown as healthy.

---

# 20. ENVIRONMENT VARIABLES

Environment variables must support:

- create
- update
- delete
- masking
- runtime injection
- build-time injection where configured

Sensitive values must never be unnecessarily returned by APIs.

Sensitive values must not appear in logs.

Redact known secrets from build/runtime logs wherever practical.

Consider encryption at rest.

---

# 21. DEPLOYMENT HISTORY

Each deployment must be independently identifiable.

Example:

```text
Deployment #41
Commit: abc123
Status: SUCCESS

Deployment #42
Commit: def456
Status: SUCCESS

Deployment #43
Commit: 123abc
Status: FAILED
```

Persist:

- deployment ID
- commit SHA
- branch
- commit message
- author
- triggered by
- trigger type
- created time
- started time
- finished time
- duration
- status
- build information
- runtime information

---

# 22. ROLLBACK

Rollback must never destroy history.

Example:

```text
Deployment 40
Deployment 41
Deployment 42  ← current
```

Rollback to 40:

```text
Deployment 43
Source commit = deployment 40 commit
```

The rollback should itself be a new deployment event.

Do not mutate deployment 40 into the current deployment.

---

# 23. AUTOMATIC GITHUB DEPLOYMENT

Implement:

```text
Developer pushes to GitHub
        ↓
GitHub webhook
        ↓
ShipYard verifies webhook
        ↓
Deployment created
        ↓
Deployment queued
        ↓
Worker builds
        ↓
Container starts
        ↓
Health check
        ↓
Traffic updated
        ↓
Deployment marked successful
```

Expose deployment progress live in the dashboard.

---

# 24. ZERO / MINIMAL DOWNTIME DEPLOYMENT

When replacing a healthy running deployment:

Prefer:

```text
Old Version
     ↓
Start New Version
     ↓
Health Check New Version
     ↓
Route Traffic
     ↓
Stop Old Version
```

Do not immediately kill the healthy old deployment before verifying the new deployment.

If the new version fails its health check, preserve the currently running healthy version whenever possible.

---

# 25. LOGGING

Support at minimum:

### Build Logs

- dependency installation
- build commands
- compiler output
- errors

### Deployment Logs

- clone
- build
- Docker
- startup
- health check
- routing

### Runtime Logs

- stdout
- stderr

### Request Logs

- HTTP requests
- response code
- latency

Use Loki for centralized logs.

Logs should include useful metadata such as:

```text
timestamp
project
deployment
container
severity
source
```

Do not store sensitive request bodies by default.

---

# 26. REAL-TIME LOG STREAMING

When a deployment or process is running, the UI should be able to display new logs without requiring a full page reload.

Prefer:

- WebSocket

or:

- SSE

Use a clean event model.

Example:

```text
DEPLOYMENT_CREATED
BUILD_STARTED
BUILD_LOG
BUILD_COMPLETED
CONTAINER_STARTING
HEALTH_CHECK_STARTED
HEALTH_CHECK_PASSED
DEPLOYMENT_COMPLETED
DEPLOYMENT_FAILED
```

---

# 27. METRICS

Use Prometheus.

Track ShipYard itself as well as deployed applications where technically appropriate.

At minimum support:

### Application

- CPU
- memory
- uptime
- restart count
- container state

### HTTP

- request count
- request rate
- response latency
- error rate
- status codes
- response size

### Deployment

- deployment count
- successful deployments
- failed deployments
- deployment duration
- build duration

### Platform

- worker utilization
- queue size
- deployment queue latency
- API latency
- API error rate

---

# 28. REQUEST MONITORING

Capture request metadata through the routing layer or application instrumentation.

Track:

- timestamp
- project
- deployment
- HTTP method
- path
- status code
- latency
- response size

Support filtering:

- time range
- method
- status
- path
- deployment

Do not record sensitive request bodies by default.

Be careful with query parameters because they may contain secrets.

---

# 29. RATE LIMITING

Implement configurable rate limiting.

Use Redis when appropriate.

Support configuration such as:

```text
100 requests/minute
1000 requests/hour
```

Decide and document the selected rate-limiting algorithm.

Possible approaches include:

- token bucket
- sliding window
- fixed window

Return appropriate HTTP responses when limits are exceeded.

Provide project-level configuration.

---

# 30. HEALTH CHECKS

Support configurable application health checks.

Example:

```text
GET /health
```

Configuration should include:

- path
- expected status
- timeout
- interval
- retry count

Deployment should not be marked successful until the new version passes its health check.

Runtime health should be monitored continuously.

---

# 31. SHELL ACCESS

Shell access is a high-security feature.

The user should receive shell access only inside their own application's running container.

Never provide:

- host shell
- host filesystem access
- Docker socket access
- privileged container access
- unrestricted capabilities

Requirements:

- authenticated user
- authorization check
- project ownership/access check
- target container validation
- session timeout
- audit logging
- restricted environment
- safe terminal transport
- session cleanup

Record:

- user
- project
- container
- start time
- end time
- result/status

Treat shell functionality as security-critical.

---

# 32. CUSTOM DOMAINS

Design support for:

```text
https://my-app.shipyard.example.com
```

and eventually:

```text
https://api.example.com
```

A future custom-domain flow should support:

- domain registration
- ownership verification
- DNS instructions
- TLS
- routing
- domain removal

Do not over-engineer custom domains in the first milestone if it would block the core platform.

---

# 33. AUTHENTICATION

Implement secure authentication.

Support application login and GitHub integration.

The authentication design must include:

- password handling if applicable
- secure sessions/tokens
- authorization
- logout
- account ownership
- GitHub account association

Do not store plaintext passwords.

Do not expose sensitive tokens to the frontend unnecessarily.

---

# 34. AUTHORIZATION

Every project-level operation must verify the current user has permission to perform it.

Examples:

- deployment
- rollback
- stop
- restart
- environment changes
- shell
- domain changes
- logs
- metrics

Prepare the design for future roles such as:

```text
Owner
Admin
Developer
Viewer
```

---

# 35. API DESIGN

Use RESTful APIs through Express.

Examples:

```text
POST   /api/auth/login

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id

POST   /api/projects/:id/deployments
GET    /api/projects/:id/deployments

GET    /api/deployments/:id
POST   /api/deployments/:id/cancel
POST   /api/deployments/:id/rollback

POST   /api/projects/:id/start
POST   /api/projects/:id/stop
POST   /api/projects/:id/restart

GET    /api/projects/:id/logs
GET    /api/projects/:id/metrics
GET    /api/projects/:id/requests

GET    /api/projects/:id/env
POST   /api/projects/:id/env
PATCH  /api/projects/:id/env/:key
DELETE /api/projects/:id/env/:key

POST   /api/projects/:id/shell

POST   /api/github/webhook
```

Do not blindly copy this exact API structure.

Adapt it to the actual domain model.

---

# 36. REAL-TIME API EVENTS

Expose a real-time channel for:

- deployment updates
- deployment logs
- container state
- application health
- runtime events

Example:

```text
Project
   ↓
WebSocket / SSE
   ↓
Frontend
```

Ensure clients only receive events they are authorized to see.

---

# 37. TESTING STRATEGY

Testing is mandatory.

Do not consider a feature complete without meaningful testing.

## Unit Tests

Cover:

- domain logic
- deployment state transitions
- validation
- authorization
- rate limiting logic
- configuration parsing
- utility functions

## Integration Tests

Cover:

- MySQL
- Redis
- GitHub webhook handling
- queues
- deployment persistence
- API endpoints
- worker behavior

## Docker / Runtime Tests

Cover:

- image creation
- container startup
- environment injection
- health checks
- restart
- stop/start
- resource limits
- logs

## End-to-End Tests

At minimum test:

```text
Create account
    ↓
Create project
    ↓
Connect GitHub
    ↓
Select repository
    ↓
Configure application
    ↓
Deploy
    ↓
Build
    ↓
Start container
    ↓
Health check
    ↓
Open live URL
    ↓
View logs
    ↓
View metrics
    ↓
Deploy new commit
    ↓
Rollback
```

## Failure Tests

Test:

- invalid repository
- unavailable repository
- invalid commit
- clone failure
- build failure
- Docker build failure
- container startup failure
- health check failure
- webhook failure
- invalid webhook signature
- duplicate webhook
- worker crash
- Redis failure
- MySQL failure
- missing environment variable
- command timeout
- resource exhaustion
- unauthorized shell access
- rate limit exceeded

---

# 38. LOCAL DEVELOPMENT

Create a reproducible local environment.

Use Docker Compose where appropriate.

A developer should be able to start the core platform without manually installing every infrastructure dependency.

Potential development services:

```text
frontend
backend
worker
mysql
redis
traefik
prometheus
loki
```

Create:

```text
docker-compose.dev.yml
```

Provide clear setup instructions.

---

# 39. SHIPYARD SELF-MONITORING

ShipYard itself must be observable.

Add:

```text
/health
/ready
```

Track:

- API latency
- API errors
- worker status
- queue size
- deployment throughput
- deployment failures
- build duration
- database latency
- Redis latency

Use structured logs.

Use correlation/request IDs.

Where practical use OpenTelemetry for distributed tracing.

---

# 40. SECURITY

Perform a security review at every major milestone.

Pay special attention to:

### Command Injection

User-provided build/run commands are untrusted.

### Container Escape

Do not provide unnecessary privileges.

### Docker Socket

Never expose the host Docker socket to user workloads.

### Secrets

Never leak environment variables into logs or API responses.

### Path Traversal

Validate all filesystem paths.

### SSRF

Be careful with URLs and remote resources accessed by deployment infrastructure.

### Webhook Validation

Verify GitHub webhook signatures.

### Authentication

Protect all privileged endpoints.

### Authorization

Verify access at the project/resource level.

### Resource Exhaustion

Apply timeouts and resource limits.

### Shell Access

Keep shell confined to the user's container.

### Log Injection

Sanitize/structure logs.

---

# 41. AUDIT LOGGING

Record sensitive administrative actions.

Examples:

```text
project.created
project.updated
deployment.created
deployment.cancelled
deployment.rollback
environment.updated
application.started
application.stopped
application.restarted
domain.added
domain.removed
shell.started
shell.ended
```

Audit records should include:

- user
- project
- action
- timestamp
- relevant metadata

Do not record secret values.

---

# 42. CI/CD

Create CI pipelines for ShipYard itself.

At minimum execute:

1. install dependencies
2. lint
3. format validation
4. tests
5. build
6. integration tests
7. security checks

Do not allow broken builds to be considered healthy.

---

# 43. DOCUMENTATION

Maintain:

```text
README.md

docs/
├── ARCHITECTURE.md
├── PROJECT_ANALYSIS.md
├── DEVELOPMENT.md
├── DEPLOYMENT.md
├── SECURITY.md
├── API.md
├── OPERATIONS.md
├── TESTING.md
└── DECISIONS/
```

Record important architectural decisions as ADRs.

Documentation must stay synchronized with implementation.

---

# 44. DEVELOPMENT WORKFLOW

You must work milestone by milestone.

For every milestone:

## Step 1 — Understand

Inspect relevant code and dependencies.

## Step 2 — Plan

Update:

```text
docs/PLAN.md
```

Include:

- objective
- scope
- files affected
- architecture changes
- database changes
- API changes
- frontend changes
- infrastructure changes
- tests
- acceptance criteria
- risks

## Step 3 — Implement

Implement only the current milestone.

Do not make unrelated refactors.

## Step 4 — Static Validation

Run:

- frontend linting
- frontend type checking
- backend linting
- syntax validation
- build
- static analysis

Fix all issues introduced by the implementation.

## Step 5 — Test

Run relevant tests.

## Step 6 — Run

Actually start the services.

Exercise the feature.

Do not rely solely on mocks.

## Step 7 — Inspect

Check:

- runtime errors
- API behavior
- database behavior
- deployment state
- Docker behavior
- networking
- logs
- UI behavior
- concurrency
- resource usage

## Step 8 — Diagnose

When something fails:

1. reproduce it
2. collect logs
3. isolate the failing component
4. identify the root cause
5. implement the fix

Do not blindly retry.

## Step 9 — Fix

Implement the smallest correct solution.

Add a regression test when appropriate.

## Step 10 — Retest

Run:

- the previously failing test
- relevant milestone tests
- regression tests

## Step 11 — Review

Review:

- correctness
- security
- maintainability
- performance
- observability
- architecture
- error handling
- tests

## Step 12 — Complete

Only mark the milestone complete when its acceptance criteria are actually satisfied.

Then continue to the next milestone.

---

# 45. NEVER FAKE FUNCTIONALITY

Do not implement fake:

- deployments
- logs
- metrics
- container statuses
- request data
- health checks
- rollback results

The frontend must represent actual backend state.

A temporary placeholder is acceptable only when explicitly documented as unfinished.

---

# 46. FAILURE RECOVERY

Assume infrastructure can fail.

Examples:

```text
GitHub unavailable
Repository unavailable
Clone fails
Build fails
Docker fails
Container crashes
Health check fails
Traefik fails
Redis unavailable
MySQL unavailable
Worker crashes
Network fails
```

Implement sensible recovery behavior.

Deployment state must remain correct after failure.

The platform should never silently lose track of a deployment.

---

# 47. CONCURRENCY

The system must be designed for:

- multiple users
- multiple projects
- multiple deployments
- concurrent builds
- repeated webhook events
- multiple workers

Use Redis-backed queues and proper concurrency handling.

Avoid global mutable state in Node.js services.

Design idempotency where needed.

---

# 48. BUILD / ARTIFACT CACHING

Start simple.

Once the core platform works, evaluate:

- Docker layer caching
- dependency caching
- shallow Git clones
- build artifact reuse

Do not prematurely optimize.

Measure before optimizing.

---

# 49. PERFORMANCE

Measure:

- API latency
- database queries
- queue latency
- build duration
- deployment duration
- log streaming latency
- dashboard loading time

Add database indexes when justified by actual query patterns.

Do not optimize blindly.

---

# 50. MILESTONE ORDER

Use the following sequence unless repository constraints justify a better order.

## Milestone 0
Repository analysis
Architecture
Risk assessment
Detailed implementation plan

## Milestone 1
Project foundation
Frontend
Backend
MySQL
Redis
Docker development environment

## Milestone 2
Authentication
Users
Sessions
Authorization foundation

## Milestone 3
Projects
Project configuration
Database model

## Milestone 4
GitHub OAuth
Repository selection
Branch selection
Commit selection

## Milestone 5
Deployment model
Deployment state machine
Redis queue
Worker foundation

## Milestone 6
Repository cloning
Build execution
Build logs

## Milestone 7
Docker image creation
Container runtime
Container lifecycle

## Milestone 8
Health checks
Traefik
Live URL
Routing

## Milestone 9
Environment variables
Secrets handling
Runtime configuration

## Milestone 10
Deployment history
Deployment status
Deployment dashboard

## Milestone 11
Automatic GitHub webhook deployment

## Milestone 12
Rollback
Zero/minimal downtime deployment

## Milestone 13
Real-time logs
WebSocket/SSE deployment events

## Milestone 14
Metrics
Prometheus
Application monitoring

## Milestone 15
Request monitoring

## Milestone 16
Rate limiting

## Milestone 17
Shell access

## Milestone 18
Custom domains

## Milestone 19
Audit logs
Security hardening
RBAC improvements

## Milestone 20
Integration tests
End-to-end tests
Failure testing
Performance testing

## Milestone 21
Production hardening
Documentation
Release preparation

---

# 51. COMPLETE PLATFORM ACCEPTANCE TEST

ShipYard is considered functionally complete when this entire scenario works:

1. User creates an account.
2. User logs in.
3. User connects GitHub.
4. User selects a repository.
5. User selects a branch.
6. User sees available commits.
7. User configures build command.
8. User configures run command.
9. User configures application port.
10. User configures environment variables.
11. User configures health check.
12. User clicks Deploy.
13. ShipYard creates a deployment.
14. Deployment enters the queue.
15. Worker picks up the job.
16. Repository is cloned.
17. Exact commit is checked out.
18. Build runs in an isolated environment.
19. Build output is streamed/stored.
20. Docker image is created.
21. Container starts.
22. Environment variables are injected.
23. Health check runs.
24. Health check succeeds.
25. Traefik exposes the application.
26. User receives a live URL.
27. Dashboard shows RUNNING.
28. Runtime logs are visible.
29. Request logs are visible.
30. Metrics are visible.
31. CPU and memory are visible.
32. User pushes another GitHub commit.
33. GitHub webhook reaches ShipYard.
34. Signature is verified.
35. New deployment is created automatically.
36. New version is built.
37. New version is health-checked.
38. Traffic is switched to the new version.
39. Previous version is cleaned up safely.
40. User sees deployment history.
41. User can manually deploy a specific previous commit.
42. User can rollback.
43. Rollback creates a new deployment.
44. User can restart the application.
45. User can stop/start the application.
46. User can view application logs.
47. User can inspect requests.
48. User can view metrics.
49. Rate limiting works.
50. User can open a restricted container shell.
51. Unauthorized users cannot access another project's resources.
52. Secrets are not exposed.
53. Failed deployments correctly report their failure.
54. A failed new deployment does not unnecessarily destroy a healthy existing deployment.
55. Tests cover the critical workflows.
56. Documentation explains how to run and operate ShipYard.

---

# 52. AGENT BEHAVIOR

Act as a senior platform engineer, backend engineer, frontend engineer, DevOps engineer, QA engineer, and security reviewer.

When a problem occurs:

Do not hide it.

Do not silently work around it.

Do not declare success without verification.

Do not repeatedly retry without understanding the failure.

Instead:

**Reproduce → Investigate → Identify Root Cause → Fix → Test → Verify → Document**

When an architectural improvement is discovered, update the relevant documentation and plan.

Do not rewrite stable working components unnecessarily.

Keep changes incremental and reviewable.

Prefer real implementations over demonstrations.

---

# 53. FINAL RULE

The goal is not:

"Make a dashboard that looks like Render."

The goal is:

**Build a functioning self-hosted deployment platform.**

The final system should actually:

```text
Receive GitHub code
        ↓
Build it
        ↓
Containerize it
        ↓
Run it
        ↓
Health-check it
        ↓
Expose it
        ↓
Monitor it
        ↓
Log it
        ↓
Track requests
        ↓
Allow controlled management
        ↓
Automatically redeploy it
        ↓
Rollback when required
```

Begin now with:

**Milestone 0 — Repository Analysis, Architecture Definition, Risk Assessment, and Detailed Implementation Plan.**

Do not implement later milestones until the current milestone has been properly analyzed and planned.