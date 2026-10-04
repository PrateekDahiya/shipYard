# ADR-005 — Rate limiting algorithm

Decision: **fixed window** counters per project (`shipyard:rl:<project>:min`, `:hour`)
via Redis `INCR` + `EXPIRE`, enforced in `middleware/rateLimit.js`.

Why not token bucket / sliding window: fixed window is atomic with two Redis
commands, trivially inspectable (`TTL` gives `Retry-After`), and precise enough
for per-project API abuse protection at this scale. No Lua scripts, no extra deps
(Redis already required).

Trade-off accepted: boundary burst (up to 2x limit across a window edge).
Revisit sliding-window-log if abuse patterns demand it — the middleware seam
(`checkFixedWindow`) isolates the change.

Fail-open without Redis (API stays available; outage visible via `/ready`).
429 responses carry `Retry-After`. No request bodies or query strings are stored
by the adjacent request logger.
