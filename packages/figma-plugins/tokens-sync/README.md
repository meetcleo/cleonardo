# Cleo Token Sync

Figma plugin that exports Cleo's colour Variables and opens a review PR of the resulting token
files in this repo. First half of the pipeline in
[COREEXP-323](https://cleo.atlassian.net/browse/COREEXP-323).

```
Figma  --click "Sync"-->  figma-sync/raw-<n> branch  --workflow-->  PR into main  -->  COREEXP-334
```

## Why a plugin and not the REST API

Figma's Variables **REST** API is Enterprise-only and Cleo is on Organization tier, so nothing
outside Figma can read token values. The plugin API has no tier gate. That also means the sync
can't be triggered automatically: a plugin only runs when a human opens it, and the
`LIBRARY_PUBLISH` webhook carries variable names but no values.

## What it does

1. Walks every local variable collection and mode and builds an inventory — names, modes, variable
   types, counts. This goes to `.figma-sync/index.json` and is shown in the plugin UI.
2. Writes token files for the collections listed in [`src/config.ts`](./src/config.ts), in exactly
   the shape `packages/tokens/scripts/transform.mjs` parses. Everything else is inventory only.
3. Creates one commit on top of `main` and pushes it as `figma-sync/raw-<n>`, which triggers
   [`.github/workflows/figma-sync.yml`](../../../.github/workflows/figma-sync.yml).

One commit, then one ref — so the workflow fires once rather than once per file.

## Setup

Build it:

```bash
yarn plugin:build
```

Then in Figma: **Plugins → Development → Import plugin from manifest…** and pick
`packages/figma-plugins/tokens-sync/manifest.json`. `yarn plugin:watch` rebuilds on save.

You need a GitHub token with write access to this repo. Either kind works:

| | Settings | Extra step |
|---|---|---|
| **Fine-grained** (preferred) | Resource owner `meetcleo`, repository access limited to `cleonardo`, **Contents: read and write** | An org owner has to approve it — it shows "Pending" until then |
| **Classic** | Scope **`repo`**, nothing else | If SAML SSO is enforced, use **Configure SSO** on the token to authorise `meetcleo` |

Prefer fine-grained: `repo` on a classic token grants read/write to *every* repository you can
reach, not just this one. Don't tick `workflow` on a classic token — the plugin only writes
`.figma-sync/*.json`, so leaving it off means the token cannot modify CI.

Paste it into the plugin once. It's kept in `figma.clientStorage`, which is local to your Figma
client — it is never committed and never leaves your machine except as an `Authorization` header to
`api.github.com`. Whichever kind you use, the plugin only ever pushes a `figma-sync/raw-*` branch;
`main` is PR-gated.

"Forget token" clears it.

## Publishing to the org

Private plugins are an Organization-plan feature and skip Figma's review process. Publish with
**Publish to → Organization**. Only the publishing account can change a plugin's access later, so
publish from a team-owned account rather than a personal one.

## Adding a token type

Add an entry to `PROMOTED` in [`src/config.ts`](./src/config.ts). Until then a collection shows up
in the inventory and is not written — `index.json` is the adoption backlog for radii, typography,
spacing and motion. Motion tokens live in a different Figma file, so they need their own run.

## Failure modes

The plugin refuses to sync and shows what it found when:

- a collection named in `config.ts` doesn't exist in the file
- a variable in a promoted collection isn't the expected type
- an alias points at a variable in another file (the transform only resolves local primitives)
- an alias chain loops

The transform itself catches the rest: dead references fail (exit 2) and removals refuse to apply
without `--allow-removals` (exit 1), so a bad export gives a red workflow, never a silent deletion.
