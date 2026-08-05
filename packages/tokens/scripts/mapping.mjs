#!/usr/bin/env node
// Map existing consumer colours to canonical token paths. COREEXP-320.
//
// Usage, from the repo root (or drop the `tokens:` prefix inside this package):
//   yarn tokens:mapping --write --meetcleo <path> --mobile-app <path>
//   yarn tokens:check:mapping                              # needs only tokens/
//   yarn tokens:check:consumers --meetcleo <p> --mobile-app <p>
//
// Consumer paths resolve against the working directory, not against this file.
//
// Inputs:  tokens/color/{primitives,semantic}.json  + the two consumer repos
// Outputs: mapping/{backend,native-app}.json, mapping/REPORT.md   (committed)
//          mapping/overrides.json is hand-maintained input, never written
//
// Why a script and not a hand-typed table: ~260 rows, and it has to be
// re-runnable every time Figma changes. Producer and guard are the same code so
// the mapping can't silently rot.
//
// Mapping is role-name driven, not hex driven. 1880 semantic tokens resolve to
// 94 distinct hexes, so hex can never identify a token — it only corroborates a
// name match and surfaces value drift.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOK_PRIM = join(ROOT, "tokens", "color", "primitives.json");
const TOK_SEM = join(ROOT, "tokens", "color", "semantic.json");
const MAP_DIR = join(ROOT, "mapping");
const OUT_BE = join(MAP_DIR, "backend.json");
const OUT_FE = join(MAP_DIR, "native-app.json");
const OVERRIDES = join(MAP_DIR, "overrides.json");
const OUT_REPORT = join(MAP_DIR, "REPORT.md");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const MODE = args.includes("--write") ? "write"
  : args.includes("--check-consumers") ? "check-consumers"
  : args.includes("--check-tokens") ? "check-tokens"
  : null;

if (!MODE) die("Pass one of --write | --check-tokens | --check-consumers");

const problems = [];
function die(msg, code = 1) { console.error(msg); process.exit(code); }
function fail(msg) { problems.push(msg); }

// ---------- token side ----------

const isLeaf = (n) => n && typeof n === "object" && n.$type === "color";

function* walk(node, path = []) {
  if (!node || typeof node !== "object") return;
  if (isLeaf(node)) { yield { path, node }; return; }
  for (const k of Object.keys(node)) {
    if (k.startsWith("$")) continue;
    yield* walk(node[k], [...path, k]);
  }
}

function flatten(tree) {
  const out = new Map();
  for (const { path, node } of walk(tree)) out.set(path.join("."), node.$value);
  return out;
}

const PRIM = flatten(JSON.parse(readFileSync(TOK_PRIM, "utf8"))); // color.primitives.Brown.800 -> "#47201C"
const SEM = flatten(JSON.parse(readFileSync(TOK_SEM, "utf8")));   // color.semantic.Base.… -> "{ref}" | hex

// Resolve a token path (primitive or semantic) to a concrete hex, following aliases.
function resolveToken(path, depth = 0) {
  if (depth > 10) return null;
  const raw = PRIM.get(path) ?? SEM.get(path);
  if (raw === undefined) return null;
  if (typeof raw === "string" && raw.startsWith("{")) return resolveToken(raw.slice(1, -1), depth + 1);
  return String(raw).toUpperCase();
}

const tokenExists = (path) => PRIM.has(path) || SEM.has(path);

// Base-namespace semantic leaves, indexed by (group, leaf) with spaces stripped.
// Groups UI.* and Feature.* are deliberately excluded — they belong to the gap
// list, not to this spike's consumers.
const MAPPABLE_TOPS = ["Core", "Extension", "Effects", "Surface"];
const baseIndex = new Map();
for (const path of SEM.keys()) {
  const parts = path.split(".");            // color, semantic, Base, Core, Background, Primary
  if (parts[2] !== "Base") continue;
  const top = parts[3];
  if (!MAPPABLE_TOPS.includes(top)) continue;
  const group = parts.at(-2);
  const leaf = parts.at(-1).replace(/\s+/g, "");
  const key = `${group}.${leaf}`;
  if (!baseIndex.has(key)) baseIndex.set(key, []);
  baseIndex.get(key).push(path);
}

