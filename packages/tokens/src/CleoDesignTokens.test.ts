import { describe, expect, it } from 'vitest';
import primitivesFixture from '../spec/fixtures/reader/primitives.json';
import semanticFixture from '../spec/fixtures/reader/semantic.json';
import collisionFixture from '../spec/fixtures/reader/collision.json';
import type { ColorPrimitiveKey, ColorSemanticKey, ColorTheme } from './generated/tokenKeys';
import {
  CleoDesignTokens,
  DuplicateTokenError,
  PRIMITIVES_LOOKUP,
  SEMANTIC_LOOKUP,
  UnknownThemeError,
  UnknownTokenError,
  buildLookup,
  buildSemanticLookup,
  makePrimitiveBucket,
  makeSemanticBucket,
} from './CleoDesignTokens';

const primitivesBucket = makePrimitiveBucket(buildLookup(primitivesFixture));
const semanticBucket = makeSemanticBucket(buildSemanticLookup(semanticFixture));

describe('colors.primitives.fetch', () => {
  it('resolves a known primitive key', () => {
    expect(primitivesBucket.fetch('brown.800' as ColorPrimitiveKey)).toBe('#47201C');
  });

  it('throws on an unknown key rather than returning undefined', () => {
    expect(() => primitivesBucket.fetch('no.such.token' as ColorPrimitiveKey)).toThrow(UnknownTokenError);
  });

  it('throws on a key that exists only in the semantic bucket', () => {
    expect(() => primitivesBucket.fetch('core.content.primary' as ColorPrimitiveKey)).toThrow(UnknownTokenError);
  });
});

describe('colors.semantic.fetch', () => {
  it('resolves Base by default', () => {
    expect(semanticBucket.fetch('core.content.primary' as ColorSemanticKey)).toBe('#47201C');
  });

  it('resolves a theme override', () => {
    expect(semanticBucket.fetch('core.content.primary' as ColorSemanticKey, 'roast')).toBe('#F8F6F2');
  });

  it('falls back to Base when the theme has no override for that role', () => {
    expect(semanticBucket.fetch('core.content.primary' as ColorSemanticKey, 'hype')).toBe('#47201C');
  });

  it('raises on a themeless read of a role with no Base value', () => {
    expect(() => semanticBucket.fetch('core.border.level0' as ColorSemanticKey)).toThrow(UnknownTokenError);
  });

  it('resolves that same role once its theme is given', () => {
    expect(semanticBucket.fetch('core.border.level0' as ColorSemanticKey, 'chat')).toBe('#F8F6F2');
  });

  it('raises on a role with no Base value and no override for the given theme either', () => {
    expect(() => semanticBucket.fetch('core.border.level0' as ColorSemanticKey, 'roast')).toThrow(UnknownTokenError);
  });

  it('throws on an unknown key rather than returning undefined', () => {
    expect(() => semanticBucket.fetch('no.such.token' as ColorSemanticKey)).toThrow(UnknownTokenError);
  });

  it('throws on a key that exists only in the primitives bucket', () => {
    expect(() => semanticBucket.fetch('brown.800' as ColorSemanticKey)).toThrow(UnknownTokenError);
  });

  it('throws on an unknown theme', () => {
    expect(() => semanticBucket.fetch('core.content.primary' as ColorSemanticKey, 'nope' as ColorTheme)).toThrow(UnknownThemeError);
  });

  it('rejects an unknown key at compile time', () => {
    expect(() => {
      // @ts-expect-error - not a real token key
      CleoDesignTokens.colors.semantic.fetch('not.a.real.token');
    }).toThrow(UnknownTokenError);
  });

  it('rejects a cross-bucket key at compile time', () => {
    expect(() => {
      // @ts-expect-error - a ColorPrimitiveKey, not a ColorSemanticKey
      CleoDesignTokens.colors.semantic.fetch('brown.800' satisfies ColorPrimitiveKey);
    }).toThrow(UnknownTokenError);
  });

  it('rejects an invalid theme literal at compile time', () => {
    expect(() => {
      // @ts-expect-error - not a ColorTheme
      CleoDesignTokens.colors.semantic.fetch('core.content.primary', 'nope');
    }).toThrow(UnknownThemeError);
  });

  // The theme axis is gone from the key: real files now carry resolved
  // values keyed one entry per role, so these assert directly against them.
  it('resolves against the real committed files', () => {
    expect(CleoDesignTokens.colors.semantic.fetch('core.content.primary')).toBe('#47201C');
    expect(CleoDesignTokens.colors.semantic.fetch('core.content.primary', 'roast')).toBe('#F8F6F2');
    expect(CleoDesignTokens.colors.primitives.fetch('brown.800' satisfies ColorPrimitiveKey)).toBe('#47201C');
  });
});

describe('buildLookup / buildSemanticLookup', () => {
  it('fails loudly on a collision, within one tree', () => {
    expect(() => buildLookup(collisionFixture)).toThrow(DuplicateTokenError);
    expect(() => buildLookup(collisionFixture)).toThrow(/brown\.800/);
  });
});

describe('PRIMITIVES_LOOKUP / SEMANTIC_LOOKUP', () => {
  it('are frozen', () => {
    expect(Object.isFrozen(PRIMITIVES_LOOKUP)).toBe(true);
    expect(Object.isFrozen(SEMANTIC_LOOKUP)).toBe(true);
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (PRIMITIVES_LOOKUP as any)['new.key'] = '#000000';
    }).toThrow(TypeError);
  });

  it('freezes every SemanticEntry it holds, and its theme overrides', () => {
    for (const entry of Object.values(SEMANTIC_LOOKUP)) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.themes)).toBe(true);
    }
  });

  it('are non-empty, sized to the real files', () => {
    expect(Object.keys(PRIMITIVES_LOOKUP)).toHaveLength(106);
    expect(Object.keys(SEMANTIC_LOOKUP)).toHaveLength(473);
  });
});

describe('CleoDesignTokens.colors', () => {
  it('is frozen and returns the same instance', () => {
    expect(Object.isFrozen(CleoDesignTokens)).toBe(true);
    expect(Object.isFrozen(CleoDesignTokens.colors)).toBe(true);
    expect(CleoDesignTokens.colors).toBe(CleoDesignTokens.colors);
  });
});
