# Colour mapping — existing consumers to canonical tokens

[COREEXP-320](https://cleo.atlassian.net/browse/COREEXP-320). Blocks
[COREEXP-264](https://cleo.atlassian.net/browse/COREEXP-264) (Ruby module API) and
[COREEXP-265](https://cleo.atlassian.net/browse/COREEXP-265) (token generator).

Before this, nothing recorded which token name replaces which existing colour, so the generator had
nothing correct to emit. This directory is that record.

| File                                   | What it is                                                          |
| -------------------------------------- | ------------------------------------------------------------------- |
| [`backend.json`](./backend.json)       | generated — every `meetcleo` colour entry to a token path or `null` |
| [`native-app.json`](./native-app.json) | generated — every `mobile-app` colour entry, same shape             |
| [`REPORT.md`](./REPORT.md)             | generated — the same data as readable tables                        |
| [`overrides.json`](./overrides.json)   | **hand-maintained** — the decisions the name rules can't derive     |
| `../scripts/mapping.mjs`               | the producer, and the guard that stops it rotting                   |

Regenerate, from the repo root, with the consumer repos checked out as siblings of `cleonardo`:

```sh
yarn tokens:mapping --write --meetcleo ../meetcleo --mobile-app ../mobile-app
```

The consumer paths are resolved against your working directory, so pass absolute paths if you run it
from anywhere else.

## Coverage

260 rows. Every one is either mapped or listed unmapped **with a recommendation** — nothing is
silently missing.

| Consumer                                 | Rows | Mapped | Unmapped |
| ---------------------------------------- | ---- | ------ | -------- |
| `app/helpers/color_roles_helper.rb`      | 32   | 25     | 7        |
| `app/models/user_prompt/screen_theme.rb` | 12   | 9      | 3        |
| `cocoaTheme/colors.ts` — `colors`        | 114  | 103    | 11       |
| `cocoaTheme/colors.ts` — `colorRoles`    | 102  | 93     | 9        |

"Mapped" includes 57 rows where the name resolves but the value differs — see [Value
drift](#value-drift). Drift is recorded, never hidden.

## How the mapping was derived

**By role name, not by hex.** The 1880 semantic tokens resolve to only 94 distinct hexes, and
`#47201C` alone matches 29 Base tokens, so a hex can never identify a token. It runs the other way
too: `colorRoles`' 102 entries reference only 49 distinct primitives, and `brown[100]` wears ten
role hats — including all six `dataVis*` roles, which are identical in the base theme and only
diverge under a feature theme. A value-derived mapping would have collapsed those six into one.

Hex is used for exactly two things: corroborating a name match, and surfacing drift.

Name rules, all in `scripts/mapping.mjs`:

- **App palette to primitives** — group rename, leaf preserved. `red`→`Red`,
  `whiteAlpha`→`Alpha.Light`, `blackAlpha`→`Alpha.Dark`, `black`/`white`→`Monotone.Black`/`White`.
- **App roles to semantic** — `colorRoles.<kind>.<leaf>` to `Base.<top>.<Kind>.<Leaf>`, resolving
  `Core` before `Extension` before `Effects` before `Surface`. `UI.*` and `Feature.*` are excluded
  by design; they're in the [gap list](#gap-list).
- **Backend constants to semantic** — same resolution, through the alias table below.
- **`screen_theme.rb`** — these are values, not roles, so there's no name to map. Each resolves to
  a unique primitive by hex; `semanticCandidates` in the JSON lists the Base tokens sharing that
  value for design to pick from.

## Namespace decision

**`Base`, for both consumers.**

`cocoaTheme` is the app's base theme — `ThemeProvider.tsx:12` hardcodes it, there's no switcher and
no light/dark mode. The backend ships raw hex with no personality axis on these constants.

Adding the other namespaces later is cheap: Base/Chat/Roast/Hype share **469 of ~470 token names**
and differ only in values (Chat 27 differing leaves, Hype 135, Roast 171). It's one name mapping
with four value sets, not four mappings.

What has to be resolved first is that the personality axis doesn't line up three ways:

| Source                                                | Values                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Tokens                                                | `Base`, `Chat`, `Roast`, `Hype`                                                             |
| Backend — `app/models/chat/ui_configuration.rb:39-47` | `normal`, `roast`, `hype` — no `chat`, no `base`, and `normal` is excluded from `AVAILABLE` |
| App — `theme/featureThemes/`                          | `chat`, `roastMode`, `hypeMode`, **`matrixMode`**                                           |

The app matches the token namespaces except for the extra `matrixMode`. The backend doesn't line up
at all — and its personality colours aren't in code: `ToneOfVoice` resolves to a `chat_themes` row
(11 colour columns) plus a `tone_of_voice_sharing_configurations.data` row (14 more). That hex lives
in production data, editable in Halo, and no generator reaches it.

Worth noting the backend already ships the theme **name** to the client rather than hex
(`ui_configuration.rb:246,294,329`) — the end state this epic wants everywhere.

## Naming-convention delta, and what aligning would cost

The AC asks not just for the delta but for what a rename sweep would look like if we aligned rather
than preserved. **Recommendation: still preserve** — constant-path preservation is already scoped
into COREEXP-265, and the sweep buys nothing the generator needs. But it's affordable, so here's
the sizing rather than a shrug.

**Delta.** Tokens use PascalCase groups, numeric scales, and _spaces_ in leaves (`Credit Score`,
`Level 0`, `Icon Foreground`). The backend uses `SCREAMING_SNAKE` in nested modules. The app uses
camelCase in nested objects.

There's a fourth difference that only shows up once you try to map: **word order**. The legacy
backend tier puts the modifier first (`LIGHT_ACCENT`, `INVERSE_PRIMARY`); tokens and the app put it
last (`AccentLight`, `PrimaryInverse`). The `Rebrand::` tier already switched to the token order, so
both spellings live in one file. That's why `BE_LEAF_ALIASES` in `scripts/mapping.mjs` exists and
lists both — it _is_ the delta, in executable form.

**Sweep cost.**

| Side    | Files touched                                         | Note                                                                                                                                          |
| ------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend | 8 (7 app + 1 test), 37 call sites                     | small and mechanical; all SDUI except one serializer                                                                                          |
| App     | 77 — 31 importing `colorRoles`, 46 importing `colors` | the ~1472 files using `useGlobalTheme` are **not** touched, because they read role names through the hook rather than importing the constants |

That last row is what makes the sweep cheap, and it's the fact worth keeping: the app's hook
indirection already absorbs a rename.

Space-bearing token leaves are a normalisation hazard for the emitters in COREEXP-265 — flagging,
not fixing, here.

## Backend: 41% of `ColorRolesHelper` is dead

The helper is never `include`d; every call site fully qualifies the constant, so the counts in
`backend.json` are exact rather than approximate. 37 references in app code, 1 in a test, across 8
files.

| Group             | Count                 | Disposition                                                               |
| ----------------- | --------------------- | ------------------------------------------------------------------------- |
| `Rebrand::*`      | 6, all live (17 refs) | **all 6 map cleanly to `Base.Core.*` / `Base.Extension.*`, hex included** |
| pre-rebrand, live | 13 (19 refs)          | name resolves, value doesn't — per-constant call for review               |
| pre-rebrand, dead | **13, zero refs**     | delete; no design decision needed                                         |

Deleting the dead 13 removes most of the "no matching token" problem outright.

Two things to hand on:

- `app/models/user_prompt/prompts/subscription_payment_modal/throttled_mobile_plan.rb` — 14 refs,
  **mixing legacy and `Rebrand` constants in one file**. The sharp end of repoint-or-delete.
- `app/serializers/debt/refinance_attempt_with_engine_personal_loan_sdk_serializer.rb:28` — hands
  `Content::PRIMARY` to a third-party SDK. The one call site where a colour leaves Cleo.

One pre-rebrand constant maps with no drift at all: `Background::LIGHT_NEGATIVE` (`#FFC3B6` =
`Red.100`) kept its value across the rebrand.

## Value drift

57 rows resolve by name but differ in value. Three kinds:

| Kind             | Rows | What it means                                         |
| ---------------- | ---- | ----------------------------------------------------- |
| `alpha-base`     | 33   | one decision — see below                              |
| `pre-rebrand`    | 16   | legacy backend constant still on the old palette      |
| `value-mismatch` | 8    | needs a look; each carries a note in `overrides.json` |

**`pre-rebrand` drift is cross-hue, not a shade off.** Don't read those 16 rows as near-matches:
`Content::SECONDARY` is `#4E5969` against `Core.Content.Secondary` `#5B3935` — grey to brown, a
different hue family entirely. The name is the right target; the value is a different palette. That's
why these need per-constant review rather than a bulk adopt.

**The alpha-base decision covers 33 rows on its own.** The app builds its alpha ramps on pure
`#FFFFFF`/`#000000`; the tokens build on brand-tinted `#FFFEFB`/`#0E0605`. That accounts for 14
primitive rows and 19 role rows. The same question settles the four
`Effects.Background.GlassMorphism` exceptions already documented in [`../README.md`](../README.md) (hardcoded
`#00000033`, nearest primitive `Alpha.Dark.20` = `#0E060533`). One answer, 37 rows.

The 8 `value-mismatch` rows, for the record: `yellow.50` is `#FDF0C5` against `Yellow.50`
`#FAEFC5` — two digits transposed, and `content.warningLight` inherits it. Five `dataVis*` roles
are placeholders in the app (all six share `brown[100]`) where the tokens carry a real Brown ramp.
`border.selected` uses `brown[700]` where the token uses `Brown.800` — one step apart, so a real
divergence rather than a slip.

## Recommendations

Framed as _add a primitive_ vs _realign to an existing one_, per the AC. No tickets filed from this
spike — these are for triage.

### For design

| Question                                    | Add a primitive                                                  | Realign                                                  | Recommendation                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Alpha base (33 rows + 4 GlassMorphism)      | add pure-white/black alpha ramps alongside the brand-tinted ones | realign to the existing `Alpha.Light.*` / `Alpha.Dark.*` | **realign** — accept the visual shift, get sign-off                                            |
| `background.dataVisSenary`                  | add a 6th DataVis token                                          | drop the role                                            | **drop** — all six DataVis roles share one value today                                         |
| `border.selected`                           | —                                                                | realign to `Brown.800`                                   | realign, but confirm the darker border is intended                                             |
| `screen_theme` `upsell_feature_promotion_3` | —                                                                | realign to the rebrand palette                           | realign or drop the variant — an old-palette campaign value leaked into a semantic theme table |

### No design input needed

- **Delete** — the 13 zero-reference `ColorRolesHelper` constants, and `colors.gray.*` (11 values,
  `@deprecated`, **zero live usages** — its hexes survive only in generated SVGs). Don't add
  primitives for either.
- **Realign** — `colors.yellow.50` to the token value; that fixes `content.warningLight` too.
- **Realign** — `background.navbar` to `Core.Background.Primary`. It's `brown[50]`, byte-identical
  to `background.primary`; the role carries no distinct value.
- **Drop** — the deprecated app roles `content.onColor{Inverse,Transparent,InverseOpaque}` and
  `border.disabled{,Light,Dark}`. One caveat: `content.onColor` is still live in
  `Button/constants/colors.ts`, so migrate those four call sites to `content.onColorLight` first.
- **Delete** — `Background::INVERSE_TRANSPARENT`. Zero references, and its value is `'FFFFFF33'`:
  no leading `#`, 8 digits. Also the concrete case COREEXP-324 exists for.
- **Decide** — `Border::ACCENT` has 1 live call site and no token to map to (tokens split accent
  into Light/Mid/Dark). Pick one with design, or delete it with the rest.

### Back to design, token side

Authoring inconsistencies found while mapping, none blocking:

- `Chat` carries `Core.Border.Level 0/3/4` — Surface-level names leaking into Core.
- `Effects.Border.ShimmerAlpha 2` exists only in `Base`.
- Several leaves contain spaces.

### Correcting the record

`offWhite` is a false alarm. `#F8F6F2` **is** `Brown.50`, in both the token primitives and
`colors.ts:157`. The `cleonardo` PR #18 comment "This colour is not in the tokens sadly" was wrong.
No primitive needed.

## Scope

### In

The two files the ticket names, plus `app/models/user_prompt/screen_theme.rb` — ruled in because its
values already _are_ the rebrand palette (`#DED9D4`=Brown.200, `#47201C`=Brown.800,
`#F8F6F2`=Brown.50, `#F0EDEA`=Brown.100, `#D7ECA7`=Green.100). 9 of its 12 values map to a unique
primitive with no drift.

### Out, and why

| Surface                              | Call                                 | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/helpers/misc_colors_helper.rb`  | out                                  | 56 constants, self-described at `:5-6` as an audit of colours that deliberately _aren't_ brand or CDS. There is nothing in the token set to map them to — that's the point of the file. Not structurally out of reach, though: its two biggest consumers resolve in Ruby, not in the database (`transaction_category.rb:103-115` `CATEGORY_ID_TO_COLOR`, a frozen constant map that also pulls in `BrandColorsHelper::SOFT_CREAM`, and `:344-364` `self.colour`, a read-time lookup). A generator could reach them in a later pass once the palette has category colours to offer. |
| `.../authorization_form/styling.rb`  | out of the mapping, in as a 265 note | Prawn needs bare 6-hex with no `#` — an emitter-format problem. Also the only backend code that resolves a colour through a runtime brand branch (`ProductFeatures::GlobalRebrand`, `:30-32`), i.e. the closest thing we have to a theme switch.                                                                                                                                                                                                                                                                                                                                   |
| `app/helpers/brand_colors_helper.rb` | out                                  | The deprecated predecessor `color_roles_helper.rb:7` points at. 37 constants, 87 references across 26 files, 16 of them dead. **Hazard, confirmed:** `brand_colors_helper.rb:50` `SEMANTIC_COLORS_CORE_CONTENT_ACCENT = '#F2F3F5'` is the value of `ColorRolesHelper::Background::TERTIARY` (`:17`), and `:51` `SEMANTIC_COLORS_CORE_BACKGROUND_TERTIARY = '#00005D'` is the value of `ColorRolesHelper::Content::ACCENT` (`:24`). The two names are transposed, so don't map by name across the two helpers.                                                                      |
| DB-resident colours                  | out                                  | `chat_themes` (11 columns), `tone_of_voice_sharing_configurations.data` (14), `transaction_categories.color`, `provider_templates`. Admin-editable; no grep finds them and no generator reaches them.                                                                                                                                                                                                                                                                                                                                                                              |
| The wider backend hex surface        | out                                  | 256 `'#RRGGBB'` occurrences across 29 `.rb` files in `app/` + `lib/`; 110 of them sit in `app/models/user_prompt/**`. Plus a family the `'#` grep misses entirely: 46 inline-Prawn `<color rgb='…'>` sites across 16 PDF services, and bare `RRGGBB` table fills.                                                                                                                                                                                                                                                                                                                  |

### Gap list — token groups with a consumer, but not in an in-scope file

Recording these because the alternative is a mapping that _looks_ complete:

| Token group               | Consumer                                                                                                                                                                      | Why not here                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UI.Buttons.*` (250)      | `Button/constants/colors.ts` — 151 `colorRoles`-derived leaf entries across variant × palette × theme × slot                                                                  | second-order: derives from roles this mapping already covers                                                                                              |
| `UI.Input.Text.*` (35)    | `BaseInputField/hooks.ts`, `InputField/hooks.ts` — ~15-20 inline state-to-role pairs                                                                                          | no extractable named set to map against yet                                                                                                               |
| `Feature.*` (68)          | app `featureThemes/{budget,savings,challenges,ewa,creditScore}.tsx`; backend `app_themes.rb` (`EWA_FEATURE_THEME`, `CHALLENGES_FEATURE_THEME`, 25 hexes, already DTCG-shaped) | separate consumer file set. The 5 app files say "WIP just for Storybook" but are live in production. `CHALLENGES_FEATURE_THEME` has zero production refs. |
| `Chat` / `Roast` / `Hype` | app `featureThemes/{chat,roastMode,hypeMode}.tsx`; backend = DB rows                                                                                                          | blocked on the personality mismatch above                                                                                                                 |

## Notes for downstream tickets

**COREEXP-265 / 327, TypeScript emitter.** The drift is type-level, not only value-level.
`colors.ts:302` — `CocoaPalette = valueof<Colors[keyof Colors]> | '#000000' | '#FFFEFB'` — hardcodes
both literals, and `colors.black = '#000000'` against `Monotone.Black = #0E0605`. Adopting token
values makes that union stale and shifts anything comparing against `colors.black`. Separately,
`gray` is excluded from `CocoaColors` but included in `CocoaPalette`, so its hexes stay type-legal
everywhere. This changes emit shape, not just hex.

**COREEXP-265, Ruby emitter.** Must emit Prawn-safe bare hex for the PDF surfaces, or they stay
hand-maintained. Four incompatible formats exist in the backend today: `#RRGGBB`, `#RRGGBBAA`
(`screen_theme.rb:33`), bare `RRGGBBAA` (`color_roles_helper.rb:18`), and bare `RRGGBB` for Prawn.

**COREEXP-264, Ruby module API.** The `null` rows are the surface it must not expose yet.
`app/models/user_prompt/component/style_props.rb` is where validation could land —
`background_color`, `border_color` and `shadow` are `nil`-defaulted kwargs passed verbatim to the
client with no type check, format validation, or allowlist.

**COREEXP-324, alpha and 8-digit hex.** `color_roles_helper.rb:18` and `screen_theme.rb:33` are its
two concrete cases.

**COREEXP-328, app hand-edit guard.** Enforcement is weaker than it looks:
`custom/no-hardcoded-colors` is severity `warn` (`eslint.config.mjs:135`), the generated-SVG folders
aren't ignored (981 + 481 hex literals sit there), and `gradients.ts:57` hardcodes `#AF502A` while
evading the rule because the hex is an array element rather than a property value.

## Keeping this honest

`cleonardo` has no `.github/` and no consumer source of its own, so the two guards have
different reach. Saying so matters — a guard you think is armed and isn't is worse than no guard.

| Command                                                       | Needs               | Checks                                                                             | Runs where                                            |
| ------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `yarn tokens:check:mapping`                                   | only `tokens/`      | every mapped token path still exists and still resolves to the recorded value      | anywhere, including whatever CI COREEXP-322 stands up |
| `yarn tokens:check:consumers --meetcleo <p> --mobile-app <p>` | both consumer repos | every consumer entry has a row; no row or override points at something that's gone | developer-run until COREEXP-322 gives it a home       |

Both are also available inside the package as `yarn check:tokens` / `yarn check:consumers`. The root
names are prefixed `tokens:` to match how COREEXP-321 wired `tokens:transform` and `tokens:check`.

Both fail loudly rather than warn. Verified by breaking each on purpose: a dangling token path, a
new consumer constant with no row, and a stale `overrides.json` key each exit non-zero.
