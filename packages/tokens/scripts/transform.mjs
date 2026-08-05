#!/usr/bin/env node
// Transform Figma Variables JSON exports into DTCG tokens.
//
// Usage:
//   npm run transform                    # apply if no removals, else fail
//   npm run transform -- --allow-removals   # apply even if tokens will be removed
//   npm run transform -- --check         # dry-run (no writes), print diff
//
// Inputs:  figma-exports/{primitives,semantic}.json   (gitignored; designer drops here)
// Outputs: tokens/color/{primitives,semantic}.json    (committed)
//
// Policy:
//   * Adds and value changes apply automatically.
//   * Removals do NOT apply unless --allow-removals is passed. The tool exits
//     non-zero and prints the tokens that would be removed so a human can
//     confirm they're really gone from Figma.
//   * Validation failures (dead refs) always fail the run.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IN_PRIM  = join(ROOT, "figma-exports", "primitives.json");
const IN_SEM   = join(ROOT, "figma-exports", "semantic.json");
const OUT_PRIM = join(ROOT, "tokens", "color", "primitives.json");
const OUT_SEM  = join(ROOT, "tokens", "color", "semantic.json");

const args = process.argv.slice(2);
const allowRemovals = args.includes("--allow-removals");
const checkOnly = args.includes("--check");

function die(msg, code = 1) { console.error(msg); process.exit(code); }

for (const p of [IN_PRIM, IN_SEM]) {
  if (!existsSync(p)) die(`Missing input: ${p}\nDrop the Figma export JSON there and re-run.`);
}

const rawPrim = JSON.parse(readFileSync(IN_PRIM, "utf8"));
const rawSem  = JSON.parse(readFileSync(IN_SEM, "utf8"));

// ---------- helpers ----------

const isLeaf = (n) => n && typeof n === "object" && n.$type === "color";

function* walk(node, path = []) {
  if (!node || typeof node !== "object") return;
  if (isLeaf(node)) { yield { path, node }; return; }
  for (const k of Object.keys(node)) {
    if (k.startsWith("$")) continue;
    yield* walk(node[k], [...path, k]);
  }
}

function toHex(figmaValue) {
  if (!figmaValue?.hex) throw new Error("no hex in figma value: " + JSON.stringify(figmaValue));
  const hex = figmaValue.hex.toUpperCase();
  const a = figmaValue.alpha ?? 1;
  if (a >= 0.999) return hex;
  return hex + Math.round(a * 255).toString(16).padStart(2, "0").toUpperCase();
}

function flatten(tree) {
  const out = new Map(); // "a.b.c" -> "#RRGGBB" | "{ref}"
  for (const { path, node } of walk(tree)) out.set(path.join("."), node.$value);
  return out;
}

function diffFlat(oldMap, newMap) {
  const added = new Map(), changed = new Map(), removed = new Map();
  for (const [k, v] of newMap) {
    if (!oldMap.has(k)) added.set(k, v);
    else if (oldMap.get(k) !== v) changed.set(k, { from: oldMap.get(k), to: v });
  }
  for (const [k, v] of oldMap) if (!newMap.has(k)) removed.set(k, v);
  return { added, changed, removed };
}

// ---------- build primitives ----------

const primOut = {};
const primIndex = new Map();   // Figma name "Brown/800" -> dtcg path "color.primitives.Brown.800"
const hexIndex = new Map();    // hex -> [dtcgPath, ...] — recover aliases when Figma lost them

for (const { path, node } of walk(rawPrim)) {
  let cursor = primOut;
  for (let i = 0; i < path.length - 1; i++) {
    cursor[path[i]] ??= {};
    cursor = cursor[path[i]];
  }
  const hex = toHex(node.$value);
  cursor[path.at(-1)] = { $type: "color", $value: hex };
  if (node.$description) cursor[path.at(-1)].$description = node.$description;

  const figmaName = path.join("/");
  const dtcgPath = ["color", "primitives", ...path].join(".");
  primIndex.set(figmaName, dtcgPath);
  if (!hexIndex.has(hex)) hexIndex.set(hex, []);
  hexIndex.get(hex).push(dtcgPath);
}

// ---------- build semantic ----------

const semOut = {};
const audit = {
  totalSemantic: 0,
  aliased: 0,
  recoveredByHex: [],
  hardcoded: [],
  deadRefs: [],
};

