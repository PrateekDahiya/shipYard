# ADR-004 — Build isolation (Phase 02 limitation, improved later)

Build commands run in a worker-scoped temp workdir (`SHIPYARD_WORKDIR` or OS temp)
with timeout + stdout/stderr capture — NOT yet in a containerized build sandbox
as §16 ultimately requires.

Update: repos WITHOUT a Dockerfile now get a generated one (buildpack-lite for
Node.js/Python in `src/deployment/dockerfile.js`), and the configured build
command runs INSIDE `docker build` for those — which is properly isolated.
Worker-host execution remains only for repos with their own Dockerfile that
also set a build command (pre-step).

Mitigations in place: per-build timeout, output size caps (16k chars/line in DB),
secret values never written by platform code (build stdout itself is untrusted
and shown as-is), pinned-commit checkout.

Before production hardening (Phase 06): move ALL build execution into an ephemeral,
unprivileged container with no host mounts, no Docker socket, CPU/mem caps.
Tracked for Phase 05/06.
