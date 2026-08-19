# Publishing access — `packages/tokens`

Groundwork for COREEXP-334 (release pipeline: colour diff in front of a
reviewer via Dependabot). This ticket (COREEXP-325) settles the permissions
this needs and one open question the epic raised. No write access to
`meetcleo` or `mobile-app` is requested or needed — see "Why no PR-opener
permissions" below.

## Current state

- `cleonardo` is **PUBLIC** (confirmed via `gh api repos/meetcleo/cleonardo`:
  `visibility: public`, secret scanning + push protection both enabled, 0
  alerts). This went further than this doc's original recommendation of
  private → internal — flagging that, not re-deciding it: it was already
  done by the time this doc was updated. This removes ask #2's target
  (nothing to flip) and, per "The permission request" below, ask #5 with
  it.
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

| # | Ask | Status | Why | Route it serves |
|---|---|---|---|---|
| 1 | `packages: write` on `cleonardo` (workflow-level; built-in `GITHUB_TOKEN` suffices) | **done** — `tokens-release.yml` published `@meetcleo/design-tokens@0.1.0` to GitHub Packages on the first real run, no further grant needed | publish to GitHub Packages | npm (confirmed) |
| 2 | Flip `cleonardo` private → internal | **done** — repo is public, which is a further step than internal | — | — |
| 3 | Confirm "Allow GitHub Actions to create and approve pull requests" is on for `cleonardo` (admin toggle, not YAML) | **already confirmed** | `figma-sync.yml` opens PRs with `gh pr create` | COREEXP-323 (already merged) |
| 4 | A **classic** PAT with `read:packages`, org-scoped, stored as a Dependabot secret + Actions secret in `meetcleo`/`mobile-app` — not committed | **not needed** — see below | consume a GH Packages package | superseded |
| 5 | A PAT with **contents: read** on `cleonardo`, as a Dependabot secret in `meetcleo` (`type: git` registry entry: `username: x-access-token`, `password: ${{secrets.…}}`) | **no longer required** — see below | Dependabot cloning a private git-source gem | git-tag route (the default) |

**Ask #5 is moot now that `cleonardo` is public.** It existed solely to let
Dependabot clone a private/internal repo; a public repo needs no credential
to clone at all — this is exactly the pattern already confirmed working in
`meetcleo`'s Gemfile today (`wachtwoord`, `avro_turf`, `statsd-instrument`,
et al. — all tag-pinned gems from public `meetcleo`-org repos, no
`registries:` entry, no secret). The prior caution here (dependabot-core
#3587/#7605 — an org-UI access grant alone wasn't sufficient) applied to
private/internal repos specifically; it does not apply to a public one.

**Ask #4 turned out not to be needed — empirically, contradicting what this
doc said earlier.** The claim below (GitHub Packages always requires a
token, even for a public package) is what GitHub's own docs and the
GitHub community say, and is presumably still right for a *private*
package. It does not hold for this one: on `mobile-app`, adding only

```yaml
# .yarnrc.yml
npmScopes:
  meetcleo:
    npmRegistryServer: "https://npm.pkg.github.com"
```

— no `npmAuthToken`, no `npmAlwaysAuth` — was sufficient to
`yarn add @meetcleo/design-tokens@0.1.0` and read a value back out of it.
Verified in a cold environment (checked first: no pre-existing GH Packages
credential anywhere in that machine's global npm/yarn config, `gh` session,
or env vars that yarn could have picked up instead). Net: **no permission
ask remains outstanding.** Asks #1–3 are done or confirmed; #4 and #5 are
both superseded rather than submitted.

The contradiction itself is worth flagging onward rather than explained
away: either GitHub's public-package behaviour changed since the docs
above were written, or there's a scope of "public" this doc's sources
didn't cover (e.g. package-level vs. repo-level visibility settling
differently). This doc doesn't resolve which — that's for whoever owns the
GitHub Packages relationship going forward, not something to design around
without understanding.

Superseded, kept for context rather than deleted:
- Ask #4 cannot be a fine-grained token — GitHub Packages is classic-PAT-only.
  Moot now, but relevant again if a *private* GH Packages package is ever
  needed.
- A GitHub changelog entry dated 2026-06-23 reportedly lets Dependabot's own
  `GITHUB_TOKEN` reach `*.pkg.github.com` — still unverified, the page still
  404s, and doesn't explain this finding anyway (this was a plain `yarn add`,
  not Dependabot).

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
   (below) runs.** Now that `cleonardo` is public, this route needs **no
   Dependabot registry entry at all** — ask #5 and the
   `insecure-external-code-execution` interaction above no longer apply.
   This makes the default route strictly simpler than it was when the repo
   was private: it's now just a plain tag-pinned `github:` gem, the same
   shape as `meetcleo`'s other public-repo git dependencies.
2. **Fallback: GitHub Packages RubyGems.** Same `packages: write`, but a
   real bug tail (dependabot-core#7327 — private registry poisons *all*
   Bundler lookups; #11843 — `rubygems-server` vs `rubygems_server` naming).
3. **Third option: rubygems.org + OIDC trusted publishing.** Cleanest
   Dependabot story, zero static credentials — but publishes Cleo's colour
   tokens publicly. A disclosure decision for a human, not an engineering
   one.

Decisive test (runnable now — no longer blocked on ask #2/#5, since
`cleonardo` is already public): cut `v0.1.0`/`v0.1.1` tags with real GitHub
Releases containing a colour diff, pin `meetcleo` to `v0.1.0` on a
throwaway branch (plain `github:`/`tag:`/`glob:`, no registry entry needed
now), trigger Dependabot, and read the resulting PR body. A **Release
notes** section = git-tag route confirmed. What remains genuinely unproven
is `glob:` itself — dependabot-core has zero test coverage for it — not
private-repo access, which is now moot.

## Security note (out of scope for this ticket, must be raised separately)

`meetcleo/mobile-app` has a classic GitHub PAT committed in plaintext on
`main`, in both `.npmrc` and `.yarnrc.yml` (annotated as having no access to
Cleo repos). Raise it with InfoSec separately from this ticket — unrelated
to `@meetcleo/design-tokens` now that ask #4 turned out not to be needed
(see "The permission request" above), but a bad pattern regardless of
that.

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
- **`mobile-app` npm resolution.** `tokens-release.yml` published
  `@meetcleo/design-tokens@0.1.0` for real (COREEXP-334). On a throwaway
  `mobile-app` branch, adding only `npmScopes.meetcleo.npmRegistryServer`
  to `.yarnrc.yml` (no `npmAuthToken`) resolved `yarn add
  @meetcleo/design-tokens@0.1.0` and read a value back out of it, in an
  environment confirmed to hold no other GH Packages credential. This is
  what retired ask #4 above.

Not runnable in this ticket (need a real tag or another repo):

- **Bundler two-deep-gemspec resolve.** On a throwaway `meetcleo` branch,
  add the `gem "cleo_design_tokens", github: ..., glob: ..., tag: ...`
  line above and run `bundle install` using a developer's own GitHub
  credentials (no org grant needed) — proves `glob:` lifts Bundler's
  one-level `DEFAULT_GLOB` limit. Also literally AC #2.
- **The live Dependabot test.** No longer blocked on ask #2/#5 — only
  needs real tags cut on `cleonardo` (now public) and a throwaway
  `meetcleo` branch. See "Gem channel" above for the exact procedure.

`glob:`'s Dependabot behaviour and the Dependabot release-notes rendering
are the ticket's central open question, and they stay open by design until
these three run — that part is unchanged by the visibility flip.

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
