# Public and private records

The public repository should explain what ArkiWatch does, how to inspect its
claims, and how someone else can run or change it. Personal operating details
belong outside that shared explanation.

## What belongs where

| Record | Audience and location |
| --- | --- |
| Purpose, limitations, provenance, privacy, attribution | Public users: README, data-source guide, privacy document and app page |
| Architecture, API contract, rules, tests, UI conventions | Contributors: `docs/`, `contracts/`, source and tests |
| Environment key names, safe defaults, placeholders | Self-hosters: tracked `.env.example` and `*.env.example` files |
| Compose, Dockerfiles, Ansible templates, generic recovery procedures | Self-hosters: tracked `deploy/` files |
| Actual credentials, tokens, database URLs containing passwords | Operator only: ignored environment files or a secret manager |
| Real inventory, SSH access details, registry credentials | Operator only: ignored Ansible inventory and group variables |
| Deployment diary, restore evidence, incident details, private costs and plans | Operator only: `docs/private/` or an access-controlled private store |
| Personal addresses, commute, account exports, database dumps, raw logs | Private data store or protected backups; never public fixtures or screenshots |
| Personal agent instructions, prompts, and tool preferences | Ignored `.agents/`, `.claude/`, or private tooling storage |

`docs/private/` and `deploy/runbooks/*.local.md` are excluded from Git and the
Docker build context. They are local conveniences, not encrypted storage or a
backup strategy. Use protected storage for durable private records and secrets.

A published deployment's enabled integrations and user-visible data handling
must still be disclosed publicly. Keeping keys private does not make the data
flow private. Likewise, architecture and generic runbooks are useful public
knowledge; hiding them is not a substitute for access controls.

## Configuration rules

Keep reusable knobs and their behavior public; keep instance-specific values
private. Example city coordinates describe public city centers, not someone's
saved home. A provider endpoint or public website domain is not inherently a
secret, but the project's actual access inventory need not be published.

All `NEXT_PUBLIC_*` values are browser-facing. `API_PUBLIC_BASE_URL` is also
embedded into browser runtime configuration despite lacking that prefix. Never
put credentials in either. Server-only settings are not automatically safe to
print, commit, or include in support reports.

The API examples intentionally list every loader key; `pnpm run config:check`
checks that correspondence. This is a reference, not a requirement to customize
every setting. Start with the database and authentication, then configure only
the providers and optional services you enable.

## Before sharing records

Review the actual diff and attachments, including screenshots and fixtures.
Check local exclusions with `git check-ignore -v <path>`. Ignore rules do not
untrack previously committed files or erase Git history. Use the repository's
Gitleaks configuration for a redacted history scan:

```bash
gitleaks git --redact --no-banner --log-opts='--all'
```

A clean scan only means no configured pattern matched; it does not classify
personal information or prove that every secret has been found. If an actual
credential was published, revoke or rotate it before addressing copies/history.
