# @cleonardo/tokens

Canonical source of truth for Cleo's design tokens.

Every downstream consumer — the generator, the Ruby module, the User Prompt pilot, product surfaces — is (or will be) produced from what lives here.

## Current scope

**Colour only** (primitives + semantic). Radii, typography, spacing, and other token types land in follow-up tickets.

## Format

Every leaf token has `$type: "color"` and a `$value` that is always a fully-resolved hex string — consumers never follow a reference. Semantic leaves also carry a `$ref`: the fetch key (see [Consumers](#consumers)) of the primitive the value came from.

```json
"Primary": { "$type": "color", "$value": "#47201C", "$ref": "brown.800" }
```

Primitives carry `$value` alone — a self-ref on a primitive carries no information. A semantic entry with **no** `$ref` is a palette gap, not a bug in the transform — see [Known exceptions](#known-exceptions).

## Layout

```
packages/tokens/
  tokens/
    color/
      primitives.json   # Base Palette — resolved hex values
      semantic.json      # Semantic layer — resolved hex + ref back to the primitive
  scripts/
    transform.mjs         # Figma-export -> committed-JSON transform (CLI driver)
    transform-core.mjs    # pure transform logic, imported by transform.mjs and its tests
  src/
    generated/
      tokenKeys.ts         # generated key unions, one per bucket — do not hand-edit
```

`$ref` values (and `src/generated/tokenKeys.ts`) are fetch keys: the JSON path with the `color.primitives.` / `color.semantic.` prefix stripped, lowercased, dot-joined — e.g. `color.primitives.Brown.800` → `brown.800`. This is the same rule the readers use. The token type isn't in the key; it's in the reader accessor (see [Consumers](#consumers)), which is what leaves room for `radii`, `typography` and `spacing` to arrive as siblings later.

Naming is preserved as authored in Figma (PascalCase groups, palette scales like `500`, `800`). Downstream consumers can normalise casing if they need to.

Scripts need only Node 18+ (the `>=20` pin carried over from `design-tokens` was aspirational — the real floor is Node 16.6, `Array.prototype.at()`). With no `workspaces` key in the root `package.json`, Yarn never reads this package's `engines` field — it's documentation, not enforcement.

## Rules

1. **Semantic tokens alias primitives.** Every semantic entry has a `$ref`, except the known gaps — see [Known exceptions](#known-exceptions). (Every `$value` is a literal hex now, including semantic entries; `$ref` is what carries the alias intent.)
2. **All references resolve.** No dead aliases pointing at primitives that don't exist.
3. **No key resolves from more than one place within its bucket.** `primitives.json` and `semantic.json` have separate key namespaces, so the same key in both is fine — but two paths in one file that differ only in case would collapse to one fetch key, and that fails the transform.

Checked whenever this package is updated. See [Known exceptions](#known-exceptions) below for the four semantic tokens that currently have no `$ref` (real palette gaps, not authoring mistakes).

## Semantic namespaces

The semantic layer has four top-level namespaces mirroring Cleo's product surfaces / personalities:

- `Base` — default
- `Chat`, `Roast`, `Hype` — personality-scoped overrides

These are semantic groupings, not display modes.

## Updating from Figma

Designers own the tokens in Figma; this package mirrors them.

1. Export the two Figma Variables collections (primitives + semantic) as JSON.
2. Drop them into `figma-exports/` in this package, named `primitives.json` and `semantic.json`. (This folder is gitignored — the raw exports are input, not history.)
3. Run `yarn tokens:check` for a dry-run diff, or `yarn tokens:transform` to apply.
4. Review the change report and the resulting diff in `tokens/color/`, then open a PR.

### Change policy

The transform is **additive and mutative by default, but never destructive**:

- **Adds** (new tokens in Figma) — applied automatically.
- **Changes** (same token, different value or reference) — applied automatically.
- **Removals** (token gone from Figma) — the transform refuses to write and exits non-zero, listing what would be removed. If the removal really is intentional, re-run with `yarn tokens:transform -- --allow-removals` to acknowledge and apply.

This guards against accidental Figma export mistakes silently deleting tokens that consumers depend on. Removal always needs a human "yes".

### Validation

The transform also fails on:

- **Dead references** — a semantic token aliasing a primitive that no longer exists. Fix the Figma export and re-run.
- **Semantic→semantic aliases** — resolution is single-hop only; an alias must point at a primitive, not another semantic token.
- **Key collisions** — two paths within one file collapsing to the same fetch key (they differ only in case). Across the two files is fine; they're separate namespaces.
- **Ambiguous hex recovery** — a semantic token has a raw hex with no alias, and 2+ primitives share that exact hex. A ref-less entry must never mean "the transform couldn't decide" — a genuine palette gap only exists when *no* primitive matches.
- **Missing input files** — `figma-exports/{primitives,semantic}.json` must both exist.

It surfaces (as warnings, not failures):

- **Hardcoded (ref-less) semantic tokens** — see [Known exceptions](#known-exceptions).
- **Auto-recovered aliases** — semantic tokens Figma exported as raw hex that exactly matched exactly one primitive; the transform restores the `$ref`.

## Consumers

The readers (TypeScript: `@meetcleo/design-tokens`; Ruby: `cleo_design_tokens`) are the canonical way to read a token's resolved value — never import `tokens/color/*.json` directly. They're namespaced by token type, then by layer:

```ruby
CleoDesignTokens.colors.semantic.fetch("base.core.content.primary")  # => "#47201C"
CleoDesignTokens.colors.primitives.fetch("brown.800")               # => "#47201C"
```

Reach for `colors.semantic` by default. A `colors.primitives` call is reaching past the semantic layer into the raw palette — legitimate in a theme adapter that re-exports a palette tier, and a smell anywhere else, usually meaning a semantic token is missing.

`src/generated/tokenKeys.ts` type-checks the key argument on the TypeScript side, with one union per bucket — `ColorPrimitiveKey` and `ColorSemanticKey` — so a primitive key can't be passed to the semantic reader. It's generated by this package's transform, never hand-edited.

## Known exceptions

Four semantic tokens in `semantic.json` have no `$ref` — they're a genuine palette gap rather than an authoring mistake, because their value (`#00000033` — pure black at 20% alpha) has no matching primitive:

- `color.semantic.Base.Effects.Background.GlassMorphism`
- `color.semantic.Chat.Effects.Background.GlassMorphism`
- `color.semantic.Roast.Effects.Background.GlassMorphism`
- `color.semantic.Hype.Effects.Background.GlassMorphism`

The closest primitive is `Alpha.Dark.20` (`#0E060533`), but that's Cleo's brand-black with alpha, not pure black. Fixing this needs a design decision: either add a pure-black primitive, or realign these to `Alpha.Dark.20`.

## Colour mapping to consumers

The mapping from these tokens to existing backend/native-app consumers lives in `meetcleo/design-tokens` on branch `feature/COREEXP-320-colour-token-mapping` (`mapping/**`, `scripts/mapping.mjs`). It is re-homed into this package by a follow-up ticket — not yet done as of this move.

## History

Stood up as `meetcleo/design-tokens` ([COREEXP-263](https://cleo.atlassian.net/browse/COREEXP-263)). Moved here ([COREEXP-321](https://cleo.atlassian.net/browse/COREEXP-321)) because `cleonardo` is the declared design-system home. The original repo is archived; history is preserved there, read-only.
