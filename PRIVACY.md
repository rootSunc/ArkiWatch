# Privacy and data boundary

ArkiWatch combines public data feeds with optional personal configuration. A
deployment operator is responsible for the database, credentials, backups, logs,
and any third-party services enabled in the environment.

## What the live application can store

- account identity and authentication metadata;
- saved locations and commute profiles;
- notification preferences and Telegram channel identifiers;
- recommendations, notification delivery status, and operational job history;
- raw provider payloads, normalized events, snapshots, and source-health metadata.

The deterministic demo uses local fixtures and does not require an account,
PostgreSQL, API keys, or external provider calls.

## Data boundaries

Personal routes require a bearer token and are scoped to the authenticated user.
Public platform and source-data routes expose public/provider data and provenance,
not personal records. Telegram is optional; enabling it sends configured
recommendation or public-broadcast text to the Telegram API.

## Retention

Raw observations default to 90 days and normalized events to 365 days when
`DATA_RETENTION_ENABLED=true`. Scheduler runs default to 90 days and Telegram
webhook idempotency records to 30 days; those operational cleanups run with the
snapshot scheduler. Adjust the retention settings for the deployment's legal and
operational requirements, and test backups before shortening a policy.

## Operator responsibilities

Use strong, unique values for `AUTH_TOKEN_SECRET`, admin credentials, database
credentials, metrics tokens, provider keys, and Telegram secrets. Restrict
production API and documentation paths at the edge, protect backups, rotate
credentials after any suspected exposure, and do not commit `.env` files or
production data.
