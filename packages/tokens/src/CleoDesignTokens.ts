import type { ColorPrimitiveKey, ColorSemanticKey, ColorTheme } from './generated/tokenKeys';
import primitives from '../tokens/color/primitives.json' with { type: 'json' };
import semantic from '../tokens/color/semantic.json' with { type: 'json' };

export class UnknownTokenError extends Error {}
export class UnknownThemeError extends Error {}
export class UnknownExperienceError extends Error {
  constructor(message: string) {
    super(message);
    // Preserve instanceof when the package's TypeScript target downlevels Error subclasses.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'UnknownExperienceError';
  }
}
export class DuplicateTokenError extends Error {}

const THEMES: ReadonlySet<string> = new Set(['base', 'chat', 'roast', 'hype']);
const SPACING_BASE_UNIT_PX = 4;
const RELATIVE_UNIT_BASE_PX = 16;

export type SpacingUnit = 'px' | 'rem' | 'em';

export interface SpacingOptions {
  readonly unit?: SpacingUnit;
}

export type ColorExperience = 'current' | 'refresh';

export interface ConfigureOptions {
  readonly experience: ColorExperience;
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

function experienceLeaf(leaf: Record<string, unknown>, experience: ColorExperience, key: string): Record<string, unknown> {
  if (experience === 'current') return leaf;
  const snapshots = leaf.$experiences as Record<string, unknown> | undefined;
  const snapshot = snapshots?.cleoRefresh;
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
    throw new UnknownExperienceError(`experience "refresh" is unavailable for design token ${JSON.stringify(key)}; sync the Refresh colour data first`);
  }
  return snapshot as Record<string, unknown>;
}

// The experience selects a complete snapshot; no fields fall back to Current.
export function buildLookup(tree: unknown, experience: ColorExperience = 'current'): Record<string, string> {
  const lookup: Record<string, string> = {};
  const origins: Record<string, string> = {};
  walk(tree, [], (path, leaf) => {
    const key = path.join('.');
    if (Object.prototype.hasOwnProperty.call(lookup, key)) {
      throw new DuplicateTokenError(`duplicate design token ${JSON.stringify(key)}: defined at both ${origins[key]} and ${path.join('.')}`);
    }
    const snapshot = experienceLeaf(leaf, experience, key);
    if (typeof snapshot.$value !== 'string') {
      throw new UnknownExperienceError(`design token ${JSON.stringify(key)} has no primitive value for experience ${JSON.stringify(experience)}`);
    }
    lookup[key] = snapshot.$value;
    origins[key] = path.join('.');
  });
  return lookup;
}

// One semantic role: its Base value (absent when the role only exists under
// a theme) plus whatever theme overrides genuinely differ from Base.
export interface SemanticEntry {
  readonly value: string | undefined;
  readonly themes: Readonly<Record<string, string>>;
}

// Flattens `semantic.json` into a key -> SemanticEntry lookup, one entry per
// role — the theme axis lives inside the entry, not in the key, so this has
// the same entries as ColorSemanticKey, not one per role-theme pair.
export function buildSemanticLookup(tree: unknown, experience: ColorExperience = 'current'): Record<string, SemanticEntry> {
  const lookup: Record<string, SemanticEntry> = {};
  const origins: Record<string, string> = {};
  walk(tree, [], (path, leaf) => {
    const key = path.join('.');
    if (Object.prototype.hasOwnProperty.call(lookup, key)) {
      throw new DuplicateTokenError(`duplicate design token ${JSON.stringify(key)}: defined at both ${origins[key]} and ${path.join('.')}`);
    }

    const snapshot = experienceLeaf(leaf, experience, key);
    const themes: Record<string, string> = {};
    const rawThemes = (snapshot.$themes as Record<string, { $value: string }> | undefined) ?? {};
    for (const [theme, override] of Object.entries(rawThemes)) {
      if (typeof override?.$value !== 'string') {
        throw new UnknownExperienceError(`design token ${JSON.stringify(key)} has no value for theme ${JSON.stringify(theme)} in experience ${JSON.stringify(experience)}`);
      }
      themes[theme] = override.$value;
    }

    if ((snapshot.$value !== undefined && typeof snapshot.$value !== 'string') || (snapshot.$value === undefined && Object.keys(themes).length === 0)) {
      throw new UnknownExperienceError(`design token ${JSON.stringify(key)} has no semantic values for experience ${JSON.stringify(experience)}`);
    }
    lookup[key] = Object.freeze({ value: typeof snapshot.$value === 'string' ? snapshot.$value : undefined, themes: Object.freeze(themes) });
    origins[key] = path.join('.');
  });
  return lookup;
}

