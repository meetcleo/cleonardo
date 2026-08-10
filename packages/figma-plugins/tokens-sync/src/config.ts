// Which Figma variable collections get promoted to token files, and where they land.
//
// Everything the plugin finds is reported in index.json. Only collections listed here are
// written as token files, at the paths `packages/tokens/scripts/transform.mjs` already reads.
// Adding radii/typography/spacing later is an entry here, not a rewrite.
//
// Collection names must match Figma exactly. If one is missing the plugin refuses to sync and
// names the collections the file does have.

export const REPO = { owner: 'meetcleo', name: 'cleonardo' } as const;

/** Branch the workflow watches. The plugin appends a counter: figma-sync/raw-1, -2, … */
export const BRANCH_PREFIX = 'figma-sync/raw-';

/** Where raw exports land on the throwaway branch. Deliberately not `figma-exports/`,
 *  which is the gitignored local input directory the workflow copies into. */
export const RAW_DIR = '.figma-sync';

export type Promotion = {
  /** Figma collection name, exactly as authored. */
  figmaName: string;
  /** Output file name inside RAW_DIR, and the name transform.mjs expects. */
  file: string;
  /** Variable types to export. Collections mix types — anything not listed is counted in the
   *  inventory as skipped, not treated as an error. */
  types: VariableResolvedDataType[];
};

// `Themes` (1880 colour variables, one mode) is the semantic layer: its top-level groups are
// Base / Chat / Roast / Hype. The `Primitives` palette is a linked library rather than local to
// that file, so it needs its own run — see `remoteCollections` in index.json for which library.
//
// The `Modes` collection carries the same role set as four Figma modes instead of four name
// prefixes. It's the direction in COREEXP-14's design proposal, not what consumers read today,
// so it stays inventory-only until that migration is a decision.
export const PROMOTED: Promotion[] = [
  { figmaName: 'Primitives', file: 'primitives.json', types: ['COLOR'] },
  { figmaName: 'Themes', file: 'semantic.json', types: ['COLOR'] },
];
