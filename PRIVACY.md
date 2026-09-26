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
PostgreSQL, API keys, or live feed collection. Map views can still load external
tiles, including in the demo.

## Data boundaries

Personal routes require a bearer token and are scoped to the authenticated user.
Public platform and source-data routes expose public/provider data and provenance,
not personal records. Telegram is optional; enabling it sends configured
recommendation or public-broadcast text to the Telegram API.

## Third-party services

Two optional integrations send data outside the deployment when configured:

- **Assistant.** When `DEEPSEEK_API_KEY` is set, the assistant sends the
  submitted conversation messages and snapshot context to the configured model
  API (DeepSeek at `api.deepseek.com` by default) and that provider's terms and
  retention apply to it. Operators can change the destination through
  `DEEPSEEK_API_BASE_URL` and should disclose the configured provider. The same
  key also routes on-demand translation of provider text through that API.
  Without a key the assistant falls back to deterministic answers built locally
  from the same snapshot, and text is left
  untranslated. The rules that produce recommendations never call a model.
- **Telegram.** Enabling a bot token sends the configured recommendation or
  public-broadcast text to the Telegram API.

Signal collection from the providers in [docs/data-sources.md](docs/data-sources.md)
runs server-side. Coordinate maps load OpenStreetMap tiles directly: on pages
with a map the visitor's IP address and the viewed area reach
`tile.openstreetmap.org`.

## Browser storage

The web app uses an HttpOnly cookie for the signed-in session. Language, theme,
selected city, and read-event state can persist in browser local storage. These
browser preferences are separate from saved account records in PostgreSQL.

## Retention

Raw observations default to 90 days and normalized events to 365 days when
`DATA_RETENTION_ENABLED=true`. Scheduler runs default to 90 days and Telegram
webhook idempotency records to 30 days; those operational cleanups run with the
snapshot scheduler. Adjust the retention settings for the deployment's legal and
operational requirements, and test backups before shortening a policy.

These cleanup windows do not define automatic deletion periods for account
profiles, saved locations, snapshots, or backups. Operators must describe the
retention and deletion process for their own deployment.

## Operator responsibilities

Use strong, unique values for `AUTH_TOKEN_SECRET`, admin credentials, database
credentials, metrics tokens, provider keys, and Telegram secrets. Restrict
production API and documentation paths at the edge, protect backups, rotate
credentials after any suspected exposure, and do not commit `.env` files or
production data.

Repository publication rules are documented separately in
[Public and private records](docs/publication-boundary.md). Keep this document
and the app's EN/中文 `/privacy` page aligned when data flows change.
