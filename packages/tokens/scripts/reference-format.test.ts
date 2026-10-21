import { describe, expect, it } from 'vitest';
import { compactSemanticTokens, expandSemanticTokens } from './semantic-format.mjs';
import { flatten } from './transform-core.mjs';
import primitives from '../spec/fixtures/reader/primitives-experiences.json';
import referenceSemantic from '../spec/fixtures/reader/reference-semantics.json';

describe('reference-based semantic format', () => {
  it('round-trips all values, references, theme gaps and experience-specific bindings', () => {
    const expanded = expandSemanticTokens(primitives, referenceSemantic);
    expect(expanded.core.content.primary.$value).toBe('#47201C');
    expect(expanded.core.content.primary.$experiences.cleoRefresh.$value).toBe('#192012');
    expect(expanded.core.content.primary.$experiences.cleoRefresh.$themes.roast.$value).toBe('#F9F9F8');
    expect(expanded.core.content.secondary.$experiences.cleoRefresh.$themes).toBeUndefined();
    expect(expanded.core.border.level0.$value).toBeUndefined();
    expect(expanded.effects.background.glassMorphism.$experiences.cleoRefresh.$value).toBe('#00000033');
    const compact = compactSemanticTokens(primitives, expanded);
    expect(compact.core.content.primary.$value).toBeUndefined();
    expect(compact.core.content.primary.$experiences).toBeUndefined();
    expect(compact.core.content.secondary.$experiences.cleoRefresh).toEqual({ $ref: 'brown.800' });
    expect(flatten(expandSemanticTokens(primitives, compact))).toEqual(flatten(expanded));
  });

  it('does not discard a mismatched resolved value while compacting legacy data', () => {
    const semantic = { primary: { $type: 'color', $value: '#BADBAD', $ref: 'brown.800' } };
    expect(() => compactSemanticTokens(primitives, semantic)).toThrow(/does not match/);
  });

  it.each(['missing', '__proto__', 'toString'])('rejects dangling primitive reference %s', (ref) => {
    const tree = structuredClone(referenceSemantic);
    tree.core.content.primary.$ref = ref;
    expect(() => expandSemanticTokens(primitives, tree)).toThrow(/primitive reference/);
  });

  it('rejects an experience override absent from the primitive palette', () => {
    const tree = structuredClone(referenceSemantic) as any;
    tree.core.content.primary.$experiences = { typo: { $ref: 'brown.800' } };
    expect(() => expandSemanticTokens(primitives, tree)).toThrow(/unknown experience/);
  });

  it('keeps legacy full snapshots readable without interpreting absent snapshots as inheritance', () => {
    const tree = { primary: { $type: 'color', $value: '#47201C' } };
    expect(expandSemanticTokens(primitives, tree)).toEqual(tree);
  });
});
