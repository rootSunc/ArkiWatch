# Frontend audit and polish — 2026-09-26

## Scope and method

Audited the public pages (`/about`, `/privacy`, `/login`), unknown-route handling, all 11 Data/Today workspace views, and `/settings`. The workspace set included overview, Today, weather, air, energy, mobility, water, events, city services, geospatial, and regional profile. The energy and mobility secondary tabs were checked separately. Authenticated settings were inspected with a local mock session and empty personal context; all four settings steps were visited.

The page matrix used Chromium at 1440px light/English, 390px light/English, 280px light/English, and 390px dark/Chinese. Settings also received 280px dark/Chinese coverage. Browser checks included screenshots, document overflow, page errors, and axe WCAG 2.0/2.1 A/AA. This is a sampled technical audit, not a claim that every data state or physical touch device was tested. No Lighthouse or field performance measurement was run.

## Implementation integrity verdict

**Pass.** The interface has a coherent, product-specific system: Data prioritizes evidence and freshness, Today prioritizes one recommendation, and workspace detail views reuse evidence and empty-state components. The refinements use existing design tokens and preserve the established hierarchy in [frontend-ui-system.md](frontend-ui-system.md). The Impeccable detector reported two existing Today-strip accent-border warnings; inspection found intentional semantic accents, so they were left in place.

## Audit health score after fixes

| Dimension | Score | Evidence and limit |
| --- | ---: | --- |
| Accessibility | 4/4 | No axe A/AA violations in the sampled light and dark routes or the four authenticated settings steps after the contrast fix. |
| Performance | 3/4 | Production builds and browser interactions completed without page errors; runtime performance and field metrics were not measured. |
| Responsive design | 3/4 | No document-level horizontal overflow at 1440, 390, or 280px; narrow data rows were corrected. Physical touch and enlarged-text tests remain outside this pass. |
| Theming | 3/4 | Sampled dark/Chinese routes and authenticated settings remained legible; full state-by-state theme coverage was not attempted. |
| Implementation integrity | 3/4 | Shared hierarchy and tokens are intact; the legacy CSS cascade still has intentional override debt documented in the UI system. |
| **Total** | **16/20** | **Good** |

## Findings and fixes

| Severity | Finding and user impact | Resolution |
| --- | --- | --- |
| P1 · Accessibility | During settings step changes, the muted status text on a hovered navigation item measured about 4.46:1, below WCAG AA normal-text contrast. | Set the status text to the existing `--muted-2` token. The checked combination now measures about 5.19:1. |
| P2 · Responsive | At 280px, water coverage labels had about 38px and wrapped into tall, hard-to-scan rows. | Put the meter on a second row; available label width increased to about 203px and the sampled row shrank from about 103px to 66px. |
| P2 · Responsive | At 280px, city-service field names had about 18px and the sample row reached about 193px high. | Use two columns for field and owner, with the description across both; available field-name width increased to about 117px and the sampled row shrank to about 89px. |
| P2 · Hierarchy | The transit alert heading touched the metric strip, making two sections read as one. | Added 24px desktop and 16px mobile separation while retaining clearance above the fixed 280px mobile navigation. |
| P2 · Responsive | The overview Today digest previously compressed its recommendation on mobile because a later flex shorthand overrode the earlier rule. | Restored a single readable text column in the compact shell. |
| P3 · Test integrity | Existing unit and end-to-end assertions expected obsolete English and Chinese copy, obscuring the result of the visual audit. | Updated assertions to the current product copy; no production copy was changed. |

No P0 issues remain. The P1 and P2 findings above were fixed and rechecked in the same pass.

## Validation

- 16 route/view cases across four viewport, language, and theme configurations: no document-level overflow or page errors.
- Axe checks on all 16 light desktop and 16 light mobile cases, plus 16 dark/Chinese mobile cases: no A/AA violations after fixes. Secondary energy and mobility tabs also had no overflow or axe findings at 1440, 390, and 280px.
- Authenticated settings: four steps at 1440px light/English, 390px light/English, 280px light/English, and 280px dark/Chinese; no overflow or axe findings after fixes.
- `pnpm run check:web`: 355 unit tests passed, with lint, types, and i18n checks passing.
- Standard and demo-mode production builds passed. Full Playwright suite: 150 passed, 62 conditionally skipped, 0 failed.

## Remaining scope

The audit used deterministic demo data and a local session mock for settings. Live backend data, physical-device touch behavior, enlarged-text layouts, and measured runtime performance need separate evidence before making claims about those conditions. No further visual changes are recommended from the sampled states.