// Candidates ordered Core > Extension > Effects > Surface, so the common case
// (a role that exists in both Core and Extension) resolves deterministically.
function resolveBaseSemantic(group, leaf) {
  const hits = baseIndex.get(`${group}.${leaf}`) ?? [];
  return [...hits].sort(
    (a, b) => MAPPABLE_TOPS.indexOf(a.split(".")[3]) - MAPPABLE_TOPS.indexOf(b.split(".")[3])
  );
}

const primitivesByHex = new Map();
for (const [path, hex] of PRIM) {
  const k = String(hex).toUpperCase();
  if (!primitivesByHex.has(k)) primitivesByHex.set(k, []);
  primitivesByHex.get(k).push(path);
}

// ---------- consumer parsers ----------

// app/helpers/color_roles_helper.rb — nested modules, SCREAMING_SNAKE constants.
function parseColorRolesHelper(src) {
  const out = [];
  const stack = [];
  for (const line of src.split("\n")) {
    let m = line.match(/^\s*module\s+(\w+)/);
    if (m) { stack.push(m[1]); continue; }
    if (/^\s*end\b/.test(line)) { stack.pop(); continue; }
    m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/);
    if (m && stack.length) {
      const scope = stack.slice(1); // drop the outer ColorRolesHelper
      out.push({
        id: ["ColorRolesHelper", ...scope, m[1]].join("::"),
        scope,                       // e.g. ["Background"] or ["Rebrand", "Content"]
        constant: m[1],
        value: normaliseHex(m[2]),
        rawValue: m[2],
      });
    }
  }
  return out;
}

// app/models/user_prompt/screen_theme.rb — SCREEN_THEMES hash, 4 variants.
function parseScreenTheme(src) {
  const out = [];
  const body = between(src, "SCREEN_THEMES = {", "\n    }.freeze");
  const stack = []; // hash keys we're currently inside, outermost first
  for (const line of body.split("\n")) {
    let m = line.match(/^\s*(\w+):\s*\{\s*$/);
    if (m) { stack.push(m[1]); continue; }
    if (/^\s*\},?\s*$/.test(line)) { stack.pop(); continue; }
    m = line.match(/^\s*(\w+):\s*'(#?[0-9A-Fa-f]{6,8})',?\s*$/);
    if (m && stack.length) {
      const path = [...stack, m[1]].join(".");
      out.push({
        id: `UserPrompt::ScreenTheme::SCREEN_THEMES.${path}`,
        variant: stack[0],
        value: normaliseHex(m[2]),
        rawValue: m[2],
      });
    }
  }
  return out;
}

// mobile-app/src/shared/global/cocoaTheme/colors.ts — `colors` then `colorRoles`.
function parseCocoaColors(src) {
  const primitives = [];
  const roles = [];

  const colorsBlock = between(src, "export const colors = {", "\n} as const;");
  let group = null;
  for (const line of colorsBlock.split("\n")) {
    let m = line.match(/^\s{2}(\w+):\s*\{/);
    if (m) { group = m[1]; continue; }
    if (/^\s{2}\},?\s*$/.test(line)) { group = null; continue; }
    m = line.match(/^\s*(\w+):\s*'(#[0-9A-Fa-f]{6,8})'/);
    if (m) {
      const key = group ? `${group}.${m[1]}` : m[1];
      primitives.push({ id: `colors.${key}`, group, leaf: m[1], value: normaliseHex(m[2]) });
    }
  }

  const rolesBlock = between(src, "export const colorRoles = {", "\n} as const;");
  let kind = null;
  for (const line of rolesBlock.split("\n")) {
    let m = line.match(/^\s{2}(\w+):\s*\{/);
    if (m) { kind = m[1]; continue; }
    if (/^\s{2}\},?\s*$/.test(line)) { kind = null; continue; }
    m = line.match(/^\s{4}(\w+):\s*colors\.(\w+)(?:\[(\d+)\])?,(.*)$/);
    if (m && kind) {
      const ref = m[3] ? `colors.${m[2]}.${m[3]}` : `colors.${m[2]}`;
      roles.push({
        id: `colorRoles.${kind}.${m[1]}`,
        kind,
        leaf: m[1],
        ref,
        deprecated: /\bdeprecated\b/i.test(m[4]),
      });
    }
  }
  return { primitives, roles };
}

