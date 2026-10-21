// Pure transform logic, importable without transform.mjs's top-level CLI side
// effects (file reads/writes, process.exit). transform.mjs is a thin driver over
// this module; tests exercise this module directly.
//
// Input is a verbatim Figma dump (`cleo-figma-dump/1`) produced by the plugin in
// COREEXP-323. Every interpretation happens here: name splitting, theme
// extraction, RGBA->hex, alias resolution by id, type filtering, and the
// collection -> output-file mapping. The plugin shapes nothing.

// ---------- config ----------

// Sources are tried in order so a file carrying both Themes and its Modes
// migration keeps exporting Themes until the legacy collection is removed.
// Unselected collections (including component-specific aliases) are ignored.
export const DEFAULT_CONFIG = {
  buckets: [
    {
      collection: "Base Colors",
      alternatives: [{ collection: "Color Primitives" }],
      bucket: "primitives",
      types: ["COLOR"],
      themeAxis: null,
    },
    {
      collection: "Themes",
      bucket: "semantic",
      types: ["COLOR"],
      themeAxis: { kind: "nameSegment", defaultTheme: "Base" },
      alternatives: [
        { collection: "Color Roles", themeAxis: { kind: "mode", defaultTheme: "Base" } },
        { collection: "Modes", themeAxis: { kind: "mode", defaultTheme: "Base" } },
      ],
    },
  ],
};

export const DUMP_SCHEMA = "cleo-figma-dump/1";

// ---------- key normalisation ----------

// Figma's authored casing -> lowerCamel. Space is the only character outside
// [A-Za-z0-9] anywhere in the tree, and an all-caps segment lowercases whole:
//
//   "Credit Score"   -> creditScore      "UI"  -> ui
//   "DataVisPrimary" -> dataVisPrimary   "EWA" -> ewa
//   "ShimmerAlpha 2" -> shimmerAlpha2    "800" -> 800
export function normaliseSegment(segment) {
  const words = segment.split(" ").filter(Boolean);
  if (!words.length) throw new Error(`empty name segment in ${JSON.stringify(segment)}`);
  return words
    .map((word, i) => {
      const w = /^[A-Z]+$/.test(word) ? word.toLowerCase() : word;
      return i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1);
    })
    .join("");
}

// The one helper behind `$ref` values, the collision check and the key unions,
// so the three can never disagree.
export function buildKey(segments) {
  return segments.map(normaliseSegment).join(".");
}

// ---------- colour ----------

// Figma reports colours as 0-1 floats. Channels round-trip exactly because the
// plugin writes them as byte/255.
export function rgbaToHex(value) {
  for (const channel of ["r", "g", "b"]) {
    if (typeof value?.[channel] !== "number") {
      throw new Error(`not an RGBA colour: ${JSON.stringify(value)}`);
    }
  }
  const byte = (n) => Math.round(n * 255).toString(16).padStart(2, "0").toUpperCase();
  const rgb = `#${byte(value.r)}${byte(value.g)}${byte(value.b)}`;
  const a = value.a ?? 1;
  return a >= 0.999 ? rgb : rgb + byte(a);
}

const isAlias = (v) => v !== null && typeof v === "object" && v.type === "VARIABLE_ALIAS";

// ---------- dump parsing ----------

