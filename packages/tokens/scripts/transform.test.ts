import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normaliseSegment,
  buildKey,
  rgbaToHex,
  walk,
  resolveTheme,
  flatten,
  diffFlat,
  buildTokens,
  buildKeyUnions,
  renderTokenKeysFile,
  naturalCompare,
} from './transform-core.mjs';

import { expandSemanticTokens } from './semantic-format.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DUMPS = join(HERE, '..', 'spec', 'fixtures', 'dumps');
const EXPECTED = join(HERE, '..', 'spec', 'fixtures', 'expected-resolved.json');
const TRANSFORM_SCRIPT = join(HERE, 'transform.mjs');

function readSemantic(dir: string) {
  return expandSemanticTokens(
    JSON.parse(readFileSync(join(dir, 'tokens/color/primitives.json'), 'utf8')),
    JSON.parse(readFileSync(join(dir, 'tokens/color/semantic.json'), 'utf8')),
  );
}

const dump = (name: string) => JSON.parse(readFileSync(join(DUMPS, `${name}.json`), 'utf8'));

const tmpDirs: string[] = [];
function tempProject(fixture: string) {
  const dir = mkdtempSync(join(tmpdir(), 'tokens-test-'));
  tmpDirs.push(dir);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'tokens', 'color'), { recursive: true });
  mkdirSync(join(dir, 'src', 'generated'), { recursive: true });
  mkdirSync(join(dir, 'figma-exports'), { recursive: true });
  cpSync(TRANSFORM_SCRIPT, join(dir, 'scripts', 'transform.mjs'));
  cpSync(join(HERE, 'transform-core.mjs'), join(dir, 'scripts', 'transform-core.mjs'));
  cpSync(join(HERE, 'semantic-format.mjs'), join(dir, 'scripts', 'semantic-format.mjs'));
  cpSync(join(HERE, 'semantic-contract.json'), join(dir, 'scripts', 'semantic-contract.json'));
  cpSync(join(DUMPS, `${fixture}.json`), join(dir, 'figma-exports', 'figma-dump.json'));
  return dir;
}
// spawnSync, not execFileSync: the script writes its entire report — success
// line included — to stderr, and execFileSync's return value is stdout only, so
// a passing run would appear to have produced no output at all.
function runCli(dir: string, extraArgs: string[] = []) {
  const result = spawnSync('node', [join(dir, 'scripts', 'transform.mjs'), ...extraArgs], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { exitCode: result.status ?? 1, output: (result.stdout ?? '') + (result.stderr ?? '') };
}

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

// ---------- key normalisation ----------

describe('normaliseSegment', () => {
  it('lowerCamels multi-word segments', () => {
    expect(normaliseSegment('Credit Score')).toBe('creditScore');
    expect(normaliseSegment('Icon Foreground')).toBe('iconForeground');
    expect(normaliseSegment('ShimmerAlpha 2')).toBe('shimmerAlpha2');
  });

  it('lowercases an all-caps segment whole', () => {
    expect(normaliseSegment('UI')).toBe('ui');
    expect(normaliseSegment('EWA')).toBe('ewa');
  });

  it('lowercases only the first letter of an already-camel segment', () => {
    expect(normaliseSegment('DataVisPrimary')).toBe('dataVisPrimary');
  });

  it('leaves numeric segments alone', () => {
    expect(normaliseSegment('800')).toBe('800');
    expect(normaliseSegment('50')).toBe('50');
  });
});

describe('buildKey', () => {
  it('joins normalised segments with dots', () => {
    expect(buildKey(['Base', 'Core', 'Content', 'Primary'])).toBe('base.core.content.primary');
    expect(buildKey(['Credit Score', 'UI', 'Band Label'])).toBe('creditScore.ui.bandLabel');
  });
});

// ---------- colour ----------

describe('rgbaToHex', () => {
  it('converts 0-1 floats to an uppercase hex', () => {
    expect(rgbaToHex({ r: 71 / 255, g: 32 / 255, b: 28 / 255, a: 1 })).toBe('#47201C');
  });

  it('appends an alpha suffix below full opacity', () => {
    expect(rgbaToHex({ r: 0, g: 0, b: 0, a: 0.2 })).toBe('#00000033');
  });

  it('treats a missing alpha as opaque', () => {
    expect(rgbaToHex({ r: 1, g: 1, b: 1 })).toBe('#FFFFFF');
  });

  it('reproduces every alpha suffix present in the real corpus', () => {
    const suffixes = ['00', '0D', '1A', '26', '33', '40', '80', 'BF'];
    for (const suffix of suffixes) {
      const a = parseInt(suffix, 16) / 255;
      expect(rgbaToHex({ r: 1, g: 1, b: 1, a })).toBe(`#FFFFFF${suffix}`);
    }
  });

  it('rejects a value that is not a colour', () => {
    expect(() => rgbaToHex({ type: 'VARIABLE_ALIAS', id: 'x' })).toThrow(/not an RGBA colour/);
  });
});

// ---------- build: structure ----------

describe('buildTokens', () => {
  it('puts Base on the leaf and genuine overrides under $themes', () => {
    const { semOut } = buildTokens(dump('valid'));
    expect(semOut.core.content.primary).toEqual({
      $type: 'color',
      $value: '#47201C',
      $ref: 'brown.800',
      $themes: { roast: { $value: '#F8F6F2', $ref: 'brown.50' } },
    });
  });

  it('omits a theme whose value and $ref both match Base', () => {
    // Chat/Core/Content/Primary aliases the same primitive as Base.
    const { semOut } = buildTokens(dump('valid'));
    expect(semOut.core.content.primary.$themes).not.toHaveProperty('chat');
  });

  it('gives primitives $value only — no $ref, no $themes', () => {
    const { primOut } = buildTokens(dump('valid'));
    expect(primOut.brown['800']).toEqual({ $type: 'color', $value: '#47201C' });
  });

  it('leaves a palette gap without a $ref and records it', () => {
    const { semOut, audit } = buildTokens(dump('valid'));
    expect(semOut.effects.background.glassMorphism).toEqual({ $type: 'color', $value: '#00000033' });
    expect(audit.paletteGaps).toEqual([{ path: 'effects.background.glassMorphism', hex: '#00000033' }]);
  });

  it('normalises authored casing into the emitted tree', () => {
    const { semOut } = buildTokens(dump('valid'));
    expect(semOut.creditScore.ui.bandLabel.$value).toBe('#47201C');
    expect(semOut.ewa.dataVisPrimary.$value).toBe('#F8F6F2');
  });

  it('emits no $value for a role absent from Base, only $themes', () => {
    const { semOut, audit } = buildTokens(dump('missing-base'));
    expect(semOut.core.border.level0).toEqual({
      $type: 'color',
      $themes: { chat: { $value: '#F8F6F2', $ref: 'brown.50' } },
    });
    expect(audit.missingBase).toEqual([{ path: 'core.border.level0', themes: ['Chat'] }]);
  });

  it('counts non-COLOR variables in a listed collection rather than failing', () => {
    const { audit } = buildTokens(dump('valid'));
    expect(audit.skippedByType).toEqual({ 'Themes/FLOAT': 1 });
  });

  it('ignores collections absent from the config, counting them', () => {
    const { audit } = buildTokens(dump('valid'));
    expect(audit.ignoredByCollection).toEqual({ Modes: 1 });
  });

  it('reports Base first, then themes in dump order', () => {
    const { themes } = buildTokens(dump('valid'));
    expect(themes[0]).toBe('Base');
    expect(themes).toEqual(['Base', 'Roast', 'Chat']);
  });
});

describe('primitive experiences × semantic themes', () => {
  it('preserves Current and Refresh independently of the default primitive mode', () => {
    const { primOut, semOut, experienceAudits } = buildTokens(dump('experiences'));
    expect(primOut.brown['800']).toEqual({
      $type: 'color', $value: '#47201C', $experiences: { cleoRefresh: { $value: '#112233' } },
    });
    expect(semOut.content.primary.$value).toBe('#47201C');
    expect(semOut.content.primary.$themes.roast.$value).toBe('#F8F6F2');
    expect(semOut.content.primary.$experiences.cleoRefresh).toEqual({
      $value: '#112233', $ref: 'brown.800',
      $themes: {
        roast: { $value: '#112233', $ref: 'brown.50' },
        hype: { $value: '#112233', $ref: 'brown.50' },
      },
    });
    expect(Object.keys(experienceAudits)).toEqual(['current', 'cleoRefresh']);
  });

  it('resolves every experience × theme pair against its own primitive palette', () => {
    const result = buildTokens(dump('experiences'));
    const semantics = result.semOut.content.primary;
    for (const theme of ['base', 'chat', 'roast', 'hype']) {
      for (const snapshot of [semantics, semantics.$experiences.cleoRefresh]) {
        const value = resolveTheme(snapshot, theme);
        const primitive = value.$ref === 'brown.800' ? result.primOut.brown['800'] : result.primOut.brown['50'];
        const palette = snapshot === semantics ? primitive : primitive.$experiences.cleoRefresh;
        expect(value.$value).toBe(palette.$value);
      }
    }
  });

  it('does not inherit a Current theme override when Refresh resolves to its own Base', () => {
    const source = dump('experiences');
    source.variables[1].valuesByMode.refresh = source.variables[1].valuesByMode.value;
    source.variables[2].valuesByMode.chat = source.variables[0].valuesByMode.refresh;
    const role = buildTokens(source).semOut.content.primary;
    expect(role.$themes.chat).toEqual({ $value: '#112233' });
    const refresh = role.$experiences.cleoRefresh;
    expect(refresh.$themes).not.toHaveProperty('chat');
    expect(resolveTheme(refresh, 'chat')).toEqual({ $value: '#112233', $ref: 'brown.800' });
  });

  it('rejects ambiguous and missing Current experience modes', () => {
    const source = dump('experiences');
    source.collections[0].modes[0].name = 'Legacy';
    expect(() => buildTokens(source)).toThrow(/no "Current" mode/);
    source.collections[0].modes[0].name = 'Current';
    source.collections[0].modes.push({ modeId: 'other', name: 'cleoRefresh' });
    expect(() => buildTokens(source)).toThrow(/duplicate experience mode names/);
  });

  it('rejects a primitive missing its Refresh value', () => {
    const source = dump('experiences');
    delete source.variables[0].valuesByMode.refresh;
    expect(() => buildTokens(source)).toThrow(/brown\/800 has no value for mode refresh/);
  });

  it('includes Refresh-only changes and removals in the diff without duplicating token keys', () => {
    const before = buildTokens(dump('experiences'));
    const source = dump('experiences');
    source.variables[0].valuesByMode.refresh.r = 1;
    const after = buildTokens(source);
    expect([...diffFlat(flatten(before.primOut), flatten(after.primOut)).changed.keys()])
      .toEqual(['brown.800@experience:cleoRefresh']);
    expect(diffFlat(flatten(before.semOut), flatten(after.semOut)).changed.has('content.primary@experience:cleoRefresh')).toBe(true);
    const removed = diffFlat(flatten(before.primOut), flatten(buildTokens(dump('modes')).primOut));
    expect([...removed.removed.keys()]).toEqual(['brown.50@experience:cleoRefresh', 'brown.800@experience:cleoRefresh']);
    expect(buildKeyUnions(before.primOut, before.semOut)).toEqual(buildKeyUnions(after.primOut, after.semOut));
  });

  it('writes both experiences and blocks removing one through the CLI', () => {
    const dir = tempProject('experiences');
    expect(runCli(dir).exitCode).toBe(0);
    const file = join(dir, 'tokens/color/semantic.json');
    const original = readFileSync(file, 'utf8');
    expect(readSemantic(dir).content.primary.$experiences.cleoRefresh.$value).toBe('#112233');
    expect(runCli(dir).exitCode).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(original);
    cpSync(join(DUMPS, 'modes.json'), join(dir, 'figma-exports/figma-dump.json'));
    expect(runCli(dir).exitCode).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe(original);
  });

  it('fails the CLI for ambiguity present only in the Refresh palette', () => {
    const dir = tempProject('experiences');
    const source = dump('experiences');
    for (const variable of source.variables.filter((v: { collectionId: string }) => v.collectionId === 'palette')) {
      variable.valuesByMode.refresh = source.variables[0].valuesByMode.value;
    }
    source.variables[2].valuesByMode.base = source.variables[0].valuesByMode.value;
    writeFileSync(join(dir, 'figma-exports/figma-dump.json'), JSON.stringify(source));
    const result = runCli(dir);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('Validating experience: cleoRefresh');
    expect(existsSync(join(dir, 'tokens/color/primitives.json'))).toBe(false);
  });

  it('keeps output stable when primitive modes are reordered', () => {
    const source = dump('experiences');
    const expected = buildTokens(source);
    source.collections[0].modes.reverse();
    expect(buildTokens(source).primOut).toEqual(expected.primOut);
    expect(buildTokens(source).semOut).toEqual(expected.semOut);
  });
});

describe('experience snapshot verification', () => {
  function generatedProject() {
    const dir = tempProject('full');
    cpSync(join(HERE, 'verify-tokens.mjs'), join(dir, 'scripts/verify-tokens.mjs'));
    const source = dump('full');
    const palette = source.collections.find((c: { name: string }) => c.name === 'Base Colors');
    palette.modes = [{ modeId: palette.defaultModeId, name: 'Current' }, { modeId: 'refresh', name: 'Cleo Refresh' }];
    for (const variable of source.variables.filter((v: { collectionId: string }) => v.collectionId === palette.id)) {
      variable.valuesByMode.refresh = { ...variable.valuesByMode[palette.defaultModeId] };
      if (variable.name.toLowerCase() === 'brown/800') {
        variable.valuesByMode.refresh = { r: 18 / 255, g: 52 / 255, b: 86 / 255, a: 1 };
      }
    }
    writeFileSync(join(dir, 'figma-exports/figma-dump.json'), JSON.stringify(source));
    expect(runCli(dir).exitCode).toBe(0);
    return dir;
  }

  function verify(dir: string) {
    const result = spawnSync('node', [join(dir, 'scripts/verify-tokens.mjs')], { encoding: 'utf8' });
    return { exitCode: result.status, output: result.stderr };
  }

  it('accepts generated experience snapshots with the existing vocabulary and known gaps', () => {
    expect(verify(generatedProject()).exitCode).toBe(0);
  });

  it('rejects a mismatched hex in a Refresh theme override', () => {
    const dir = generatedProject();
    const file = join(dir, 'tokens/color/semantic.json');
    const tree = JSON.parse(readFileSync(file, 'utf8'));
    tree.core.content.primary.$experiences = { cleoRefresh: { $ref: 'brown.800', $themes: { roast: { $value: '#FFFFFF', $ref: 'brown.50' } } } };
    writeFileSync(file, JSON.stringify(tree, null, 2) + '\n');
    const result = verify(dir);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('core.content.primary@experience:cleoRefresh@roast $value');
  });

  it('rejects an incomplete palette snapshot instead of falling back to Current', () => {
    const dir = generatedProject();
    const file = join(dir, 'tokens/color/primitives.json');
    const tree = JSON.parse(readFileSync(file, 'utf8'));
    delete tree.brown['800'].$experiences;
    writeFileSync(file, JSON.stringify(tree, null, 2) + '\n');
    const result = verify(dir);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('inconsistent primitive experiences for brown.800');
  });

  it('rejects an unknown theme inside Refresh', () => {
    const dir = generatedProject();
    const file = join(dir, 'tokens/color/semantic.json');
    const tree = JSON.parse(readFileSync(file, 'utf8'));
    tree.core.content.primary.$experiences = { cleoRefresh: { $ref: 'brown.800', $themes: { unknown: { $ref: 'brown.800' } } } };
    writeFileSync(file, JSON.stringify(tree, null, 2) + '\n');
    const result = verify(dir);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('core.content.primary@experience:cleoRefresh@unknown uses a theme outside');
  });
});

describe('Color Roles vocabulary migration', () => {
  function migrationProject() {
    const dir = tempProject('full');
    expect(runCli(dir).exitCode).toBe(0);
    cpSync(join(HERE, 'verify-tokens.mjs'), join(dir, 'scripts/verify-tokens.mjs'));
    const legacy = dump('full');
    const palette = legacy.collections.find((c: { name: string }) => c.name === 'Base Colors');
    const primitives = legacy.variables.filter((v: { collectionId: string }) => v.collectionId === palette.id);
    palette.name = 'Color Primitives';
    palette.modes = [{ modeId: palette.defaultModeId, name: 'Current' }, { modeId: 'refresh', name: 'Cleo Refresh' }];
    for (const primitive of primitives) {
      primitive.valuesByMode.refresh = { ...primitive.valuesByMode[palette.defaultModeId] };
      if (primitive.name.toLowerCase() === 'brown/800') primitive.valuesByMode.refresh = { r: 17 / 255, g: 34 / 255, b: 51 / 255, a: 1 };
    }
    const modern = dump('experiences');
    modern.collections[1].modes.sort((a: { name: string }, b: { name: string }) =>
      ['Base', 'Chat', 'Roast', 'Hype'].indexOf(a.name) - ['Base', 'Chat', 'Roast', 'Hype'].indexOf(b.name));
    const ids = new Map(modern.variables.filter((v: { collectionId: string }) => v.collectionId === 'palette')
      .map((v: { id: string; name: string }) => [v.id, primitives.find((p: { name: string }) => p.name.toLowerCase() === v.name).id]));
    const roles = modern.variables.filter((v: { collectionId: string }) => v.collectionId === 'roles');
    for (const role of roles) {
      role.description = `Token: core.${role.name.replaceAll('/', '.')}`;
      for (const value of Object.values(role.valuesByMode) as { id: string }[]) value.id = ids.get(value.id);
    }
    const source = { ...modern, collections: [palette, modern.collections[1]], variables: [...primitives, ...roles] };
    writeFileSync(join(dir, 'figma-exports/figma-dump.json'), JSON.stringify(source));
    const previous = readSemantic(dir);
    return { dir, source, previous };
  }

  it('maps renamed roles and retains every existing Current key and value through the real CLI', () => {
    const { dir, previous } = migrationProject();
    const result = runCli(dir);
    expect(result.exitCode, result.output.slice(-1500)).toBe(0);
    const tree = readSemantic(dir);
    const oldLeaves = [...walk(previous)];
    const newLeaves = [...walk(tree)];
    expect(newLeaves).toHaveLength(473);
    for (let i = 0; i < oldLeaves.length; i++) {
      const { $experiences, ...current } = newLeaves[i].node;
      expect(current).toEqual(oldLeaves[i].node);
      expect($experiences).toHaveProperty('cleoRefresh');
    }
    expect(tree).not.toHaveProperty('content');
    expect(tree.core.content.primary.$experiences.cleoRefresh.$value).toBe('#112233');
    const fallback = newLeaves.find(({ path, node }) => path.join('.') !== 'core.content.primary' && node.$ref === 'brown.800');
    expect(fallback.node.$experiences.cleoRefresh.$value).toBe('#112233');
    const verified = spawnSync('node', [join(dir, 'scripts/verify-tokens.mjs')], { encoding: 'utf8' });
    expect(verified.status, verified.stderr).toBe(0);
    const first = readFileSync(join(dir, 'tokens/color/semantic.json'), 'utf8');
    expect(runCli(dir).exitCode).toBe(0);
    expect(readFileSync(join(dir, 'tokens/color/semantic.json'), 'utf8')).toBe(first);
  });

  it('keeps released Current values when the new semantic definitions differ', () => {
    const { dir, source, previous } = migrationProject();
    const roles = source.variables.filter((v: { collectionId: string }) => v.collectionId === 'roles');
    roles[0].valuesByMode.base = { ...roles[1].valuesByMode.base };
    writeFileSync(join(dir, 'figma-exports/figma-dump.json'), JSON.stringify(source));
    const result = runCli(dir);
    expect(result.exitCode, result.output.slice(-1500)).toBe(0);
    const tree = readSemantic(dir);
    expect(tree.core.content.primary.$value).toBe(previous.core.content.primary.$value);
    expect(tree.core.content.primary.$experiences.cleoRefresh.$ref).toBe('brown.50');
    expect(result.output).toContain('preserved Current');
  });

  it.each(['missing', 'unknown', 'duplicate'])('rejects %s compatibility mappings without writing', (kind) => {
    const { dir, source } = migrationProject();
    const roles = source.variables.filter((v: { collectionId: string }) => v.collectionId === 'roles');
    if (kind === 'missing') delete roles[0].description;
    if (kind === 'unknown') roles[0].description = 'Token: unknown.role';
    if (kind === 'duplicate') {
      roles[1].name = 'background/primary';
      roles[1].description = roles[0].description;
    }
    writeFileSync(join(dir, 'figma-exports/figma-dump.json'), JSON.stringify(source));
    const file = join(dir, 'tokens/color/semantic.json');
    const before = readFileSync(file, 'utf8');
    const result = runCli(dir);
    expect(result.exitCode).toBe(2);
    expect(result.output).toMatch(/mapping/);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('rejects a Current primitive change during the experience migration', () => {
    const { dir, source } = migrationProject();
    const palette = source.collections[0];
    source.variables[0].valuesByMode[palette.defaultModeId].r = 1;
    writeFileSync(join(dir, 'figma-exports/figma-dump.json'), JSON.stringify(source));
    const result = runCli(dir);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('Current primitive');
  });

  it('preserves an additional role whose copied description shares a canonical mapping', () => {
    const { dir, source } = migrationProject();
    const roles = source.variables.filter((v: { collectionId: string }) => v.collectionId === 'roles');
    roles[1].name = 'background/navbar';
    roles[1].description = roles[0].description;
    writeFileSync(join(dir, 'figma-exports/figma-dump.json'), JSON.stringify(source));
    const result = runCli(dir);
    expect(result.exitCode, result.output.slice(-1500)).toBe(0);
    const tree = readSemantic(dir);
    expect([...walk(tree)]).toHaveLength(474);
    expect(tree.background.navbar.$experiences.cleoRefresh).toBeDefined();
    expect(tree.core.content.primary.$experiences.cleoRefresh.$value).toBe('#112233');
    const verified = spawnSync('node', [join(dir, 'scripts/verify-tokens.mjs')], { encoding: 'utf8' });
    expect(verified.status, verified.stderr).toBe(0);
    const first = readFileSync(join(dir, 'tokens/color/semantic.json'), 'utf8');
    expect(runCli(dir).exitCode).toBe(0);
    expect(readFileSync(join(dir, 'tokens/color/semantic.json'), 'utf8')).toBe(first);
  });

  it('still requires every published key when an addition keeps the overall count unchanged', () => {
    const { dir } = migrationProject();
    expect(runCli(dir).exitCode).toBe(0);
    const file = join(dir, 'tokens/color/semantic.json');
    const tree = JSON.parse(readFileSync(file, 'utf8'));
    tree.core.content.newPrimary = tree.core.content.primary;
    delete tree.core.content.primary;
    writeFileSync(file, JSON.stringify(tree, null, 2) + '\n');
    const verified = spawnSync('node', [join(dir, 'scripts/verify-tokens.mjs')], { encoding: 'utf8' });
    expect(verified.status).toBe(2);
    expect(verified.stderr).toContain('missing required published key "core.content.primary"');
  });
});

describe('mode-based colour collections', () => {
  it('resolves every mode, using Base even when the collection defaults to Roast', () => {
    const { primOut, semOut, themes, audit } = buildTokens(dump('modes'));
    expect(primOut.brown['800'].$value).toBe('#47201C');
    expect(semOut.content.primary).toEqual({
      $type: 'color', $value: '#47201C', $ref: 'brown.800',
      $themes: {
        roast: { $value: '#F8F6F2', $ref: 'brown.50' },
        hype: { $value: '#F8F6F2', $ref: 'brown.50' },
      },
    });
    expect(semOut.content.secondary.$value).toBe('#F8F6F2');
    expect(themes).toEqual(['Base', 'Roast', 'Chat', 'Hype']);
    expect(audit.semanticRoleCount).toBe(2);
    expect(renderTokenKeysFile({ ...buildKeyUnions(primOut, semOut), themes }))
      .toContain("export type ColorTheme = 'base' | 'roast' | 'chat' | 'hype'");
  });

  it('supports the original Modes collection when Themes is absent', () => {
    const source = dump('modes');
    source.collections[0].name = 'Base Colors';
    source.collections[1].name = 'Modes';
    expect(buildTokens(source).semOut).toEqual(buildTokens(dump('modes')).semOut);
  });

  it('keeps preferring Themes when a file also carries its mode-based migration', () => {
    const legacy = dump('valid');
    const modern = dump('modes');
    expect(buildTokens({
      ...legacy,
      collections: [...modern.collections, ...legacy.collections],
      variables: [...modern.variables, ...legacy.variables],
    }).semOut).toEqual(buildTokens(legacy).semOut);
  });

  it('rejects an ambiguous collection name', () => {
    const source = dump('modes');
    source.collections.push({ ...source.collections[1], id: 'other-roles' });
    expect(() => buildTokens(source)).toThrow(/multiple collections named "Color Roles"/);
  });

  it('rejects a collection without Base rather than treating another mode as Base', () => {
    const source = dump('modes');
    source.collections[1].modes = source.collections[1].modes.filter((m: { name: string }) => m.name !== 'Base');
    expect(() => buildTokens(source)).toThrow(/has no "Base" mode/);
  });

  it('rejects theme names that would collide after lowercasing', () => {
    const source = dump('modes');
    source.collections[1].modes.push({ modeId: 'other-chat', name: 'CHAT' });
    expect(() => buildTokens(source)).toThrow(/duplicate theme mode names/);
  });

  it('rejects a missing non-default mode value instead of copying Base', () => {
    const source = dump('modes');
    delete source.variables[2].valuesByMode.hype;
    expect(() => buildTokens(source)).toThrow(/content\/primary has no value for mode hype/);
  });

  it('checks aliases in non-default modes', () => {
    const source = dump('modes');
    source.variables[2].valuesByMode.chat.id = 'missing';
    expect(buildTokens(source).audit.danglingIds).toEqual([
      { path: 'semantic.content.primary@chat', id: 'missing', collection: 'Color Roles' },
    ]);
    source.variables[2].valuesByMode.chat.id = 'secondary';
    expect(buildTokens(source).audit.semanticAliases).toEqual([
      { path: 'semantic.content.primary@chat', target: 'content/secondary' },
    ]);
  });

  it('rejects colliding role paths within a mode', () => {
    const source = dump('modes');
    source.variables.push({ ...source.variables[2], id: 'duplicate', name: 'Content/Primary' });
    expect(() => buildTokens(source)).toThrow(/duplicate token key "content.primary"/);
  });

  it('recovers literal colours independently for each mode', () => {
    const source = dump('modes');
    source.variables[2].valuesByMode.chat = source.variables[1].valuesByMode.value;
    const result = buildTokens(source);
    expect(result.semOut.content.primary.$themes.chat).toEqual({ $value: '#F8F6F2', $ref: 'brown.50' });
    expect(result.audit.recoveredByHex).toEqual([
      { path: 'semantic.content.primary@chat', target: 'brown.50', hex: '#F8F6F2' },
    ]);
  });

  it('keeps the CLI removal guard when switching to the new source', () => {
    const dir = tempProject('valid');
    expect(runCli(dir).exitCode).toBe(0);
    const oldSemantic = readFileSync(join(dir, 'tokens/color/semantic.json'), 'utf8');
    const oldKeys = readFileSync(join(dir, 'src/generated/tokenKeys.ts'), 'utf8');
    cpSync(join(DUMPS, 'modes.json'), join(dir, 'figma-exports/figma-dump.json'));
    expect(runCli(dir).exitCode).toBe(1);
    expect(readFileSync(join(dir, 'tokens/color/semantic.json'), 'utf8')).toBe(oldSemantic);
    expect(readFileSync(join(dir, 'src/generated/tokenKeys.ts'), 'utf8')).toBe(oldKeys);
    expect(runCli(dir, ['--allow-removals']).exitCode).toBe(0);
    const emitted = readSemantic(dir);
    expect(emitted.content.primary.$themes.roast.$value).toBe('#F8F6F2');
  });
});

// ---------- build: failure classes ----------

describe('canonical ordering', () => {
  it('orders palette scales numerically, not lexicographically', () => {
    expect(['500', '50', '1000', '100'].sort(naturalCompare)).toEqual(['50', '100', '500', '1000']);
  });

  it('orders mixed segments by text then number', () => {
    expect(['level10', 'level2', 'alpha', 'level1'].sort(naturalCompare)).toEqual([
      'alpha',
      'level1',
      'level2',
      'level10',
    ]);
  });

  it('emits identical output whatever order the dump lists things in', () => {
    // Figma's own variable order leaks into the dump. Before this was imposed, a designer
    // reordering variables produced a whole-file diff with no value changes.
    const source = dump('valid');
    const shuffled = {
      ...source,
      collections: [...source.collections].reverse(),
      variables: [...source.variables].reverse(),
    };

    const a = buildTokens(source);
    const b = buildTokens(shuffled);

    expect(JSON.stringify(b.semOut)).toEqual(JSON.stringify(a.semOut));
    expect(JSON.stringify(b.primOut)).toEqual(JSON.stringify(a.primOut));
    expect(buildKeyUnions(b.primOut, b.semOut)).toEqual(buildKeyUnions(a.primOut, a.semOut));
  });
});

describe('buildTokens validation', () => {
  it('records a dangling alias id with its collection', () => {
    const { audit } = buildTokens(dump('dangling-id'));
    expect(audit.danglingIds).toEqual([{ path: 'semantic.core.content.primary@base', id: 'VariableID:9:999', collection: 'Themes' }]);
  });

  it('records a dead reference when the target is outside the token set', () => {
    const { audit } = buildTokens(dump('dead-ref'));
    expect(audit.deadRefs).toEqual([{ path: 'semantic.core.content.primary@base', target: 'Legacy/Blue', collection: 'Modes' }]);
    expect(audit.danglingIds).toHaveLength(0);
  });

  it('distinguishes a semantic->semantic alias from a dead reference', () => {
    const { audit } = buildTokens(dump('semantic-alias'));
    expect(audit.semanticAliases).toEqual([{ path: 'semantic.core.content.secondary@base', target: 'Base/Core/Content/Primary' }]);
    expect(audit.deadRefs).toHaveLength(0);
  });

  it('records an ambiguous hex recovery with its candidates', () => {
    const { audit } = buildTokens(dump('ambiguous-hex'));
    expect(audit.ambiguousHex).toHaveLength(1);
    expect(audit.ambiguousHex[0].candidates).toEqual(['brown.800', 'brown.801']);
  });

  it('throws on two paths in one bucket collapsing to the same key', () => {
    expect(() => buildTokens(dump('collision'))).toThrow(/duplicate token key "brown\.800"/);
  });

  it('throws on an unrecognised dump schema', () => {
    expect(() => buildTokens({ $schema: 'something-else/9', collections: [], variables: [] })).toThrow(/unrecognised dump schema/);
  });

  it('throws when a configured collection is absent from the dump', () => {
    expect(() => buildTokens({ $schema: 'cleo-figma-dump/1', collections: [], variables: [] })).toThrow(
      /no collection named "Base Colors"/,
    );
  });
});

// ---------- value equivalence against the pre-restructure files ----------

describe('value equivalence with the pre-restructure token files', () => {
  // spec/fixtures/expected-resolved.json was captured from the committed
  // `{Base,Chat,Roast,Hype}`-nested files by reading their hex strings directly,
  // not by round-tripping them through the dump synthesiser. So a bug in
  // hex -> float -> hex fails here instead of cancelling out on both sides.
  const expected = JSON.parse(readFileSync(EXPECTED, 'utf8'));
  const { primOut, semOut } = buildTokens(dump('full'));

  const leaves = new Map<string, Record<string, never>>();
  for (const { path, node } of walk(semOut)) leaves.set(path.join('.'), node);

  it('resolves all 1880 (theme, role) pairs to the identical hex', () => {
    const mismatches: string[] = [];
    let pairs = 0;
    for (const [theme, roles] of Object.entries(expected.semantic as Record<string, Record<string, string>>)) {
      for (const [key, hex] of Object.entries(roles)) {
        pairs++;
        const resolved = resolveTheme(leaves.get(key)!, theme);
        if (resolved?.$value !== hex) mismatches.push(`${theme}/${key}: expected ${hex}, got ${resolved?.$value}`);
      }
    }
    expect(pairs).toBe(1880);
    expect(mismatches).toEqual([]);
  });

  it('reproduces all 106 primitive hexes byte-identically', () => {
    const actual = new Map<string, string>();
    for (const { path, node } of walk(primOut)) actual.set(path.join('.'), node.$value);
    expect(actual.size).toBe(106);
    const mismatches = Object.entries(expected.primitives as Record<string, string>)
      .filter(([key, hex]) => actual.get(key) !== hex)
      .map(([key, hex]) => `${key}: expected ${hex}, got ${actual.get(key)}`);
    expect(mismatches).toEqual([]);
  });

  it('leaves primitive fetch keys unchanged, so every $ref stays valid', () => {
    const primKeys = new Set([...walk(primOut)].map(({ path }) => path.join('.')));
    expect([...primKeys].sort()).toEqual(Object.keys(expected.primitives).sort());
    const danglingRefs = [...walk(semOut)]
      .flatMap(({ path, node }) =>
        [node.$ref, ...Object.values(node.$themes ?? {}).map((o: { $ref?: string }) => o.$ref)]
          .filter(Boolean)
          .map((ref) => ({ path: path.join('.'), ref })),
      )
      .filter(({ ref }) => !primKeys.has(ref as string));
    expect(danglingRefs).toEqual([]);
  });

  it('collapses 1880 leaf entries into 473 roles plus 336 overrides', () => {
    const { audit } = buildTokens(dump('full'));
    const overrides = Object.values(audit.themeOverrides).reduce((a: number, b) => a + (b as number), 0);
    expect(audit.semanticRoleCount).toBe(473);
    expect(overrides).toBe(336);
    expect(audit.themeOverrides).toEqual({ chat: 30, roast: 171, hype: 135 });
  });
});

// ---------- resolveTheme ----------

describe('resolveTheme', () => {
  const leaf = {
    $type: 'color',
    $value: '#47201C',
    $ref: 'brown.800',
    $themes: { roast: { $value: '#F8F6F2', $ref: 'brown.50' } },
  };

  it('returns the override when the theme has one', () => {
    expect(resolveTheme(leaf, 'roast')).toEqual({ $value: '#F8F6F2', $ref: 'brown.50' });
  });

  it('falls back to Base when the theme has no override', () => {
    expect(resolveTheme(leaf, 'chat')).toEqual({ $value: '#47201C', $ref: 'brown.800' });
  });

  it('returns undefined when there is no Base value and no override', () => {
    const themeOnly = { $type: 'color', $themes: { chat: { $value: '#F8F6F2' } } };
    expect(resolveTheme(themeOnly, 'roast')).toBeUndefined();
  });
});

// ---------- diff ----------

describe('flatten', () => {
  it('emits one entry per role and one per theme override', () => {
    const tree = {
      core: {
        content: {
          primary: { $type: 'color', $value: '#47201C', $ref: 'brown.800', $themes: { roast: { $value: '#F8F6F2', $ref: 'brown.50' } } },
        },
      },
    };
    expect([...flatten(tree).entries()]).toEqual([
      ['core.content.primary', '#47201C {brown.800}'],
      ['core.content.primary@roast', '#F8F6F2 {brown.50}'],
    ]);
  });

  it('describes a role with no Base value rather than stringifying undefined', () => {
    const tree = { core: { border: { level0: { $type: 'color', $themes: { chat: { $value: '#F8F6F2' } } } } } };
    expect(flatten(tree).get('core.border.level0')).toBe('(no base value)');
  });
});

describe('diffFlat', () => {
  it('reports a changed theme override as a change on that role', () => {
    const before = new Map([['core.content.primary@roast', '#F8F6F2 {brown.50}']]);
    const after = new Map([['core.content.primary@roast', '#291210 {brown.900}']]);
    expect([...diffFlat(before, after).changed.keys()]).toEqual(['core.content.primary@roast']);
  });

  it('reports a dropped override as a removal', () => {
    const before = new Map([
      ['core.content.primary', '#47201C {brown.800}'],
      ['core.content.primary@roast', '#F8F6F2 {brown.50}'],
    ]);
    const after = new Map([['core.content.primary', '#47201C {brown.800}']]);
    expect([...diffFlat(before, after).removed.keys()]).toEqual(['core.content.primary@roast']);
  });
});

// ---------- emitted types ----------

describe('buildKeyUnions / renderTokenKeysFile', () => {
  it('returns a sorted key list per bucket', () => {
    const { primOut, semOut } = buildTokens(dump('valid'));
    const unions = buildKeyUnions(primOut, semOut);
    expect(unions.primitives).toEqual(['brown.50', 'brown.800']);
    expect(unions.semantic).toEqual([
      'core.content.primary',
      'creditScore.ui.bandLabel',
      'effects.background.glassMorphism',
      'ewa.dataVisPrimary',
    ]);
  });

  it('emits exactly 106 primitive and 473 semantic keys for the real corpus', () => {
    const { primOut, semOut } = buildTokens(dump('full'));
    const unions = buildKeyUnions(primOut, semOut);
    expect(unions.primitives).toHaveLength(106);
    expect(unions.semantic).toHaveLength(473);
  });

  it('renders one union per bucket plus the theme union', () => {
    const out = renderTokenKeysFile({ primitives: ['brown.800'], semantic: ['core.content.primary'], themes: ['Base', 'Chat'] });
    expect(out).toContain('export type ColorPrimitiveKey =');
    expect(out).toContain('export type ColorSemanticKey =');
    expect(out).toContain("export type ColorTheme = 'base' | 'chat';");
  });

  it('keeps each bucket to its own union', () => {
    const out = renderTokenKeysFile({ primitives: ['brown.800'], semantic: ['core.content.primary'], themes: ['Base'] });
    const [, primBlock, semBlock] = out.split('export type ');
    expect(primBlock).toContain("'brown.800'");
    expect(primBlock).not.toContain("'core.content.primary'");
    expect(semBlock).toContain("'core.content.primary'");
    expect(semBlock).not.toContain("'brown.800'");
  });

  it('is stable across repeat calls with the same input', () => {
    const unions = { primitives: ['a.a'], semantic: ['b.b'], themes: ['Base'] };
    expect(renderTokenKeysFile(unions)).toBe(renderTokenKeysFile(unions));
  });
});

// ---------- CLI integration ----------

describe('transform.mjs CLI', () => {
  it('exits 0 under --check and writes nothing', () => {
    const dir = tempProject('valid');
    expect(runCli(dir, ['--check']).exitCode).toBe(0);
    expect(existsSync(join(dir, 'tokens', 'color', 'primitives.json'))).toBe(false);
    expect(existsSync(join(dir, 'src', 'generated', 'tokenKeys.ts'))).toBe(false);
  });

  it('writes all three outputs on a clean run', () => {
    const dir = tempProject('valid');
    expect(runCli(dir).exitCode).toBe(0);
    expect(existsSync(join(dir, 'tokens', 'color', 'primitives.json'))).toBe(true);
    expect(existsSync(join(dir, 'tokens', 'color', 'semantic.json'))).toBe(true);
    expect(existsSync(join(dir, 'src', 'generated', 'tokenKeys.ts'))).toBe(true);
  });

  it('is byte-stable on a re-run over unchanged input', () => {
    const dir = tempProject('valid');
    runCli(dir);
    const first = ['tokens/color/primitives.json', 'tokens/color/semantic.json', 'src/generated/tokenKeys.ts'].map((f) =>
      readFileSync(join(dir, f), 'utf8'),
    );
    runCli(dir);
    const second = ['tokens/color/primitives.json', 'tokens/color/semantic.json', 'src/generated/tokenKeys.ts'].map((f) =>
      readFileSync(join(dir, f), 'utf8'),
    );
    expect(second).toEqual(first);
  });

  it('exits 1 on a removal without --allow-removals, and 0 with it', () => {
    const dir = tempProject('valid');
    expect(runCli(dir).exitCode).toBe(0);

    // drop a themed role from the dump, then re-run
    const dumpPath = join(dir, 'figma-exports', 'figma-dump.json');
    const raw = JSON.parse(readFileSync(dumpPath, 'utf8'));
    raw.variables = raw.variables.filter((v: { name: string }) => v.name !== 'Base/EWA/DataVisPrimary');
    writeFileSync(dumpPath, JSON.stringify(raw));

    const blocked = runCli(dir, ['--check']);
    expect(blocked.exitCode).toBe(1);
    expect(blocked.output).toMatch(/would be removed/);
    expect(runCli(dir, ['--allow-removals', '--check']).exitCode).toBe(0);
  });

  it('exits 2 on each validation failure', () => {
    for (const fixture of ['dangling-id', 'dead-ref', 'semantic-alias', 'ambiguous-hex', 'collision']) {
      expect(runCli(tempProject(fixture), ['--check']).exitCode, fixture).toBe(2);
    }
  });

  it('exits non-zero with a pointer when the dump is missing', () => {
    const dir = tempProject('valid');
    rmSync(join(dir, 'figma-exports', 'figma-dump.json'));
    const { exitCode, output } = runCli(dir, ['--check']);
    expect(exitCode).toBe(1);
    expect(output).toMatch(/Missing input/);
  });

  it('reports skipped types, ignored collections and Base gaps on stderr', () => {
    const { output } = runCli(tempProject('missing-base'), ['--check']);
    expect(output).toMatch(/missing from the Base theme/);
    expect(output).toMatch(/core\.border\.level0/);
  });
});
