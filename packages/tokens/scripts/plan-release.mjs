#!/usr/bin/env node
// Computes one release of the token packages (COREEXP-334): the version, and the GitHub Release
// body describing every colour change since the last release. Diffing is delegated to
// transform-core's flatten/diffFlat/renderDiffReport — the same functions that produce the
// Figma-sync change report — so a colour change reads identically wherever it's reported, rather
// than re-deriving it here.
//
// Versioning: `packages/tokens/package.json`'s committed version is only ever used as the first
// release's version (see README "Versioning") — every later release computes its version from
// the previous `tokens-v*` tag, never from the committed file, so main's static baseline can't
// collide with an already-shipped version. Colour changes never ship as a patch release
// (meetcleo's Dependabot ignores patch updates, so one would never open a pull request); any
// other change (reader code, docs shipped in a package) ships as a patch.
//
// Usage:
//   node scripts/plan-release.mjs [--previous-tag tokens-vX.Y.Z]
//
// With no --previous-tag (the first release), prints the committed package.json version as-is
// and treats every token as added. Reads old tree(s) via `git show <tag>:<path>`, so it must run
// from a checkout that has that tag fetched.
//
// Writes ./release-notes.md (repo-root-relative CWD) and prints $GITHUB_OUTPUT-shaped lines to
// stdout: version=, tag=, has-color-change=.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { flatten, diffFlat, diffIsEmpty, renderDiffReport } from "./transform-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRIM_REL = "packages/tokens/tokens/color/primitives.json";
const SEM_REL = "packages/tokens/tokens/color/semantic.json";

// ---------- version arithmetic ----------

/** Bumps a plain `major.minor.patch` version — no prerelease/build metadata, the pipeline never
 *  emits one. `minor` resets patch to 0. */
export function nextVersion(current, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`not a plain major.minor.patch version: ${JSON.stringify(current)}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`unknown bump type ${JSON.stringify(bump)} — expected "minor" or "patch"`);
}

/** Strips the `tokens-v` prefix a release tag carries. */
export function versionFromTag(tag) {
  const match = /^tokens-v(\d+\.\d+\.\d+)$/.exec(tag);
  if (!match) throw new Error(`not a tokens-v tag: ${JSON.stringify(tag)}`);
  return match[1];
}

// ---------- pure planning ----------

/** Everything the release needs, computed without touching git or the filesystem — the part
 *  worth unit testing directly. `previousTag: null` means "first release": no diff is computed
 *  (there's nothing to diff against), the committed version ships as-is, and the notes say so
 *  rather than listing every token as "added". */
export function planRelease({ previousTag, committedVersion, primOld, semOld, primNew, semNew }) {
  if (!previousTag) {
    return {
      version: committedVersion,
      hasColorChange: true,
      notes: `Initial release. ${flatten(primNew).size} primitives, ` +
        `${flatten(semNew).size} semantic role/theme entries.`,
    };
  }

  const primDiff = diffFlat(flatten(primOld), flatten(primNew));
  const semDiff = diffFlat(flatten(semOld), flatten(semNew));
  const hasColorChange = !diffIsEmpty(primDiff) || !diffIsEmpty(semDiff);

  const version = nextVersion(versionFromTag(previousTag), hasColorChange ? "minor" : "patch");

  const notes = hasColorChange
    ? renderDiffReport({ primDiff, semDiff }) +
      "\n\nA `@theme` entry in \"removed\" means that theme now resolves to Base — the colour " +
      "isn't gone, the override is."
    : "No colour changes in this release.";

  return { version, hasColorChange, notes };
}

// ---------- CLI ----------

function readJsonAt(ref, relPath) {
  if (!ref) return {};
  try {
    return JSON.parse(execFileSync("git", ["show", `${ref}:${relPath}`], { cwd: ROOT, encoding: "utf8" }));
  } catch {
    return {}; // the file didn't exist at that ref
  }
}

function readJsonOnDisk(relPath) {
  const path = join(ROOT, relPath);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const previousTag = args[args.indexOf("--previous-tag") + 1] || null;

  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

  const { version, hasColorChange, notes } = planRelease({
    previousTag,
    committedVersion: pkg.version,
    primOld: readJsonAt(previousTag, PRIM_REL),
    semOld: readJsonAt(previousTag, SEM_REL),
    primNew: readJsonOnDisk("tokens/color/primitives.json"),
    semNew: readJsonOnDisk("tokens/color/semantic.json"),
  });

  writeFileSync("release-notes.md", notes + "\n");
  console.log(`version=${version}`);
  console.log(`tag=tokens-v${version}`);
  console.log(`has-color-change=${hasColorChange}`);
}