export function parseDump(raw, config = DEFAULT_CONFIG) {
  if (raw?.$schema !== DUMP_SCHEMA) {
    die(`✗ unrecognised dump schema ${JSON.stringify(raw?.$schema)} — expected ${JSON.stringify(DUMP_SCHEMA)}`, 2);
  }
  const collectionsById = new Map((raw.collections ?? []).map((c) => [c.id, c]));
  const variablesById = new Map((raw.variables ?? []).map((v) => [v.id, v]));

  const bucketByCollectionId = new Map();
  for (const spec of config.buckets) {
    const sources = [spec, ...(spec.alternatives ?? []).map((source) => ({ ...spec, ...source }))];
    const source = sources.find((s) => (raw.collections ?? []).some((c) => c.name === s.collection));
    const matches = (raw.collections ?? []).filter((c) => c.name === source?.collection);
    const collection = matches[0];
    if (!collection) {
      die(`✗ dump has no collection named ${JSON.stringify(spec.collection)} (alternatives: ${sources.slice(1).map((s) => s.collection).join(", ") || "none"}) — found: ${[...collectionsById.values()].map((c) => c.name).join(", ")}`, 2);
    }
    if (matches.length > 1) {
      die(`✗ dump has multiple collections named ${JSON.stringify(collection.name)} — cannot choose a token source`, 2);
    }
    bucketByCollectionId.set(collection.id, { ...source, collection });
  }
  return { raw, collectionsById, variablesById, bucketByCollectionId };
}

// Variables belonging to a configured bucket, in dump order, with non-matching
// types counted rather than treated as errors — the `Themes` collection carries
// FLOAT variables that simply aren't ours.
function selectVariables(dump, audit) {
  const selected = [];
  for (const variable of dump.raw.variables ?? []) {
    const spec = dump.bucketByCollectionId.get(variable.collectionId);
    if (!spec) {
      const name = dump.collectionsById.get(variable.collectionId)?.name ?? variable.collectionId;
      audit.ignoredByCollection[name] = (audit.ignoredByCollection[name] ?? 0) + 1;
      continue;
    }
    if (!spec.types.includes(variable.resolvedType)) {
      const label = `${spec.collection.name}/${variable.resolvedType}`;
      audit.skippedByType[label] = (audit.skippedByType[label] ?? 0) + 1;
      continue;
    }
    selected.push({ variable, spec });
  }
  return selected;
}

// ---------- resolution ----------

function setPath(root, path, value) {
  let cursor = root;
  for (let i = 0; i < path.length - 1; i++) {
    cursor[path[i]] ??= {};
    cursor = cursor[path[i]];
  }
  cursor[path.at(-1)] = value;
}

function modeValue(variable, spec, modeId = spec.collection.defaultModeId) {
  const value = variable.valuesByMode?.[modeId];
  if (value === undefined) {
    die(`✗ ${variable.name} has no value for mode ${modeId} in ${spec.collection.name}`, 2);
  }
  return value;
}

export function newAudit() {
  return {
    primitiveCount: 0,
    semanticRoleCount: 0,
    themeOverrides: {},
    recoveredByHex: [],
    paletteGaps: [],
    missingBase: [],
    deadRefs: [],
    danglingIds: [],
    semanticAliases: [],
    ambiguousHex: [],
    skippedByType: {},
    ignoredByCollection: {},
  };
}

// Resolves one variable's colour to a hex plus, where it came from an alias, the
// primitive fetch key it points at. Single-hop only: an alias points at a
// primitive, never at another themed role.
function resolveColour({ variable, spec, modeId }, { dump, primHexByKey, primKeyById, hexIndex, audit }, label) {
  const value = modeValue(variable, spec, modeId);

  if (isAlias(value)) {
    const target = dump.variablesById.get(value.id);
    if (!target) {
      audit.danglingIds.push({ path: label, id: value.id, collection: spec.collection.name });
      return { hex: "#000000" }; // placeholder; the caller dies before this is written
    }
    const key = primKeyById.get(target.id);
    if (key) return { hex: primHexByKey.get(key), ref: key };

    const targetSpec = dump.bucketByCollectionId.get(target.collectionId);
    if (targetSpec?.bucket === "semantic") {
      audit.semanticAliases.push({ path: label, target: target.name });
    } else {
      const collection = dump.collectionsById.get(target.collectionId)?.name ?? target.collectionId;
      audit.deadRefs.push({ path: label, target: target.name, collection });
    }
    return { hex: "#000000" }; // placeholder; the caller dies before this is written
  }

  // A raw colour on a themed role means Figma holds a literal rather than an
  // alias. Recover the alias when exactly one primitive carries that hex; a tie
  // is fatal, so a missing `$ref` can only ever mean "genuine palette gap".
  const hex = rgbaToHex(value);
  const matches = hexIndex.get(hex);
  if (matches?.length === 1) {
    audit.recoveredByHex.push({ path: label, target: matches[0], hex });
    return { hex, ref: matches[0] };
  }
  if (matches?.length > 1) {
    audit.ambiguousHex.push({ path: label, hex, candidates: matches });
    return { hex }; // placeholder; the caller dies before this is written
  }
  return { hex };
}

