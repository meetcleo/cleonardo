// Pure transform logic, importable without transform.mjs's top-level CLI
// side effects (file reads/writes, process.exit). transform.mjs is a thin
// driver over this module; tests exercise this module directly.

// ---------- shared helpers ----------

// A leaf accepts either shape it may see: the Figma export input
// (`$type`/`$value`) or the on-disk output read back for the diff — which
// is `{ $type, $value }` before COREEXP-265 lands and `{ value, ref }`
// after. Both must be recognised so the diff and removal gate keep working
// across the migration run.
export const isLeaf = (n) => n && typeof n === "object" && (n.$type === "color" || typeof n.value === "string");

export function* walk(node, path = []) {
  if (!node || typeof node !== "object") return;
  if (isLeaf(node)) { yield { path, node }; return; }
  for (const k of Object.keys(node)) {
    if (k.startsWith("$")) continue;
    yield* walk(node[k], [...path, k]);
  }
}

export function toHex(figmaValue) {
  if (!figmaValue?.hex) throw new Error("no hex in figma value: " + JSON.stringify(figmaValue));
  const hex = figmaValue.hex.toUpperCase();
  const a = figmaValue.alpha ?? 1;
  if (a >= 0.999) return hex;
  return hex + Math.round(a * 255).toString(16).padStart(2, "0").toUpperCase();
}

// A source tree is rooted at one of these two prefixes; strip it, lowercase,
// dot-join the rest. Matches CleoDesignTokens.fetch's buildKey / build_key —
// used here for `ref`, the collision check and the key union, so all three
// can never disagree.
const KNOWN_PREFIXES = [
  ["color", "primitives"],
  ["color", "semantic"],
];

export function buildKey(path) {
  const stripped = KNOWN_PREFIXES.some((prefix) => prefix.every((segment, i) => segment === path[i]))
    ? path.slice(2)
    : path;
  return stripped.join(".").toLowerCase();
}

