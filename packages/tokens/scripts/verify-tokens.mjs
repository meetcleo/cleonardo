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
import { walk, sortTree, buildKeyUnions, renderTokenKeysFile, die } from "./transform-core.mjs";

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

// Literal counts per the ticket. A change here is a deliberate token-set
// change (new roles, a new primitive scale), not something the verifier
// should infer — update alongside ColorPrimitiveKey / ColorSemanticKey.
const EXPECTED_PRIMITIVE_COUNT = 106;
const EXPECTED_SEMANTIC_COUNT = 473;

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
  const semTree = JSON.parse(semRaw);

  checkCanonicalForm(primTree, primRaw, "tokens/color/primitives.json");
  checkCanonicalForm(semTree, semRaw, "tokens/color/semantic.json");
  checkTokenKeys(primTree, semTree, keysRaw);
  checkReferenceIntegrity(primTree, semTree);
  checkPaletteGaps(semTree);
  checkShape(semTree);
  checkCounts(primTree, semTree);

  if (failures.length) {
    console.error(`✗ ${failures.length} token invariant violation(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    die(
      "\nSee packages/tokens/README.md -> \"Known exceptions\" for the two reviewed gaps, or re-run " +
        "yarn tokens:transform if these files were hand-edited instead of generated.",
      2,
    );
  }

  console.error(`✓ ${EXPECTED_PRIMITIVE_COUNT} primitives, ${EXPECTED_SEMANTIC_COUNT} semantic roles — invariants hold.`);
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
  return out;
}

function canonicalTree(tree) {
  const out = {};
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

function checkReferenceIntegrity(primTree, semTree) {
  const primValueByKey = new Map();
  for (const { path, node } of walk(primTree)) primValueByKey.set(path.join("."), node.$value);

  function checkRef(label, value, ref) {
    if (ref === undefined) return;
    if (!primValueByKey.has(ref)) {
      fail(3, `${label} $ref ${JSON.stringify(ref)} does not exist in primitives.json (dangling reference).`);
      return;
    }
    const primValue = primValueByKey.get(ref);
    if (value !== primValue) {
      fail(3, `${label} $value ${JSON.stringify(value)} does not match {${ref}} = ${JSON.stringify(primValue)} (hand-edited hex or re-pointed $ref).`);
    }
  }

  for (const { path, node } of walk(semTree)) {
    const key = path.join(".");
    checkRef(key, node.$value, node.$ref);
    for (const [theme, override] of Object.entries(node.$themes ?? {})) {
      checkRef(`${key}@${theme}`, override.$value, override.$ref);
    }
  }
}

// ---------- check 4: palette gaps ----------

function checkPaletteGaps(semTree) {
  const seenGaps = new Set();

  function checkEntry(label, value, ref) {
    if (value === undefined || ref !== undefined) return; // not a gap
    seenGaps.add(label);
    const expected = PALETTE_GAP_ALLOWLIST[label];
    if (expected === undefined) {
      fail(4, `${label} has a $value (${JSON.stringify(value)}) and no $ref — an un-allowlisted palette gap. Point it at a primitive, or add it to PALETTE_GAP_ALLOWLIST with the reviewed hex.`);
    } else if (expected !== value) {
      fail(4, `${label} is allowlisted at ${JSON.stringify(expected)} but its committed value is ${JSON.stringify(value)} — editing an allowlisted gap still fails.`);
    }
  }

  for (const { path, node } of walk(semTree)) {
    const key = path.join(".");
    checkEntry(key, node.$value, node.$ref);
    for (const [theme, override] of Object.entries(node.$themes ?? {})) {
      checkEntry(`${key}@${theme}`, override.$value, override.$ref);
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
    const key = path.join(".");
    const hasBase = node.$value !== undefined;

    if (!hasBase) {
      seenMissingBase.add(key);
      if (!MISSING_BASE_ALLOWLIST.has(key)) {
        fail(5, `${key} has no Base $value and is not on MISSING_BASE_ALLOWLIST — every semantic leaf must resolve a Base value unless Figma defines it only under a non-Base theme.`);
      }
    }

    for (const [theme, override] of Object.entries(node.$themes ?? {})) {
      if (!THEME_ORDER.includes(theme)) {
        fail(5, `${key}@${theme} uses a theme outside {${THEME_ORDER.join(", ")}}.`);
        continue;
      }
      if (hasBase && override.$value === node.$value && override.$ref === node.$ref) {
        const refPart = override.$ref !== undefined ? ` {${override.$ref}}` : "";
        fail(5, `${key}@${theme} duplicates Base ($value ${JSON.stringify(override.$value)}${refPart}) — the transform drops overrides equal to Base, so one on disk is a hand-edit.`);
      }
    }
  }

  for (const key of MISSING_BASE_ALLOWLIST) {
    if (!seenMissingBase.has(key)) {
      fail(5, `MISSING_BASE_ALLOWLIST entry ${JSON.stringify(key)} is stale — it now has a Base $value, or no longer exists. Remove it.`);
    }
  }
}

// ---------- check 6: counts ----------

function checkCounts(primTree, semTree) {
  const primCount = [...walk(primTree)].length;
  const semCount = [...walk(semTree)].length;
  if (primCount !== EXPECTED_PRIMITIVE_COUNT) {
    fail(6, `primitives.json has ${primCount} leaves, expected ${EXPECTED_PRIMITIVE_COUNT}. If this is a deliberate palette change, update EXPECTED_PRIMITIVE_COUNT and ColorPrimitiveKey together.`);
  }
  if (semCount !== EXPECTED_SEMANTIC_COUNT) {
    fail(6, `semantic.json has ${semCount} roles, expected ${EXPECTED_SEMANTIC_COUNT}. If this is a deliberate role change, update EXPECTED_SEMANTIC_COUNT and ColorSemanticKey together.`);
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