function between(src, open, close) {
  const a = src.indexOf(open);
  if (a === -1) die(`Could not find "${open}" — consumer file shape changed.`);
  const b = src.indexOf(close, a);
  if (b === -1) die(`Could not find the close of "${open}".`);
  return src.slice(a + open.length, b);
}

function normaliseHex(v) {
  const s = v.trim().toUpperCase();
  return s.startsWith("#") ? s : `#${s}`;
}

// ---------- name rules ----------

const FE_GROUP_TO_TOKEN = {
  red: "Red", yellow: "Yellow", orange: "Orange", teal: "Teal", green: "Green",
  purple: "Purple", blue: "Blue", brown: "Brown",
  whiteAlpha: "Alpha.Light", blackAlpha: "Alpha.Dark",
  gray: null,             // @deprecated, zero live usages — deliberately unmapped
  black: "Monotone.Black", white: "Monotone.White",
};

const FE_KIND_TO_GROUP = { background: "Background", content: "Content", border: "Border" };

// The naming-convention delta, made executable. The legacy tier orders the
// modifier first (LIGHT_ACCENT, INVERSE_PRIMARY); tokens and the app order it
// last (AccentLight, PrimaryInverse). The `Rebrand::` tier already switched to
// the token order, so both spellings appear in one file and both are listed
// here. Entries mapping to null have no token leaf at all.
const BE_LEAF_ALIASES = {
  PRIMARY: "Primary", SECONDARY: "Secondary", TERTIARY: "Tertiary",
  INVERSE_PRIMARY: "PrimaryInverse", INVERSE_SECONDARY: "SecondaryInverse",
  INVERSE_TERTIARY: "TertiaryInverse",
  PRIMARY_INVERSE: "PrimaryInverse", SECONDARY_INVERSE: "SecondaryInverse",
  TERTIARY_INVERSE: "TertiaryInverse",
  INVERSE_OPAQUE: "OpaqueInverse", INVERSE_SELECTED: "SelectedInverse",
  LIGHT_ACCENT: "AccentLight", LIGHT_WAITING: "WaitingLight",
  LIGHT_POSITIVE: "PositiveLight", LIGHT_NEGATIVE: "NegativeLight",
  DARK_POSITIVE: "PositiveDark", POSITIVE_DARK: "PositiveDark",
  DISABLED: "Disabled", OPAQUE: "Opaque", TRANSPARENT: "Transparent",
  ACCENT: null,               // tokens only have AccentLight/Mid/Dark
  POSITIVE: null,             // ditto PositiveLight/Mid/Dark
  WAITING: null,
  INVERSE_TRANSPARENT: null,  // malformed value too — see COREEXP-324
};

const pascal = (camel) => camel.charAt(0).toUpperCase() + camel.slice(1);

const PURE_ALPHA_BASES = ["#FFFFFF", "#000000"];
const TOKEN_ALPHA_BASES = ["#FFFEFB", "#0E0605"];

// Distinguish the drift we already have an answer for (one alpha-base decision
// covers 19 rows) from drift that needs a per-row look.
function classifyDrift(consumerHex, tokenHex, ctx) {
  const c = consumerHex.toUpperCase();
  const t = tokenHex.toUpperCase();
  const cBase = c.slice(0, 7);
  const tBase = t.slice(0, 7);
  const sameAlpha = c.slice(7) === t.slice(7);
  if (sameAlpha && PURE_ALPHA_BASES.includes(cBase) && TOKEN_ALPHA_BASES.includes(tBase)) {
    return "alpha-base";
  }
  if (ctx === "backend-legacy") return "pre-rebrand";
  return "value-mismatch";
}

// ---------- call sites ----------

function rubyFiles(root) {
  const out = [];
  for (const sub of ["app", "lib", "test"]) {
    const dir = join(root, sub);
    if (existsSync(dir)) collect(dir, out);
  }
  return out;
}

function collect(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) collect(p, out);
    else if (name.endsWith(".rb") || name.endsWith(".erb")) out.push(p);
  }
}