// ---------- build ----------

export function buildTokens(rawDump, config = DEFAULT_CONFIG) {
  const dump = parseDump(rawDump, config);
  const primitiveSpec = [...dump.bucketByCollectionId.values()].find((spec) => spec.bucket === "primitives");
  const modes = primitiveSpec.collection.modes;
  if (modes.length === 1) return buildPaletteTokens(rawDump, config, modes[0].modeId);

  const current = modes.find((mode) => mode.name === "Current");
  if (!current) die(`✗ ${primitiveSpec.collection.name} has multiple palette modes but no "Current" mode`, 2);
  const experiences = modes.map((mode) => normaliseSegment(mode.name));
  if (new Set(experiences).size !== experiences.length) {
    die(`✗ ${primitiveSpec.collection.name} has duplicate experience mode names after normalisation`, 2);
  }

  // Each snapshot resolves aliases and literal recovery against its own palette.
  // Theme overrides are relative to that snapshot's Base, never to Current.
  const result = buildPaletteTokens(rawDump, config, current.modeId);
  result.experienceAudits = { current: result.audit };
  for (const mode of modes) {
    if (mode.modeId === current.modeId) continue;
    const experience = normaliseSegment(mode.name);
    const palette = buildPaletteTokens(rawDump, config, mode.modeId);
    result.experienceAudits[experience] = palette.audit;
    for (const bucket of ["primOut", "semOut"]) {
      const snapshots = new Map([...walk(palette[bucket])].map(({ path, node }) => [path.join("."), node]));
      for (const { path, node } of walk(result[bucket])) {
        const snapshot = { ...snapshots.get(path.join(".")) };
        delete snapshot.$type;
        delete snapshot.$description;
        node.$experiences ??= {};
        node.$experiences[experience] = snapshot;
      }
    }
  }
  result.primOut = sortTree(result.primOut);
  result.semOut = sortTree(result.semOut);
  return result;
}

