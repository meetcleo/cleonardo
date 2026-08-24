# @cleonardo/tokens

Canonical source of truth for Cleo's design tokens.

Every downstream consumer — the generator, the Ruby module, the User Prompt pilot, product surfaces — is (or will be) produced from what lives here.

## Current scope

**Colour only** (primitives + semantic). Radii, typography, spacing, and other token types land in follow-up tickets.

## Format

Two files, both keyed by lowerCamel dot paths. Every `$value` is a fully-resolved hex string, so consumers never follow a reference.

`tokens/color/primitives.json` — the palette. A leaf carries a value and nothing else:

```json
"brown": { "800": { "$type": "color", "$value": "#47201C" } }
```

`tokens/color/semantic.json` — the roles. The `Base` theme sits on the leaf; other themes appear under `$themes` **only where they genuinely differ**:

```json
"core": { "content": { "primary": {
  "$type": "color",
  "$value": "#47201C",
  "$ref": "brown.800",
  "$themes": {
    "roast": { "$value": "#F8F6F2", "$ref": "brown.50" }
  }
} } }
```

- **`$ref`** is the primitive the value came from, as a valid primitives fetch key. It records *intent* — that `core.content.primary` is meant to be `brown.800`, not merely that it happens to equal `#47201C`.
- **No `$ref`** means a palette gap: no primitive carries that value. See [Known exceptions](#known-exceptions).
- **A theme absent from `$themes` resolves to Base.** A theme earns an entry only by differing from Base in its value or its `$ref`.
- **No `$value` on the leaf at all** means the role exists in some themes but not Base — a Figma-side gap, reported by the transform rather than papered over. A themeless read raises.

The theme is an **axis**, not part of the key: `core.content.primary` is one role with per-theme values, not four keys. That's why 1880 leaf entries collapse to 473 roles plus 336 overrides.

## Layout

```
packages/tokens/
  tokens/
    color/
      primitives.json     # the palette — resolved hex, no themes
      semantic.json        # the roles — Base on the leaf, overrides under $themes
  scripts/
    transform.mjs          # CLI driver: reads the dump, writes the files
    transform-core.mjs     # all the logic — parsing, resolution, key derivation
  spec/
    synthesise-dump.mjs    # builds dump fixtures from a pre-restructure token pair
    fixtures/              # committed dumps + the value-equivalence expectations
    fixtures/reader/       # small hand-written fixtures for the reader's own tests
  lib/
    cleo_design_tokens.rb            # Ruby reader — requires the below, wires up `colors`
    cleo_design_tokens/
      tree_walker.rb                 # walks a token tree, yielding each leaf
      lookup_builder.rb              # flattens a tree into a frozen key -> value/SemanticEntry lookup
      semantic_entry.rb              # one role's Base value + theme overrides
      bucket.rb                      # colors.primitives — one lookup, one `fetch`
      semantic_bucket.rb             # colors.semantic — adds the `theme:` axis
      errors.rb                      # UnknownTokenError, UnknownThemeError, DuplicateTokenError
  src/
    CleoDesignTokens.ts    # TypeScript reader
    generated/
      tokenKeys.ts         # generated key unions — do not hand-edit
```

## Keys

A key is the JSON path, dot-joined. Figma's authored casing is normalised to **lowerCamel**, and an all-caps segment lowercases whole:

| Figma | key segment |
| --- | --- |
| `Credit Score` | `creditScore` |
| `DataVisPrimary` | `dataVisPrimary` |
| `ShimmerAlpha 2` | `shimmerAlpha2` |
| `UI` | `ui` |
| `EWA` | `ewa` |
| `800` | `800` |

Space is the only character outside `[A-Za-z0-9]` anywhere in the tree. One helper (`buildKey`) produces `$ref` values, the collision check and the generated unions, so the three can never disagree.

The token *type* is not in the key — it's in the reader accessor (see [Consumers](#consumers)), which is what leaves room for `radii`, `typography` and `spacing` to arrive as siblings later.

## Rules

1. **Semantic roles alias primitives.** Every role has a `$ref` on its Base value and on each override, except the known gaps.
2. **All references resolve.** No alias pointing at a variable that doesn't exist, or at anything outside the primitives collection.
3. **No key resolves from more than one place within its bucket.** `primitives.json` and `semantic.json` have separate key namespaces, so the same key in both is fine. Two Figma names in one collection that normalise to the same key is not.

## Semantic namespaces

Top-level groups are `core`, `extension`, `effects`, `feature`, `surface` and `ui`. The four themes — `base`, `chat`, `roast`, `hype` — mirror Cleo's product personalities. They are **not** display modes: there is no light/dark axis here, and `roast` is already dark.

## Updating from Figma

Designers own the tokens in Figma; this package mirrors them.

1. The Figma plugin (COREEXP-323) writes `figma-exports/figma-dump.json`. That folder is gitignored — the raw dump is input, not history.
2. Run `yarn tokens:check` for a dry-run diff, or `yarn tokens:transform` to apply.
3. Review the change report and the resulting diff in `tokens/color/` and `src/generated/`, then open a PR. That PR must carry the `token-regen` label — `tokens/color/**` and `src/generated/**` are gated as generated output (see [CI](#ci)), and without the label the gate fails it by design.

### The input format

One file, `figma-exports/figma-dump.json`, **verbatim from Figma's plugin API** — nothing nested, hexed, filtered or resolved:

```json
{
  "$schema": "cleo-figma-dump/1",
  "file": { "name": "Colour Modes and Themes" },
  "collections": [
    { "id": "VariableCollectionId:1:3", "name": "Themes", "source": "local",
      "defaultModeId": "1:0", "modes": [{ "modeId": "1:0", "name": "Light" }] }
  ],
  "variables": [
    { "id": "VariableID:1:5", "name": "Base/Core/Content/Primary",
      "collectionId": "VariableCollectionId:1:3", "resolvedType": "COLOR",
      "valuesByMode": { "1:0": { "type": "VARIABLE_ALIAS", "id": "VariableID:9:7" } } }
  ]
}
```

`valuesByMode` values are either `{ r, g, b, a }` floats in 0–1 or `{ type: "VARIABLE_ALIAS", id }`. Names keep `/` separators and Figma's casing. Aliases reference variables **by id**, and the dump must include every collection an alias reaches into.

**This script owns every interpretation** — name splitting, theme extraction, RGBA→hex, alpha, alias resolution, type filtering, and the collection→file mapping. The plugin shapes nothing, so alias handling exists in exactly one place.

### Which collection becomes which file

Config, not hardcoded, because a second token type arrives later:

| Figma collection | Output | Types | Theme axis |
| --- | --- | --- | --- |
| `Base Colors` | `tokens/color/primitives.json` | `COLOR` | none |
| `Themes` | `tokens/color/semantic.json` | `COLOR` | first name segment, default `Base` |

Collections not listed are **ignored** (`Modes`, plus `Spacing`, `Radius`, `Type`, `Border`, `Surface Level`, `Image Crops` from the Component Library). Non-`COLOR` variables inside a listed collection are **skipped and counted**, not errors — `Themes` carries 18 `FLOAT` variables.

Design is migrating these roles from `Themes` to the `Modes` collection, where the theme is a real Figma mode rather than a name segment. When that lands, `themeAxis.kind` becomes `"mode"` and the emitted output is identical — a config change, not a rewrite.

### Ordering

Keys are written in a **canonical** order — alphabetical by group, numeric-aware within a group, so palette scales read `50, 100, … 1000` rather than `100, 1000, …, 50`. The order does not depend on the dump.

That matters because the dump carries Figma's own variable order. Ordering used to be inherited from it, which made output stable for identical input but not canonical across inputs: a designer reordering variables in Figma produced a whole-file diff with no value changes, burying the real ones. Leaves keep their authored key order (`$type`, `$value`, `$ref`, `$themes`) and `$themes` follows the configured theme order — both already deterministic, and both easier to read than alphabetical.

### Change policy

The transform is **additive and mutative by default, but never destructive**:

- **Adds** and **changes** — applied automatically. A changed theme override shows as a change on that role; a re-point at an identical hex still counts, since `$ref` is part of what's compared.
- **Removals** — the transform refuses to write and exits 1, listing what would go. If the removal is intentional, re-run with `yarn tokens:transform -- --allow-removals`.

### Validation

Exits 2 and writes nothing on:

- **Dangling alias id** — the target isn't in the dump at all. Names the id and its collection.
- **Dead reference** — the target exists but sits outside the primitives collection.
- **Semantic→semantic alias** — resolution is single-hop; an alias points at a primitive.
- **Ambiguous hex recovery** — a role holds a literal that 2+ primitives share, so the transform can't tell which it meant. This exists so a missing `$ref` can only ever mean "genuine palette gap".
- **Key collision** — two names in one collection normalising to the same key.

Reported as warnings, not failures: palette gaps, roles missing from Base, aliases recovered by exact-hex match, skipped types, and ignored collections. All go to **stderr**, including the success line — CI has to capture it.

## CI

`.github/workflows/tokens.yml` runs two jobs on every PR touching this package, both required to merge. `verify` covers the TypeScript side, in two layers, neither able to do the other's job:

- **Generated files are generated** (`.github/workflows/tokens.yml`, layer 1). `tokens/color/**` and `src/generated/**` must be byte-identical to the PR's merge base, checked with `git diff` rather than a fixture — a committed fixture would go red on the first real Figma change. This is what catches a hand-edit on one of the 13 primitives nothing references (`alpha.dark.75`, `blue.300/500/900`, `green.300/500/600/800`, `orange.300/600/700/900`, `yellow.600`): nothing in `semantic.json` points at them, so a value-comparison check has nothing to compare against. Skip it by applying the **`token-regen`** label — that's how a human who ran `yarn tokens:transform` and reviewed the diff (see [Updating from Figma](#updating-from-figma)) tells the gate "yes, I regenerated these". It's a different label from `figma-sync`, kept separate so a reviewer can still tell an automated sync PR from a human one — but `figma-sync.yml` applies **both** to its own PRs: `token-regen` is true there by construction (the PR's entire content is generated output), and it's what keeps layer 1 from failing if a human later pushes a follow-up commit to that PR branch (that push isn't made with `GITHUB_TOKEN`, so it *does* trigger `tokens.yml`, unlike the PR's own `opened` event — see below).
- **Invariants on the committed tree** (`yarn tokens:verify`, layer 2, every run). Layer 1 says "unchanged"; this says "correct". It rebuilds the canonical form of both JSON files and `tokenKeys.ts` and byte-compares, checks every `$ref` resolves and matches its primitive's value, and checks the two allowlists below. It's the only gate that runs on a `figma-sync` PR — see below — where the files legitimately move, so layer 1 doesn't apply.

Both allowlists live as named consts at the top of `scripts/verify-tokens.mjs`, next to the *why*, mirroring [Known exceptions](#known-exceptions):

- `PALETTE_GAP_ALLOWLIST` — the one reviewed `$ref`-less semantic entry, pinned to its hex.
- `MISSING_BASE_ALLOWLIST` — the three roles Figma defines only under `chat`.

Editing an allowlisted token, or letting an allowlist entry go stale (the gap gets fixed in Figma but the exception isn't removed), fails `tokens:verify` either way.

**A `figma-sync` PR is checked inside `figma-sync.yml`, not `tokens.yml`.** GitHub does not fire `pull_request` workflow events for actions taken with `GITHUB_TOKEN`, so `tokens.yml` never runs on the PR's own `opened` event. `figma-sync.yml` runs `tokens:verify`, `tokens:test` and `tokens:typecheck` itself, against the tree the transform just wrote, before it opens the PR — a bad export fails the sync workflow rather than landing in review. That restriction doesn't cover what happens afterwards, though: a human pushing a follow-up commit to that PR branch uses their own credentials, which does trigger `tokens.yml`'s `synchronize` event as normal — the `token-regen` label applied at creation (see above) is what keeps layer 1 from failing on that push.

**`ruby-test` covers the Ruby reader** (`cleo_design_tokens`, COREEXP-264) — `bundle exec rspec` against its own spec suite. Independent of `verify`: it doesn't touch `tokens/color` or `src/generated`, so it has no layer 1, and `figma-sync.yml` has no equivalent step, since a sync PR never touches `lib/` or `spec/`.

## Consumers

The readers (TypeScript: `@meetcleo/design-tokens`; Ruby: `cleo_design_tokens`) are the canonical way to read a value — never import `tokens/color/*.json` directly. They're namespaced by token type, then by layer, with the theme passed alongside the key:

```ruby
CleoDesignTokens.colors.semantic.fetch("core.content.primary")                  # => "#47201C"
CleoDesignTokens.colors.semantic.fetch("core.content.primary", theme: :roast)   # => "#F8F6F2"
CleoDesignTokens.colors.primitives.fetch("brown.800")                          # => "#47201C"
```

Reach for `colors.semantic` by default. A `colors.primitives` call is reaching past the semantic layer into the raw palette — legitimate in a theme adapter that re-exports a palette tier, a smell anywhere else, and usually a sign that a semantic role is missing.

`src/generated/tokenKeys.ts` type-checks the arguments on the TypeScript side and is generated, never hand-edited:

- `ColorPrimitiveKey` — 106 members
- `ColorSemanticKey` — 473 members
- `ColorTheme` — `'base' | 'chat' | 'roast' | 'hype'`

### Ruby — `cleo_design_tokens`

```ruby
CleoDesignTokens.colors.semantic.fetch("core.content.primary")                  # => "#47201C"
CleoDesignTokens.colors.semantic.fetch("core.content.primary", theme: :roast)   # => "#F8F6F2"
CleoDesignTokens.colors.primitives.fetch("brown.800")                          # => "#47201C"
```

Add to a `Gemfile`:

```ruby
gem "cleo_design_tokens", path: "path/to/cleonardo/packages/tokens"
```

```ruby
gem "cleo_design_tokens"
```

The gem is public on RubyGems.org, so Bundler and Dependabot need no registry credentials.

`colors` returns a frozen `Struct` of `primitives`/`semantic` — lowercase accessors, not `CleoDesignTokens::Colors::Semantic.fetch(...)` module nesting, so the call text stays identical to the TypeScript reader. `PRIMITIVES_LOOKUP`/`SEMANTIC_LOOKUP` are built once at load, into frozen `Hash`es (values frozen too, `SemanticEntry` structs frozen too) — safe to read from multiple threads, no lazy `||=` race. An unknown key raises `CleoDesignTokens::UnknownTokenError` rather than returning `nil`; an unknown `theme:` raises `CleoDesignTokens::UnknownThemeError`.

### TypeScript — `@meetcleo/design-tokens`

```ts
import CleoDesignTokens from "@meetcleo/design-tokens";

CleoDesignTokens.colors.semantic.fetch("core.content.primary"); // => "#47201C"
CleoDesignTokens.colors.semantic.fetch("core.content.primary", "roast"); // => "#F8F6F2"
CleoDesignTokens.colors.primitives.fetch("brown.800"); // => "#47201C"
```

Add a `meetcleo` entry to the consuming repo's `.yarnrc.yml` `npmScopes`:

```yaml
# .yarnrc.yml
npmScopes:
  meetcleo:
    npmRegistryServer: "https://npm.pkg.github.com"
```

```
yarn add @meetcleo/design-tokens
```

No auth token needed, confirmed against the real published package — this
contradicts GitHub's own docs and community reports that GitHub Packages'
npm registry requires a token for every install, even a public package's.
Verified in an environment confirmed to hold no other GH Packages
credential yarn could have picked up instead. Why it doesn't need one here
is unresolved — flag it if you're the one figuring out whether that's a
`cleonardo`-specific setting or a GitHub Packages behaviour change, rather
than assuming it'll hold for a private package too.

Theme is a plain second positional argument here, not the `theme:` keyword the Ruby reader uses — TypeScript has no equivalent that's as cheap as a positional param, and an options object (`fetch(key, { theme })`) would buy nothing. Imported as the `CleoDesignTokens` namespace, not a bare `fetch` — `import { fetch } from "@meetcleo/design-tokens"` would shadow the global `fetch` in that file.

### Versioning

`package.json`'s `version` is the single source of truth for what an installed copy of either package reports (npm requires a literal, so it can't defer to us). `lib/cleo_design_tokens/version.rb` reads it at load rather than holding its own copy — the gemspec's `spec.files` ships `package.json` alongside `lib/`, specifically so that read works from an installed gem too, not just this source checkout.

That value only matches what's actually released on `main`'s tip during the first release. After that, the committed file is a floor, not a live version — `main` is protected by a ruleset requiring a PR and a review with no bypass actors, so the release pipeline (below) can't commit a bump there without reintroducing a manual step. The **authoritative** version of any given release is its `tokens-v*` tag; the release commit that carries the matching `package.json` exists only as that tag's target, never on `main`'s history. Reading `package.json` on `main` tells you the floor a fresh checkout starts from, not the latest published version — for that, check the latest `tokens-v*` tag or the registry.

### Release

[COREEXP-334](https://cleo.atlassian.net/browse/COREEXP-334): `.github/workflows/tokens-release.yml` publishes on every merge to `main` that changes a shipped file (`tokens/color/**`, `lib/**`, `src/**`, `package.json`, the gemspec). One trigger, one version bump, one set of release notes, covering both artefacts:

* **Version and release notes** come from `scripts/plan-release.mjs`, diffing the previous `tokens-v*` tag against the tree on `main` — reusing `transform-core.mjs`'s `flatten`/`diffFlat`/`renderDiffReport`, the same functions behind the Figma-sync change report, so a colour change reads identically wherever it's described. A colour change (`primitives` or `semantic` touched) always bumps **minor**, never **patch** — `meetcleo`'s Dependabot config ignores all patch updates, so a patch-versioned colour change would never open a pull request.
* **npm** publishes to GitHub Packages using the built-in `GITHUB_TOKEN`; **RubyGems** publishes publicly to RubyGems.org using the `RUBYGEMS_API_KEY` repository secret. The gem's `allowed_push_host` points to RubyGems.org.
* **Shared version, one bump.** Both artefacts release under the same version in the same run — there's only one trigger and one colour diff to describe, and `CleoDesignTokens.colors.*` is already meant to be one vocabulary across both languages (see [Consumers](#consumers)); a version split would just be a second thing to keep in sync for no reader-visible benefit.

`tokens-v0.1.0` is the first real release, published this way.

## Known exceptions

**One palette gap.** `effects.background.glassMorphism` has no `$ref` in any theme: its value (`#00000033` — pure black at 20% alpha) matches no primitive. The closest is `alpha.dark.20` (`#0E060533`), which is Cleo's brand-black with alpha rather than pure black. Fixing it needs a design decision: add a pure-black primitive, or realign to `alpha.dark.20`.

**Three roles missing from Base.** `core.border.level0`, `core.border.level3` and `core.border.level4` exist only in the `chat` theme. They emit `$themes` with no leaf `$value`, so reading them without a theme raises. That's a gap in Figma, not in the transform — adding them to Base there fixes it.

## Colour mapping to consumers

The mapping from these tokens to existing backend/native-app consumers lives in `meetcleo/design-tokens` on branch `feature/COREEXP-320-colour-token-mapping` (`mapping/**`, `scripts/mapping.mjs`). It is re-homed into this package by a follow-up ticket — not yet done as of this move.

## History

Stood up as `meetcleo/design-tokens` ([COREEXP-263](https://cleo.atlassian.net/browse/COREEXP-263)). Moved here ([COREEXP-321](https://cleo.atlassian.net/browse/COREEXP-321)) because `cleonardo` is the declared design-system home. The original repo is archived; history is preserved there, read-only.
