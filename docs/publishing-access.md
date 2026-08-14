# Publishing access — `packages/tokens`

Groundwork for COREEXP-334 (release pipeline: colour diff in front of a
reviewer via Dependabot). This ticket (COREEXP-325) settles the permissions
this needs and one open question the epic raised. No write access to
`meetcleo` or `mobile-app` is requested or needed — see "Why no PR-opener
permissions" below.

## Current state

- `cleonardo` is **PRIVATE** today (confirmed via `gh repo view`). Several
  items below depend on flipping it to **internal** (ask #2) — until that
  lands, treat the private-repo caveats as live.
- Both artefacts (`@meetcleo/design-tokens` npm package,
  `cleo_design_tokens` gem) are consumed today only via local `path:`/
  relative references. Nothing is published yet.
- Publishing the gem is explicitly blocked: `cleo_design_tokens.gemspec`
  sets a fake `allowed_push_host`. Removing that is COREEXP-334's call once
  the channel below is chosen, not this ticket's.

## Open question, answered

**Does Dependabot render release notes for a `github:`-sourced gem?**
Yes — but only under conditions the epic didn't state. Evidence from
`dependabot-core@main`:

| Git dep pinned to | Release notes | Changelog | Commits |
|---|---|---|---|
| version-like **tag** | ✅ | ✅ | ✅ |
| `branch:` or unpinned | ❌ | ❌ (explicit gate, `changelog_finder.rb`) | ✅ SHA…SHA compare |
| non-version tag / raw SHA | no PR opened at all | — | — |

Tag-pinning works because `git_pin_replacer.rb` rewrites the `tag:`, and
`release_finder.rb#new_version` substitutes the new ref for a SHA-shaped
version. `GitCommitChecker#pinned?` is `false` for `branch: "main"` and for
no ref, so both collapse to commits-only.

## Why no PR-opener permissions

The epic's feared fallback — `contents: write` + `pull-requests: write` on
`meetcleo` for a custom PR-opening workflow — is off the table. Tag-pinning
already gets Dependabot-native release notes, and rubygems.org trusted
publishing is a second native route. **No write permission on `meetcleo` or
`mobile-app`, ever.**

## The permission request

Ask for all of the below in **one** IT/InfoSec service-desk Access Request
("Application name: `Github`"), the same route as
[How to: request github access](https://app.notion.com/p/e2f91cec94f04654ba9346a2f12cdb0c).
Org-level settings need a GitHub **org owner** — confirm who from
[Cleo Tech Tools](https://app.notion.com/p/ab735b5d41c942479b9107de60b1c689)
rather than assuming a name.

| # | Ask | Why | Route it serves |
|---|---|---|---|
| 1 | `packages: write` on `cleonardo` (workflow-level; built-in `GITHUB_TOKEN` suffices) | publish to GitHub Packages | npm (certain) + gem fallback |
| 2 | Flip `cleonardo` private → **internal**, else a point-in-time Dependabot private-repo access grant for `meetcleo` and `mobile-app` | Dependabot reads release notes from the source repo | both routes |
| 3 | Confirm "Allow GitHub Actions to create and approve pull requests" is on for `cleonardo` (admin toggle, not YAML) | `figma-sync.yml` opens PRs with `gh pr create` | COREEXP-323 (already merged — verify, don't re-request if on) |
| 4 | A **classic** PAT with `read:packages`, org-scoped, stored as a Dependabot secret + Actions secret in `meetcleo`/`mobile-app` — not committed | consume a private GH Packages package | registry routes |
| 5 | A PAT with **contents: read** on `cleonardo`, as a Dependabot secret in `meetcleo` (`type: git` registry entry: `username: x-access-token`, `password: ${{secrets.…}}`) | Dependabot cloning a private git-source gem | git-tag route (the default) |

Ask #5 is not optional for the recommended route: dependabot-core#3587 and
#7605 both resolved with an explicit token *after* an org-UI access grant
proved insufficient — **do not assume ask #2 removes the need for ask #5.**

Flag up front when submitting:
- Ask #4 cannot be a fine-grained token — GitHub Packages is classic-PAT-only.
  This is the item most likely to bounce.
- A GitHub changelog entry dated 2026-06-23 reportedly lets Dependabot's own
  `GITHUB_TOKEN` reach `*.pkg.github.com`, which would remove ask #4 —
  **unverified: the page 404s. Do not design around it.**

**No Figma API token needed.** The epic's premise here is stale — COREEXP-323
is Done, and its auth design is a per-designer fine-grained PAT in
`figma.clientStorage`, never CI. `figma-sync.yml` only references the
built-in `GITHUB_TOKEN`. Figma's Variables REST API is Enterprise-only;
Cleo is on Organization tier, so a Figma token would be inert even if
minted.

## Consumer-repo interactions to plan around

- `meetcleo/.github/dependabot.yml` ignores
  `dependency-name: "*"` for `version-update:semver-patch`. A token
  **patch** release opens no Dependabot PR. COREEXP-326 must either exempt
  `cleo_design_tokens`, or the release pipeline must never ship colour
  changes as patch bumps.
- Adding a `registries:` block to a consumer's `dependabot.yml` flips
  external code execution to **deny** by default —
  `file_parser.rb#check_external_code` raises
  `Dependabot::UnexpectedExternalCode` for *any* git-source gem. The
  registry route and the git-tag route interfere: if `meetcleo` ever gains
  a Bundler `registries:` entry, the git-sourced gem needs
  `insecure-external-code-execution: allow`.

## Gem channel — decide from a live test, not this doc

1. **Default: git tag + `glob:`.** (No version tag exists on this repo
   yet — `<tag>` is a placeholder for whatever release tag gets cut.)
   ```
   gem "cleo_design_tokens", github: "meetcleo/cleonardo", glob: "packages/tokens/*.gemspec", tag: "<tag>"
   ```
   No registry, no new consumer credential. `glob:` is mandatory —
   `packages/tokens/cleo_design_tokens.gemspec` is two levels deep and
   Bundler's `DEFAULT_GLOB` only reaches one. Honoured by Dependabot's
   native helpers and preserved by `GitSourceRemover`'s `GOOD_KEYS` —
   **but there is zero test coverage for `glob:` in dependabot-core and no
   issue discussing it. Treat as unverified until the live Dependabot test
   (below) runs.** Needs ask #5's `type: git` registry entry, which then
   triggers the `insecure-external-code-execution` interaction above.
2. **Fallback: GitHub Packages RubyGems.** Same `packages: write`, but a
   real bug tail (dependabot-core#7327 — private registry poisons *all*
   Bundler lookups; #11843 — `rubygems-server` vs `rubygems_server` naming).
3. **Third option: rubygems.org + OIDC trusted publishing.** Cleanest
   Dependabot story, zero static credentials — but publishes Cleo's colour
   tokens publicly. A disclosure decision for a human, not an engineering
   one.

Decisive test (run once ask #2 and #5 land): cut `v0.1.0`/`v0.1.1` tags with
real GitHub Releases containing a colour diff, pin `meetcleo` to `v0.1.0` on
a throwaway branch with a `type: git` registry entry, trigger Dependabot,
and read the resulting PR body. A **Release notes** section = git-tag route
confirmed. Run once against a throwaway public repo pair first, to separate
a `glob:` failure from a private-repo-access failure (ask #2/#5).

## Security note (out of scope for this ticket, must be raised separately)

`meetcleo/mobile-app` has a classic GitHub PAT committed in plaintext on
`main`, in both `.npmrc` and `.yarnrc.yml` (annotated as having no access to
Cleo repos). That pattern cannot be reused for `@meetcleo/design-tokens`:
GitHub Packages is classic-PAT-only, and a token that can read a private
Cleo-org package must never be committed. Raise the existing token with
InfoSec separately from this ticket; ask #4 above must be a
**secret-managed** credential, never committed.

## Verified in this repo (empirical, this ticket)

- `yarn install && yarn tokens:build && cd packages/tokens && npm pack --dry-run` —
  tarball contains `dist/tokens/color/{primitives,semantic}.json`. Confirmed
  clean before any edits in this ticket.
- `gem build cleo_design_tokens.gemspec` + `gem install` into a scratch
  `GEM_HOME` + `require "cleo_design_tokens"` — resolves and reads tokens
  correctly (`colors.primitives.fetch("brown.800")` → `"#47201C"`).
  **Correction to the plan's suggested check:** `CleoDesignTokens.colors
  .primitives.size` does not exist — `Bucket` only exposes `fetch`. Use
  `yarn tokens:verify`, which reports the primitive count directly
  (**106** primitives, 473 semantic roles, confirmed).
- `ruby -rrubygems -e 'p Gem::Version.new("0.2.0-rc.1").to_s'` →
  `"0.2.0.pre.rc.1"`. **The two ecosystems display different version
  strings for the same tag** (npm `0.2.0-rc.1` vs. gem `0.2.0.pre.rc.1`).
  Dependabot matches release tags against versions — confirm this doesn't
  break note resolution before choosing a prerelease format for the real
  release.
- `yarn tokens:verify && yarn tokens:test && yarn tokens:typecheck` and
  `bundle exec rspec` (in `packages/tokens`) — all green, unaffected by the
  metadata changes in this ticket.

Not runnable in this ticket (need org action or another repo): the
Bundler two-deep-gemspec resolve from `meetcleo` with a developer's own
credentials, the live Dependabot test, and the `mobile-app` npm resolution
check. See the plan's verification steps 4–6.

## Acceptance criteria — two flagged for amendment on the Jira ticket

- **AC #1** asked for a workflow publishing a prerelease of both packages.
  If the gem goes the git-tag route, a tag + GitHub Release is not a
  "publish", and the fake `allowed_push_host` blocks `gem push` outright.
  Proposed amendment: npm prerelease published to GitHub Packages; gem
  proven resolvable via `bundle install` from the git source and from a
  locally built `.gem`, with the actual `gem push` and
  `allowed_push_host` removal deferred to COREEXP-334.
- **AC #3** ("the Figma token is available to `cleonardo` workflows") should
  be struck — no such token exists or is needed, per the COREEXP-323
  finding above.

## `packages/tokens/cleo_design_tokens.gemspec` license note

`spec.license` is set to `"Nonstandard"`, not `"UNLICENSED"`. RubyGems
validates against SPDX identifiers and rejects `UNLICENSED` (that's an npm
convention, not a gem one) — `package.json`'s `license` field uses
`"UNLICENSED"` instead, which is the correct npm signal for a
proprietary, non-public package.
