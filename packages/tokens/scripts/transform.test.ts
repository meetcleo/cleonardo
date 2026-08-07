import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  toHex,
  buildKey,
  walk,
  flatten,
  diffFlat,
  buildPrimitives,
  buildSemantic,
  buildKeyUnions,
  renderTokenKeysFile,
} from './transform-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'spec', 'fixtures', 'figma-exports');
const TRANSFORM_SCRIPT = join(HERE, 'transform.mjs');

const tmpDirs: string[] = [];
function tempProject() {
  const dir = mkdtempSync(join(tmpdir(), 'tokens-test-'));
  tmpDirs.push(dir);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'tokens', 'color'), { recursive: true });
  mkdirSync(join(dir, 'src', 'generated'), { recursive: true });
  cpSync(TRANSFORM_SCRIPT, join(dir, 'scripts', 'transform.mjs'));
  cpSync(join(HERE, 'transform-core.mjs'), join(dir, 'scripts', 'transform-core.mjs'));
  return dir;
}
function seedExports(dir: string, fixtureName: string) {
  cpSync(join(FIXTURES, fixtureName), join(dir, 'figma-exports'), { recursive: true });
}
function runCli(dir: string, extraArgs: string[] = []) {
  try {
    const stdout = execFileSync('node', [join(dir, 'scripts', 'transform.mjs'), ...extraArgs], {
      cwd: dir,
      encoding: 'utf8',
    });
    return { exitCode: 0, output: stdout };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { exitCode: e.status ?? 1, output: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

// ---------- toHex ----------

describe('toHex', () => {
  it('returns a bare hex for opaque colours', () => {
    expect(toHex({ hex: '#47201c' })).toBe('#47201C');
  });

  it('appends an alpha suffix for translucent colours', () => {
    expect(toHex({ hex: '#000000', alpha: 0.2 })).toBe('#00000033');
  });

  it('round-trips every alpha suffix present in the real corpus', () => {
    const cases = [
      [0, '00'],
      [0.05, '0D'],
      [0.1, '1A'],
      [0.15, '26'],
      [0.2, '33'],
      [0.25, '40'],
      [0.5, '80'],
      [0.75, 'BF'],
    ] as const;
    for (const [alpha, suffix] of cases) {
      expect(toHex({ hex: '#FFFFFF', alpha })).toBe(`#FFFFFF${suffix}`);
    }
  });
});

// ---------- buildKey ----------

describe('buildKey', () => {
  it('strips the color.primitives prefix and lowercases', () => {
    expect(buildKey(['color', 'primitives', 'Brown', '800'])).toBe('brown.800');
  });

  it('strips the color.semantic prefix and lowercases', () => {
    expect(buildKey(['color', 'semantic', 'Base', 'Core', 'Content', 'Primary'])).toBe('base.core.content.primary');
  });

  it("matches the readers' buildKey/build_key rule byte-for-byte", () => {
    // mirrors src/CleoDesignTokens.ts / lib/cleo_design_tokens.rb on the
    // COREEXP-264 branches: strip the 2-segment prefix, lowercase, dot-join.
    expect(buildKey(['color', 'primitives', 'Alpha', 'Dark', '10'])).toBe('alpha.dark.10');
  });
});

// ---------- walk / isLeaf ----------

describe('isLeaf / walk', () => {
  it('recognises a { $type, $value } leaf', () => {
    const tree = { Brown: { '800': { $type: 'color', $value: '#47201C' } } };
    expect([...walk(tree)]).toHaveLength(1);
  });

  it('recognises a { $type, $value, $ref } leaf (COREEXP-265 semantic shape)', () => {
    const tree = { Brown: { '800': { $type: 'color', $value: '#47201C', $ref: 'brown.800' } } };
    expect([...walk(tree)]).toHaveLength(1);
  });

  it('skips $-prefixed keys', () => {
    const tree = { $description: 'ignore me', Brown: { '800': { $type: 'color', $value: '#47201C' } } };
    expect([...walk(tree)]).toHaveLength(1);
  });
});

// ---------- flatten ----------

describe('flatten', () => {
  it('reads the { $type, $value } shape', () => {
    const tree = { color: { primitives: { Brown: { '800': { $type: 'color', $value: '#47201C' } } } } };
    expect(flatten(tree).get('color.primitives.Brown.800')).toBe('#47201C');
  });

  it('folds $ref into the comparison value when present', () => {
    const tree = {
      color: { semantic: { Base: { Primary: { $type: 'color', $value: '#47201C', $ref: 'brown.800' } } } },
    };
    expect(flatten(tree).get('color.semantic.Base.Primary')).toBe('#47201C {brown.800}');
  });

  it('keeps map keys as the JSON path, not the fetch key', () => {
    const tree = { color: { primitives: { Brown: { '800': { $type: 'color', $value: '#47201C' } } } } };
    expect([...flatten(tree).keys()]).toEqual(['color.primitives.Brown.800']);
  });
});

// ---------- diffFlat ----------

describe('diffFlat', () => {
  it('reports added, changed, removed', () => {
    const oldMap = new Map([
      ['a', '1'],
      ['b', '2'],
    ]);
    const newMap = new Map([
      ['a', '1'],
      ['b', '3'],
      ['c', '4'],
    ]);
    const { added, changed, removed } = diffFlat(oldMap, newMap);
    expect([...added.keys()]).toEqual(['c']);
    expect([...changed.keys()]).toEqual(['b']);
    expect([...removed.keys()]).toEqual([]);
  });

  it('reports a value re-point (same hex, different ref) as changed', () => {
    const oldMap = new Map([['k', '#FFFFFF {a.b}']]);
    const newMap = new Map([['k', '#FFFFFF {c.d}']]);
    const { changed } = diffFlat(oldMap, newMap);
    expect(changed.has('k')).toBe(true);
  });
});

// ---------- resolution: buildPrimitives / buildSemantic ----------

describe('buildPrimitives / buildSemantic', () => {
  function raw(fixtureName: string) {
    return {
      prim: JSON.parse(readFileSync(join(FIXTURES, fixtureName, 'primitives.json'), 'utf8')),
      sem: JSON.parse(readFileSync(join(FIXTURES, fixtureName, 'semantic.json'), 'utf8')),
    };
  }

  it('resolves an alias hit to { $value, $ref }', () => {
    const { prim, sem } = raw('valid');
    const { primIndex, hexIndex } = buildPrimitives(prim);
    const { semOut } = buildSemantic(sem, { primIndex, hexIndex });
    expect(semOut.Base.Content.Primary).toEqual({ $type: 'color', $value: '#47201C', $ref: 'brown.800' });
  });

  it('resolves an exact hex match with no alias via hex-recovery', () => {
    const { prim, sem } = raw('valid');
    const { primIndex, hexIndex } = buildPrimitives(prim);
    const { semOut, audit } = buildSemantic(sem, { primIndex, hexIndex });
    expect(semOut.Base.Content.Secondary).toEqual({ $type: 'color', $value: '#AC9B98', $ref: 'brown.400' });
    expect(audit.recoveredByHex).toHaveLength(1);
  });

  it('leaves a palette gap as { $value } with no $ref', () => {
    const { prim, sem } = raw('valid');
    const { primIndex, hexIndex } = buildPrimitives(prim);
    const { semOut } = buildSemantic(sem, { primIndex, hexIndex });
    expect(semOut.Base.Content.GlassMorphism).toEqual({ $type: 'color', $value: '#00000033' });
  });

  it('gives primitives $value only, no self-ref', () => {
    const { prim } = raw('valid');
    const { primOut } = buildPrimitives(prim);
    expect(primOut.Brown['800']).toEqual({ $type: 'color', $value: '#47201C' });
  });

  it('flags a dead reference (alias target not a primitive)', () => {
    const { prim, sem } = raw('dead-ref');
    const { primIndex, hexIndex } = buildPrimitives(prim);
    const { audit } = buildSemantic(sem, { primIndex, hexIndex });
    expect(audit.deadRefs).toEqual([{ path: 'color.semantic.Base.Primary', target: 'Brown/900' }]);
  });

  it('flags an ambiguous hex recovery (2+ primitives share the hex)', () => {
    const prim = {
      Brown: {
        '800': { $type: 'color', $value: { hex: '#47201C' } },
        '801': { $type: 'color', $value: { hex: '#47201C' } },
      },
    };
    const sem = { Base: { Primary: { $type: 'color', $value: { hex: '#47201C' } } } };
    const { primIndex, hexIndex } = buildPrimitives(prim);
    const { audit } = buildSemantic(sem, { primIndex, hexIndex });
    expect(audit.ambiguousHex).toHaveLength(1);
    expect(audit.ambiguousHex[0].candidates).toEqual(['color.primitives.Brown.800', 'color.primitives.Brown.801']);
  });

  it('flags a semantic->semantic alias rather than treating it as a dead ref', () => {
    const prim = { Brown: { '800': { $type: 'color', $value: { hex: '#47201C' } } } };
    const sem = {
      Base: { Primary: { $type: 'color', $value: { hex: '#47201C' } } },
      Alias: {
        Ref: { $type: 'color', $extensions: { 'com.figma.aliasData': { targetVariableName: 'Base/Primary' } } },
      },
    };
    const { primIndex, hexIndex } = buildPrimitives(prim);
    const { audit } = buildSemantic(sem, { primIndex, hexIndex });
    expect(audit.deadRefs).toHaveLength(0);
    expect(audit.semanticAliases).toEqual([{ path: 'color.semantic.Alias.Ref', target: 'Base/Primary' }]);
  });
});

// ---------- key unions + collision detection ----------

describe('buildKeyUnions', () => {
  it('returns a sorted key list per bucket', () => {
    const prim = {
      Brown: { '800': { $type: 'color', $value: '#47201C' } },
      Alpha: { Dark: { '10': { $type: 'color', $value: '#0E06051A' } } },
    };
    const sem = {
      Base: { Primary: { $type: 'color', $value: '#47201C', $ref: 'brown.800' } },
      Chat: { Primary: { $type: 'color', $value: '#47201C', $ref: 'brown.800' } },
    };
    expect(buildKeyUnions(prim, sem)).toEqual({
      primitives: ['alpha.dark.10', 'brown.800'],
      semantic: ['base.primary', 'chat.primary'],
    });
  });

  it('allows the same key in both buckets — they are separate lookups', () => {
    const prim = { Brown: { '800': { $type: 'color', $value: '#111111' } } };
    const sem = { Brown: { '800': { $type: 'color', $value: '#222222' } } };
    expect(buildKeyUnions(prim, sem)).toEqual({
      primitives: ['brown.800'],
      semantic: ['brown.800'],
    });
  });

  it('throws when two paths in the same bucket collapse to one key', () => {
    const prim = {
      Brown: { '800': { $type: 'color', $value: '#111111' } },
      brown: { '800': { $type: 'color', $value: '#222222' } },
    };
    expect(() => buildKeyUnions(prim, {})).toThrow(/duplicate token key/);
  });

  it('throws on a same-bucket collision in the semantic tree too', () => {
    const sem = {
      Base: { Primary: { $type: 'color', $value: '#111111' } },
      base: { primary: { $type: 'color', $value: '#222222' } },
    };
    expect(() => buildKeyUnions({}, sem)).toThrow(/duplicate token key/);
  });
});

// ---------- union rendering ----------

describe('renderTokenKeysFile', () => {
  it('renders one sorted, single-quoted union per bucket', () => {
    const out = renderTokenKeysFile({ primitives: ['b.b', 'a.a'], semantic: ['d.d', 'c.c'] });
    expect(out).toContain('export type ColorPrimitiveKey =');
    expect(out).toContain('export type ColorSemanticKey =');
    expect(out).toContain("  | 'b.b'");
    expect(out).toContain("  | 'd.d'");
    expect(out.trimEnd().endsWith(';')).toBe(true);
  });

  it('keeps each bucket to its own union', () => {
    const out = renderTokenKeysFile({ primitives: ['brown.800'], semantic: ['base.primary'] });
    const [, primBlock, semBlock] = out.split('export type ');
    expect(primBlock).toContain("'brown.800'");
    expect(primBlock).not.toContain("'base.primary'");
    expect(semBlock).toContain("'base.primary'");
    expect(semBlock).not.toContain("'brown.800'");
  });

  it('is stable across repeat calls with the same input', () => {
    const unions = { primitives: ['a.a'], semantic: ['b.b'] };
    expect(renderTokenKeysFile(unions)).toBe(renderTokenKeysFile(unions));
  });
});

// ---------- CLI integration ----------

describe('transform.mjs CLI', () => {
  it('exits 2 on a dead reference', () => {
    const dir = tempProject();
    seedExports(dir, 'dead-ref');
    const { exitCode, output } = runCli(dir, ['--check']);
    expect(exitCode).toBe(2);
    expect(output).toMatch(/dead reference/);
  });

  it('exits 0 under --check with no writes', () => {
    const dir = tempProject();
    seedExports(dir, 'valid');
    const { exitCode } = runCli(dir, ['--check']);
    expect(exitCode).toBe(0);
    expect(existsSync(join(dir, 'tokens', 'color', 'primitives.json'))).toBe(false);
    expect(existsSync(join(dir, 'src', 'generated', 'tokenKeys.ts'))).toBe(false);
  });

  it('exits 1 on a removal without --allow-removals, and 0 with it', () => {
    const dir = tempProject();
    seedExports(dir, 'valid');

    // seed the on-disk output first
    const seed = runCli(dir);
    expect(seed.exitCode).toBe(0);

    // drop a semantic token from the export, then re-run
    const semPath = join(dir, 'figma-exports', 'semantic.json');
    const sem = JSON.parse(readFileSync(semPath, 'utf8'));
    delete sem.Base.Content.Secondary;
    writeFileSync(semPath, JSON.stringify(sem));

    const blocked = runCli(dir, ['--check']);
    expect(blocked.exitCode).toBe(1);
    expect(blocked.output).toMatch(/would be removed/);

    const allowed = runCli(dir, ['--allow-removals', '--check']);
    expect(allowed.exitCode).toBe(0);
  });
});
