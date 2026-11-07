# Product scope and open assumptions

This is a repository review, not evidence from user research. The recommended
scope below follows the existing promise: public data that helps with practical
decisions. Product usefulness still needs observation with real users.

## The smallest useful outcome

A person in a supported Finnish city can find a relevant signal, understand its
place and time coverage, inspect its source, and decide whether to act. When the
evidence is missing or old, the product makes that limitation visible.

Home combines the next decision with the signal readings. Domain workspaces
support deeper inspection, while the optional Your day page holds the personal
plan without repeating the overview. Home is the default entry point. The assistant
is an optional way to explain the same evidence. An account, a model provider,
Telegram, and a historical archive are not prerequisites for that public path.

## What earns its complexity

| Existing capability | Why keep it | Boundary |
| --- | --- | --- |
| Collectors, provenance, freshness, scope | A decision is only useful if its evidence applies here and now | Adding a feed needs a specific user question |
| Go-owned decisions and generated demo assets | Live and demo can use the same rules without duplicate browser business logic | Do not move presentation logic into Go |
| Home, domain workspaces and Your day | A decision needs readings, evidence and an optional personal plan | Keep one overview; the plan must not repeat it |
| Saved context, Telegram, assistant | Potential convenience for recurring use | Keep optional; assess each against actual use |
| History and backfill | Supports comparison and investigation | Keep bounded; missing history remains missing |
| Single-VPS recipe | Makes self-hosting reproducible | Keep generic; personal infrastructure is separate |

## Assumptions to challenge

| Assumption | Evidence in this repository | Consequence and next validation |
| --- | --- | --- |
| More categories and cities make the product more useful | Six city packs and many specialist workspaces exist; this review has no usage evidence | Improve one city's end-to-end path before adding scope; observe whether users can find and explain a relevant signal |
| `supported` in the coverage catalog proves current data is available | [Coverage definitions](../apps/api/internal/platform/coverage.go) assign static signal capabilities; `configured` only means at least one city-specific feed is configured | Treat the catalog as capability metadata. Inspect collector status, returned readings, and timestamps for operational availability |
| One daily recommendation works for everyone | Public advice is regional; saved personal context is optional | Validate relevance without a profile and after adding context; absence of useful advice is an acceptable result |
| Citations make model answers reliable | The assistant receives grounded context and returns citations | Citations identify inputs; they do not prove every generated claim. Validate unsupported questions and unavailable or historical scopes |
| A successful backfill means complete history | [The planner](../apps/api/internal/database/backfill_planner.go) checks for at least one observation per source per day, not complete coverage per city or dataset | Do not advertise complete archives; require a more precise completeness measure before doing so |
| Passing CI means the project is finished | [CI](../.github/workflows/ci.yml) runs API/web checks, contract/asset checks, and a web build | It does not establish current provider availability, usability, restore success, or production readiness |

## Recommended completion criteria

For the current pre-release scope, gather evidence that a user can find a
relevant signal and its source without assistance; see a clear unavailable state
when a source fails; distinguish demo, past dates, and live data; and complete
the public path with optional integrations disabled. Record the chosen city,
configuration, date, and observed outcomes in the release review.

Use three short Helsinki tasks with participants who have not seen the project:

| Task | What to observe |
| --- | --- |
| Find a change relevant to leaving home today | Whether the participant reaches a city-scoped signal without prompting |
| Decide whether to change a plan | Whether they can distinguish an actionable recommendation from "no current recommendation" or missing data |
| Explain the basis of that decision | Whether they can find the provider, location, observation time, and any freshness limit |

Record the route taken, misunderstandings, and whether each task succeeded.
Automated checks now cover the Helsinki demo capability label, collector status,
no-data heading, and desktop/mobile rendering. They cannot establish whether an
unfamiliar person understands the interface or whether live providers return
fresh readings.

For a deployed instance, also verify its enabled data flows against the public
privacy page and complete a restore drill. A screenshot, test count, or successful
build alone is insufficient. No user study, live-provider check, or production
restore was performed as part of this documentation review.

The recommended next step is validating that narrow path, rather than expanding
the feature inventory. Existing optional features remain available; removing one
should follow evidence that its value does not justify its maintenance cost.
