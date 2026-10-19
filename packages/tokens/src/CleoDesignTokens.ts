import type { ColorPrimitiveKey, ColorSemanticKey, ColorTheme } from './generated/tokenKeys';
import primitives from '../tokens/color/primitives.json' with { type: 'json' };
import semantic from '../tokens/color/semantic.json' with { type: 'json' };
import refreshPatch from '../tokens/patches/refresh.json' with { type: 'json' };

export class UnknownTokenError extends Error {}
export class UnknownThemeError extends Error {}
export class UnknownPaletteError extends Error {}
export class DuplicateTokenError extends Error {}

// `current` is the palette as generated from Figma; any other palette is a
// hand-authored patch over it (tokens/patches/*.json) — only the primitives
// whose value changes. Semantic roles follow their `$ref` into the patch, so
// every theme's overrides pick a patch up with no per-role data.
export type ColorPalette = 'current' | 'refresh';

export interface PaletteOptions {
  readonly palette?: ColorPalette;
}

const THEMES: ReadonlySet<string> = new Set(['base', 'chat', 'roast', 'hype']);
const SPACING_BASE_UNIT_PX = 4;
const RELATIVE_UNIT_BASE_PX = 16;

export type SpacingUnit = 'px' | 'rem' | 'em';

export interface SpacingOptions {
  readonly unit?: SpacingUnit;
}

function spacing(multiplier: 'auto', options?: SpacingOptions): 'auto';
function spacing(multiplier: number, options?: { readonly unit?: undefined }): number;
function spacing(multiplier: number, options: { readonly unit: SpacingUnit }): string;
function spacing(multiplier: number | 'auto', options?: SpacingOptions): number | string;
function spacing(multiplier: number | 'auto', options: SpacingOptions = {}): number | string {
  const { unit } = options;
  if (unit !== undefined && unit !== 'px' && unit !== 'rem' && unit !== 'em') {
    throw new RangeError(`spacing unit must be one of "px", "rem", "em"; received ${String(unit)}`);
  }

  if (multiplier === 'auto') return 'auto';

  const pixels = multiplier * SPACING_BASE_UNIT_PX;
  if (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || !Number.isInteger(pixels)) {
    throw new RangeError(`spacing multiplier must be "auto" or a finite multiple of 0.25; received ${String(multiplier)}`);
  }

  if (unit === undefined) return pixels;
  if (unit === 'px') return `${pixels}px`;

  // `pixels` is integral, so division by 16 (a power of two) has an exact
  // binary representation. Stringifying it therefore cannot expose a
  // floating-point rounding artifact.
  return `${pixels / RELATIVE_UNIT_BASE_PX}${unit}`;
}

// A leaf is `{ $type: "color", ... }` — matches transform-core.mjs's `isLeaf`
// exactly. A role can carry `$themes` and no `$value` at all (defined only
// under a theme, missing from Base in Figma), so `$value` presence is never
// part of this check.
function isLeaf(node: Record<string, unknown>): boolean {
  return node.$type === 'color';
}

// Walks a token tree, skipping `$`-prefixed keys, collecting leaves. Keys are
// the JSON path, dot-joined — the files carry no `color.primitives`/
// `color.semantic` wrapper to strip, and segments are already normalised on
// disk, so there's nothing left for the reader to do to a path.
function walk(node: unknown, path: readonly string[], onLeaf: (path: readonly string[], leaf: Record<string, unknown>) => void): void {
  // Mirrors transform-core.mjs's `walk`: arrays aren't a token tree shape,
  // and without this check `Object.entries` would walk array indices as if
  // they were object keys.
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return;

  const record = node as Record<string, unknown>;
  if (isLeaf(record)) {
    onLeaf(path, record);
    return;
  }

  for (const [childKey, childValue] of Object.entries(record)) {
    if (childKey.startsWith('$')) continue;
    walk(childValue, [...path, childKey], onLeaf);
  }
}

// Flattens one token tree of plain (theme-free) leaves — e.g. `primitives.json`
// — into a key -> hex lookup. Exposed as a function, rather than baked into
// module load, so the collision case is testable against fixtures.
export function buildLookup(tree: unknown): Record<string, string> {
  const lookup: Record<string, string> = {};
  const origins: Record<string, string> = {};
  walk(tree, [], (path, leaf) => {
    const key = path.join('.');
    if (Object.prototype.hasOwnProperty.call(lookup, key)) {
      throw new DuplicateTokenError(`duplicate design token ${JSON.stringify(key)}: defined at both ${origins[key]} and ${path.join('.')}`);
    }
    lookup[key] = leaf.$value as string;
    origins[key] = path.join('.');
  });
  return lookup;
}

// One semantic role: its Base value (absent when the role only exists under
// a theme) plus whatever theme overrides genuinely differ from Base, each with
// the primitive it came from — what a palette patch is applied through.
export interface SemanticEntry {
  readonly value: string | undefined;
  readonly ref: string | undefined;
  readonly themes: Readonly<Record<string, string>>;
  readonly themeRefs: Readonly<Record<string, string | undefined>>;
}