// Every call site fully qualifies the constant — the helper is never `include`d —
// so a single regex over app/lib/test is exact rather than approximate.
function countColorRoleCallSites(meetcleoRoot) {
  const counts = new Map();
  const re = /ColorRolesHelper::((?:Rebrand::)?(?:Background|Content|Border)::[A-Z][A-Z0-9_]*)/g;
  const declFile = join(meetcleoRoot, "app", "helpers", "color_roles_helper.rb");
  for (const file of rubyFiles(meetcleoRoot)) {
    if (file === declFile) continue;
    const src = readFileSync(file, "utf8");
    const isTest = file.includes(`${join(meetcleoRoot, "test")}/`);
    for (const m of src.matchAll(re)) {
      const id = `ColorRolesHelper::${m[1]}`;
      const rec = counts.get(id) ?? { app: 0, test: 0, files: new Set() };
      rec[isTest ? "test" : "app"] += 1;
      rec.files.add(file.slice(meetcleoRoot.length + 1));
      counts.set(id, rec);
    }
  }
  return counts;
}

// ---------- row builders ----------

function loadOverrides() {
  if (!existsSync(OVERRIDES)) return {};
  return JSON.parse(readFileSync(OVERRIDES, "utf8")).entries ?? {};
}

// Overrides are applied BEFORE the row is finalised, so an override that
// resolves an ambiguity also clears the "ambiguous" status rather than leaving a
// row that is both mapped and flagged.
function applyOverride(row, overrides) {
  const o = overrides[row.id];
  if (!o) return row;
  row.overridden = true;
  if ("token" in o) { row.token = o.token; delete row.status; }
  if (o.reason) row.reason = o.reason;
  if (o.recommendation) row.recommendation = o.recommendation;
  if (o.status) row.status = o.status;
  return row;
}

function finaliseRow(row, ctx) {
  if (row.token) {
    if (!tokenExists(row.token)) {
      row.status = "broken-target";
      fail(`${row.id}: mapped to ${row.token}, which does not exist in the token files.`);
      return row;
    }
    const tokenHex = resolveToken(row.token);
    row.tokenValue = tokenHex;
    if (row.value && tokenHex && row.value !== tokenHex) {
      row.status = "mapped-with-drift";
      row.drift = { consumer: row.value, token: tokenHex, kind: classifyDrift(row.value, tokenHex, ctx) };
    } else if (!row.status || row.status === "mapped-with-drift") {
      row.status = "mapped";
    }
  } else if (!row.status) {
    row.status = "unmapped";
  }
  return row;
}