for (const { path, node } of walk(rawSem)) {
  audit.totalSemantic++;
  const ext = node.$extensions ?? {};
  const alias = ext["com.figma.aliasData"];

  let cursor = semOut;
  for (let i = 0; i < path.length - 1; i++) {
    cursor[path[i]] ??= {};
    cursor = cursor[path[i]];
  }
  const dtcgPath = ["color", "semantic", ...path].join(".");

  let $value;
  if (alias) {
    audit.aliased++;
    const target = alias.targetVariableName;
    const targetDtcg = primIndex.get(target);
    if (!targetDtcg) {
      audit.deadRefs.push({ path: dtcgPath, target });
      $value = "{" + ["color", "primitives", ...target.split("/")].join(".") + "}";
    } else {
      $value = "{" + targetDtcg + "}";
    }
  } else {
    const hex = toHex(node.$value);
    const matches = hexIndex.get(hex);
    if (matches?.length === 1) {
      audit.recoveredByHex.push({ path: dtcgPath, target: matches[0], hex });
      audit.aliased++;
      $value = "{" + matches[0] + "}";
    } else {
      audit.hardcoded.push({ path: dtcgPath, hex, ambiguous: matches?.length > 1 ? matches : undefined });
      $value = hex;
    }
  }

  cursor[path.at(-1)] = { $type: "color", $value };
  if (node.$description) cursor[path.at(-1)].$description = node.$description;
}

// ---------- validation ----------

if (audit.deadRefs.length) {
  console.error(`✗ ${audit.deadRefs.length} dead reference(s) — semantic tokens pointing at primitives that don't exist:`);
  for (const d of audit.deadRefs) console.error(`  - ${d.path} -> ${d.target}`);
  die("Refusing to write. Fix the Figma export and re-run.", 2);
}

// ---------- diff vs. current on-disk ----------

const primNew = flatten({ color: { primitives: primOut } });
const semNew  = flatten({ color: { semantic: semOut } });
const primOld = existsSync(OUT_PRIM) ? flatten(JSON.parse(readFileSync(OUT_PRIM, "utf8"))) : new Map();
const semOld  = existsSync(OUT_SEM)  ? flatten(JSON.parse(readFileSync(OUT_SEM,  "utf8"))) : new Map();

const primDiff = diffFlat(primOld, primNew);
const semDiff  = diffFlat(semOld, semNew);

// ---------- report ----------

function summarise(title, d) {
  console.error(`\n${title}: +${d.added.size} added  ~${d.changed.size} changed  -${d.removed.size} removed`);
}
console.error("=== change report ===");
summarise("primitives", primDiff);
summarise("semantic  ", semDiff);

function list(label, entries, formatter) {
  if (!entries.size) return;
  console.error(`\n${label}:`);
  for (const [k, v] of entries) console.error(`  ${formatter(k, v)}`);
}
list("primitives added",   primDiff.added,   (k, v) => `+ ${k} = ${v}`);
list("primitives changed", primDiff.changed, (k, v) => `~ ${k}: ${v.from} -> ${v.to}`);
list("primitives removed", primDiff.removed, (k, v) => `- ${k} (was ${v})`);
list("semantic added",     semDiff.added,    (k, v) => `+ ${k} = ${v}`);
list("semantic changed",   semDiff.changed,  (k, v) => `~ ${k}: ${v.from} -> ${v.to}`);
list("semantic removed",   semDiff.removed,  (k, v) => `- ${k} (was ${v})`);

if (audit.hardcoded.length) {
  console.error(`\nhardcoded (semantic tokens with no matching primitive — palette gap):`);
  for (const h of audit.hardcoded) console.error(`  ! ${h.path} = ${h.hex}${h.ambiguous ? " (ambiguous: "+h.ambiguous.join(", ")+")" : ""}`);
}
if (audit.recoveredByHex.length) {
  console.error(`\nrecovered by exact-hex match (Figma dropped the alias — restored automatically):`);
  for (const r of audit.recoveredByHex) console.error(`  ↺ ${r.path} (${r.hex}) -> {${r.target}}`);
}

// ---------- removal gate ----------

const totalRemovals = primDiff.removed.size + semDiff.removed.size;
if (totalRemovals > 0 && !allowRemovals) {
  console.error(`\n✗ ${totalRemovals} token(s) would be removed. Refusing to write.`);
  console.error(`  If these tokens really are gone from Figma, re-run with:  npm run transform -- --allow-removals`);
  process.exit(1);
}

// ---------- write ----------

if (checkOnly) {
  console.error(`\n(--check: no files written)`);
  process.exit(0);
}

mkdirSync(dirname(OUT_PRIM), { recursive: true });
writeFileSync(OUT_PRIM, JSON.stringify({ color: { primitives: primOut } }, null, 2) + "\n");
writeFileSync(OUT_SEM,  JSON.stringify({ color: { semantic: semOut } },   null, 2) + "\n");
console.error(`\n✓ wrote tokens/color/primitives.json and tokens/color/semantic.json`);