// Flattens `semantic.json` into a key -> SemanticEntry lookup, one entry per
// role — the theme axis lives inside the entry, not in the key, so this has
// the same 473 entries as ColorSemanticKey, not one per role-theme pair.
export function buildSemanticLookup(tree: unknown): Record<string, SemanticEntry> {
  const lookup: Record<string, SemanticEntry> = {};
  const origins: Record<string, string> = {};
  walk(tree, [], (path, leaf) => {
    const key = path.join('.');
    if (Object.prototype.hasOwnProperty.call(lookup, key)) {
      throw new DuplicateTokenError(`duplicate design token ${JSON.stringify(key)}: defined at both ${origins[key]} and ${path.join('.')}`);
    }

    const themes: Record<string, string> = {};
    const themeRefs: Record<string, string | undefined> = {};
    const rawThemes = (leaf.$themes as Record<string, { $value: string; $ref?: string }> | undefined) ?? {};
    for (const [theme, override] of Object.entries(rawThemes)) {
      themes[theme] = override.$value;
      themeRefs[theme] = override.$ref;
    }

    lookup[key] = Object.freeze({
      value: typeof leaf.$value === 'string' ? leaf.$value : undefined,
      ref: typeof leaf.$ref === 'string' ? leaf.$ref : undefined,
      themes: Object.freeze(themes),
      themeRefs: Object.freeze(themeRefs),
    });
    origins[key] = path.join('.');
  });
  return lookup;
}

// What a caller gets for (role, theme): the theme's override when it has
// one, otherwise the Base value — mirrors transform-core.mjs's
// `resolveTheme` exactly — plus the primitive that value came from. `value`
// is undefined when neither exists, which is what makes `fetch` raise for the
// Base-less roles.
function resolveTheme(entry: SemanticEntry, theme: string): { value: string | undefined; ref: string | undefined } {
  if (entry.themes[theme] !== undefined) return { value: entry.themes[theme], ref: entry.themeRefs[theme] };
  return { value: entry.value, ref: entry.ref };
}

export type Palettes = Readonly<Record<string, Readonly<Record<string, string>>>>;

function paletteFor(palettes: Palettes, options: PaletteOptions): Readonly<Record<string, string>> {
  const palette = options.palette ?? 'current';
  const patch = palettes[palette];
  if (patch === undefined) {
    throw new UnknownPaletteError(`unknown palette: ${JSON.stringify(palette)}`);
  }
  return patch;
}

// A bucket wraps one frozen lookup with a single-argument `fetch`. Exposed as
// a function, rather than baked into module load, so tests can build one
// over a fixture lookup exactly like the module's own buckets below.
export function makePrimitiveBucket(lookup: Record<string, string>, palettes: Palettes = PALETTES) {
  return {
    fetch(key: ColorPrimitiveKey, options: PaletteOptions = {}): string {
      const patch = paletteFor(palettes, options);
      const value = lookup[key];
      if (value === undefined) {
        throw new UnknownTokenError(`unknown design token: ${JSON.stringify(key)}`);
      }
      return patch[key] ?? value;
    },
  };
}

// `theme` defaults to `'base'` — `$themes` never carries a `'base'` entry
// (Base isn't an override of itself), so the default and an explicit
// `theme: 'base'` resolve identically with no special-casing.
export function makeSemanticBucket(lookup: Record<string, SemanticEntry>, palettes: Palettes = PALETTES) {
  return {
    fetch(key: ColorSemanticKey, theme: ColorTheme = 'base', options: PaletteOptions = {}): string {
      if (!THEMES.has(theme)) {
        throw new UnknownThemeError(`unknown theme: ${JSON.stringify(theme)}`);
      }
      const patch = paletteFor(palettes, options);

      const entry = lookup[key];
      if (entry === undefined) {
        throw new UnknownTokenError(`unknown design token: ${JSON.stringify(key)}`);
      }

      const { value, ref } = resolveTheme(entry, theme);
      if (value === undefined) {
        throw new UnknownTokenError(
          `design token ${JSON.stringify(key)} has no Base value and no override for theme ${JSON.stringify(theme)}`,
        );
      }
      return (ref !== undefined ? patch[ref] : undefined) ?? value;
    },
  };
}

// Built at module load into frozen objects — not lazily on first access, so
// reads are safe from multiple threads/requests with no init race.
export const PRIMITIVES_LOOKUP: Record<string, string> = Object.freeze(buildLookup(primitives));
export const SEMANTIC_LOOKUP: Record<string, SemanticEntry> = Object.freeze(buildSemanticLookup(semantic));
export const PALETTES: Palettes = Object.freeze({
  current: Object.freeze({}),
  refresh: Object.freeze({ ...refreshPatch.primitives }),
} satisfies Record<ColorPalette, Readonly<Record<string, string>>>);

// Namespaced by token type (`colors`), then by layer (`primitives`,
// `semantic`) — no selector argument, no top-level `fetch` defaulting to
// semantic. `spacing` is code-owned rather than Figma-generated. Theme is a second, optional argument on the semantic reader
// only — the primitive palette has one value per key:
//
//   CleoDesignTokens.colors.semantic.fetch('core.content.primary')
//   CleoDesignTokens.colors.semantic.fetch('core.content.primary', 'roast')
//   CleoDesignTokens.colors.semantic.fetch('core.content.primary', 'roast', { palette: 'refresh' })
//   CleoDesignTokens.colors.primitives.fetch('brown.800')
//   CleoDesignTokens.colors.primitives.fetch('brown.800', { palette: 'refresh' })
export const CleoDesignTokens = Object.freeze({
  spacing,
  colors: Object.freeze({
    primitives: makePrimitiveBucket(PRIMITIVES_LOOKUP),
    semantic: makeSemanticBucket(SEMANTIC_LOOKUP),
  }),
});
export default CleoDesignTokens;
