// The plugin's whole job is to hand Figma's variable data to `packages/tokens` verbatim, so
// there is nothing here about which collections matter or how tokens are shaped — that's the
// transform's config (see packages/tokens/README.md).

export const REPO = { owner: 'meetcleo', name: 'cleonardo' } as const;

/** Branch the workflow watches. The plugin appends a counter: figma-sync/raw-1, -2, … */
export const BRANCH_PREFIX = 'figma-sync/raw-';

/** What the throwaway branch is based on, and what the resulting PR targets.
 *
 *  Keep this `main`. The only reason to change it is to exercise the pipeline before
 *  `.github/workflows/figma-sync.yml` exists on `main`: a push event runs the workflow as it
 *  exists *on the pushed branch*, so the branch has to be based on one that contains it. */
export const BASE_BRANCH = 'main';

/** Where the dump lands on the throwaway branch. Deliberately not `figma-exports/`, which is
 *  the gitignored local input directory the workflow copies into. */
export const RAW_DIR = '.figma-sync';

export const DUMP_FILE = 'figma-dump.json';

/** Bump when the dump's shape changes, so the transform can refuse an older one. */
export const SCHEMA = 'cleo-figma-dump/1';
