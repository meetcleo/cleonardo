// Which Figma variable collections get promoted to token files, and where they land.
//
// Everything the plugin finds is reported in index.json. Only collections listed
// here are written as token files, at the paths `packages/tokens/scripts/transform.mjs`
// already reads. Adding radii/typography/spacing later is an entry here, not a rewrite.
//
// Collection names must match Figma exactly. If one is missing the plugin refuses to
// sync and shows the inventory so the name can be corrected.

export const REPO = { owner: 'meetcleo', name: 'cleonardo' } as const;

/** Branch the workflow watches. The plugin appends a counter: figma-sync/raw-1, -2, … */
export const BRANCH_PREFIX = 'figma-sync/raw-';

/** Where raw exports land on the throwaway branch. Deliberately not `figma-exports/`,
 *  which is the gitignored local input directory the workflow copies into. */
export const RAW_DIR = '.figma-sync';

export type PromotedCollection = {
  /** Figma collection name, exactly as authored. */
  figmaName: string;
  /** Output file name inside RAW_DIR, and the name transform.mjs expects. */
  file: string;
  /** Variable types allowed in this collection. Anything else fails the run. */
  expectedType: VariableResolvedDataType;
};

export const PROMOTED: PromotedCollection[] = [
  { figmaName: 'Primitives', file: 'primitives.json', expectedType: 'COLOR' },
  { figmaName: 'Semantic', file: 'semantic.json', expectedType: 'COLOR' },
];