function buildPaletteTokens(rawDump, config, primitiveModeId) {
  const dump = parseDump(rawDump, config);
  const audit = newAudit();
  const selected = selectVariables(dump, audit);

  // ---- primitives ----

  const primOut = {};
  const primHexByKey = new Map();
  const primKeyById = new Map();
  const hexIndex = new Map(); // hex -> [key, ...]
  const primKeyOrigin = new Map(); // key -> Figma name, for collision reporting

  for (const { variable, spec } of selected) {
    if (spec.bucket !== "primitives") continue;
    const segments = variable.name.split("/");
    const key = buildKey(segments);
    if (primKeyOrigin.has(key)) {
      die(`✗ duplicate token key ${JSON.stringify(key)} in ${spec.collection.name}: defined at both ${primKeyOrigin.get(key)} and ${variable.name}`, 2);
    }
    primKeyOrigin.set(key, variable.name);

    const hex = rgbaToHex(modeValue(variable, spec, primitiveModeId));
    const leaf = { $type: "color", $value: hex };
    if (variable.description) leaf.$description = variable.description;
    setPath(primOut, key.split("."), leaf);

    primHexByKey.set(key, hex);
    primKeyById.set(variable.id, key);
    if (!hexIndex.has(hex)) hexIndex.set(hex, []);
    hexIndex.get(hex).push(key);
    audit.primitiveCount++;
  }

  // ---- semantic ----

  const ctx = { dump, primHexByKey, primKeyById, hexIndex, audit };
  // role key -> { order, byTheme: Map<theme, {hex, ref}>, description }
  const roles = new Map();
  const themeOrder = [];
  let defaultTheme = null;

  for (const { variable, spec } of selected) {
    if (spec.bucket !== "semantic") continue;
    const segments = variable.name.split("/");

    let entries, rolePath;
    if (spec.themeAxis?.kind === "nameSegment") {
      if (segments.length < 2) {
        die(`✗ ${variable.name} in ${spec.collection.name} has no role path after its theme segment`, 2);
      }
      const [theme, ...path] = segments;
      rolePath = path;
      entries = [{ name: theme, modeId: spec.collection.defaultModeId }];
      defaultTheme ??= spec.themeAxis.defaultTheme;
    } else if (spec.themeAxis?.kind === "mode") {
      entries = spec.collection.modes;
      const baseTheme = spec.themeAxis.defaultTheme;
      if (!entries.some((mode) => mode.name === baseTheme)) {
        die(`✗ ${spec.collection.name} has no ${JSON.stringify(baseTheme)} mode`, 2);
      }
      const names = entries.map((mode) => mode.name.toLowerCase());
      if (new Set(names).size !== names.length) {
        die(`✗ ${spec.collection.name} has duplicate theme mode names`, 2);
      }
      rolePath = segments;
      defaultTheme ??= baseTheme;
    } else {
      const theme = spec.themeAxis?.defaultTheme ?? "Base";
      entries = [{ name: theme, modeId: spec.collection.defaultModeId }];
      rolePath = segments;
      defaultTheme ??= theme;
    }

    const key = buildKey(rolePath);
    let role = roles.get(key);
    if (!role) {
      role = { order: roles.size, byTheme: new Map(), origin: variable.name };
      roles.set(key, role);
    }
    for (const { name: theme, modeId } of entries) {
      if (!themeOrder.includes(theme)) themeOrder.push(theme);
      if (role.byTheme.has(theme)) {
        die(`✗ duplicate token key ${JSON.stringify(key)} for theme ${JSON.stringify(theme)} in ${spec.collection.name}: defined at both ${role.origin} and ${variable.name}`, 2);
      }
      role.byTheme.set(theme, resolveColour({ variable, spec, modeId }, ctx, `${spec.bucket}.${key}@${theme.toLowerCase()}`));
    }
    if (variable.description && !role.description) role.description = variable.description;
  }

  defaultTheme ??= "Base";
  // Base first, then the remaining themes in the order Figma listed them.
  const themes = [defaultTheme, ...themeOrder.filter((t) => t !== defaultTheme)];

  const semOut = {};
  for (const [key, role] of roles) {
    const base = role.byTheme.get(defaultTheme);
    const leaf = { $type: "color" };
    if (base) {
      leaf.$value = base.hex;
      if (base.ref !== undefined) leaf.$ref = base.ref;
      if (base.ref === undefined) audit.paletteGaps.push({ path: key, hex: base.hex });
    } else {
      // Honest rather than invented: the role exists in some themes but not in
      // Base, so a themeless fetch has nothing to return and the reader raises.
      audit.missingBase.push({ path: key, themes: [...role.byTheme.keys()] });
    }
    if (role.description) leaf.$description = role.description;

    const overrides = {};
    for (const theme of themes) {
      if (theme === defaultTheme) continue;
      const entry = role.byTheme.get(theme);
      if (!entry) continue;
      // A theme earns a place in `$themes` only by differing from Base. Chat
      // restates 440 values identically purely to exist as a namespace.
      if (base && entry.hex === base.hex && entry.ref === base.ref) continue;
      const override = { $value: entry.hex };
      if (entry.ref !== undefined) override.$ref = entry.ref;
      overrides[theme.toLowerCase()] = override;
      audit.themeOverrides[theme.toLowerCase()] = (audit.themeOverrides[theme.toLowerCase()] ?? 0) + 1;
    }
    if (Object.keys(overrides).length) leaf.$themes = overrides;

    setPath(semOut, key.split("."), leaf);
    audit.semanticRoleCount++;
  }

  return { primOut: sortTree(primOut), semOut: sortTree(semOut), themes, audit };
}

