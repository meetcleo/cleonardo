#!/usr/bin/env node
// Asserts the invariants the committed token tree is supposed to hold. No
// Figma dump needed — reads only what's committed, so it runs on every PR
// (tokens.yml) and inside figma-sync.yml right after the transform writes.
//
// What this catches: a bad hand-edit on a referenced token, a bad Figma
// export, a stale allowlist, tokenKeys.ts drifting from the JSON it
// describes. What it can't catch: a hand-edit on one of the 13 unreferenced
// primitives (nothing to compare them against) or a byte-identical rewrite —
// that's layer 1, the merge-base diff in .github/workflows/tokens.yml. See
// packages/tokens/README.md -> "Known exceptions" and "CI".
//
// Usage: yarn tokens:verify

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { walk, sortTree, naturalCompare, buildKeyUnions, renderTokenKeysFile, die } from "./transform-core.mjs";

import { expandSemanticTokens } from "./semantic-format.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRIM_PATH = join(ROOT, "tokens", "color", "primitives.json");
const SEM_PATH = join(ROOT, "tokens", "color", "semantic.json");
const KEYS_PATH = join(ROOT, "src", "generated", "tokenKeys.ts");

// The order the transform emits $themes in: Base sits on the leaf itself,
// then the remaining themes in Figma's listed order (transform-core.mjs:285).
// Hardcoded here as much as it is in the transform — there is one theme axis
// today, and a new theme changes what "canonical" means, not just this list.
const THEME_ORDER = ["chat", "roast", "hype"];

// Passed to renderTokenKeysFile for the ColorTheme union. Hardcoded, not
// derived — correct today, but a new theme arriving via figma-sync fails
// check 2 for the wrong reason. If that happens, update this list; the fix
// is not to debug the verifier.
const TOKEN_KEYS_THEMES = ["Base", "Chat", "Roast", "Hype"];

// Primitive count remains fixed. The semantic contract protects every published
// key individually while permitting new roles from the replacement vocabulary.
const EXPECTED_PRIMITIVE_COUNT = 106;
const REQUIRED_SEMANTIC_KEYS = JSON.parse(readFileSync(join(ROOT, "scripts", "semantic-contract.json"), "utf8"));

// Semantic entries with a $value and no $ref: a genuine palette gap, not a
// hand-edit missing its reference. Pins the hex too, so editing an
// allowlisted token's value still fails. Mirrors README.md -> "Known
// exceptions".
const PALETTE_GAP_ALLOWLIST = {
  "effects.background.glassMorphism": "#00000033",
};

// Roles Figma defines only under a non-Base theme, so the Base leaf has no
// resolved $value at all — a gap in Figma, not the transform. Mirrors
// README.md -> "Known exceptions".
const MISSING_BASE_ALLOWLIST = new Set(["core.border.level0", "core.border.level3", "core.border.level4"]);

const failures = [];
function fail(check, message) {
  failures.push(`[check ${check}] ${message}`);
}

