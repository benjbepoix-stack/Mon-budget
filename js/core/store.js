/*
 * Store central : état en mémoire + persistance locale + synchronisation.
 *
 * Synchronisation fine : les collections (catégories, opérations, récurrences,
 * objectifs, dépenses reliées retirées) sont écrites élément par élément (`transactions/<id>`), jamais en
 * bloc. Deux appareils qui ajoutent chacun une dépense hors ligne ne
 * s'écrasent donc pas : Firebase fusionne au niveau de chaque élément.
 *
 * Les écritures non confirmées par le serveur sont mémorisées localement
 * (budget_unsynced) et renvoyées dès qu'un compte est connecté : une dépense
 * saisie sans réseau (ou sans compte) n'est jamais perdue, même si l'app est
 * fermée entre-temps.
 */
import { readJSON, readText, write } from '../services/storage.js';
import { sameJSON } from './utils.js';
import { normalizeCategories, normalizeTransactions, normalizeRecurring, normalizeGoals, normalizeTheme, normalizeLinked, normalizeHidden } from './schema.js';

const LOCAL_KEYS = {
  categories: 'budget_categories',
  transactions: 'budget_transactions',
  recurring: 'budget_recurring',
  goals: 'budget_goals',
  hidden: 'budget_hidden',
  theme: 'budget_theme'
};
const UNSYNCED_KEY = 'budget_unsynced';
/** Passage au thème Auto (une seule fois) : l'ancien défaut « sombre » devient « auto ». */
const THEME_AUTO_FLAG = 'budget_theme_auto_v1';
/** Dépenses publiées par Mon Garage / Ma Maison : lues seulement, jamais écrites d'ici (pas dans SLICES). */
const LINKED_KEY = 'budget_linked';
const NORMALIZERS = {
  categories: normalizeCategories,
  transactions: normalizeTransactions,
  recurring: normalizeRecurring,
  goals: normalizeGoals,
  hidden: normalizeHidden,
  theme: normalizeTheme
};
export const SLICES = Object.keys(LOCAL_KEYS);
const COLLECTIONS = ['categories', 'transactions', 'recurring', 'goals', 'hidden'];

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
  state.theme = normalizeTheme(readText(LOCAL_KEYS.theme, 'auto'));
  // Réglage de cet appareil seulement (pas d'envoi) : le thème du compte reçu à la synchro prime.
  if (!readText(THEME_AUTO_FLAG, '')) {
    if (state.theme === 'dark') state.theme = 'auto';
    write(THEME_AUTO_FLAG, '1');
  }
  COLLECTIONS.forEach(slice => {
    state[slice] = NORMALIZERS[slice](readJSON(LOCAL_KEYS[slice], null));
    known[slice] = toMap(state[slice]);
  });
  state.linked = normalizeLinked(readJSON(LINKED_KEY, null));
  const saved = readJSON(UNSYNCED_KEY, {});
  unsynced = saved && typeof saved === 'object' ? saved : {};
  SLICES.forEach(persist);
}

export const subscribe = fn => (listeners.add(fn), () => listeners.delete(fn));

/** Branche la synchronisation. */
export function setCloudSink(fn) {
  cloudSink = fn;
}

/** Renvoie les écritures restées en attente (compte connecté). */
export function resendUnsynced() {
  const paths = Object.keys(unsynced);
  if (paths.length) cloudSink?.(Object.fromEntries(paths.map(p => [p, valueAt(p)])));
}

/**
 * Le serveur a confirmé ces chemins (une collection entière confirme aussi ses
 * éléments). `requeued` : chemins remis en file entre-temps, encore à confirmer.
 */
export function acknowledge(paths, requeued = []) {
  const skip = new Set(requeued);
  let changed = false;
  Object.keys(unsynced).forEach(p => {
    if (skip.has(p) || !paths.some(a => p === a || p.startsWith(`${a}/`))) return;
    delete unsynced[p];
    changed = true;
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

/** Dépenses reliées lues dans le nœud du budget (forme brute gardée, re-normalisée à chaque lecture locale). */
export function applyLinked(raw) {
  const linked = normalizeLinked(raw);
  if (sameJSON(linked, state.linked)) return;
  state.linked = linked;
  write(LINKED_KEY, JSON.stringify(raw || null));
  notify(['linked'], 'remote');
}

/**
 * Changement de compte sur l'appareil : données remises à zéro avant la synchro
 * (le thème, réglage de l'appareil, est conservé). Rien n'est envoyé au cloud.
 */
export function resetLocal() {
  COLLECTIONS.forEach(slice => {
    state[slice] = NORMALIZERS[slice](null);
    known[slice] = toMap(state[slice]);
    persist(slice);
  });
  state.linked = [];
  write(LINKED_KEY, 'null');
  unsynced = {};
  persistUnsynced();
  notify([...COLLECTIONS, 'linked'], 'remote');
}

/** Instantané complet au format cloud (collections indexées par id). */
export function cloudSnapshot() {
  const out = { theme: state.theme };
  COLLECTIONS.forEach(slice => {
    out[slice] = Object.fromEntries(state[slice].map(x => [x.id, x]));
  });
  return out;
}