// Value side of the diff compares `value` **and** `ref`: a re-point at an
// identical hex still shows up as a real intent change. `flatten`'s map
// *keys* stay the JSON path exactly as today (not the fetch key) — the
// removal gate depends on that key space being stable across the migration.
export function flatten(tree) {
  const out = new Map();
  for (const { path, node } of walk(tree)) {
    const value = "value" in node ? node.value : node.$value;
    const ref = node.ref;
    out.set(path.join("."), ref !== undefined ? `${value} {${ref}}` : String(value));
  }
  return out;
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

// ---------- resolution ----------

function setPath(root, path, value) {
  let cursor = root;
  for (let i = 0; i < path.length - 1; i++) {
    cursor[path[i]] ??= {};
    cursor = cursor[path[i]];
  }
  cursor[path.at(-1)] = value;
}

// Builds `tokens/color/primitives.json`'s tree from a raw Figma export tree.
// Returns the output tree plus indexes the semantic pass needs:
//   primIndex — Figma name "Brown/800" -> { dtcgPath, hex, key }
//   hexIndex  — hex -> [{ dtcgPath, key }, ...]  (recover dropped aliases)
export function buildPrimitives(rawPrim) {
  const primOut = {};
  const primIndex = new Map();
  const hexIndex = new Map();

  for (const { path, node } of walk(rawPrim)) {
    const hex = toHex(node.$value);
    const dtcgPath = ["color", "primitives", ...path].join(".");
    const key = buildKey(dtcgPath.split("."));
    const leaf = { $type: "color", value: hex };
    if (node.$description) leaf.$description = node.$description;
    setPath(primOut, path, leaf);

    const figmaName = path.join("/");
    const entry = { dtcgPath, hex, key };
    primIndex.set(figmaName, entry);
    if (!hexIndex.has(hex)) hexIndex.set(hex, []);
    hexIndex.get(hex).push(entry);
  }

  return { primOut, primIndex, hexIndex };
}

// Builds `tokens/color/semantic.json`'s tree from a raw Figma export tree,
// resolving every alias/hex-recovery single-hop against `primIndex`/`hexIndex`
// from buildPrimitives. No multi-hop resolution, no cycle detection — 0 such
// refs exist in the corpus and it is unrequested complexity.
export function buildSemantic(rawSem, { primIndex, hexIndex }) {
  const semOut = {};
  const audit = {
    totalSemantic: 0,
    aliased: 0,
    recoveredByHex: [],
    hardcoded: [],
    deadRefs: [],
    ambiguousHex: [],
    semanticAliases: [],
  };

  for (const { path, node } of walk(rawSem)) {
    audit.totalSemantic++;
    const ext = node.$extensions ?? {};
    const alias = ext["com.figma.aliasData"];
    const dtcgPath = ["color", "semantic", ...path].join(".");

    let value, ref;
    if (alias) {
      audit.aliased++;
      const target = alias.targetVariableName;
      const targetEntry = primIndex.get(target);
      if (!targetEntry) {
        // Distinguish "points at a primitive that doesn't exist" (dead ref)
        // from "points at another semantic entry" (unsupported — single-hop
        // resolution only).
        const targetSemanticPath = ["color", "semantic", ...target.split("/")].join(".");
        if (isSemanticPath(rawSem, target)) {
          audit.semanticAliases.push({ path: dtcgPath, target });
        } else {
          audit.deadRefs.push({ path: dtcgPath, target });
        }
        value = "{" + targetSemanticPath + "}"; // placeholder; caller dies before this is written
      } else {
        value = targetEntry.hex;
        ref = targetEntry.key;
      }
    } else {
      const hex = toHex(node.$value);
      const matches = hexIndex.get(hex);
      if (matches?.length === 1) {
        audit.recoveredByHex.push({ path: dtcgPath, target: matches[0].dtcgPath, hex });
        audit.aliased++;
        value = hex;
        ref = matches[0].key;
      } else if (matches?.length > 1) {
        audit.ambiguousHex.push({ path: dtcgPath, hex, candidates: matches.map((m) => m.dtcgPath) });
        value = hex; // placeholder; caller dies before this is written
      } else {
        audit.hardcoded.push({ path: dtcgPath, hex });
        value = hex;
      }
    }

    const leaf = { $type: "color", value };
    if (ref !== undefined) leaf.ref = ref;
    if (node.$description) leaf.$description = node.$description;
    setPath(semOut, path, leaf);
  }

  return { semOut, audit };
}

// target is a Figma name like "Base/Core/Content/Primary" — true if it
// resolves to a path inside the semantic tree rather than the primitive tree.
function isSemanticPath(rawSem, target) {
  let cursor = rawSem;
  for (const segment of target.split("/")) {
    if (!cursor || typeof cursor !== "object" || !(segment in cursor)) return false;
    cursor = cursor[segment];
  }
  return isLeaf(cursor);
}

// ---------- key union + collision check ----------

// Builds the sorted TokenKey union across both output trees, raising via
// `die` (exit 2) on any key that resolves from more than one place.
export function buildKeyUnion(primTree, semTree) {
  const seen = new Map(); // key -> source dtcg path
  for (const { path } of walk(primTree)) {
    const dtcgPath = ["color", "primitives", ...path].join(".");
    recordKey(seen, buildKey(dtcgPath.split(".")), dtcgPath);
  }
  for (const { path } of walk(semTree)) {
    const dtcgPath = ["color", "semantic", ...path].join(".");
    recordKey(seen, buildKey(dtcgPath.split(".")), dtcgPath);
  }
  return [...seen.keys()].sort();
}

function recordKey(seen, key, dtcgPath) {
  if (seen.has(key)) {
    die(`✗ duplicate token key ${JSON.stringify(key)}: defined at both ${seen.get(key)} and ${dtcgPath}`, 2);
  }
  seen.set(key, dtcgPath);
}

export function renderTokenKeysFile(keys) {
  const header = [
    "// generated — owned by COREEXP-265, do not hand-edit.",
    "//",
    "// Sorted union of every token key derivable from",
    "// tokens/color/{primitives,semantic}.json. Lowercased, with the",
    "// `color.primitives` / `color.semantic` prefix stripped — the same",
    "// rule CleoDesignTokens.fetch uses on the `{ value, ref }` leaves.",
    "export type TokenKey =",
  ].join("\n");
  const body = keys.map((k) => `  | '${k}'`).join("\n");
  return `${header}\n${body};\n`;
}
