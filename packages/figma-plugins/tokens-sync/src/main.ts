// Sandbox half of the plugin: dumps Figma's variable data verbatim and hands it to the UI,
// which does the GitHub calls (network access needs the iframe).
//
// This deliberately interprets nothing — no nesting, no hex, no alias following, no type
// filtering. `packages/tokens/scripts/transform.mjs` owns every one of those decisions, so alias
// handling and colour maths exist in exactly one place. See packages/tokens/README.md.
//
// The one job beyond copying is completeness: an alias references a variable by id, so the dump
// has to contain every collection an alias reaches into — including ones published from a
// library, which aren't local to this file.

import { SCHEMA } from './config';

const PAT_KEY = 'github-pat';

type DumpCollection = {
  id: string;
  name: string;
  source: 'local' | 'library';
  libraryName?: string;
  defaultModeId: string;
  modes: { modeId: string; name: string }[];
};

type DumpVariable = {
  id: string;
  name: string;
  collectionId: string;
  resolvedType: VariableResolvedDataType;
  description?: string;
  valuesByMode: { [modeId: string]: unknown };
};

type Dump = {
  $schema: string;
  file: { name: string };
  collections: DumpCollection[];
  variables: DumpVariable[];
};

/** Display-only counts. The dump is the record; this is what the panel renders. */
type Summary = {
  collections: {
    name: string;
    source: string;
    modes: string[];
    variableCount: number;
    typeCounts: { [type: string]: number };
  }[];
  aliasStats: { aliased: number; literal: number };
  problems: string[];
};

const isAlias = (v: unknown): v is VariableAlias => typeof v === 'object' && v !== null && (v as VariableAlias).type === 'VARIABLE_ALIAS';

/** Plain copy — valuesByMode is a live API object, and it may hold colours, numbers, strings or
 *  booleans depending on the variable's type. All of them pass through untouched. */
function copyValues(variable: Variable): { [modeId: string]: unknown } {
  const out: { [modeId: string]: unknown } = {};
  for (const modeId of Object.keys(variable.valuesByMode)) {
    out[modeId] = JSON.parse(JSON.stringify(variable.valuesByMode[modeId]));
  }
  return out;
}

function toDumpVariable(variable: Variable): DumpVariable {
  const entry: DumpVariable = {
    id: variable.id,
    name: variable.name,
    collectionId: variable.variableCollectionId,
    resolvedType: variable.resolvedType,
    valuesByMode: copyValues(variable),
  };
  if (variable.description) entry.description = variable.description;
  return entry;
}

async function collectionMeta(
  id: string,
  source: 'local' | 'library',
  fallbackName: string,
  fallbackModeIds: string[],
  libraryName?: string,
): Promise<DumpCollection> {
  let found: VariableCollection | null = null;
  try {
    found = await figma.variables.getVariableCollectionByIdAsync(id);
  } catch {
    found = null; // library collections aren't always reachable by id
  }
  if (found) {
    return {
      id: found.id,
      name: found.name,
      source,
      ...(libraryName ? { libraryName } : {}),
      defaultModeId: found.defaultModeId,
      modes: found.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    };
  }
  return {
    id,
    name: fallbackName,
    source,
    ...(libraryName ? { libraryName } : {}),
    defaultModeId: fallbackModeIds[0] ?? '',
    modes: fallbackModeIds.map((modeId) => ({ modeId, name: fallbackName })),
  };
}