function main() {
  const primRaw = readFileSync(PRIM_PATH, "utf8");
  const semRaw = readFileSync(SEM_PATH, "utf8");
  const keysRaw = readFileSync(KEYS_PATH, "utf8");
  const primTree = JSON.parse(primRaw);
  const semStored = JSON.parse(semRaw);
  const semTree = expandSemanticTokens(primTree, semStored);

  checkCanonicalForm(primTree, primRaw, "tokens/color/primitives.json");
  checkCanonicalForm(semStored, semRaw, "tokens/color/semantic.json");
  checkTokenKeys(primTree, semTree, keysRaw);
  checkReferenceIntegrity(primTree, semTree);
  checkPaletteGaps(semTree);
  checkShape(semTree);
  checkCounts(primTree, semTree);
  checkExperiences(primTree, semTree);

  if (failures.length) {
    console.error(`✗ ${failures.length} token invariant violation(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    die(
      "\nSee packages/tokens/README.md -> \"Known exceptions\" for the two reviewed gaps, or re-run " +
        "yarn tokens:transform if these files were hand-edited instead of generated.",
      2,
    );
  }

  console.error(`✓ ${EXPECTED_PRIMITIVE_COUNT} primitives, ${[...walk(semTree)].length} semantic roles — invariants hold.`);
  console.error(`  palette-gap allowlist: ${Object.keys(PALETTE_GAP_ALLOWLIST).join(", ")}`);
  console.error(`  missing-Base allowlist: ${[...MISSING_BASE_ALLOWLIST].join(", ")}`);
}

// ---------- check 1: canonical form ----------
//
// Rebuilds both trees from their leaves — sortTree for group order, this
// file's own field order for each leaf ($type, $value, $ref, $description,
// $themes; each override as $value then $ref) — then byte-compares against
// disk. Catches reordering, formatting drift, and any unrecognised $-field
// (canonicalLeaf only copies known fields, so a stray one silently drops out
// of the canonical form and shows up as a diff).

function canonicalLeaf(node) {
  const out = { $type: node.$type, $value: node.$value, $ref: node.$ref, $description: node.$description };
  if (node.$themes) {
    const themes = {};
    for (const theme of THEME_ORDER) {
      const override = node.$themes[theme];
      if (!override) continue;
      themes[theme] = { $value: override.$value, $ref: override.$ref };
    }
    out.$themes = themes;
  }
  if (node.$experiences) {
    out.$experiences = Object.fromEntries(
      Object.keys(node.$experiences).sort(naturalCompare).map((experience) => [experience, canonicalLeaf(node.$experiences[experience])]),
    );
  }
  return out;
}

function canonicalTree(tree) {
  const out = tree.$schema === undefined ? {} : { $schema: tree.$schema };
  for (const { path, node } of walk(tree)) {
    let cursor = out;
    for (let i = 0; i < path.length - 1; i++) {
      cursor[path[i]] ??= {};
      cursor = cursor[path[i]];
    }
    cursor[path.at(-1)] = canonicalLeaf(node);
  }
  return sortTree(out);
}

function checkCanonicalForm(tree, raw, filename) {
  const canonical = JSON.stringify(canonicalTree(tree), null, 2) + "\n";
  if (canonical !== raw) {
    fail(1, `${filename} is not in canonical form (reordered, reformatted, or an unrecognised $-field). Regenerate with yarn tokens:transform.`);
  }
}

// ---------- check 2: tokenKeys.ts in step ----------

function checkTokenKeys(primTree, semTree, keysRaw) {
  const rendered = renderTokenKeysFile({ ...buildKeyUnions(primTree, semTree), themes: TOKEN_KEYS_THEMES });
  if (rendered !== keysRaw) {
    fail(2, "src/generated/tokenKeys.ts does not match what the committed JSON regenerates. Regenerate with yarn tokens:transform.");
  }
}

// ---------- check 3: reference integrity ----------

function* experienceEntries(node) {
  yield { experience: undefined, entry: node };
  for (const [experience, entry] of Object.entries(node.$experiences ?? {})) yield { experience, entry };
}

const experienceLabel = (key, experience) => experience ? `${key}@experience:${experience}` : key;

function checkReferenceIntegrity(primTree, semTree) {
  const primValueByKey = new Map();
  for (const { path, node } of walk(primTree)) {
    for (const { experience, entry } of experienceEntries(node)) {
      primValueByKey.set(experienceLabel(path.join("."), experience), entry.$value);
    }
  }

  function checkRef(label, value, ref, experience) {
    if (ref === undefined) return;
    const primitiveKey = experienceLabel(ref, experience);
    if (!primValueByKey.has(primitiveKey)) {
      fail(3, `${label} $ref ${JSON.stringify(ref)} does not exist in primitives.json (dangling reference).`);
      return;
    }
    const primValue = primValueByKey.get(primitiveKey);
    if (value !== primValue) {
      fail(3, `${label} $value ${JSON.stringify(value)} does not match {${ref}} = ${JSON.stringify(primValue)} (hand-edited hex or re-pointed $ref).`);
    }
  }

  for (const { path, node } of walk(semTree)) {
    for (const { experience, entry } of experienceEntries(node)) {
      const key = experienceLabel(path.join("."), experience);
      checkRef(key, entry.$value, entry.$ref, experience);
      for (const [theme, override] of Object.entries(entry.$themes ?? {})) {
        checkRef(`${key}@${theme}`, override.$value, override.$ref, experience);
      }
    }
  }
}

// ---------- check 4: palette gaps ----------

function checkPaletteGaps(semTree) {
  const seenGaps = new Set();

  function checkEntry(label, value, ref, experience) {
    if (value === undefined || ref !== undefined) return; // not a gap
    seenGaps.add(label);
    const expected = PALETTE_GAP_ALLOWLIST[label];
    if (expected === undefined) {
      fail(4, `${experienceLabel(label, experience)} has a $value (${JSON.stringify(value)}) and no $ref — an un-allowlisted palette gap. Point it at a primitive, or add it to PALETTE_GAP_ALLOWLIST with the reviewed hex.`);
    } else if (expected !== value) {
      fail(4, `${experienceLabel(label, experience)} is allowlisted at ${JSON.stringify(expected)} but its committed value is ${JSON.stringify(value)} — editing an allowlisted gap still fails.`);
    }
  }

  for (const { path, node } of walk(semTree)) {
    const key = path.join(".");
    for (const { experience, entry } of experienceEntries(node)) {
      checkEntry(key, entry.$value, entry.$ref, experience);
      for (const [theme, override] of Object.entries(entry.$themes ?? {})) {
        checkEntry(`${key}@${theme}`, override.$value, override.$ref, experience);
      }
    }
  }

  for (const label of Object.keys(PALETTE_GAP_ALLOWLIST)) {
    if (!seenGaps.has(label)) {
      fail(4, `PALETTE_GAP_ALLOWLIST entry ${JSON.stringify(label)} is stale — it is no longer a $ref-less entry. Remove it.`);
    }
  }
}

// ---------- check 5: shape ----------

function checkShape(semTree) {
  const seenMissingBase = new Set();

  for (const { path, node } of walk(semTree)) {
    for (const { experience, entry } of experienceEntries(node)) {
      const key = path.join(".");
      const label = experienceLabel(key, experience);
      const hasBase = entry.$value !== undefined;

      if (!hasBase) {
        seenMissingBase.add(key);
        if (!MISSING_BASE_ALLOWLIST.has(key)) {
          fail(5, `${label} has no Base $value and is not on MISSING_BASE_ALLOWLIST — every semantic leaf must resolve a Base value unless Figma defines it only under a non-Base theme.`);
        }
      }

      for (const [theme, override] of Object.entries(entry.$themes ?? {})) {
        if (!THEME_ORDER.includes(theme)) {
          fail(5, `${label}@${theme} uses a theme outside {${THEME_ORDER.join(", ")}}.`);
          continue;
        }
        if (hasBase && override.$value === entry.$value && override.$ref === entry.$ref) {
          const refPart = override.$ref !== undefined ? ` {${override.$ref}}` : "";
          fail(5, `${label}@${theme} duplicates Base ($value ${JSON.stringify(override.$value)}${refPart}) — the transform drops overrides equal to Base, so one on disk is a hand-edit.`);
        }
      }
    }
  }

  for (const key of MISSING_BASE_ALLOWLIST) {
    if (!seenMissingBase.has(key)) {
      fail(5, `MISSING_BASE_ALLOWLIST entry ${JSON.stringify(key)} is stale — it now has a Base $value, or no longer exists. Remove it.`);
    }
  }
}

// ---------- check 7: experience coverage ----------

function checkExperiences(primTree, semTree) {
  const primitiveLeaves = [...walk(primTree)];
  const expected = Object.keys(primitiveLeaves[0]?.node.$experiences ?? {}).sort();
  for (const { path, node } of [...primitiveLeaves, ...walk(semTree)]) {
    const actual = Object.keys(node.$experiences ?? {}).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(7, `${path.join(".")} has inconsistent experience snapshots; expected ${expected.join(", ") || "none"}.`);
    }
    for (const [experience, entry] of Object.entries(node.$experiences ?? {})) {
      if (entry.$experiences || (entry.$value === undefined && !Object.keys(entry.$themes ?? {}).length)) {
        fail(7, `${experienceLabel(path.join("."), experience)} must be a complete snapshot without nested experiences.`);
      }
    }
  }
  for (const { path, node } of primitiveLeaves) {
    for (const [experience, entry] of Object.entries(node.$experiences ?? {})) {
      if (typeof entry.$value !== "string" || entry.$themes || entry.$experiences) {
        fail(7, `${experienceLabel(path.join("."), experience)} must contain a primitive $value without themes or nested experiences.`);
      }
    }
  }
}

// ---------- check 6: counts ----------

function checkCounts(primTree, semTree) {
  const primCount = [...walk(primTree)].length;
  if (primCount !== EXPECTED_PRIMITIVE_COUNT) {
    fail(6, `primitives.json has ${primCount} leaves, expected ${EXPECTED_PRIMITIVE_COUNT}. If this is a deliberate palette change, update EXPECTED_PRIMITIVE_COUNT and ColorPrimitiveKey together.`);
  }
  const semanticKeys = new Set([...walk(semTree)].map(({ path }) => path.join(".")));
  for (const key of REQUIRED_SEMANTIC_KEYS) {
    if (!semanticKeys.has(key)) fail(6, `semantic.json is missing required published key ${JSON.stringify(key)}.`);
  }
}

try {
  main();
} catch (err) {
  if (err.exitCode) {
    if (err.message) console.error(err.message);
    process.exit(err.exitCode);
  }
  throw err;
}
