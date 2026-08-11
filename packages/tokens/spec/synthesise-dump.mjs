#!/usr/bin/env node
// Builds a `cleo-figma-dump/1` file from a pre-restructure token pair, for test
// fixtures. The real dump comes from the Figma plugin (COREEXP-323); this exists
// because that plugin lands in a PR stacked on top of this one, so there is no
// real dump to hand yet.
//
//   node spec/synthesise-dump.mjs [sourceDir] > spec/fixtures/dumps/full.json
//
// `sourceDir` holds `primitives.json` + `semantic.json` in the *pre-restructure*
// shape (semantic nested under Base/Chat/Roast/Hype, leaves `{ $type, $value, $ref }`).
// Defaults to `tokens/color`, which is that shape only until the restructure
// lands — afterwards, point it at a copy extracted from git history:
//
//   git show <ref>:packages/tokens/tokens/color/semantic.json > /tmp/src/semantic.json
//
// Colour channels are written as `byte / 255` at full float precision, never
// rounded decimals: the round trip back to hex has to be exact, and rounding is
// the one place precision loss would hide. `spec/fixtures/expected-resolved.json`
// is derived from the token files directly rather than from this output, so a
// bug here fails that check instead of cancelling out inside it.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourceDir = process.argv[2] ?? "tokens/color";

const PRIM_COLLECTION = { id: "VariableCollectionId:9:1", name: "Base Colors", source: "library", libraryName: "Base Color Palette 🔒", defaultModeId: "9:0", modes: [{ modeId: "9:0", name: "Base Colors" }] };
const THEME_COLLECTION = { id: "VariableCollectionId:1:3", name: "Themes", source: "local", defaultModeId: "1:0", modes: [{ modeId: "1:0", name: "Light" }] };
// Present so the transform's "ignore unlisted collections" path is exercised.
const MODES_COLLECTION = { id: "VariableCollectionId:2:1", name: "Modes", source: "local", defaultModeId: "2:0", modes: [{ modeId: "2:0", name: "Light" }, { modeId: "2:1", name: "Dark" }] };

const isLeaf = (n) => n && typeof n === "object" && n.$type === "color";

function* walk(node, path = []) {
  if (!node || typeof node !== "object") return;
  if (isLeaf(node)) { yield { path, node }; return; }
  for (const k of Object.keys(node)) {
    if (k.startsWith("$")) continue;
    yield* walk(node[k], [...path, k]);
  }
}

// "#RRGGBB" | "#RRGGBBAA" -> { r, g, b, a } as Figma reports them: 0–1 floats.
function hexToRgba(hex) {
  const byte = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return {
    r: byte(1),
    g: byte(3),
    b: byte(5),
    a: hex.length > 7 ? byte(7) : 1,
  };
}

const primTree = JSON.parse(readFileSync(join(sourceDir, "primitives.json"), "utf8")).color.primitives;
const semTree = JSON.parse(readFileSync(join(sourceDir, "semantic.json"), "utf8")).color.semantic;

const variables = [];

// ---------- primitives ----------

const primIdByKey = new Map(); // fetch key ("brown.800") -> variable id
let primSeq = 5;
for (const { path, node } of walk(primTree)) {
  const id = `VariableID:9:${primSeq++}`;
  primIdByKey.set(path.join(".").toLowerCase(), id);
  variables.push({
    id,
    name: path.join("/"),
    collectionId: PRIM_COLLECTION.id,
    resolvedType: "COLOR",
    description: node.$description ?? "",
    valuesByMode: { [PRIM_COLLECTION.defaultModeId]: hexToRgba(node.$value) },
  });
}

// ---------- semantic (Themes) ----------

let semSeq = 5;
for (const { path, node } of walk(semTree)) {
  const targetId = node.$ref === undefined ? undefined : primIdByKey.get(node.$ref);
  if (node.$ref !== undefined && !targetId) {
    throw new Error(`no primitive variable for $ref ${JSON.stringify(node.$ref)} at ${path.join("/")}`);
  }
  variables.push({
    id: `VariableID:1:${semSeq++}`,
    name: path.join("/"),
    collectionId: THEME_COLLECTION.id,
    resolvedType: "COLOR",
    description: node.$description ?? "",
    // A palette gap has no primitive to alias, so it carries a raw colour —
    // exactly how Figma reports a variable set to a literal value.
    valuesByMode: {
      [THEME_COLLECTION.defaultModeId]: targetId
        ? { type: "VARIABLE_ALIAS", id: targetId }
        : hexToRgba(node.$value),
    },
  });
}

// 18 FLOAT variables sit in the real `Themes` collection. They must be skipped
// and counted, not treated as an error.
for (let i = 0; i < 18; i++) {
  variables.push({
    id: `VariableID:1:${semSeq++}`,
    name: `Spacing/Step ${i}`,
    collectionId: THEME_COLLECTION.id,
    resolvedType: "FLOAT",
    description: "",
    valuesByMode: { [THEME_COLLECTION.defaultModeId]: i * 4 },
  });
}

// The `Modes` collection is unlisted in the transform's config, so everything
// here — colours included — must be ignored outright.
variables.push({
  id: "VariableID:2:5",
  name: "Core/Content/Primary",
  collectionId: MODES_COLLECTION.id,
  resolvedType: "COLOR",
  description: "",
  valuesByMode: {
    "2:0": { type: "VARIABLE_ALIAS", id: primIdByKey.get("brown.800") },
    "2:1": { type: "VARIABLE_ALIAS", id: primIdByKey.get("brown.50") },
  },
});

process.stdout.write(
  JSON.stringify({
    $schema: "cleo-figma-dump/1",
    file: { name: "Colour Modes and Themes" },
    collections: [THEME_COLLECTION, PRIM_COLLECTION, MODES_COLLECTION],
    variables,
  }) + "\n",
);
