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

1. Dumps every variable it can reach to `.figma-sync/figma-dump.json` — a flat list of collections
   and variables with `valuesByMode` exactly as the Figma API returns it.
2. Creates one commit on top of `main` and pushes it as `figma-sync/raw-<n>`, which triggers
   [`.github/workflows/figma-sync.yml`](../../../.github/workflows/figma-sync.yml).

One commit, then one ref — so the workflow fires once.

**It interprets nothing.** No nesting, no hex conversion, no alias following, no type filtering, no
decision about which collections matter. `packages/tokens/scripts/transform.mjs` owns all of that,
so alias handling and colour maths exist in exactly one place. The dump format is specified in
[`packages/tokens/README.md`](../../tokens/README.md) — that's the contract between the two.

The one job beyond copying is **completeness**. Aliases reference variables by id, so the dump has
to contain every collection an alias reaches into, including library-published ones that aren't
local to the file (Cleo's palette is one). It follows references to a fixed point rather than a
single pass, because a library collection can alias another.

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

Private plugins are an Organization-plan feature and skip Figma's review process, so a publish is
live immediately.

Before publishing:

- **`.github/workflows/figma-sync.yml` has to be on `main`.** The plugin bases its throwaway branch
  there, and a push event runs the workflow as it exists on the pushed branch. Publish before that
  lands and designers push branches that do nothing.
- **An icon**, 128×128 (Figma's recommended size). A 1920×1080 cover image is offered too; nobody
  browses a private plugin, so it's optional.
- **Pick the account.** Only the original publisher can change a plugin's access later, and if they
  leave the org it takes Figma Support to transfer ownership. Prefer a team-owned account.

Then:

```bash
yarn plugin:build
```

In the Figma **desktop app** — publishing isn't available in the browser: **Plugins → Manage
plugins**, select the plugin, **Publish**, fill in the details and icon, set **Publish to →
Organization**, and publish. The network-access screen will show `api.github.com` and the reasoning
from [`manifest.json`](./manifest.json).

Designers then install it from the file browser: **All teams** (or All workspaces) → **Plugins** →
**↓ Save**. Guests can't see or run private plugins. Each designer needs their own GitHub token —
see [Setup](#setup).

Two things to expect:

- **Figma assigns a real plugin id on first publish** and rewrites `manifest.json`, which currently
  holds the placeholder `cleo-token-sync`. Commit that change, or the next person importing from the
  manifest ends up with a different plugin.
- **Publishing uploads your local build**, and `dist/` is gitignored. Always `yarn plugin:build`
  from an up-to-date checkout first, or you ship whatever was last built on that machine.

## Adding a token type

Nothing changes here — the dump already carries every collection in the file. Adoption is a config
entry in `packages/tokens`, which decides what becomes a token file. Motion tokens live in a
different Figma file, so those need their own run of this plugin.

## Failure modes

The plugin only refuses to sync over **completeness** — the dump has to be usable:

- the file has no local variable collections (you're probably in a file that *consumes* the library
  rather than the one that authors it)
- an alias reaches into a library collection that isn't enabled in this file (the plugin API can't
  enable one — that's a Figma UI action)
- two enabled libraries provide a collection with the same name, so the right one can't be chosen
- an alias target can't be read at all

Everything about the *content* is the transform's job, and it reports against the dump rather than
guessing: dead references and dangling ids exit 2, removals refuse to apply without
`--allow-removals` (exit 1). A bad dump gives a red workflow, never a silent deletion.
