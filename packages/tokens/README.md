# @cleonardo/tokens

Canonical source of truth for Cleo's design tokens.

Every downstream consumer — the generator, the Ruby module, the User Prompt pilot, product surfaces — is (or will be) produced from what lives here.

## Current scope

**Colour only** (primitives + semantic). Radii, typography, spacing, and other token types land in follow-up tickets.

## Format

[DTCG JSON](https://www.designtokens.org/tr/drafts/format/) (Design Tokens Community Group format). Every leaf token has `$type: "color"` and a `$value` that is either a hex string (primitives) or a `{…}` reference (semantic).

## Layout

```
packages/tokens/
  tokens/
    color/
      primitives.json   # Base Palette — hex values
      semantic.json      # Semantic layer — aliases into primitives
  scripts/
    transform.mjs         # Figma-export -> committed-JSON transform
```

Reference paths mirror the JSON structure, e.g. `{color.primitives.Brown.800}`. The `color.` prefix leaves room for `radius.`, `typography.`, `spacing.` etc. to slot in cleanly later.

Naming is preserved as authored in Figma (PascalCase groups, palette scales like `500`, `800`). Downstream consumers can normalise casing if they need to.

Scripts need only Node 18+ (the `>=20` pin carried over from `design-tokens` was aspirational — the real floor is Node 16.6, `Array.prototype.at()`). With no `workspaces` key in the root `package.json`, Yarn never reads this package's `engines` field — it's documentation, not enforcement.

## Rules

1. **Semantic tokens alias primitives.** No hardcoded hex in `semantic.json` — every `$value` is a `{…}` reference to a primitive.
2. **All references resolve.** No dead aliases pointing at primitives that don't exist.

Both are checked whenever this package is updated. See [Known exceptions](#known-exceptions) below for the four semantic tokens that currently violate rule 1 (real palette gaps, not authoring mistakes).

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
- **Missing input files** — `figma-exports/{primitives,semantic}.json` must both exist.

It surfaces (as warnings, not failures):

- **Hardcoded semantic tokens** — see [Known exceptions](#known-exceptions).
- **Auto-recovered aliases** — semantic tokens Figma exported as raw hex that exactly matched a primitive; the transform restores the alias.

## Consumers

**Nothing consumes this repo yet.** The generator, Ruby module, and other consumer wiring land in follow-up tickets. Don't import these JSON files directly into product code — wait for the generated artefact.

[`mapping/`](./mapping/) records which token name replaces which existing colour in `meetcleo` and `mobile-app` ([COREEXP-320](https://cleo.atlassian.net/browse/COREEXP-320)). It's the input the generator reads instead of re-deriving the mapping, and `yarn tokens:check:mapping` keeps it honest against changes here.

## Known exceptions

Four semantic tokens in `semantic.json` are hardcoded rather than aliased, because their value (`#00000033` — pure black at 20% alpha) has no matching primitive:

- `color.semantic.Base.Effects.Background.GlassMorphism`
- `color.semantic.Chat.Effects.Background.GlassMorphism`
- `color.semantic.Roast.Effects.Background.GlassMorphism`
- `color.semantic.Hype.Effects.Background.GlassMorphism`

The closest primitive is `Alpha.Dark.20` (`#0E060533`), but that's Cleo's brand-black with alpha, not pure black. Fixing this needs a design decision: either add a pure-black primitive, or realign these to `Alpha.Dark.20`.

## Colour mapping to consumers

The mapping from these tokens to existing backend/native-app consumers lives in `meetcleo/design-tokens` on branch `feature/COREEXP-320-colour-token-mapping` (`mapping/**`, `scripts/mapping.mjs`). It is re-homed into this package by a follow-up ticket — not yet done as of this move.

## History

Stood up as `meetcleo/design-tokens` ([COREEXP-263](https://cleo.atlassian.net/browse/COREEXP-263)). Moved here ([COREEXP-321](https://cleo.atlassian.net/browse/COREEXP-321)) because `cleonardo` is the declared design-system home. The original repo is archived; history is preserved there, read-only.
