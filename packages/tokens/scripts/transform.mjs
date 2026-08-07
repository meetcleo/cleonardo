#!/usr/bin/env node
// Transform Figma Variables JSON exports into DTCG-shaped tokens, resolved
// in place.
//
// Usage:
//   npm run transform                    # apply if no removals, else fail
//   npm run transform -- --allow-removals   # apply even if tokens will be removed
//   npm run transform -- --check         # dry-run (no writes), print diff
//
// Inputs:  figma-exports/{primitives,semantic}.json   (gitignored; designer drops here)
// Outputs: tokens/color/{primitives,semantic}.json    (committed)
//          src/generated/tokenKeys.ts                 (committed; not written under --check)
//
// Leaf shape: primitives are `{ $type, $value }` (a resolved hex, no self-ref).
// Semantic entries are `{ $type, $value, $ref }` — `$value` is fully resolved
// (consumers never follow a reference), `$ref` is the primitive it came from,
// expressed as a valid fetch key. A semantic entry with no `$ref` is a palette
// gap, not a bug in the transform.
//
// Fetch keys drop the two-segment bucket prefix and lowercase the rest, so
// `color.primitives.Brown.800` keys as `brown.800`. Each bucket gets its own
// union in tokenKeys.ts, keying its own reader accessor
// (`CleoDesignTokens.colors.primitives.fetch` / `.colors.semantic.fetch`), so
// key uniqueness is a per-bucket property and the token type stays out of the
// key string.
//
// Policy:
//   * Adds and value changes apply automatically.
//   * Removals do NOT apply unless --allow-removals is passed. The tool exits
//     non-zero and prints the tokens that would be removed so a human can
//     confirm they're really gone from Figma.
//   * Validation failures (dead refs, key collisions, ambiguous hex
//     recovery, semantic→semantic aliases) always fail the run with exit 2.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  flatten,
  diffFlat,
  buildPrimitives,
  buildSemantic,
  buildKeyUnions,
  renderTokenKeysFile,
  die,
} from "./transform-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IN_PRIM  = join(ROOT, "figma-exports", "primitives.json");
const IN_SEM   = join(ROOT, "figma-exports", "semantic.json");
const OUT_PRIM = join(ROOT, "tokens", "color", "primitives.json");
const OUT_SEM  = join(ROOT, "tokens", "color", "semantic.json");
const OUT_KEYS = join(ROOT, "src", "generated", "tokenKeys.ts");

const args = process.argv.slice(2);
const allowRemovals = args.includes("--allow-removals");
const checkOnly = args.includes("--check");

try {
  run();
} catch (err) {
  if (err.exitCode) {
    if (err.message) console.error(err.message);
    process.exit(err.exitCode);
  }
  throw err;
}

function run() {
  for (const p of [IN_PRIM, IN_SEM]) {
    if (!existsSync(p)) die(`Missing input: ${p}\nDrop the Figma export JSON there and re-run.`);
  }

  const rawPrim = JSON.parse(readFileSync(IN_PRIM, "utf8"));
  const rawSem  = JSON.parse(readFileSync(IN_SEM, "utf8"));

  const { primOut, primIndex, hexIndex } = buildPrimitives(rawPrim);
  const { semOut, audit } = buildSemantic(rawSem, { primIndex, hexIndex });

  // ---------- validation ----------

  if (audit.deadRefs.length) {
    console.error(`✗ ${audit.deadRefs.length} dead reference(s) — semantic tokens pointing at primitives that don't exist:`);
    for (const d of audit.deadRefs) console.error(`  - ${d.path} -> ${d.target}`);
    die("Refusing to write. Fix the Figma export and re-run.", 2);
  }

  if (audit.semanticAliases.length) {
    console.error(`✗ ${audit.semanticAliases.length} semantic→semantic alias(es) — single-hop resolution only:`);
    for (const d of audit.semanticAliases) console.error(`  - ${d.path} -> ${d.target}`);
    die("Refusing to write. Point the alias at a primitive, not another semantic token.", 2);
  }

  if (audit.ambiguousHex.length) {
    console.error(`✗ ${audit.ambiguousHex.length} ambiguous hex recovery — 2+ primitives share the hex:`);
    for (const a of audit.ambiguousHex) console.error(`  - ${a.path} (${a.hex}) matches: ${a.candidates.join(", ")}`);
    die("Refusing to write. A ref-less entry must never mean \"the transform couldn't decide\" — disambiguate in Figma.", 2);
  }

  const primTree = { color: { primitives: primOut } };
  const semTree  = { color: { semantic: semOut } };

  // per-bucket key unions + collision check — dies (exit 2) on collision
  const keyUnions = buildKeyUnions(primOut, semOut);

  // ---------- diff vs. current on-disk ----------

  const primNew = flatten(primTree);
  const semNew  = flatten(semTree);
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
    for (const h of audit.hardcoded) console.error(`  ! ${h.path} = ${h.hex}`);
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
    die("", 1);
  }

  // ---------- write ----------

  if (checkOnly) {
    console.error(`\n(--check: no files written)`);
    return;
  }

  mkdirSync(dirname(OUT_PRIM), { recursive: true });
  mkdirSync(dirname(OUT_KEYS), { recursive: true });
  writeFileSync(OUT_PRIM, JSON.stringify(primTree, null, 2) + "\n");
  writeFileSync(OUT_SEM,  JSON.stringify(semTree,  null, 2) + "\n");
  writeFileSync(OUT_KEYS, renderTokenKeysFile(keyUnions));
  console.error(`\n✓ wrote tokens/color/primitives.json, tokens/color/semantic.json and src/generated/tokenKeys.ts`);
}
