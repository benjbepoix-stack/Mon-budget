/*
 * Store central : état en mémoire + persistance locale + synchronisation.
 *
 * Synchronisation fine : les collections (catégories, opérations, récurrences,
 * objectifs) sont écrites élément par élément (`transactions/<id>`), jamais en
 * bloc. Deux appareils qui ajoutent chacun une dépense hors ligne ne
 * s'écrasent donc pas : Firebase fusionne au niveau de chaque élément.
 *
 * Les écritures non confirmées par le serveur sont mémorisées localement
 * (budget_unsynced) et renvoyées au prochain lancement : une dépense saisie
 * sans réseau n'est jamais perdue, même si l'app est fermée entre-temps.
 */
import { readJSON, readText, write } from '../services/storage.js';
import { sameJSON } from './utils.js';
import { normalizeCategories, normalizeTransactions, normalizeRecurring, normalizeGoals, normalizeTheme } from './schema.js';

const LOCAL_KEYS = {
  categories: 'budget_categories',
  transactions: 'budget_transactions',
  recurring: 'budget_recurring',
  goals: 'budget_goals',
  theme: 'budget_theme'
};
const UNSYNCED_KEY = 'budget_unsynced';
const NORMALIZERS = {
  categories: normalizeCategories,
  transactions: normalizeTransactions,
  recurring: normalizeRecurring,
  goals: normalizeGoals,
  theme: normalizeTheme
};
export const SLICES = Object.keys(LOCAL_KEYS);
const COLLECTIONS = ['categories', 'transactions', 'recurring', 'goals'];

export const state = {};
const listeners = new Set();
let cloudSink = null;
/** Dernière version connue de chaque élément : { slice: Map<id, json> } */
const known = {};
/** Chemins modifiés localement et non encore confirmés : { 'transactions/abc': true } */
let unsynced = {};

const toMap = list => new Map(list.map(item => [item.id, JSON.stringify(item)]));

function persist(slice) {
  const value = state[slice];
  write(LOCAL_KEYS[slice], typeof value === 'string' ? value : JSON.stringify(value));
}
const persistUnsynced = () => write(UNSYNCED_KEY, JSON.stringify(unsynced));

function notify(slices, source) {
  listeners.forEach(fn => {
    try {
      fn(slices, source);
    } catch (error) {
      console.error('[store] erreur dans un abonné', error);
    }
  });
}

/** Valeur actuelle d'un chemin (`slice` ou `slice/id`), null si supprimé. */
function valueAt(path) {
  const [slice, id] = path.split('/');
  if (!id) return state[slice] ?? null;
  return state[slice]?.find(x => x.id === id) ?? null;
}

export function loadLocal() {
  state.theme = normalizeTheme(readText(LOCAL_KEYS.theme, 'dark'));
  COLLECTIONS.forEach(slice => {
    state[slice] = NORMALIZERS[slice](readJSON(LOCAL_KEYS[slice], null));
    known[slice] = toMap(state[slice]);
  });
  const saved = readJSON(UNSYNCED_KEY, {});
  unsynced = saved && typeof saved === 'object' ? saved : {};
  SLICES.forEach(persist);
}

export const subscribe = fn => (listeners.add(fn), () => listeners.delete(fn));

/** Branche la synchronisation et renvoie les écritures restées en attente. */
export function setCloudSink(fn) {
  cloudSink = fn;
  const paths = Object.keys(unsynced);
  if (paths.length) cloudSink(Object.fromEntries(paths.map(p => [p, valueAt(p)])));
}

/** Le serveur a confirmé ces chemins. */
export function acknowledge(paths) {
  let changed = false;
  paths.forEach(p => {
    if (unsynced[p]) {
      delete unsynced[p];
      changed = true;
    }
  });
  if (changed) persistUnsynced();
}

export const unsyncedCount = () => Object.keys(unsynced).length;

/** Valide une modification locale (tranches mutées en place ou fournies dans `patch`). */
export function commit(slices, patch = {}) {
  const list = Array.isArray(slices) ? slices : [slices];
  const payload = {};
  list.forEach(slice => {
    if (slice in patch) state[slice] = patch[slice];
    state[slice] = NORMALIZERS[slice](state[slice]);
    persist(slice);
    if (!COLLECTIONS.includes(slice)) {
      payload[slice] = state[slice];
      return;
    }
    // Différence élément par élément avec la dernière version connue.
    const next = toMap(state[slice]);
    next.forEach((json, id) => {
      if (known[slice].get(id) !== json) payload[`${slice}/${id}`] = JSON.parse(json);
    });
    known[slice].forEach((_, id) => {
      if (!next.has(id)) payload[`${slice}/${id}`] = null;
    });
    known[slice] = next;
  });
  Object.keys(payload).forEach(p => (unsynced[p] = true));
  persistUnsynced();
  if (Object.keys(payload).length) cloudSink?.(payload);
  notify(list, 'local');
}

/**
 * Applique l'état distant. Les éléments modifiés localement et pas encore
 * confirmés gardent leur version locale (elle est en cours d'envoi).
 */
export function applyRemote(cloud) {
  if (!cloud || typeof cloud !== 'object') return [];
  const changed = [];
  for (const slice of SLICES) {
    if (slice === 'theme') {
      if (!('theme' in cloud) || unsynced.theme) continue;
      const next = normalizeTheme(cloud.theme);
      if (next !== state.theme) {
        state.theme = next;
        persist('theme');
        changed.push('theme');
      }
      continue;
    }
    // Firebase supprime les nœuds vides : absent = collection vidée.
    let next = NORMALIZERS[slice](slice in cloud ? cloud[slice] : null);
    const pendingIds = Object.keys(unsynced)
      .filter(p => p.startsWith(`${slice}/`))
      .map(p => p.slice(slice.length + 1));
    if (pendingIds.length) {
      const byId = new Map(next.map(x => [x.id, x]));
      pendingIds.forEach(id => {
        const local = state[slice].find(x => x.id === id);
        if (local) byId.set(id, local);
        else byId.delete(id);
      });
      next = NORMALIZERS[slice]([...byId.values()]);
    }
    known[slice] = toMap(next.filter(x => !pendingIds.includes(x.id)));
    pendingIds.forEach(id => {
      const local = state[slice].find(x => x.id === id);
      if (local) known[slice].set(id, JSON.stringify(local));
    });
    if (sameJSON(next, state[slice])) continue;
    state[slice] = next;
    persist(slice);
    changed.push(slice);
  }
  if (changed.length) notify(changed, 'remote');
  return changed;
}

/** Instantané complet au format cloud (collections indexées par id). */
export function cloudSnapshot() {
  const out = { theme: state.theme };
  COLLECTIONS.forEach(slice => {
    out[slice] = Object.fromEntries(state[slice].map(x => [x.id, x]));
  });
  return out;
}
