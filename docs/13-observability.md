# 13 — Observability

## Logging

Structured (JSON) server-side logging for every mutation and every error,
including: `organizationId`, `userId`, `action`, `entityType`/`entityId`,
duration, outcome. Sensitive fields (passwords, full bank account numbers,
raw `MONGODB_URI`) are never logged — a `redact()` helper applied at the
logging boundary strips known-sensitive keys defensively even if a caller
forgets. Logs are the operational complement to `auditLogs` (§03/§07):
`auditLogs` is the durable, queryable business record; application logs are
for operational debugging and are retained on a shorter window.

## Metrics

- **Application**: request latency (p50/p95/p99) per route, error rate,
  Server Action duration, background job duration/success rate.
- **Database**: MongoDB Atlas built-in metrics (connection pool utilization,
  operation latency, index usage, replication lag) — reviewed against the
  index strategy in [08](08-performance-scalability.md) to catch missing or
  unused indexes over time (`$indexStats`/Atlas Performance Advisor).
- **Business**: payments recorded/day, cycle collection rate, export job
  volume — useful both operationally and as product signal.

## Error tracking

A dedicated error-tracking service (e.g. Sentry) captures unhandled
exceptions from both server (Server Actions, Route Handlers, background
jobs) and client, with `organizationId`/`userId` (not PII beyond that)
attached for triage, sourcemaps enabled for readable stack traces in
production.

## Alerting

Alert thresholds tied to what actually matters for a financial system:

- Any failed transaction in the payment/expense/cycle-close code paths
  (these should be exceedingly rare given transactional guarantees —
  a spike is a signal something is structurally wrong).
- MongoDB connection pool exhaustion / elevated operation latency.
- Background job failure rate above a small threshold.
- Authentication failure spikes (possible credential-stuffing attempt).

## Health checks

A lightweight `app/api/health` Route Handler verifying MongoDB connectivity
(a cheap `ping` command, not a full query) for use by the hosting platform's
load balancer / uptime monitoring.

## Dashboards

An internal operations dashboard (Atlas's own charts, or a lightweight Grafana
if the org already has one) tracking the metrics above — not built as part of
the product itself, kept separate from the customer-facing financial
dashboard described in [10-ui-ux-system.md](10-ui-ux-system.md).
