import { afterEach, describe, expect, it, vi } from 'vitest';
import primitives from '../spec/fixtures/reader/primitives-experiences.json';
import semantic from '../spec/fixtures/reader/semantic-experiences.json';
import currentPrimitives from '../spec/fixtures/reader/primitives.json';

async function loadReader(primitiveTree: unknown = primitives, semanticTree: unknown = semantic) {
  vi.resetModules();
  vi.doMock('../tokens/color/primitives.json', () => ({ default: primitiveTree }));
  vi.doMock('../tokens/color/semantic.json', () => ({ default: semanticTree }));
  return import('./CleoDesignTokens');
}

afterEach(() => {
  vi.doUnmock('../tokens/color/primitives.json');
  vi.doUnmock('../tokens/color/semantic.json');
  vi.resetModules();
});

describe('CleoDesignTokens.configure', () => {
  it('defaults to Current before configuration', async () => {
    const { CleoDesignTokens: tokens } = await loadReader();
    expect(tokens.colors.primitives.fetch('brown.800')).toBe('#47201C');
    expect(tokens.colors.semantic.fetch('core.content.primary')).toBe('#47201C');
  });

  it('switches both palettes through fetch functions captured before configuration', async () => {
    const { CleoDesignTokens: tokens } = await loadReader();
    const { fetch: primitive } = tokens.colors.primitives;
    const { fetch: semanticFetch } = tokens.colors.semantic;
    const previouslyResolved = semanticFetch('core.content.primary');
    tokens.configure({ experience: 'refresh' });
    expect(primitive('brown.800')).toBe('#192012');
    expect(semanticFetch('core.content.primary')).toBe('#192012');
    expect(semanticFetch('core.content.primary', 'roast')).toBe('#F9F9F8');
    expect(primitive('monotone.white')).toBe('#FFFEFB');
    expect(previouslyResolved).toBe('#47201C');
  });

  it('resets to Current and supports repeated selections', async () => {
    const { CleoDesignTokens: tokens } = await loadReader();
    const { fetch } = tokens.colors.semantic;
    tokens.configure({ experience: 'refresh' });
    tokens.configure({ experience: 'refresh' });
    expect(fetch('core.content.primary')).toBe('#192012');
    tokens.configure({ experience: 'current' });
    expect(fetch('core.content.primary')).toBe('#47201C');
    expect(tokens.colors.primitives.fetch('brown.800')).toBe('#47201C');
    tokens.configure({ experience: 'refresh' });
    expect(fetch('core.content.primary')).toBe('#192012');
    expect(tokens.spacing(2)).toBe(8);
  });

  it('falls back to Refresh Base without inheriting Current theme overrides', async () => {
    const { CleoDesignTokens: tokens } = await loadReader();
    expect(tokens.colors.semantic.fetch('core.content.secondary', 'roast')).toBe('#47201C');
    tokens.configure({ experience: 'refresh' });
    expect(tokens.colors.semantic.fetch('core.content.secondary', 'roast')).toBe('#F9F9F8');
    expect(tokens.colors.semantic.fetch('core.content.primary', 'hype')).toBe('#192012');
  });

  it('preserves missing-Base behaviour in Refresh', async () => {
    const { CleoDesignTokens: tokens, UnknownTokenError } = await loadReader();
    tokens.configure({ experience: 'refresh' });
    expect(tokens.colors.semantic.fetch('core.border.level0', 'chat')).toBe('#F9F9F8');
    expect(() => tokens.colors.semantic.fetch('core.border.level0')).toThrow(UnknownTokenError);
  });

  it('rejects unknown experiences at compile time and runtime without changing selection', async () => {
    const { CleoDesignTokens: tokens, UnknownExperienceError } = await loadReader();
    tokens.configure({ experience: 'refresh' });
    expect(() => {
      // @ts-expect-error - not a supported public experience
      tokens.configure({ experience: 'cleoRefresh' });
    }).toThrow(UnknownExperienceError);
    expect(tokens.colors.semantic.fetch('core.content.primary')).toBe('#192012');
  });

  it.each([{}, null, undefined, { experience: null }])('rejects invalid configuration %s', async (options) => {
    const { CleoDesignTokens: tokens, UnknownExperienceError } = await loadReader();
    expect(() => tokens.configure(options as never)).toThrow(UnknownExperienceError);
    expect(tokens.colors.semantic.fetch('core.content.primary')).toBe('#47201C');
  });

  it('rejects unavailable primitive snapshots without changing the active palette', async () => {
    const { CleoDesignTokens: tokens, UnknownExperienceError } = await loadReader(currentPrimitives);
    expect(() => tokens.configure({ experience: 'refresh' })).toThrow(UnknownExperienceError);
    expect(tokens.colors.primitives.fetch('brown.800')).toBe('#47201C');
    expect(tokens.colors.semantic.fetch('core.content.primary')).toBe('#47201C');
  });

  it('validates the complete semantic palette before switching either bucket', async () => {
    const incomplete = JSON.parse(JSON.stringify(semantic));
    delete incomplete.core.content.secondary.$experiences;
    const { CleoDesignTokens: tokens, UnknownExperienceError } = await loadReader(primitives, incomplete);
    expect(() => tokens.configure({ experience: 'refresh' })).toThrow(UnknownExperienceError);
    expect(tokens.colors.primitives.fetch('brown.800')).toBe('#47201C');
    expect(tokens.colors.semantic.fetch('core.content.primary')).toBe('#47201C');
  });

  it.each(['primitive', 'base', 'theme', 'empty'])('rejects an incomplete %s value before switching', async (kind) => {
    const palette = JSON.parse(JSON.stringify(primitives));
    const roles = JSON.parse(JSON.stringify(semantic));
    if (kind === 'primitive') delete palette.brown['800'].$experiences.cleoRefresh.$value;
    if (kind === 'base') roles.core.content.primary.$experiences.cleoRefresh.$value = 123;
    if (kind === 'theme') roles.core.content.primary.$experiences.cleoRefresh.$themes.roast = {};
    if (kind === 'empty') roles.core.content.primary.$experiences.cleoRefresh = {};
    const { CleoDesignTokens: tokens, UnknownExperienceError } = await loadReader(palette, roles);
    expect(() => tokens.configure({ experience: 'refresh' })).toThrow(UnknownExperienceError);
    expect(tokens.colors.primitives.fetch('brown.800')).toBe('#47201C');
    expect(tokens.colors.semantic.fetch('core.content.primary')).toBe('#47201C');
  });

  it('retains immutable Current lookups and the same public bucket objects', async () => {
    const { CleoDesignTokens: tokens, PRIMITIVES_LOOKUP, SEMANTIC_LOOKUP } = await loadReader();
    const { colors } = tokens;
    tokens.configure({ experience: 'refresh' });
    expect(tokens.colors).toBe(colors);
    expect(Object.isFrozen(tokens)).toBe(true);
    expect(Object.isFrozen(PRIMITIVES_LOOKUP)).toBe(true);
    expect(PRIMITIVES_LOOKUP['brown.800']).toBe('#47201C');
    expect(SEMANTIC_LOOKUP['core.content.primary']?.value).toBe('#47201C');
  });
});
