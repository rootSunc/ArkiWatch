# Documentation

Start with the question you need to answer. These documents describe the source
repository; they do not certify the health of a particular deployment.

| I want to… | Read |
| --- | --- |
| Understand the product and try the demo | [Project README](../README.md) |
| Understand the purpose, tradeoffs, and remaining assumptions | [Product scope](product-scope.md) |
| Check coverage, sources, and attribution | [Data sources](data-sources.md) |
| Understand storage and external data flows | [Privacy](../PRIVACY.md), also available in the app at `/privacy` |
| Run the live stack or contribute | [Development](development.md) |
| Change business rules or API behavior | [Go business boundary](go-business-boundary.md), [API guide](../apps/api/README.md) |
| Change a workspace or its presentation | [Frontend UI system](frontend-ui-system.md) · [Redesign review](frontend-redesign-2026-10-implementation.md) |
| Understand historical collection | [History and backfill](history-backfill-framework.md) |
| Deploy and operate an instance | [Deployment](../deploy/README.md) and its runbooks |
| Decide what belongs in the public repository | [Public and private records](publication-boundary.md) |

## Maintaining these documents

Describe current behavior first. Mark a proposal as a proposal and give its
validation condition; remove completed implementation plans instead of keeping
a second history beside Git. Prefer links to code and configuration over copied
endpoint lists, settings catalogs, or changing test counts.

Keep setup commands in the development guide, release commands in the deploy
runbook, and environment keys in the example files. The root README is an entry
point. Update both `PRIVACY.md` and the EN/中文 `/privacy` page when data flows
change. Generated API types and demo assets are updated through the commands in
the [business boundary](go-business-boundary.md#offline-assets-and-contract-maintenance).
