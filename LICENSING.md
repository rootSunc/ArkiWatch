# Licensing

## The code

ArkiWatch is licensed under the
[GNU Affero General Public License v3.0 only](LICENSE).

Copyright (C) 2025-2026 Chao Sun (rootSunc).

The licence covers the source code in this repository. It does not cover the
ArkiWatch name and logo, and it grants no rights in the public data the
software fetches.

## Running a public instance

AGPL section 13 applies to a network deployment: anyone who can use your
instance over a network must be able to obtain the source of the version you
are running, including your changes.

The interface links to the upstream repository from
`apps/web/src/features/shared/project-links.ts`, which satisfies section 13 for
an unmodified deployment. If you change the code, point that link at your own
source or offer it another way.

## Commercial licensing

The AGPL is the only licence offered here, and it is sufficient for
self-hosting, internal use, research, and any deployment willing to publish its
source.

For use in a closed-source product, or as a hosted service that will not meet
section 13, the copyright holder can grant a separate commercial licence. Write
to sunchao686@gmail.com with what you intend to build and how you intend to
deploy it.

A commercial licence covers the code only. The provider constraints in
[Commercial use](docs/data-sources.md#commercial-use) are between you and the
data providers, and no licence granted here can lift them.

## Contributions

Issues, bug reports, and data-source proposals are welcome. For a new Finnish
public source, the
[data-source template](.github/ISSUE_TEMPLATE/data_source.yml) helps collect
the licence, limits, and coverage.

Code contributions require a contributor licence agreement before they can be
merged, so that commercial licensing remains possible. Open an issue to discuss
the change first rather than starting with a pull request. This is a
single-maintainer project and the history is single-author by design.

## Name and logo

The ArkiWatch name and logo are not covered by the AGPL and are not licensed for
reuse. A fork is free to use the code under the AGPL and needs its own name and
marks.

## Public data

ArkiWatch adapts public data and owns none of it. Each provider's licence,
access requirement, and attribution string is listed in
[docs/data-sources.md](docs/data-sources.md), together with the credits a public
deployment owes and the providers whose default configuration is unavailable for
commercial use.

Attribution is not optional. Most feeds are CC BY 4.0, which requires crediting
the source. The workspaces show provider name and fetch time next to each
reading; a deployment that strips those breaches the data licences, independent
of this one.
