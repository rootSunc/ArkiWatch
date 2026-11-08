# Product scope

**Goal:** someone in a supported Finnish city finds a relevant signal, sees
where and when it applies, checks its source, and decides whether to act. When
evidence is missing or old, the product says so.

Home is the entry point. Accounts, the assistant, Telegram, and history are
optional and must never be required for that public path.

## Keep vs. bound

| Capability | Why it exists | Boundary |
| --- | --- | --- |
| Collectors with provenance and scope | Advice is only useful if it applies here and now | New feed only for a specific user question |
| Go-owned decisions, generated demo | Live and demo share one rule set | No presentation logic in Go |
| Home + domain pages + Your day | Decide, inspect, plan | One overview; Your day must not repeat it |
| Assistant, Telegram, saved context | Recurring-use convenience | Optional; keep only if used |
| History and backfill | Comparison and investigation | Bounded; gaps stay visible |

## Unproven assumptions

| Assumption | Reality check |
| --- | --- |
| More cities/categories = more useful | No usage data. Deepen Helsinki first. |
| `supported` = data available | It's capability metadata; health is runtime. |
| Citations make answers reliable | They identify inputs, not prove each claim. |
| Backfill = complete history | One row per source per day counts as covered. |
| Green CI = ready | CI doesn't test providers, usability, or restores. |

## Done for pre-release

Three Helsinki tasks with people new to the project:

1. Find something relevant to leaving home today.
2. Decide whether to change a plan (tell "act" from "nothing now" from "no data").
3. Explain why: provider, place, observation time, freshness.

Record route, confusion, and success per task. For a deployed instance, also
check enabled data flows against `/privacy` and run one restore drill.
Prefer validating this path over adding features.