async function build(): Promise<{ dump: Dump; summary: Summary }> {
  const problems: string[] = [];
  const collections: DumpCollection[] = [];
  const variables = new Map<string, DumpVariable>();
  const haveCollection = new Set<string>();

  for (const collection of await figma.variables.getLocalVariableCollectionsAsync()) {
    collections.push({
      id: collection.id,
      name: collection.name,
      source: 'local',
      defaultModeId: collection.defaultModeId,
      modes: collection.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    });
    haveCollection.add(collection.id);

    for (const id of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(id);
      if (variable) variables.set(variable.id, toDumpVariable(variable));
    }
  }

  if (!collections.length) {
    problems.push(
      'This file has no local variable collections. Variables published from a library are not ' +
        'local to the files that consume them — open the file that authors them, and check you are ' +
        'on the branch that holds them.',
    );
  }

  let libraryCollections: LibraryVariableCollection[] | null = null;
  const importedLibraries = new Set<string>();

  // Follow alias references until nothing new turns up: a library collection can itself alias
  // another one, so one pass isn't enough.
  for (let round = 0; round < 5; round++) {
    const missing = new Map<string, string>(); // target variable id -> referring variable name
    for (const variable of variables.values()) {
      for (const value of Object.values(variable.valuesByMode)) {
        if (isAlias(value) && !variables.has(value.id)) missing.set(value.id, variable.name);
      }
    }
    if (!missing.size) break;

    for (const [targetId, referrer] of missing) {
      const target = await figma.variables.getVariableByIdAsync(targetId);
      if (!target) {
        problems.push(`${referrer} aliases ${targetId}, which can't be read from this file.`);
        continue;
      }
      variables.set(target.id, toDumpVariable(target));
      if (haveCollection.has(target.variableCollectionId)) continue;

      // The referenced collection lives in a library. Pull all of it, not just this variable —
      // a partial palette would look like tokens were removed.
      const meta = await collectionMeta(
        target.variableCollectionId,
        'library',
        'unknown library collection',
        Object.keys(target.valuesByMode),
      );
      if (importedLibraries.has(meta.name)) continue;

      if (!libraryCollections) {
        try {
          libraryCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
        } catch (error) {
          problems.push(
            `Could not list enabled libraries (${(error as Error).message}). A library has to be ` +
              `enabled in this file through Figma's UI — the plugin API can't enable one.`,
          );
          libraryCollections = [];
        }
      }

      const matches = libraryCollections.filter((c) => c.name === meta.name);
      if (matches.length !== 1) {
        const names = libraryCollections.map((c) => `"${c.name}" (${c.libraryName})`).join(', ');
        problems.push(
          matches.length === 0
            ? `${referrer} aliases into "${meta.name}", which no enabled library provides. ` +
                `Enabled library collections: ${names || 'none'}.`
            : `"${meta.name}" is provided by ${matches.length} enabled libraries, so the right one ` +
                `can't be chosen: ${matches.map((c) => c.libraryName).join(', ')}.`,
        );
        continue;
      }

      const descriptors = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(matches[0].key);
      for (const descriptor of descriptors) {
        const imported = await figma.variables.importVariableByKeyAsync(descriptor.key);
        if (imported) variables.set(imported.id, toDumpVariable(imported));
      }

      const modeIds = new Set<string>();
      for (const variable of variables.values()) {
        if (variable.collectionId !== target.variableCollectionId) continue;
        for (const modeId of Object.keys(variable.valuesByMode)) modeIds.add(modeId);
      }
      collections.push(await collectionMeta(target.variableCollectionId, 'library', matches[0].name, [...modeIds], matches[0].libraryName));
      haveCollection.add(target.variableCollectionId);
      importedLibraries.add(meta.name);
    }
  }

  const dump: Dump = {
    $schema: SCHEMA,
    file: { name: figma.root.name },
    collections,
    variables: [...variables.values()],
  };

  const summary: Summary = { collections: [], aliasStats: { aliased: 0, literal: 0 }, problems };
  for (const collection of collections) {
    const own = dump.variables.filter((v) => v.collectionId === collection.id);
    const typeCounts: { [type: string]: number } = {};
    for (const variable of own) {
      typeCounts[variable.resolvedType] = (typeCounts[variable.resolvedType] || 0) + 1;
      for (const value of Object.values(variable.valuesByMode)) {
        if (isAlias(value)) summary.aliasStats.aliased++;
        else summary.aliasStats.literal++;
      }
    }
    summary.collections.push({
      name: collection.libraryName ? `${collection.name} (library: ${collection.libraryName})` : collection.name,
      source: collection.source,
      modes: collection.modes.map((m) => m.name),
      variableCount: own.length,
      typeCounts,
    });
  }

  return { dump, summary };
}

async function run(): Promise<void> {
  const { dump, summary } = await build();
  const pat = (await figma.clientStorage.getAsync(PAT_KEY)) as string | undefined;
  figma.ui.postMessage({ type: 'loaded', dump, summary, pat: pat || '' });
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