function buildBackendRows(meetcleoRoot, overrides) {
  const helperSrc = readFileSync(join(meetcleoRoot, "app", "helpers", "color_roles_helper.rb"), "utf8");
  const themeSrc = readFileSync(join(meetcleoRoot, "app", "models", "user_prompt", "screen_theme.rb"), "utf8");
  const callSites = countColorRoleCallSites(meetcleoRoot);
  const rows = [];

  for (const c of parseColorRolesHelper(helperSrc)) {
    const site = callSites.get(c.id) ?? { app: 0, test: 0, files: new Set() };
    const isRebrand = c.scope[0] === "Rebrand";
    const group = c.scope.at(-1);
    const leaf = BE_LEAF_ALIASES[c.constant];
    const candidates = leaf ? resolveBaseSemantic(group, leaf) : [];

    const row = {
      id: c.id,
      source: "app/helpers/color_roles_helper.rb",
      value: c.value,
      rawValue: c.rawValue,
      lineage: isRebrand ? "rebrand" : "pre-rebrand",
      callSites: { app: site.app, test: site.test, files: [...site.files].sort() },
      token: null,
      candidates,
    };

    if (c.rawValue !== c.value) {
      row.malformed = "no leading '#' — see COREEXP-324";
    }

    if (!leaf) {
      row.reason = `no token leaf corresponds to ${c.constant} (tokens split this role into Light/Mid/Dark)`;
    } else if (candidates.length === 0) {
      row.reason = `no Base token named ${group}.${leaf}`;
    } else if (candidates.length > 1) {
      row.status = "ambiguous";
      row.reason = `${candidates.length} Base candidates — needs an overrides.json decision`;
    } else {
      row.token = candidates[0];
    }

    applyOverride(row, overrides);
    finaliseRow(row, isRebrand ? "backend-rebrand" : "backend-legacy");

    // The delete-vs-repoint call rests on call-site count, not on taste.
    if (!row.recommendation) {
      if (site.app === 0) {
        row.recommendation = "delete — zero references in app/ or lib/";
      } else if (row.lineage === "pre-rebrand") {
        row.recommendation = row.status === "mapped" || row.status === "mapped-with-drift"
          ? `repoint needs review — ${site.app} live call site(s); adopting the token value changes rendered colour`
          : `repoint or delete needs review — ${site.app} live call site(s), no token counterpart`;
      } else {
        row.recommendation = "adopt the token";
      }
    }
    rows.push(row);
  }

  // screen_theme.rb values are not roles, so there is no name to map. Resolve
  // hex -> primitive (unique), and record the semantic candidates for a human.
  for (const t of parseScreenTheme(themeSrc)) {
    const prims = primitivesByHex.get(t.value) ?? [];
    const row = {
      id: t.id,
      source: "app/models/user_prompt/screen_theme.rb",
      value: t.value,
      variant: t.variant,
      token: prims.length === 1 ? prims[0] : null,
      candidates: prims,
      semanticCandidates: [...SEM.keys()]
        .filter((p) => p.split(".")[2] === "Base" && resolveToken(p) === t.value)
        .slice(0, 8),
    };
    if (prims.length === 0) {
      row.reason = "no primitive has this value";
      row.recommendation = t.variant === "upsell_feature_promotion_3"
        ? "old-palette campaign value leaked into a semantic theme table — realign to the rebrand palette or drop the variant"
        : "realign to an existing primitive — design's call";
    } else if (prims.length > 1) {
      row.status = "ambiguous";
      row.reason = `${prims.length} primitives share this value`;
    } else {
      row.recommendation = "adopt the primitive now; the semantic target needs design to pick from semanticCandidates";
    }
    applyOverride(row, overrides);
    finaliseRow(row, "backend-screen-theme");
    rows.push(row);
  }

  return rows;
}

function buildNativeAppRows(mobileRoot, overrides) {
  const src = readFileSync(join(mobileRoot, "src", "shared", "global", "cocoaTheme", "colors.ts"), "utf8");
  const { primitives, roles } = parseCocoaColors(src);
  const byId = new Map(primitives.map((p) => [p.id, p]));
  const rows = [];

  for (const p of primitives) {
    const tokenGroup = FE_GROUP_TO_TOKEN[p.group ?? p.leaf];
    const row = {
      id: p.id,
      source: "src/shared/global/cocoaTheme/colors.ts",
      layer: "primitive",
      value: p.value,
      token: null,
    };
    if (tokenGroup === null) {
      row.reason = "colors.gray is @deprecated with zero live usages; no token group corresponds to it";
      row.recommendation = "delete — do not add primitives";
    } else if (!tokenGroup) {
      row.reason = `no token group rule for ${p.group ?? p.leaf}`;
    } else {
      row.token = p.group
        ? `color.primitives.${tokenGroup}.${p.leaf}`
        : `color.primitives.${tokenGroup}`;
      if (!tokenExists(row.token)) {
        row.reason = `derived path ${row.token} is not in the token files`;
        row.token = null;
      }
    }
    applyOverride(row, overrides);
    finaliseRow(row, "native-app");
    if (!row.recommendation) {
      row.recommendation = row.drift?.kind === "alpha-base"
        ? "realign to the existing brand-tinted alpha primitive — one design decision covers every alpha row"
        : row.drift
          ? "realign to the token value — the app value looks like a transcription slip"
          : "adopt the token";
    }
    rows.push(row);
  }

  for (const r of roles) {
    const group = FE_KIND_TO_GROUP[r.kind];
    const leaf = pascal(r.leaf);
    const candidates = resolveBaseSemantic(group, leaf);
    const referenced = byId.get(r.ref);
    const row = {
      id: r.id,
      source: "src/shared/global/cocoaTheme/colors.ts",
      layer: "role",
      references: r.ref,
      value: referenced?.value ?? null,
      deprecated: r.deprecated,
      token: null,
      candidates,
    };
    if (!referenced) row.reason = `could not resolve ${r.ref} in colors`;
    else if (candidates.length === 0) row.reason = `no Base token named ${group}.${leaf}`;
    else if (candidates.length > 1) { row.status = "ambiguous"; row.reason = `${candidates.length} Base candidates — needs an overrides.json decision`; }
    else row.token = candidates[0];

    applyOverride(row, overrides);
    finaliseRow(row, "native-app");

    if (!row.recommendation) {
      if (row.token) {
        row.recommendation = row.drift?.kind === "alpha-base"
          ? "realign to the existing brand-tinted alpha primitive"
          : "adopt the token";
      } else if (r.deprecated) {
        row.recommendation = "drop rather than tokenise — already marked deprecated in the app";
      } else {
        row.recommendation = "add a token or drop the role — design's call";
      }
    }
    rows.push(row);
  }

  return rows;
}

