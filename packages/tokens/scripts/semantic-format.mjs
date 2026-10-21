import { walk, sortTree, die } from "./transform-core.mjs";

export const SEMANTIC_REFERENCE_SCHEMA = "cleo-semantic-references/1";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function setLeaf(tree, path, leaf) {
  let cursor = tree;
  for (const part of path.slice(0, -1)) cursor = cursor[part] ??= {};
  cursor[path.at(-1)] = leaf;
}

function primitivePalettes(primitives) {
  const leaves = [...walk(primitives)];
  const experiences = Object.keys(leaves[0]?.node.$experiences ?? {});
  const palettes = new Map([["current", new Map()]]);
  for (const experience of experiences) palettes.set(experience, new Map());
  for (const { path, node } of leaves) {
    if (JSON.stringify(Object.keys(node.$experiences ?? {}).sort()) !== JSON.stringify([...experiences].sort())) {
      die(`✗ inconsistent primitive experiences for ${path.join(".")}`, 2);
    }
    for (const [experience, palette] of palettes) {
      const value = (experience === "current" ? node : node.$experiences[experience])?.$value;
      if (typeof value !== "string") die(`✗ missing primitive value for ${path.join(".")} in ${experience}`, 2);
      palette.set(path.join("."), value);
    }
  }
  return palettes;
}

function resolveBinding(binding, palette, label, compact) {
  if (!isObject(binding)) die(`✗ invalid semantic binding for ${label}`, 2);
  if (binding.$ref !== undefined) {
    if (typeof binding.$ref !== "string" || !palette.has(binding.$ref)) {
      die(`✗ invalid primitive reference ${JSON.stringify(binding.$ref)} for ${label}`, 2);
    }
    const value = palette.get(binding.$ref);
    if (binding.$value !== undefined && binding.$value !== value) die(`✗ ${label} $value does not match its primitive reference`, 2);
    if (compact && binding.$value !== undefined) die(`✗ ${label} must store a reference or a literal, not both`, 2);
    return { $value: value, $ref: binding.$ref };
  }
  if (typeof binding.$value !== "string") die(`✗ missing semantic value or primitive reference for ${label}`, 2);
  return { $value: binding.$value };
}

function resolveSnapshot(snapshot, palette, label, compact) {
  if (!isObject(snapshot) || snapshot.$experiences !== undefined) die(`✗ invalid semantic snapshot for ${label}`, 2);
  const result = snapshot.$ref !== undefined || snapshot.$value !== undefined
    ? resolveBinding(snapshot, palette, label, compact) : {};
  if (snapshot.$themes !== undefined) {
    if (!isObject(snapshot.$themes)) die(`✗ invalid themes for ${label}`, 2);
    result.$themes = Object.fromEntries(Object.entries(snapshot.$themes).map(([theme, binding]) => [
      theme, resolveBinding(binding, palette, `${label}@${theme}`, compact),
    ]));
  }
  if (result.$value === undefined && !Object.keys(result.$themes ?? {}).length) die(`✗ empty semantic snapshot for ${label}`, 2);
  return result;
}

// Expand before value diffs, compatibility migration and invariant checks. Sparse
// semantic experience overrides inherit bindings, never resolved Current hexes.
export function expandSemanticTokens(primitives, semantic) {
  if (semantic.$schema === undefined) return semantic; // legacy resolved snapshots
  if (semantic.$schema !== SEMANTIC_REFERENCE_SCHEMA) die(`✗ unsupported semantic schema ${JSON.stringify(semantic.$schema)}`, 2);
  const palettes = primitivePalettes(primitives);
  const result = {};
  for (const { path, node } of walk(semantic)) {
    const key = path.join(".");
    const { $experiences, ...base } = node;
    if ($experiences !== undefined && !isObject($experiences)) die(`✗ invalid semantic experiences for ${key}`, 2);
    for (const experience of Object.keys($experiences ?? {})) {
      if (experience === "current" || !palettes.has(experience)) die(`✗ unknown experience ${experience} for ${key}`, 2);
    }
    const leaf = { $type: node.$type, ...resolveSnapshot(base, palettes.get("current"), key, true) };
    if (node.$description !== undefined) leaf.$description = node.$description;
    for (const [experience, palette] of palettes) {
      if (experience === "current") continue;
      leaf.$experiences ??= {};
      leaf.$experiences[experience] = resolveSnapshot(
        Object.hasOwn($experiences ?? {}, experience) ? $experiences[experience] : base,
        palette, `${key}@experience:${experience}`, true,
      );
    }
    setLeaf(result, path, leaf);
  }
  return sortTree(result);
}

// Keep references and literal gaps; emit complete semantic snapshots only when
// their bindings differ. An explicit snapshot replaces Base and all its themes.
export function compactSemanticTokens(primitives, semantic) {
  const expanded = expandSemanticTokens(primitives, semantic);
  const palettes = primitivePalettes(primitives);
  function compactSnapshot(snapshot, palette, label) {
    const resolved = resolveSnapshot(snapshot, palette, label, false);
    const binding = (entry) => entry.$ref === undefined ? { $value: entry.$value } : { $ref: entry.$ref };
    const result = resolved.$value === undefined ? {} : binding(resolved);
    if (resolved.$themes) result.$themes = Object.fromEntries(Object.entries(resolved.$themes).map(([theme, entry]) => [theme, binding(entry)]));
    return result;
  }
  const result = { $schema: SEMANTIC_REFERENCE_SCHEMA };
  for (const { path, node } of walk(expanded)) {
    const key = path.join(".");
    const { $experiences, ...base } = node;
    const shared = compactSnapshot(base, palettes.get("current"), key);
    const { $themes, ...baseBinding } = shared;
    const leaf = { $type: node.$type, ...baseBinding };
    if (node.$description !== undefined) leaf.$description = node.$description;
    if ($themes !== undefined) leaf.$themes = $themes;
    for (const [experience, snapshot] of Object.entries($experiences ?? {})) {
      const palette = palettes.get(experience);
      if (!palette) die(`✗ unknown experience ${experience} for ${key}`, 2);
      const compact = compactSnapshot(snapshot, palette, `${key}@experience:${experience}`);
      if (JSON.stringify(compact) !== JSON.stringify(shared)) {
        leaf.$experiences ??= {};
        leaf.$experiences[experience] = compact;
      }
    }
    // Verify omissions are lossless against every experience, including literals.
    for (const experience of palettes.keys()) {
      if (experience !== "current" && !Object.hasOwn($experiences ?? {}, experience)) {
        die(`✗ missing legacy semantic snapshot for ${key} in ${experience}`, 2);
      }
    }
    setLeaf(result, path, leaf);
  }
  return sortTree(result);
}