// Color Roles is a partial replacement for the published vocabulary. Its Token:
// descriptions explicitly identify the existing keys; missing legacy roles still
// need to resolve for released clients. Current remains the compatibility baseline.
export function preserveSemanticVocabulary(result, previousPrimitives, previousSemantic) {
  const primitives = new Map([...walk(result.primOut)].map(({ path, node }) => [path.join("."), node]));
  const previous = new Map([...walk(previousSemantic)].map(({ path, node }) => [path.join("."), node]));
  if (!previous.size) return;

  for (const { path, node } of walk(previousPrimitives)) {
    const key = path.join(".");
    if (primitives.get(key)?.$value !== node.$value) {
      die(`✗ Current primitive ${JSON.stringify(key)} changed during the Color Roles migration — migrate Current palette changes separately`, 2);
    }
  }

  const mappings = new Map();
  const additions = new Map();
  const candidates = new Map();
  let preservedCurrent = 0;
  for (const { path, node } of walk(result.semOut)) {
    const source = path.join(".");
    const target = previous.has(source) ? source : node.$description?.match(/^Token:\s*(\S+)\s*$/)?.[1] ?? source;
    if (!previous.has(target)) {
      die(`✗ Color Roles mapping for ${JSON.stringify(source)} must identify an existing key via a "Token: <key>" description; got ${JSON.stringify(target)}`, 2);
    }
    if (!candidates.has(target)) candidates.set(target, []);
    candidates.get(target).push({ source, node });
  }
  for (const [target, roles] of candidates) {
    const canonical = roles.filter(({ source }) => source.split(".").at(-1) === target.split(".").at(-1));
    if (roles.length > 1 && canonical.length !== 1) {
      die(`✗ ambiguous Color Roles mapping for ${JSON.stringify(target)}`, 2);
    }
    const selected = roles.length === 1 ? roles[0] : canonical[0];
    mappings.set(target, selected.node);
    for (const role of roles) {
      if (role !== selected) additions.set(role.source, role.node);
    }
    for (const theme of result.themes) {
      const before = resolveTheme(previous.get(target), theme.toLowerCase());
      const after = resolveTheme(selected.node, theme.toLowerCase());
      if (before?.$value !== after?.$value || before?.$ref !== after?.$ref) preservedCurrent++;
    }
  }

  function rebind(entry, experience) {
    if (entry.$value === undefined) return undefined;
    const value = entry.$ref === undefined ? entry.$value : primitives.get(entry.$ref)?.$experiences?.[experience]?.$value;
    if (value === undefined) {
      die(`✗ retained semantic reference ${JSON.stringify(entry.$ref)} has no primitive value for experience ${JSON.stringify(experience)}`, 2);
    }
    return { $value: value, ...(entry.$ref === undefined ? {} : { $ref: entry.$ref }) };
  }

  function project(node, experience) {
    const snapshot = rebind(node, experience) ?? {};
    const overrides = {};
    for (const [theme, entry] of Object.entries(node.$themes ?? {})) {
      const value = rebind(entry, experience);
      if (value.$value !== snapshot.$value || value.$ref !== snapshot.$ref) overrides[theme] = value;
    }
    if (Object.keys(overrides).length) snapshot.$themes = overrides;
    return snapshot;
  }

  const semOut = {};
  const experiences = Object.keys(result.experienceAudits).filter((experience) => experience !== "current");
  for (const [key, node] of previous) {
    const current = { ...node };
    delete current.$experiences;
    current.$experiences = Object.fromEntries(experiences.map((experience) => [
      experience,
      mappings.get(key)?.$experiences?.[experience] ?? project(node, experience),
    ]));
    setPath(semOut, key.split("."), current);
  }
  for (const [key, node] of additions) setPath(semOut, key.split("."), node);
  result.semOut = sortTree(semOut);
  result.compatibility = { mapped: mappings.size, retained: previous.size - mappings.size, added: additions.size, preservedCurrent };
}

