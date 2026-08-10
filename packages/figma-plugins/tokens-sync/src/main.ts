// Sandbox half of the plugin: reads Figma Variables, builds the export, hands it to the UI.
// The UI half does the GitHub calls, because network access needs the iframe.

import { PROMOTED, PromotedCollection } from './config';

const PAT_KEY = 'github-pat';

type Hex = { hex: string; alpha: number };

type ExportLeaf = {
  $type: 'color';
  $value: Hex;
  $description?: string;
  $extensions?: { 'com.figma.aliasData': { targetVariableName: string } };
};

type ExportTree = { [key: string]: ExportTree | ExportLeaf };

type CollectionReport = {
  name: string;
  id: string;
  modes: string[];
  /** How the tree was built: 'single' = variable names only, 'mode-prefixed' = mode name is the top level. */
  modeStrategy: 'single' | 'mode-prefixed';
  variableCount: number;
  typeCounts: { [type: string]: number };
  promotedTo: string | null;
  /** Top-level groups in the resulting tree, so a mode/group mix-up is visible at a glance. */
  topLevelKeys: string[];
};

type Inventory = {
  fileName: string;
  generatedBy: string;
  collections: CollectionReport[];
  aliasStats: { aliased: number; literal: number };
  problems: string[];
};

const collectionCache = new Map<string, VariableCollection>();

async function collectionOf(variable: Variable): Promise<VariableCollection | null> {
  const cached = collectionCache.get(variable.variableCollectionId);
  if (cached) return cached;
  const found = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  if (found) collectionCache.set(found.id, found);
  return found;
}

const isAlias = (v: VariableValue): v is VariableAlias =>
  typeof v === 'object' && v !== null && (v as VariableAlias).type === 'VARIABLE_ALIAS';

function toHex(colour: RGB | RGBA): Hex {
  const channel = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  const alpha = 'a' in colour ? colour.a : 1;
  return { hex: `#${channel(colour.r)}${channel(colour.g)}${channel(colour.b)}`, alpha };
}

/** Pick the value for `modeId`, falling back to the variable's own default mode when the
 *  alias crossed into a collection that doesn't share that mode id. */
async function valueFor(variable: Variable, modeId: string): Promise<VariableValue | undefined> {
  if (modeId in variable.valuesByMode) return variable.valuesByMode[modeId];
  const collection = await collectionOf(variable);
  return collection ? variable.valuesByMode[collection.defaultModeId] : undefined;
}

/** Follow an alias chain to the literal colour behind it. */
async function resolveLiteral(variable: Variable, modeId: string, problems: string[], seen: string[] = []): Promise<Hex | null> {
  if (seen.indexOf(variable.id) !== -1) {
    problems.push(`Alias cycle through ${variable.name}`);
    return null;
  }
  const value = await valueFor(variable, modeId);
  if (value === undefined) {
    problems.push(`${variable.name} has no value in the mode being exported`);
    return null;
  }
  if (!isAlias(value)) return toHex(value as RGB | RGBA);

  const target = await figma.variables.getVariableByIdAsync(value.id);
  if (!target) {
    problems.push(`${variable.name} aliases a variable that no longer exists`);
    return null;
  }
  return resolveLiteral(target, modeId, problems, seen.concat(variable.id));
}

function place(tree: ExportTree, path: string[], leaf: ExportLeaf): void {
  let cursor = tree;
  for (const segment of path.slice(0, -1)) {
    if (!cursor[segment]) cursor[segment] = {};
    cursor = cursor[segment] as ExportTree;
  }
  cursor[path[path.length - 1]] = leaf;
}

async function buildTree(collection: VariableCollection, promoted: PromotedCollection, inventory: Inventory): Promise<ExportTree> {
  const tree: ExportTree = {};
  const prefixWithMode = collection.modes.length > 1;

  for (const mode of collection.modes) {
    for (const variableId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) continue;

      if (variable.resolvedType !== promoted.expectedType) {
        inventory.problems.push(`${collection.name}/${variable.name} is ${variable.resolvedType}, expected ${promoted.expectedType}`);
        continue;
      }

      const resolved = await resolveLiteral(variable, mode.modeId, inventory.problems);
      if (!resolved) continue;

      const leaf: ExportLeaf = { $type: 'color', $value: resolved };
      if (variable.description) leaf.$description = variable.description;

      const raw = await valueFor(variable, mode.modeId);
      if (raw !== undefined && isAlias(raw)) {
        const target = await figma.variables.getVariableByIdAsync(raw.id);
        if (target) {
          if (target.remote) {
            inventory.problems.push(
              `${variable.name} aliases ${target.name} from another file — the transform only resolves local primitives`,
            );
          }
          leaf.$extensions = { 'com.figma.aliasData': { targetVariableName: target.name } };
          inventory.aliasStats.aliased++;
        }
      } else {
        inventory.aliasStats.literal++;
      }

      const path = variable.name.split('/');
      place(tree, prefixWithMode ? [mode.name].concat(path) : path, leaf);
    }
  }

  return tree;
}

async function run(): Promise<void> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const collection of collections) collectionCache.set(collection.id, collection);

  const inventory: Inventory = {
    fileName: figma.root.name,
    generatedBy: 'packages/figma-plugins/tokens-sync',
    collections: [],
    aliasStats: { aliased: 0, literal: 0 },
    problems: [],
  };

  const files: { [file: string]: ExportTree } = {};

  for (const collection of collections) {
    const promoted = PROMOTED.filter((p) => p.figmaName === collection.name)[0];
    const typeCounts: { [type: string]: number } = {};

    for (const variableId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) continue;
      typeCounts[variable.resolvedType] = (typeCounts[variable.resolvedType] || 0) + 1;
    }

    const tree = promoted ? await buildTree(collection, promoted, inventory) : null;
    if (promoted && tree) files[promoted.file] = tree;

    inventory.collections.push({
      name: collection.name,
      id: collection.id,
      modes: collection.modes.map((m) => m.name),
      modeStrategy: collection.modes.length > 1 ? 'mode-prefixed' : 'single',
      variableCount: collection.variableIds.length,
      typeCounts,
      promotedTo: promoted ? promoted.file : null,
      topLevelKeys: tree ? Object.keys(tree) : [],
    });
  }

  for (const promoted of PROMOTED) {
    if (!files[promoted.file]) {
      inventory.problems.push(
        `No collection named "${promoted.figmaName}" in this file — sync is blocked until the name in config.ts matches Figma`,
      );
    }
  }

  const pat = (await figma.clientStorage.getAsync(PAT_KEY)) as string | undefined;
  figma.ui.postMessage({ type: 'loaded', inventory, files, hasPat: Boolean(pat), pat: pat || '' });
}

figma.showUI(__html__, { width: 460, height: 620, themeColors: true });

figma.ui.onmessage = async (message: { type: string; pat?: string; text?: string }) => {
  if (message.type === 'save-pat') {
    await figma.clientStorage.setAsync(PAT_KEY, message.pat || '');
  } else if (message.type === 'forget-pat') {
    await figma.clientStorage.deleteAsync(PAT_KEY);
  } else if (message.type === 'notify' && message.text) {
    figma.notify(message.text);
  } else if (message.type === 'close') {
    figma.closePlugin();
  }
};

run().catch((error: Error) => {
  figma.ui.postMessage({ type: 'fatal', message: error.message });
});