// ---------- report ----------

function tally(rows) {
  const t = {};
  for (const r of rows) t[r.status] = (t[r.status] ?? 0) + 1;
  return t;
}

function driftTally(rows) {
  const t = {};
  for (const r of rows) if (r.drift) t[r.drift.kind] = (t[r.drift.kind] ?? 0) + 1;
  return t;
}

function table(rows, cols) {
  const head = `| ${cols.map((c) => c[0]).join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${cols.map((c) => c[1](r) ?? "").join(" | ")} |`).join("\n");
  return `${head}\n${body}`;
}

const code = (v) => (v ? `\`${v}\`` : "—");

function buildReport(be, fe) {
  const all = [...be, ...fe];
  const unmapped = all.filter((r) => r.status === "unmapped" || r.status === "ambiguous");
  const drifted = all.filter((r) => r.drift);

  return `<!-- GENERATED by scripts/mapping.mjs — do not edit. Prose lives in README.md. -->
# Colour mapping report

Rows: **${all.length}** — backend ${be.length}, native-app ${fe.length}.

## Status

| Status | Backend | Native app |
| --- | --- | --- |
${["mapped", "mapped-with-drift", "ambiguous", "unmapped", "broken-target"]
      .map((s) => `| ${s} | ${tally(be)[s] ?? 0} | ${tally(fe)[s] ?? 0} |`).join("\n")}

## Value drift

${Object.entries(driftTally(all)).map(([k, v]) => `- \`${k}\` — ${v} row(s)`).join("\n") || "- none"}

${table(drifted, [
        ["Entry", (r) => code(r.id)],
        ["Token", (r) => code(r.token)],
        ["Consumer", (r) => code(r.drift.consumer)],
        ["Token value", (r) => code(r.drift.token)],
        ["Kind", (r) => r.drift.kind],
      ])}

## Unmapped and ambiguous

${table(unmapped, [
        ["Entry", (r) => code(r.id)],
        ["Status", (r) => r.status],
        ["Value", (r) => code(r.value)],
        ["Call sites", (r) => (r.callSites ? `${r.callSites.app} app / ${r.callSites.test} test` : "—")],
        ["Reason", (r) => r.reason ?? ""],
        ["Recommendation", (r) => r.recommendation ?? ""],
      ])}

## Backend, by lineage and call-site count

${table(be.filter((r) => r.lineage), [
        ["Constant", (r) => code(r.id)],
        ["Lineage", (r) => r.lineage],
        ["Call sites", (r) => `${r.callSites.app} app / ${r.callSites.test} test`],
        ["Status", (r) => r.status],
        ["Token", (r) => code(r.token)],
        ["Recommendation", (r) => r.recommendation ?? ""],
      ])}

## Full backend mapping

${table(be, [
        ["Entry", (r) => code(r.id)],
        ["Value", (r) => code(r.value)],
        ["Token", (r) => code(r.token)],
        ["Status", (r) => r.status],
      ])}

## Full native-app mapping

${table(fe, [
        ["Entry", (r) => code(r.id)],
        ["Layer", (r) => r.layer],
        ["Value", (r) => code(r.value)],
        ["Token", (r) => code(r.token)],
        ["Status", (r) => r.status],
      ])}
