// UI half of the plugin. Network requests have to live here: plugin requests run with a
// `null` origin, so only APIs sending `Access-Control-Allow-Origin: *` are reachable, and
// `api.github.com` is one of them.

import { BRANCH_PREFIX, RAW_DIR, REPO } from './config';

const API = 'https://api.github.com';
const BASE_BRANCH = 'main';

type Loaded = {
  type: 'loaded';
  inventory: Record<string, unknown> & {
    collections: Array<{
      name: string;
      modes: string[];
      modeStrategy: string;
      variableCount: number;
      typeCounts: Record<string, number>;
      promotedTo: string | null;
      topLevelKeys: string[];
    }>;
    aliasStats: { aliased: number; literal: number };
    problems: string[];
  };
  files: Record<string, unknown>;
  hasPat: boolean;
  pat: string;
};

let state: Loaded | null = null;

const el = (id: string) => document.getElementById(id) as HTMLElement;
const patInput = () => el('pat') as unknown as HTMLInputElement;

function log(line: string): void {
  const box = el('log');
  box.textContent = `${box.textContent}${box.textContent ? '\n' : ''}${line}`;
  box.scrollTop = box.scrollHeight;
}

function render(loaded: Loaded): void {
  const { inventory } = loaded;

  el('file').textContent = String(inventory.fileName ?? 'unknown file');

  el('collections').innerHTML = inventory.collections
    .map((c) => {
      const types = Object.keys(c.typeCounts)
        .map((t) => `${t.toLowerCase()} ${c.typeCounts[t]}`)
        .join(', ');
      const status = c.promotedTo ? `<span class="ok">→ ${c.promotedTo}</span>` : '<span class="muted">inventory only</span>';
      return `<div class="row">
        <div class="row-head"><strong>${c.name}</strong> ${status}</div>
        <div class="muted">${c.variableCount} variables (${types || 'none'})</div>
        <div class="muted">modes: ${c.modes.join(', ') || 'none'} — ${c.modeStrategy}</div>
        ${c.topLevelKeys.length ? `<div class="muted">top level: ${c.topLevelKeys.join(', ')}</div>` : ''}
      </div>`;
    })
    .join('');

  el('aliases').textContent = `${inventory.aliasStats.aliased} aliased, ${inventory.aliasStats.literal} literal`;

  if (inventory.problems.length) {
    el('problems').innerHTML = `<strong>${inventory.problems.length} problem(s) — sync blocked</strong><ul>${inventory.problems
      .map((p) => `<li>${p}</li>`)
      .join('')}</ul>`;
    el('problems').classList.remove('hidden');
    (el('sync') as unknown as HTMLButtonElement).disabled = true;
  }

  if (loaded.pat) patInput().value = loaded.pat;
}

async function gh<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${patInput().value.trim()}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    const detail = body ? ` — ${body.slice(0, 300)}` : '';
    if (response.status === 401) {
      throw new Error(
        `GitHub rejected the token (401). Create a new fine-grained PAT for ${REPO.owner}/${REPO.name} with Contents: write, then paste it above.${detail}`,
      );
    }
    if (response.status === 403 || response.status === 404) {
      throw new Error(
        `GitHub returned ${response.status} for ${path}. Check the token has Contents: write on ${REPO.owner}/${REPO.name}.${detail}`,
      );
    }
    throw new Error(`GitHub ${response.status} for ${path}${detail}`);
  }
  return (body ? JSON.parse(body) : null) as T;
}

type Sha = { sha: string };
type Ref = { object: Sha };
type Commit = { sha: string; tree: Sha };

async function nextBranch(): Promise<string> {
  const refs = await gh<Array<{ ref: string }>>(`/repos/${REPO.owner}/${REPO.name}/git/matching-refs/heads/${BRANCH_PREFIX}`);
  const used = refs.map((r) => parseInt(r.ref.replace(`refs/heads/${BRANCH_PREFIX}`, ''), 10)).filter((n) => !isNaN(n));
  const next = used.length ? Math.max(...used) + 1 : 1;
  return `${BRANCH_PREFIX}${next}`;
}

async function sync(): Promise<void> {
  if (!state) return;
  const button = el('sync') as unknown as HTMLButtonElement;
  button.disabled = true;

  try {
    parent.postMessage({ pluginMessage: { type: 'save-pat', pat: patInput().value.trim() } }, '*');

    const payload: Record<string, string> = { 'index.json': JSON.stringify(state.inventory, null, 2) };
    for (const file of Object.keys(state.files)) {
      payload[file] = `${JSON.stringify(state.files[file], null, 2)}\n`;
    }

    log(`Reading ${BASE_BRANCH}…`);
    const baseRef = await gh<Ref>(`/repos/${REPO.owner}/${REPO.name}/git/ref/heads/${BASE_BRANCH}`);
    const baseCommit = await gh<Commit>(`/repos/${REPO.owner}/${REPO.name}/git/commits/${baseRef.object.sha}`);

    log(`Uploading ${Object.keys(payload).length} files…`);
    const tree = [];
    for (const path of Object.keys(payload)) {
      const blob = await gh<Sha>(`/repos/${REPO.owner}/${REPO.name}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: payload[path], encoding: 'utf-8' }),
      });
      tree.push({ path: `${RAW_DIR}/${path}`, mode: '100644', type: 'blob', sha: blob.sha });
    }

    // One commit, then one ref — so the workflow fires once rather than once per file.
    const newTree = await gh<Sha>(`/repos/${REPO.owner}/${REPO.name}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
    });
    const commit = await gh<Sha>(`/repos/${REPO.owner}/${REPO.name}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: `Figma token export from ${state.inventory.fileName}`,
        tree: newTree.sha,
        parents: [baseRef.object.sha],
      }),
    });

    const branch = await nextBranch();
    log(`Pushing ${branch}…`);
    await gh(`/repos/${REPO.owner}/${REPO.name}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });

    log(`Done. A figma-sync PR will appear once the workflow finishes.`);
    log(`https://github.com/${REPO.owner}/${REPO.name}/pulls?q=is%3Apr+is%3Aopen+label%3Afigma-sync`);
    parent.postMessage({ pluginMessage: { type: 'notify', text: 'Token export pushed' } }, '*');
  } catch (error) {
    log(`✗ ${(error as Error).message}`);
    button.disabled = false;
  }
}

el('sync').onclick = () => void sync();
el('forget').onclick = () => {
  patInput().value = '';
  parent.postMessage({ pluginMessage: { type: 'forget-pat' } }, '*');
  log('Token cleared from this Figma client.');
};
el('copy').onclick = () => {
  if (state) log(JSON.stringify(state.inventory, null, 2));
};

onmessage = (event: MessageEvent) => {
  const message = event.data.pluginMessage;
  if (!message) return;
  if (message.type === 'loaded') {
    state = message as Loaded;
    render(state);
    el('loading').classList.add('hidden');
    el('content').classList.remove('hidden');
  } else if (message.type === 'fatal') {
    el('loading').textContent = `Failed to read variables: ${message.message}`;
  }
};
