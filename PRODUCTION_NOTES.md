# Production Readiness Notes (`PRODUCTION_NOTES.md`)

While LendLoop's current architecture provides strong security boundaries, bidirectional HMAC verification, and idempotent automation for technical evaluation and local/staging deployment, the following changes would be implemented before running at production scale:

## 1. Secret Management & Key Rotation
- **Secret Manager**: Store `CLERK_SECRET_KEY`, `N8N_OUTBOUND_SECRET`, `N8N_INBOUND_SECRET`, and `N8N_ENCRYPTION_KEY` in a managed vault (AWS Secrets Manager, GCP Secret Manager, or Doppler) injected at runtime rather than manual `.env` files.
- **Dual-Key Zero-Downtime Rotation**: Support comma-separated active/previous HMAC secrets (`N8N_INBOUND_SECRET_CURRENT`, `N8N_INBOUND_SECRET_PREVIOUS`) in `verifyHmacSignature` so secrets can be rotated every 90 days without dropping in-flight webhooks.

## 2. n8n High Availability (Queue Mode + PostgreSQL)
- Replace the default SQLite storage in `docker-compose.yml` with a managed **PostgreSQL** instance (`DB_TYPE=postgresdb`).
- Run n8n in **Queue Mode** (`EXECUTIONS_MODE=queue`) backed by **Redis**, separating webhook receiver processes, main scheduler processes, and scalable worker containers.

## 3. Rate Limiting on HTTP & Mutation Endpoints
- Place **Cloudflare WAF** or **Upstash Redis (`@upstash/ratelimit`)** in front of Convex HTTP endpoints (`/overdue-loans`, `/reminders/ack`) to throttle anomalous IP traffic before HMAC computation.
- Add per-user token-bucket rate limiting inside Convex mutations (`loans.request`, `tools.create`) to prevent spam requests from compromised accounts.

## 4. Observability, Tracing & Alerting
- Integrate **Sentry** (or **Datadog**) across Next.js client/server and route n8n's `error-handler.json` workflow to **PagerDuty** / **Slack** webhooks.
- Emit structured OpenTelemetry metrics for webhook latency, retry counts, and `automationEvents` failure rates, alerting on any sustained `status: "failed"` spike.

## 5. Immutable Admin Audit Logs
- Introduce an append-only `auditLogs` table in Convex (`actorId`, `action`, `targetId`, `metadata`, `createdAt`) recording every `admin.removeListing` and `admin.setTrustedLender` invocation, with periodic export to immutable object storage (S3 Object Lock).

## 6. Automated Backups & Disaster Recovery
- Enable automated daily snapshots on Convex production deployments and PostgreSQL point-in-time recovery (PITR) for n8n execution state.
- Version-control n8n workflows via CI/CD using the n8n CLI (`n8n export:workflow` / `n8n import:workflow`).

## 7. Data Retention & Privacy Compliance (GDPR)
- Implement a scheduled Convex cron job that anonymizes or purges historical `automationEvents` and completed `loans` older than the retention window (e.g., 12 months) and supports user account deletion requests via Clerk webhooks (`user.deleted`).

## 8. Transactional Email Provider & Versioned Templates
- Replace the console/mock notification step in n8n with a dedicated transactional email service (**Resend**, **Postmark**, or **AWS SES**) using DKIM/SPF/DMARC-authenticated domains and pre-rendered MJML/React Email templates.

## 9. End-to-End Testing (Playwright)
- Supplement the `convex-test` unit/integration suite with **Playwright** E2E tests running in GitHub Actions against ephemeral preview deployments, covering the full Clerk login flow, loan approval lifecycle, and webhook round-trips.

## 10. Accessibility (WCAG 2.1 AA)
- Enforce automated `axe-core` accessibility checks in CI, add full keyboard trap management and ARIA live regions for date-picker dialogs and toast alerts, and verify high-contrast focus states across all interactive controls.

