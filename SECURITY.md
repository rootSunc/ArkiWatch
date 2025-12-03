# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's private
vulnerability reporting or a security advisory for this repository. Do not open a
public issue, post exploit details in a pull request, or contact a public data
provider with ArkiWatch credentials.

Include the affected component, a concise reproduction, potential impact, and any
safe mitigation you have identified. Redact tokens, passwords, personal data, and
production hostnames from the report.

Maintainers will acknowledge a report when they can, investigate it, and publish a
fix or mitigation when appropriate. Security fixes should preserve the project's
AGPL licensing and existing data-source terms.

## Scope reminders

- Never commit `.env` files, deployment credentials, API keys, database dumps, or
  personal data.
- If a credential appears in a working tree, log, issue, pull request, or commit,
  revoke it first, rotate the replacement, then remove the local copy and run the
  repository secret scan. Removing the file alone does not invalidate the old
  credential.
- Treat public endpoints as untrusted input and keep operational routes protected.
- Personal reads (`/personal/*`, `/user/*`, `/today`, `/recommendations`,
  `/notifications`, and `/public/subscriptions`) require a bearer token for the
  same user named by the request. Public platform and source-data endpoints do
  not expose those personal records.
- Assistant chat may be used anonymously for public data, but it never trusts a
  request-body `user_id`; personalized context is derived only from the bearer
  token.
- Use synthetic fixtures for tests and examples.
