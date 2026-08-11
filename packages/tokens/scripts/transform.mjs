#!/usr/bin/env node
// Turns a verbatim Figma dump into the committed token files and the generated
// key types.
//
// Usage:
//   yarn tokens:transform                     # apply if no removals, else fail
//   yarn tokens:transform -- --allow-removals # apply even if tokens will be removed
//   yarn tokens:check                         # dry run (no writes), print the diff
//
// Input:   figma-exports/figma-dump.json      (gitignored; the plugin drops it here)
// Outputs: tokens/color/{primitives,semantic}.json   (committed)
//          src/generated/tokenKeys.ts                (committed; not written under --check)
//
// Leaf shape. Primitives are `{ $type, $value }` — a resolved hex, nothing else.
// Semantic roles carry Base on the leaf and only genuine overrides beneath
// `$themes`:
//
//   "primary": {
//     "$type": "color",
//     "$value": "#47201C",
//     "$ref": "brown.800",
//     "$themes": { "roast": { "$value": "#F8F6F2", "$ref": "brown.50" } }
//   }
//
// `$value` is always fully resolved, so consumers never follow a reference.
// `$ref` is the primitive it came from, as a primitives fetch key; no `$ref`
// means a genuine palette gap. A theme absent from `$themes` resolves to Base.
// A role with no `$value` at all exists in some themes but not Base — a
// Figma-side gap, reported rather than papered over.
//
// Policy:
//   * Adds and value changes apply automatically.
//   * Removals do NOT apply unless --allow-removals is passed. The tool exits
//     non-zero and prints the tokens that would be removed so a human can
//     confirm they're really gone from Figma.
//   * Validation failures always fail the run with exit 2: dangling alias ids,
//     dead references, semantic->semantic aliases, ambiguous hex recovery, and
//     key collisions within a bucket.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTokens, flatten, diffFlat, buildKeyUnions, renderTokenKeysFile, die } from "./transform-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IN_DUMP = join(ROOT, "figma-exports", "figma-dump.json");
const OUT_PRIM = join(ROOT, "tokens", "color", "primitives.json");
const OUT_SEM = join(ROOT, "tokens", "color", "semantic.json");
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
  if (!existsSync(IN_DUMP)) {
    die(`Missing input: ${IN_DUMP}\nRun the Figma plugin (COREEXP-323) to produce it, or drop a dump there and re-run.`);
  }

  const { primOut, semOut, themes, audit } = buildTokens(JSON.parse(readFileSync(IN_DUMP, "utf8")));

  // ---------- validation ----------

  reportFatal(audit.danglingIds, "alias(es) pointing at a variable id absent from the dump", (d) => `${d.path} -> ${d.id} (from ${d.collection})`,
    "Refusing to write. The dump must include every collection its aliases reach into.");

  reportFatal(audit.deadRefs, "dead reference(s) — alias target isn't a primitive", (d) => `${d.path} -> ${d.target} (in ${d.collection})`,
    "Refusing to write. Point the alias at a variable in the primitives collection.");

  reportFatal(audit.semanticAliases, "semantic→semantic alias(es) — resolution is single-hop", (d) => `${d.path} -> ${d.target}`,
    "Refusing to write. Point the alias at a primitive, not another themed role.");

  reportFatal(audit.ambiguousHex, "ambiguous hex recovery — 2+ primitives share the hex", (a) => `${a.path} (${a.hex}) matches: ${a.candidates.join(", ")}`,
    'Refusing to write. A missing $ref must only ever mean "genuine palette gap" — disambiguate in Figma.');

  const keyUnions = { ...buildKeyUnions(primOut, semOut), themes };

  // ---------- diff vs. current on-disk ----------

  const primNew = flatten(primOut);
  const semNew = flatten(semOut);
  const primOld = existsSync(OUT_PRIM) ? flatten(JSON.parse(readFileSync(OUT_PRIM, "utf8"))) : new Map();
  const semOld = existsSync(OUT_SEM) ? flatten(JSON.parse(readFileSync(OUT_SEM, "utf8"))) : new Map();

  const primDiff = diffFlat(primOld, primNew);
  const semDiff = diffFlat(semOld, semNew);

  // ---------- report ----------

  console.error("=== change report ===");
  summarise("primitives", primDiff);
  summarise("semantic  ", semDiff);

  list("primitives added", primDiff.added, (k, v) => `+ ${k} = ${v}`);
  list("primitives changed", primDiff.changed, (k, v) => `~ ${k}: ${v.from} -> ${v.to}`);
  list("primitives removed", primDiff.removed, (k, v) => `- ${k} (was ${v})`);
  list("semantic added", semDiff.added, (k, v) => `+ ${k} = ${v}`);
  list("semantic changed", semDiff.changed, (k, v) => `~ ${k}: ${v.from} -> ${v.to}`);
  list("semantic removed", semDiff.removed, (k, v) => `- ${k} (was ${v})`);

  console.error(
    `\n${audit.primitiveCount} primitives, ${audit.semanticRoleCount} semantic roles, themes: ${themes.join(", ")}`,
  );
  const overrides = Object.entries(audit.themeOverrides);
  if (overrides.length) {
    console.error(`theme overrides: ${overrides.map(([t, n]) => `${t} ${n}`).join(", ")}`);
  }

  if (audit.missingBase.length) {
    console.error(`\n! ${audit.missingBase.length} role(s) missing from the Base theme — Figma-side gap, not a transform bug:`);
    for (const m of audit.missingBase) console.error(`  ! ${m.path} (present in: ${m.themes.join(", ")})`);
    console.error(`  These emit no $value, so a themeless fetch raises. Add them to Base in Figma to fix.`);
  }
  if (audit.paletteGaps.length) {
    console.error(`\npalette gaps (no matching primitive, so no $ref):`);
    for (const g of audit.paletteGaps) console.error(`  ! ${g.path} = ${g.hex}`);
  }
  if (audit.recoveredByHex.length) {
    console.error(`\nrecovered by exact-hex match (Figma held a literal, not an alias):`);
    for (const r of audit.recoveredByHex) console.error(`  ↺ ${r.path} (${r.hex}) -> {${r.target}}`);
  }
  const skipped = Object.entries(audit.skippedByType);
  if (skipped.length) {
    console.error(`\nskipped, wrong type for its bucket: ${skipped.map(([k, n]) => `${k} ${n}`).join(", ")}`);
  }
  const ignored = Object.entries(audit.ignoredByCollection);
  if (ignored.length) {
    console.error(`ignored, collection not in config: ${ignored.map(([k, n]) => `${k} ${n}`).join(", ")}`);
  }

  // ---------- removal gate ----------

  const totalRemovals = primDiff.removed.size + semDiff.removed.size;
  if (totalRemovals > 0 && !allowRemovals) {
    console.error(`\n✗ ${totalRemovals} token(s) would be removed. Refusing to write.`);
    console.error(`  If these tokens really are gone from Figma, re-run with:  yarn tokens:transform -- --allow-removals`);
    die("", 1);
  }

  // ---------- write ----------

  if (checkOnly) {
    console.error(`\n(--check: no files written)`);
    return;
  }

  mkdirSync(dirname(OUT_PRIM), { recursive: true });
  mkdirSync(dirname(OUT_KEYS), { recursive: true });
  writeFileSync(OUT_PRIM, JSON.stringify(primOut, null, 2) + "\n");
  writeFileSync(OUT_SEM, JSON.stringify(semOut, null, 2) + "\n");
  writeFileSync(OUT_KEYS, renderTokenKeysFile(keyUnions));
  console.error(`\n✓ wrote tokens/color/primitives.json, tokens/color/semantic.json and src/generated/tokenKeys.ts`);
}

function reportFatal(entries, headline, formatter, remedy) {
  if (!entries.length) return;
  console.error(`✗ ${entries.length} ${headline}:`);
  for (const e of entries) console.error(`  - ${formatter(e)}`);
  die(remedy, 2);
}

function summarise(title, d) {
  console.error(`\n${title}: +${d.added.size} added  ~${d.changed.size} changed  -${d.removed.size} removed`);
}

function list(label, entries, formatter) {
  if (!entries.size) return;
  console.error(`\n${label}:`);
  for (const [k, v] of entries) console.error(`  ${formatter(k, v)}`);
}
