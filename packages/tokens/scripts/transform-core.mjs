// Pure transform logic, importable without transform.mjs's top-level CLI side
// effects (file reads/writes, process.exit). transform.mjs is a thin driver over
// this module; tests exercise this module directly.
//
// Input is a verbatim Figma dump (`cleo-figma-dump/1`) produced by the plugin in
// COREEXP-323. Every interpretation happens here: name splitting, theme
// extraction, RGBA->hex, alias resolution by id, type filtering, and the
// collection -> output-file mapping. The plugin shapes nothing.

// ---------- config ----------

// Which Figma collections become which output file. Collections absent from
// this list are ignored outright (`Modes`, plus Spacing/Radius/Type/Border/
// Surface Level/Image Crops from the Component Library).
//
// `themeAxis` is deliberately a config value, not a branch in the code: design
// is migrating these roles from the `Themes` collection (where the theme is the
// first segment of the variable name) to the `Modes` collection (where it is a
// real Figma mode). When that lands, `kind` becomes "mode" and the emitted
// output is identical.
export const DEFAULT_CONFIG = {
  buckets: [
    {
      collection: "Base Colors",
      bucket: "primitives",
      types: ["COLOR"],
      themeAxis: null,
    },
    {
      collection: "Themes",
      bucket: "semantic",
      types: ["COLOR"],
      themeAxis: { kind: "nameSegment", defaultTheme: "Base" },
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
    const collection = (raw.collections ?? []).find((c) => c.name === spec.collection);
    if (!collection) {
      die(`✗ dump has no collection named ${JSON.stringify(spec.collection)} — found: ${[...collectionsById.values()].map((c) => c.name).join(", ")}`, 2);
    }
    bucketByCollectionId.set(collection.id, { ...spec, collection });
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

function modeValue(variable, spec) {
  const modeId = spec.collection.defaultModeId;
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
function resolveColour({ variable, spec }, { dump, primHexByKey, primKeyById, hexIndex, audit }, label) {
  const value = modeValue(variable, spec);

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

    const hex = rgbaToHex(modeValue(variable, spec));
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

    let theme, rolePath;
    if (spec.themeAxis?.kind === "nameSegment") {
      if (segments.length < 2) {
        die(`✗ ${variable.name} in ${spec.collection.name} has no role path after its theme segment`, 2);
      }
      [theme, ...rolePath] = segments;
      defaultTheme ??= spec.themeAxis.defaultTheme;
    } else if (spec.themeAxis?.kind === "mode") {
      // The Modes migration: one variable carries every theme as a Figma mode.
      // Not reachable until the config flips; kept so the flip is a config
      // change rather than a rewrite.
      die(`✗ theme axis "mode" is not implemented yet — ${spec.collection.name}`, 2);
    } else {
      theme = spec.themeAxis?.defaultTheme ?? "Base";
      rolePath = segments;
      defaultTheme ??= theme;
    }
    if (!themeOrder.includes(theme)) themeOrder.push(theme);

    const key = buildKey(rolePath);
    let role = roles.get(key);
    if (!role) {
      role = { order: roles.size, byTheme: new Map(), origin: variable.name };
      roles.set(key, role);
    }
    if (role.byTheme.has(theme)) {
      die(`✗ duplicate token key ${JSON.stringify(key)} for theme ${JSON.stringify(theme)} in ${spec.collection.name}: defined at both ${role.origin} and ${variable.name}`, 2);
    }
    role.byTheme.set(theme, resolveColour({ variable, spec }, ctx, `${spec.bucket}.${key}@${theme.toLowerCase()}`));
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

/** Rebuild every group with its keys in canonical order. Leaves are returned untouched: their
 *  `$type` / `$value` / `$ref` / `$themes` order is set by the code that builds them, and
 *  `$themes` follows the configured theme order — both deterministic already, and both more
 *  readable than alphabetical. */
export function sortTree(node) {
  if (isLeaf(node)) return node;
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
  for (const { path, node } of walk(tree)) {
    const key = path.join(".");
    out.set(key, describe(node.$value, node.$ref));
    for (const [theme, override] of Object.entries(node.$themes ?? {})) {
      out.set(`${key}@${theme}`, describe(override.$value, override.$ref));
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
