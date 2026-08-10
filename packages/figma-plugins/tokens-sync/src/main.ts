// Sandbox half of the plugin: reads Figma Variables, builds the export, hands it to the UI.
// The UI half does the GitHub calls, because network access needs the iframe.

import { PROMOTED, Promotion } from './config';

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
  /** 'single' = variable names only. 'mode-prefixed' = mode name becomes the top-level group. */
  modeStrategy: 'single' | 'mode-prefixed';
  variableCount: number;
  typeCounts: { [type: string]: number };
  /** Types present but not exported — the adoption backlog for other token types. */
  skippedTypes: { [type: string]: number };
  promotedTo: string | null;
  /** Top-level groups in the resulting tree, so a mode/group mix-up is visible at a glance. */
  topLevelKeys: string[];
};

type Inventory = {
  fileName: string;
  generatedBy: string;
  collections: CollectionReport[];
  /** Libraries this file's aliases point into. Their variables are not local, so they can't be
   *  exported from here — they need a run in the file that authors them. */
  remoteCollections: { [name: string]: { referencedBy: number; sample: string[] } };
  aliasStats: { aliased: number; literal: number };
  problems: string[];
};

const collectionCache = new Map<string, VariableCollection | null>();

async function collectionById(id: string): Promise<VariableCollection | null> {
  if (collectionCache.has(id)) return collectionCache.get(id) as VariableCollection | null;
  let found: VariableCollection | null = null;
  try {
    found = await figma.variables.getVariableCollectionByIdAsync(id);
  } catch {
    found = null; // remote collections aren't always reachable by id
  }
  collectionCache.set(id, found);
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

/** Pick the value for `modeId`, falling back to the variable's own default mode when the alias
 *  crossed into a collection that doesn't share that mode id. */
async function valueFor(variable: Variable, modeId: string): Promise<VariableValue | undefined> {
  if (modeId in variable.valuesByMode) return variable.valuesByMode[modeId];
  const collection = await collectionById(variable.variableCollectionId);
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

async function noteRemote(inventory: Inventory, target: Variable): Promise<void> {
  const collection = await collectionById(target.variableCollectionId);
  const name = collection ? collection.name : 'unknown library collection';
  if (!inventory.remoteCollections[name]) {
    inventory.remoteCollections[name] = { referencedBy: 0, sample: [] };
  }
  const entry = inventory.remoteCollections[name];
  entry.referencedBy++;
  if (entry.sample.length < 5 && entry.sample.indexOf(target.name) === -1) {
    entry.sample.push(target.name);
  }
}

/** A local collection and an enabled library collection are read through different APIs but
 *  export identically, so both are normalised to this before the tree is built. */
type Readable = {
  name: string;
  modes: { modeId: string; name: string }[];
  variables: Variable[];
};

async function readLocal(collection: VariableCollection): Promise<Readable> {
  const variables: Variable[] = [];
  for (const id of collection.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(id);
    if (variable) variables.push(variable);
  }
  return { name: collection.name, modes: collection.modes.slice(), variables };
}

/** Read a collection that lives in an enabled library. Its variables aren't local, so they have
 *  to be imported one at a time; the library descriptor doesn't expose mode names, so a
 *  multi-mode library collection can't be named reliably and is refused rather than guessed. */
async function readLibrary(promoted: Promotion, problems: string[]): Promise<Readable | null> {
  let collections: LibraryVariableCollection[];
  try {
    collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  } catch (error) {
    problems.push(
      `Could not list enabled libraries (${(error as Error).message}). A library has to be enabled ` +
        `in this file through Figma's UI — the plugin API can't enable one.`,
    );
    return null;
  }

  const match = collections.filter((c) => c.name === promoted.figmaName)[0];
  if (!match) {
    const names = collections.map((c) => `"${c.name}" (${c.libraryName})`).join(', ') || 'none';
    problems.push(
      `"${promoted.figmaName}" is not a local collection and no enabled library provides it. ` + `Enabled library collections: ${names}.`,
    );
    return null;
  }

  const descriptors = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(match.key);
  const variables: Variable[] = [];
  for (const descriptor of descriptors) {
    const variable = await figma.variables.importVariableByKeyAsync(descriptor.key);
    if (variable) variables.push(variable);
  }

  const modeIds = new Set<string>();
  for (const variable of variables) {
    for (const modeId of Object.keys(variable.valuesByMode)) modeIds.add(modeId);
  }
  if (modeIds.size > 1) {
    problems.push(
      `Library collection "${match.name}" has ${modeIds.size} modes. Mode names aren't exposed for ` +
        `library collections, so they can't be exported from a consuming file — run the plugin in ` +
        `${match.libraryName} instead.`,
    );
    return null;
  }

  const modeId = [...modeIds][0];
  return {
    name: `${match.name} (library: ${match.libraryName})`,
    modes: modeId ? [{ modeId, name: match.name }] : [],
    variables,
  };
}

async function buildTree(source: Readable, promoted: Promotion, report: CollectionReport, inventory: Inventory): Promise<ExportTree> {
  const tree: ExportTree = {};
  const prefixWithMode = source.modes.length > 1;

  for (const mode of source.modes) {
    for (const variable of source.variables) {
      if (promoted.types.indexOf(variable.resolvedType) === -1) {
        if (mode === source.modes[0]) {
          report.skippedTypes[variable.resolvedType] = (report.skippedTypes[variable.resolvedType] || 0) + 1;
        }
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
          if (target.remote) await noteRemote(inventory, target);

          // aliasData records the first hop only, and transform.mjs resolves it against the
          // primitives. A chain through another semantic token would emit a name it can't find
          // and fail as a dead reference, blaming the wrong thing — so say it here instead.
          const onward = await valueFor(target, mode.modeId);
          if (onward !== undefined && isAlias(onward)) {
            const next = await figma.variables.getVariableByIdAsync(onward.id);
            inventory.problems.push(
              `${variable.name} aliases ${target.name}, which is itself an alias` +
                `${next ? ` (to ${next.name})` : ''}. Resolution is single-hop: a semantic token has ` +
                `to point straight at a primitive.`,
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
    remoteCollections: {},
    aliasStats: { aliased: 0, literal: 0 },
    problems: [],
  };

  const files: { [file: string]: ExportTree } = {};

  for (const collection of collections) {
    const promoted = PROMOTED.filter((p) => p.figmaName === collection.name)[0];

    const report: CollectionReport = {
      name: collection.name,
      id: collection.id,
      modes: collection.modes.map((m) => m.name),
      modeStrategy: collection.modes.length > 1 ? 'mode-prefixed' : 'single',
      variableCount: collection.variableIds.length,
      typeCounts: {},
      skippedTypes: {},
      promotedTo: promoted ? promoted.file : null,
      topLevelKeys: [],
    };

    const source = await readLocal(collection);
    for (const variable of source.variables) {
      report.typeCounts[variable.resolvedType] = (report.typeCounts[variable.resolvedType] || 0) + 1;
    }

    if (promoted) {
      const tree = await buildTree(source, promoted, report, inventory);
      files[promoted.file] = tree;
      report.topLevelKeys = Object.keys(tree);
    }

    inventory.collections.push(report);
  }

  // Anything not local may still be reachable as an enabled library — the colour palette is.
  for (const promoted of PROMOTED) {
    if (files[promoted.file]) continue;

    const source = await readLibrary(promoted, inventory.problems);
    if (!source) continue;

    const report: CollectionReport = {
      name: source.name,
      id: 'library',
      modes: source.modes.map((m) => m.name),
      modeStrategy: source.modes.length > 1 ? 'mode-prefixed' : 'single',
      variableCount: source.variables.length,
      typeCounts: {},
      skippedTypes: {},
      promotedTo: promoted.file,
      topLevelKeys: [],
    };
    for (const variable of source.variables) {
      report.typeCounts[variable.resolvedType] = (report.typeCounts[variable.resolvedType] || 0) + 1;
    }

    const tree = await buildTree(source, promoted, report, inventory);
    files[promoted.file] = tree;
    report.topLevelKeys = Object.keys(tree);
    inventory.collections.push(report);
  }

  if (!collections.length) {
    inventory.problems.push(
      'This file has no local variable collections. Variables published from a library are not ' +
        'local to the files that consume them — open the file that authors them, and check you are ' +
        'on the branch that holds them.',
    );
  }

  const remote = Object.keys(inventory.remoteCollections);
  const unexported = remote.filter((name) => !PROMOTED.some((p) => p.figmaName === name));
  if (unexported.length) {
    inventory.problems.push(
      `Aliases point into ${unexported.length} library collection(s) not exported from this file: ` +
        `${unexported.join(', ')}. Their values resolve here, but the collection itself has to be ` +
        `exported from its own file.`,
    );
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