// ---------- canonical ordering ----------
//
// Key order used to be inherited from the dump, which is Figma's own variable order. That made
// output stable for identical input but not canonical across inputs: a designer reordering
// variables in Figma produced a whole-file diff with no value changes, burying the real ones.
// Ordering is imposed here instead, so the committed files depend only on the token set.

/** Numeric-aware, so palette scales read 50, 100, … 1000 rather than 100, 1000, …, 50. */
export function naturalCompare(a, b) {
  const chunks = (s) => s.match(/\d+|\D+/g) ?? [];
  const left = chunks(a);
  const right = chunks(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const x = left[i];
    const y = right[i];
    if (x === y) continue;
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) return Number(x) - Number(y);
    return x < y ? -1 : 1;
  }
  return left.length - right.length;
}

/** Rebuild groups and experience names in canonical order. Leaf fields retain their build
 *  order, and $themes follows the configured theme order. */
export function sortTree(node) {
  if (node === null || typeof node !== "object") return node;
  if (isLeaf(node)) {
    if (!node.$experiences) return node;
    return {
      ...node,
      $experiences: Object.fromEntries(
        Object.entries(node.$experiences).sort(([a], [b]) => naturalCompare(a, b)),
      ),
    };
  }
  const out = {};
  for (const key of Object.keys(node).sort(naturalCompare)) out[key] = sortTree(node[key]);
  return out;
}

// ---------- reading the emitted shape ----------

export const isLeaf = (n) => n && typeof n === "object" && n.$type === "color";

export function* walk(node, path = []) {
  if (!node || typeof node !== "object") return;
  if (isLeaf(node)) { yield { path, node }; return; }
  for (const k of Object.keys(node)) {
    if (k.startsWith("$")) continue;
    yield* walk(node[k], [...path, k]);
  }
}

// What a consumer gets for (role, theme): the theme's override when it has one,
// otherwise the Base value on the leaf. Returns undefined when neither exists,
// which is what makes the reader raise for the 3 Figma-side gaps.
export function resolveTheme(leaf, theme) {
  const override = leaf.$themes?.[theme];
  if (override) return { $value: override.$value, $ref: override.$ref };
  if (leaf.$value === undefined) return undefined;
  return { $value: leaf.$value, $ref: leaf.$ref };
}

// ---------- diff ----------

// One entry per role, plus one per theme override, so a changed override shows
// as a change on that role rather than vanishing into the leaf. `$ref` is part
// of the compared value: a re-point at an identical hex is a real intent change.
export function flatten(tree) {
  const out = new Map();
  function addEntry(key, node) {
    out.set(key, describe(node.$value, node.$ref));
    for (const [theme, override] of Object.entries(node.$themes ?? {})) {
      out.set(`${key}@${theme}`, describe(override.$value, override.$ref));
    }
  }
  for (const { path, node } of walk(tree)) {
    const key = path.join(".");
    addEntry(key, node);
    for (const [experience, snapshot] of Object.entries(node.$experiences ?? {})) {
      addEntry(`${key}@experience:${experience}`, snapshot);
    }
  }
  return out;
}

// A role with no Base value is a real state, not a missing field — say so
// rather than stringifying `undefined`.
function describe(value, ref) {
  if (value === undefined) return "(no base value)";
  return ref !== undefined ? `${value} {${ref}}` : String(value);
}

export function diffFlat(oldMap, newMap) {
  const added = new Map(), changed = new Map(), removed = new Map();
  for (const [k, v] of newMap) {
    if (!oldMap.has(k)) added.set(k, v);
    else if (oldMap.get(k) !== v) changed.set(k, { from: oldMap.get(k), to: v });
  }
  for (const [k, v] of oldMap) if (!newMap.has(k)) removed.set(k, v);
  return { added, changed, removed };
}