`;
}

// ---------- modes ----------

function requireRepos() {
  const meetcleo = flag("--meetcleo");
  const mobile = flag("--mobile-app");
  if (!meetcleo || !mobile) {
    die("This mode needs both consumer repos:\n  --meetcleo <path> --mobile-app <path>\n" +
      "design-tokens has no consumer source of its own, so consumer checks cannot run standalone.");
  }
  for (const p of [meetcleo, mobile]) if (!existsSync(p)) die(`No such path: ${p}`);
  return { meetcleo, mobile };
}

if (MODE === "check-tokens") {
  // Standalone: needs only tokens/. This is the mode that can live in CI today.
  for (const [file, path] of [["backend.json", OUT_BE], ["native-app.json", OUT_FE]]) {
    if (!existsSync(path)) die(`Missing mapping/${file} — run --write first.`);
    for (const row of JSON.parse(readFileSync(path, "utf8")).rows) {
      if (!row.token) continue;
      if (!tokenExists(row.token)) fail(`mapping/${file}: ${row.id} -> ${row.token} no longer exists.`);
      else if (row.tokenValue && resolveToken(row.token) !== row.tokenValue) {
        fail(`mapping/${file}: ${row.id} -> ${row.token} changed value ` +
          `(${row.tokenValue} -> ${resolveToken(row.token)}). Re-run --write.`);
      }
    }
  }
  report("check:tokens");
}

if (MODE === "check-consumers") {
  const { meetcleo, mobile } = requireRepos();
  const overrides = loadOverrides();
  const fresh = [...buildBackendRows(meetcleo, overrides), ...buildNativeAppRows(mobile, overrides)];
  const committed = new Map();
  for (const path of [OUT_BE, OUT_FE]) {
    if (!existsSync(path)) die(`Missing ${path} — run --write first.`);
    for (const row of JSON.parse(readFileSync(path, "utf8")).rows) committed.set(row.id, row);
  }
  const freshIds = new Set(fresh.map((r) => r.id));
  for (const r of fresh) {
    if (!committed.has(r.id)) fail(`${r.id} exists in the consumer but has no mapping row. Re-run --write.`);
  }
  for (const id of committed.keys()) {
    if (!freshIds.has(id)) fail(`mapping row ${id} no longer exists in the consumer. Re-run --write.`);
  }
  for (const id of Object.keys(overrides)) {
    if (!freshIds.has(id)) fail(`overrides.json entry ${id} matches no consumer entry — stale.`);
  }
  for (const r of committed.values()) {
    if (!r.token && !r.recommendation) fail(`${r.id} is unmapped with no recommendation.`);
  }
  report("check:consumers");
}

if (MODE === "write") {
  const { meetcleo, mobile } = requireRepos();
  const overrides = loadOverrides();
  const be = buildBackendRows(meetcleo, overrides);
  const fe = buildNativeAppRows(mobile, overrides);

  mkdirSync(MAP_DIR, { recursive: true });
  const meta = (rows, scope) => ({
    $comment: "GENERATED by scripts/mapping.mjs (COREEXP-320). Hand decisions live in overrides.json.",
    scope,
    counts: tally(rows),
    rows,
  });
  writeFileSync(OUT_BE, JSON.stringify(meta(be, "meetcleo"), null, 2) + "\n");
  writeFileSync(OUT_FE, JSON.stringify(meta(fe, "mobile-app"), null, 2) + "\n");
  writeFileSync(OUT_REPORT, buildReport(be, fe));

  console.error(`backend  : ${be.length} rows  ${JSON.stringify(tally(be))}`);
  console.error(`native-app: ${fe.length} rows  ${JSON.stringify(tally(fe))}`);
  console.error(`drift     : ${JSON.stringify(driftTally([...be, ...fe]))}`);
  console.error(`\n✓ wrote mapping/backend.json, mapping/native-app.json, mapping/REPORT.md`);
  report("write");
}

function report(label) {
  if (problems.length) {
    console.error(`\n✗ ${label}: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.error(`\n✓ ${label}: ok`);
  process.exit(0);
}
