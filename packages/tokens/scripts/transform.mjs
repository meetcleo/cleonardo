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
// Primitive leaves store resolved values for each experience. Semantic files use
// cleo-semantic-references/1: shared $ref bindings, literal $value palette gaps,
// $themes overrides, and complete $experiences snapshots only where bindings differ.
// Resolution and diffing use expanded snapshots; only the written JSON is compact.
// Missing both $ref and $value on a semantic Base is a real Figma-side gap.
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
import { buildTokens, parseDump, preserveSemanticVocabulary, walk, flatten, diffFlat, buildKeyUnions, renderTokenKeysFile, renderDiffReport, die } from "./transform-core.mjs";

import { compactSemanticTokens, expandSemanticTokens } from "./semantic-format.mjs";

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

  const rawDump = JSON.parse(readFileSync(IN_DUMP, "utf8"));
  const result = buildTokens(rawDump);
  const previousPrimitives = existsSync(OUT_PRIM) ? JSON.parse(readFileSync(OUT_PRIM, "utf8")) : {};
  const previousSemantic = expandSemanticTokens(previousPrimitives, existsSync(OUT_SEM) ? JSON.parse(readFileSync(OUT_SEM, "utf8")) : {});
  const semanticSource = [...parseDump(rawDump).bucketByCollectionId.values()].find((spec) => spec.bucket === "semantic");

  // ---------- validation ----------

  for (const [experience, paletteAudit] of Object.entries(result.experienceAudits ?? { current: result.audit })) {
    if (result.experienceAudits) console.error(`Validating experience: ${experience}`);
    validateAudit(paletteAudit);
  }

  if (semanticSource.collection.name === "Color Roles" && result.experienceAudits) {
    preserveSemanticVocabulary(result, previousPrimitives, previousSemantic);
  }
  const { primOut, semOut, themes, audit, experienceAudits, compatibility } = result;

  const keyUnions = { ...buildKeyUnions(primOut, semOut), themes };
  const compactSemantic = compactSemanticTokens(primOut, semOut);

  // ---------- diff vs. current on-disk ----------

  const primNew = flatten(primOut);
  const semNew = flatten(semOut);
  const primOld = flatten(previousPrimitives);
  const semOld = flatten(previousSemantic);

  const primDiff = diffFlat(primOld, primNew);
  const semDiff = diffFlat(semOld, semNew);

  // ---------- report ----------

  console.error(renderDiffReport({ primDiff, semDiff }));

  console.error(
    `\n${audit.primitiveCount} primitives, ${[...walk(semOut)].length} semantic roles, themes: ${themes.join(", ")}`,
  );
  if (compatibility) {
    console.error(`Compatibility: ${compatibility.mapped} mapped roles, ${compatibility.retained} retained roles, ${compatibility.added} new roles; preserved Current for ${compatibility.preservedCurrent} differing theme entries.`);
  }
  const overrides = Object.entries(audit.themeOverrides);
  if (overrides.length) {
    console.error(`theme overrides: ${overrides.map(([t, n]) => `${t} ${n}`).join(", ")}`);
  }

  for (const [experience, paletteAudit] of Object.entries(experienceAudits ?? { current: audit })) {
    if (experienceAudits) console.error(`\nExperience: ${experience}`);
    reportWarnings(paletteAudit);
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
  writeFileSync(OUT_SEM, JSON.stringify(compactSemantic, null, 2) + "\n");
  writeFileSync(OUT_KEYS, renderTokenKeysFile(keyUnions));
  console.error(`\n✓ wrote tokens/color/primitives.json, tokens/color/semantic.json and src/generated/tokenKeys.ts`);
}

function reportFatal(entries, headline, formatter, remedy) {
  if (!entries.length) return;
  console.error(`✗ ${entries.length} ${headline}:`);
  for (const e of entries) console.error(`  - ${formatter(e)}`);
  die(remedy, 2);
}

function validateAudit(audit) {
  reportFatal(audit.danglingIds, "alias(es) pointing at a variable id absent from the dump", (d) => `${d.path} -> ${d.id} (from ${d.collection})`,
    "Refusing to write. The dump must include every collection its aliases reach into.");

  reportFatal(audit.deadRefs, "dead reference(s) — alias target isn't a primitive", (d) => `${d.path} -> ${d.target} (in ${d.collection})`,
    "Refusing to write. Point the alias at a variable in the primitives collection.");

  reportFatal(audit.semanticAliases, "semantic→semantic alias(es) — resolution is single-hop", (d) => `${d.path} -> ${d.target}`,
    "Refusing to write. Point the alias at a primitive, not another themed role.");

  reportFatal(audit.ambiguousHex, "ambiguous hex recovery — 2+ primitives share the hex", (a) => `${a.path} (${a.hex}) matches: ${a.candidates.join(", ")}`,
    'Refusing to write. A missing $ref must only ever mean "genuine palette gap" — disambiguate in Figma.');
}

function reportWarnings(audit) {
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
}
