import { describe, it, expect } from 'vitest';
import { INITIAL_VERSION, nextVersion, versionFromTag, planRelease } from './plan-release.mjs';

// ---------- version arithmetic ----------

describe('nextVersion', () => {
  it('resets patch to 0 on a minor bump', () => {
    expect(nextVersion('0.2.3', 'minor')).toBe('0.3.0');
  });

  it('only increments the last segment on a patch bump', () => {
    expect(nextVersion('0.2.3', 'patch')).toBe('0.2.4');
  });

  it('rejects anything that is not a plain major.minor.patch version', () => {
    expect(() => nextVersion('0.2.3-rc.1', 'minor')).toThrow(/major\.minor\.patch/);
  });

  it('rejects an unknown bump type', () => {
    expect(() => nextVersion('0.2.3', 'major')).toThrow(/unknown bump type/);
  });
});

describe('versionFromTag', () => {
  it('strips the tokens-v prefix', () => {
    expect(versionFromTag('tokens-v0.2.3')).toBe('0.2.3');
  });

  it('rejects a tag with no tokens-v prefix', () => {
    expect(() => versionFromTag('v0.2.3')).toThrow(/not a tokens-v tag/);
  });
});

// ---------- planRelease ----------

const leaf = (value: string, ref?: string) => ({ $type: 'color', $value: value, ...(ref ? { $ref: ref } : {}) });

describe('planRelease', () => {
  it('ships the initial version on the first release, with no diff listing', () => {
    const result = planRelease({
      previousTag: null,
      primOld: {},
      semOld: {},
      primNew: { brown: { 800: leaf('#47201C') } },
      semNew: { core: { content: { primary: leaf('#47201C', 'brown.800') } } },
    });

    expect(result.version).toBe(INITIAL_VERSION);
    expect(result.hasColourChange).toBe(true);
    expect(result.notes).toMatch(/Initial release/);
    expect(result.notes).toMatch(/1 primitives/);
    expect(result.notes).toMatch(/1 semantic/);
  });

  it('bumps minor and lists an added primitive', () => {
    const result = planRelease({
      previousTag: 'tokens-v0.2.0',
      primOld: {},
      semOld: {},
      primNew: { brown: { 800: leaf('#47201C') } },
      semNew: {},
    });

    expect(result.version).toBe('0.3.0');
    expect(result.hasColourChange).toBe(true);
    expect(result.notes).toContain('primitives added:');
    expect(result.notes).toContain('+ brown.800 = #47201C');
  });

  it('bumps minor and lists a changed value', () => {
    const result = planRelease({
      previousTag: 'tokens-v0.2.0',
      primOld: { purple: { 500: leaf('#695F9A') } },
      semOld: {},
      primNew: { purple: { 500: leaf('#695F9B') } },
      semNew: {},
    });

    expect(result.version).toBe('0.3.0');
    expect(result.notes).toContain('~ purple.500: #695F9A -> #695F9B');
  });

  it('bumps minor and lists a removed key', () => {
    const result = planRelease({
      previousTag: 'tokens-v0.2.0',
      primOld: { purple: { 500: leaf('#695F9A') } },
      semOld: {},
      primNew: {},
      semNew: {},
    });

    expect(result.version).toBe('0.3.0');
    expect(result.notes).toContain('- purple.500 (was #695F9A)');
  });

  it('counts a re-point at an identical hex as a change — $ref is part of the compared value', () => {
    const result = planRelease({
      previousTag: 'tokens-v0.2.0',
      primOld: { purple: { 500: leaf('#695F9A') }, indigo: { 500: leaf('#695F9A') } },
      semOld: { core: { content: { primary: leaf('#695F9A', 'purple.500') } } },
      primNew: { purple: { 500: leaf('#695F9A') }, indigo: { 500: leaf('#695F9A') } },
      semNew: { core: { content: { primary: leaf('#695F9A', 'indigo.500') } } },
    });

    expect(result.hasColourChange).toBe(true);
    expect(result.notes).toContain('~ core.content.primary: #695F9A {purple.500} -> #695F9A {indigo.500}');
  });

  it('reports a theme-only override change as role@theme, leaving Base untouched', () => {
    const before = { $type: 'color', $value: '#47201C', $ref: 'brown.800' };
    const after = {
      ...before,
      $themes: { roast: { $value: '#F8F6F2', $ref: 'brown.50' } },
    };
    const result = planRelease({
      previousTag: 'tokens-v0.2.0',
      primOld: {},
      semOld: { core: { content: { primary: before } } },
      primNew: {},
      semNew: { core: { content: { primary: after } } },
    });

    expect(result.notes).toContain('semantic added:');
    expect(result.notes).toContain('+ core.content.primary@roast = #F8F6F2 {brown.50}');
    expect(result.notes).not.toMatch(/~ core\.content\.primary:/); // Base itself didn't change
  });

  it('reports a removed theme override as a removal, with a note that it now resolves to Base', () => {
    const after = { $type: 'color', $value: '#47201C', $ref: 'brown.800' };
    const before = {
      ...after,
      $themes: { roast: { $value: '#F8F6F2', $ref: 'brown.50' } },
    };
    const result = planRelease({
      previousTag: 'tokens-v0.2.0',
      primOld: {},
      semOld: { core: { content: { primary: before } } },
      primNew: {},
      semNew: { core: { content: { primary: after } } },
    });

    expect(result.notes).toContain('semantic removed:');
    expect(result.notes).toContain('- core.content.primary@roast (was #F8F6F2 {brown.50})');
    expect(result.notes).toMatch(/now resolves to Base/);
  });

  it('bumps patch and says so plainly when nothing colour-related changed', () => {
    const tree = { brown: { 800: leaf('#47201C') } };
    const result = planRelease({
      previousTag: 'tokens-v0.2.0',
      primOld: tree,
      semOld: {},
      primNew: tree,
      semNew: {},
    });

    expect(result.version).toBe('0.2.1');
    expect(result.hasColourChange).toBe(false);
    expect(result.notes).toBe('No colour changes in this release.');
  });
});