export function die(msg, code = 1) {
  const err = new Error(msg);
  err.exitCode = code;
  throw err;
}

// ---------- change-report rendering ----------
//
// Shared by transform.mjs (dump vs on-disk, printed to stderr during a Figma sync) and the
// release pipeline's release-notes script (last release vs on-disk, written into the GitHub
// Release body, COREEXP-334) — one formatter, so both describe a colour change the same way.
// `$ref` is already baked into the compared value by `describe()`, so a re-point at an
// identical hex still shows as a change here, and a theme override that starts resolving to
// Base again shows as a removal of its `key@theme` entry rather than vanishing.

function summariseLine(title, d) {
  return `${title}: +${d.added.size} added  ~${d.changed.size} changed  -${d.removed.size} removed`;
}

function listLines(label, entries, formatter) {
  if (!entries.size) return [];
  return [`\n${label}:`, ...[...entries].map(([k, v]) => `  ${formatter(k, v)}`)];
}

/** True when a diff (as `diffFlat` produces it) touched nothing in that bucket. */
export function diffIsEmpty(diff) {
  return diff.added.size === 0 && diff.changed.size === 0 && diff.removed.size === 0;
}

/** Renders the two-bucket change report in the shape transform.mjs has always printed to
 *  stderr: a summary line per bucket, then every added, changed and removed key. Callers
 *  decide where the string goes (stderr, a release note); this only ever formats. */
export function renderDiffReport({ primDiff, semDiff }) {
  return [
    "=== change report ===",
    "",
    summariseLine("primitives", primDiff),
    "",
    summariseLine("semantic  ", semDiff),
    ...listLines("primitives added", primDiff.added, (k, v) => `+ ${k} = ${v}`),
    ...listLines("primitives changed", primDiff.changed, (k, v) => `~ ${k}: ${v.from} -> ${v.to}`),
    ...listLines("primitives removed", primDiff.removed, (k, v) => `- ${k} (was ${v})`),
    ...listLines("semantic added", semDiff.added, (k, v) => `+ ${k} = ${v}`),
    ...listLines("semantic changed", semDiff.changed, (k, v) => `~ ${k}: ${v.from} -> ${v.to}`),
    ...listLines("semantic removed", semDiff.removed, (k, v) => `- ${k} (was ${v})`),
  ].join("\n");
}

// ---------- emitted types ----------

export function buildKeyUnions(primTree, semTree) {
  // Same comparator as the JSON, so the unions read in the same order as the files they describe.
  return {
    primitives: [...flattenKeys(primTree)].sort(naturalCompare),
    semantic: [...flattenKeys(semTree)].sort(naturalCompare),
  };
}

function flattenKeys(tree) {
  const keys = new Set();
  for (const { path } of walk(tree)) keys.add(path.join("."));
  return keys;
}

export function renderTokenKeysFile({ primitives, semantic, themes }) {
  const header = [
    "// generated — owned by COREEXP-265, do not hand-edit.",
    "//",
    "// One union per bucket, keying the matching reader accessor:",
    "//   ColorPrimitiveKey -> CleoDesignTokens.colors.primitives.fetch",
    "//   ColorSemanticKey  -> CleoDesignTokens.colors.semantic.fetch",
    "//",
    "// Semantic keys are theme-free: the theme is an axis, passed alongside the",
    "// key, not baked into it. A role resolves to its Base value unless the",
    "// requested theme overrides it.",
  ].join("\n");
  return [
    header,
    renderUnion("ColorPrimitiveKey", primitives),
    renderUnion("ColorSemanticKey", semantic),
    `export type ColorTheme = ${themes.map((t) => `'${t.toLowerCase()}'`).join(" | ")};\n`,
  ].join("\n");
}

function renderUnion(name, keys) {
  const body = keys.map((k) => `  | '${k}'`).join("\n");
  return `export type ${name} =\n${body};\n`;
}