// What a caller gets for (role, theme): the theme's override when it has
// one, otherwise the Base value — mirrors transform-core.mjs's
// `resolveTheme` exactly. Returns undefined when neither exists, which is
// what makes `fetch` raise for the Base-less roles.
function resolveTheme(entry: SemanticEntry, theme: string): string | undefined {
  const override = entry.themes[theme];
  if (override !== undefined) return override;
  return entry.value;
}

// A bucket wraps one frozen lookup with a single-argument `fetch`. Exposed as
// a function, rather than baked into module load, so tests can build one
// over a fixture lookup exactly like the module's own buckets below.
type LookupSource<T> = Readonly<Record<string, T>> | (() => Readonly<Record<string, T>>);

export function makePrimitiveBucket(lookup: LookupSource<string>) {
  return {
    fetch(key: ColorPrimitiveKey): string {
      const value = (typeof lookup === 'function' ? lookup() : lookup)[key];
      if (value === undefined) {
        throw new UnknownTokenError(`unknown design token: ${JSON.stringify(key)}`);
      }
      return value;
    },
  };
}

// `theme` defaults to `'base'` — `$themes` never carries a `'base'` entry
// (Base isn't an override of itself), so the default and an explicit
// `theme: 'base'` resolve identically with no special-casing.
export function makeSemanticBucket(lookup: LookupSource<SemanticEntry>) {
  return {
    fetch(key: ColorSemanticKey, theme: ColorTheme = 'base'): string {
      if (!THEMES.has(theme)) {
        throw new UnknownThemeError(`unknown theme: ${JSON.stringify(theme)}`);
      }

      const entry = (typeof lookup === 'function' ? lookup() : lookup)[key];
      if (entry === undefined) {
        throw new UnknownTokenError(`unknown design token: ${JSON.stringify(key)}`);
      }

      const value = resolveTheme(entry, theme);
      if (value === undefined) {
        throw new UnknownTokenError(
          `design token ${JSON.stringify(key)} has no Base value and no override for theme ${JSON.stringify(theme)}`,
        );
      }
      return value;
    },
  };
}

// These exported lookups remain immutable snapshots of Current. Public fetch
// functions read activePalette at call time so captured functions stay current.
export const PRIMITIVES_LOOKUP: Record<string, string> = Object.freeze(buildLookup(primitives));
export const SEMANTIC_LOOKUP: Record<string, SemanticEntry> = Object.freeze(buildSemanticLookup(semantic));

interface Palette {
  readonly primitives: Readonly<Record<string, string>>;
  readonly semantic: Readonly<Record<string, SemanticEntry>>;
}

const CURRENT_PALETTE: Palette = Object.freeze({ primitives: PRIMITIVES_LOOKUP, semantic: SEMANTIC_LOOKUP });
let refreshPalette: Palette | undefined;
let activePalette = CURRENT_PALETTE;

function configure(options: ConfigureOptions): void {
  const experience = options?.experience;
  if (experience !== 'current' && experience !== 'refresh') {
    throw new UnknownExperienceError(`unknown experience: ${JSON.stringify(experience)}; expected "current" or "refresh"`);
  }
  if (experience === 'current') {
    activePalette = CURRENT_PALETTE;
    return;
  }

  // Build both buckets before publishing the selection. A missing snapshot
  // leaves the previous palette active, including for captured fetch functions.
  refreshPalette ??= Object.freeze({
    primitives: Object.freeze(buildLookup(primitives, 'refresh')),
    semantic: Object.freeze(buildSemanticLookup(semantic, 'refresh')),
  });
  activePalette = refreshPalette;
}

// Namespaced by token type (`colors`), then by layer (`primitives`,
// `semantic`) — no selector argument, no top-level `fetch` defaulting to
// semantic. `spacing` is code-owned rather than Figma-generated. Theme is a
// second, optional argument on the semantic reader; configure selects the palette:
//
//   CleoDesignTokens.colors.semantic.fetch('core.content.primary')
//   CleoDesignTokens.colors.semantic.fetch('core.content.primary', 'roast')
//   CleoDesignTokens.colors.primitives.fetch('brown.800')
export const CleoDesignTokens = Object.freeze({
  configure,
  spacing,
  colors: Object.freeze({
    primitives: makePrimitiveBucket(() => activePalette.primitives),
    semantic: makeSemanticBucket(() => activePalette.semantic),
  }),
});
export default CleoDesignTokens;
