/*
 * Firebase : compte (e-mail / mot de passe, le même que Mon Garage et Ma Maison)
 * + Realtime Database.
 *
 * - Le SDK est chargé dynamiquement : si le CDN est inaccessible (hors ligne,
 *   bloqueur…), l'application continue en mode local sans planter.
 * - Données : users/<uid>/budget. Les collections sont écrites élément par
 *   élément (`transactions/<id>`), regroupées (debounce) en un seul `update`.
 * - Le même nœud reçoit les dépenses reliées de Mon Garage et Ma Maison
 *   (`linked/garage`, `linked/maison`) et la marque du transfert (`migrated`) :
 *   lues à chaque instantané, jamais réécrites ici.
 * - Premier instantané sans `migrated` : transfert unique depuis l'ancienne base
 *   publique (voir `start`).
 * - Tant que la première lecture n'est pas arrivée, les modifications locales
 *   sont mises en attente et ne sont pas écrasées par le cloud.
 * - Sans compte : rien n'est envoyé ; le store garde ces écritures « non
 *   confirmées » et les renvoie à la connexion.
 * - L'état est exposé via `onStatus` : connecting | online | syncing | offline | local
 */
import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION, DB_NODE, LEGACY_DB_URL, LEGACY_DB_PATH } from '../config/firebase-config.js';

const SDK = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
const LOAD_TIMEOUT = 12000;
const LEGACY_TIMEOUT = 8000;
const WRITE_DELAY = 250;
const NO_ACCOUNT = 'Sans compte : connectez-vous dans Réglages › Compte.';
/** Tranches du budget : les seules écrites d'ici (pas `linked` ni `migrated`). */
const SLICES = ['theme', 'categories', 'transactions', 'recurring', 'goals', 'hidden', 'plans'];
const COLLECTIONS = SLICES.filter(s => s !== 'theme');
/** Apps qui publient leurs dépenses sous `linked/<app>`. */
const LINK_SOURCES = ['garage', 'maison'];

let authMod = null;
let dbMod = null;
let auth = null;
let db = null;
let user = null;
/** Firebase a répondu « pas de compte » (déconnecté, ou « Continuer sans compte »). */
let signedOut = false;
let rootRef = null;
let ready = false;
let connected = null;
let fatal = null;
let inflight = 0;
let buffer = {};
let flushTimer = null;
let unsubscribeData = null;
/** Incrémenté à chaque changement de compte : les réponses d'une session précédente sont ignorées. */
let session = 0;
let handlers = {
  onUser: () => {},
  onRemote: () => {},
  onLinked: () => {},
  onStatus: () => {},
  onError: () => {},
  onAck: () => {},
  onReady: () => {},
  getSnapshot: () => ({}),
  adaptLegacy: data => data
};

const isObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function emitStatus() {
  let status;
  let detail = fatal;
  if (fatal) status = 'local';
  else if (signedOut) {
    status = 'local';
    detail = NO_ACCOUNT;
  } else if (connected === false) status = 'offline';
  else if (!ready) status = 'connecting';
  else if (inflight > 0 || Object.keys(buffer).length) status = 'syncing';
  else status = 'online';
  handlers.onStatus(status, detail);
}

const withTimeout = (promise, ms, message) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);

function describeError(error) {
  const code = String(error?.code || error?.message || '');
  if (/permission/i.test(code)) return 'Accès refusé par les règles Firebase.';
  if (/timeout|délai/i.test(code)) return 'Firebase ne répond pas.';
  if (/fetch|import|network|load/i.test(code)) return 'Impossible de charger Firebase (connexion ?).';
  return 'Service de synchronisation indisponible.';
}

export function describeAuthError(error) {
  const map = {
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
    'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
    'auth/user-not-found': 'Aucun compte avec cette adresse e-mail.',
    'auth/missing-password': 'Indiquez votre mot de passe.',
    'auth/email-already-in-use': 'Cette adresse possède déjà un compte : utilisez « Se connecter ».',
    'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
    'auth/operation-not-allowed': 'La connexion e-mail / mot de passe n’est pas activée dans Firebase (Authentication → Sign-in method).',
    'auth/network-request-failed': 'Connexion Internet indisponible.',
    'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.'
  };
  return map[error?.code] || 'Une erreur est survenue. Réessayez.';
}

function goLocal(error) {
  fatal = describeError(error);
  ready = false;
  console.warn('[firebase] passage en mode local :', error);
  emitStatus();
}

/** Supprime les `undefined` (refusés par Firebase) via un aller-retour JSON. */
const clean = value => JSON.parse(JSON.stringify(value));

/**
 * Le nœud contient au moins une collection du budget. `linked` et `migrated` ne comptent pas,
 * ni le thème seul : appliqué comme données distantes, un tel nœud viderait les collections
 * de l'appareil (une collection absente est lue comme vidée ailleurs).
 */
const hasBudgetData = value => isObj(value) && COLLECTIONS.some(s => value[s] !== undefined && value[s] !== null);

/** Instantané complet → chemins élément par élément (`transactions/<id>`), comme les écritures courantes. */
const byElement = snapshot =>
  Object.fromEntries(Object.entries(snapshot).flatMap(([k, v]) => (COLLECTIONS.includes(k) && isObj(v) ? Object.entries(v).map(([id, x]) => [`${k}/${id}`, x]) : [[k, v]])));

/**
 * Envoie un `update`. Les chemins confirmés sont signalés à `onAck` (sauf ceux remis
 * en file entre-temps) ; `ack: false` pour un envoi qui ne reflète pas l'état local
 * (transfert de l'ancienne base).
 */
function send(payload, { ack = true } = {}) {
  const id = session;
  inflight++;
  emitStatus();
  return dbMod
    .update(rootRef, clean(payload))
    .then(() => ack && id === session && handlers.onAck(Object.keys(payload), Object.keys(buffer)))
    .catch(error => {
      // Écriture d'une session précédente (déconnexion ou changement de compte entre-temps) : refusée
      // pour le compte actuel, sans effet sur sa synchronisation (elle reste en attente sur l'appareil).
      if (id !== session) return console.warn('[firebase] écriture d’une session précédente non envoyée', error);
      console.error('[firebase] écriture refusée', error);
      handlers.onError(describeError(error));
      if (/permission/i.test(String(error?.code))) goLocal(error);
    })
    .finally(() => {
      inflight--;
      emitStatus();
    });
}

function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!ready || fatal || !rootRef || !Object.keys(buffer).length) return emitStatus();
  const payload = buffer;
  buffer = {};
  send(payload);
}

/** Met en file une écriture partielle ({ 'transactions/<id>': valeur, theme: … }). */
export function pushCloud(payload) {
  // Sans compte : rien n'est envoyé (le store garde ces chemins non confirmés et les renvoie à la connexion).
  if (signedOut) return;
  Object.assign(buffer, payload);
  if (fatal) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, WRITE_DELAY);
  emitStatus();
}

/** Force l'envoi immédiat (ex. : l'app passe en arrière-plan). */
export const flushNow = () => flushTimer && flush();

/** Abandonne les écritures en attente (changement de compte). */
export function clearPending() {
  clearTimeout(flushTimer);
  flushTimer = null;
  buffer = {};
}

/** Attend que toutes les écritures soient confirmées par le serveur (max `ms`). */
export async function waitForSync(ms = 6000) {
  flushNow();
  const start = Date.now();
  // Écritures en file sans possibilité d'envoi (compte pas encore chargé, accès refusé) : inutile d'attendre.
  while ((inflight > 0 || (ready && !fatal && Object.keys(buffer).length)) && Date.now() - start < ms) {
    await new Promise(r => setTimeout(r, 120));
  }
  return !fatal && ready && inflight === 0;
}

export const isCloudAvailable = () => ready && !fatal;
export const isOnline = () => ready && !fatal && connected === true;

/* ---------- Transfert depuis l'ancienne base publique (une seule fois) ---------- */

/** Lecture REST de l'ancienne base (délai max 8 s) : objet, ou null si vide / injoignable. */
async function readLegacy() {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    const data = await withTimeout(
      fetch(`${LEGACY_DB_URL}/${LEGACY_DB_PATH}.json`, { cache: 'no-store', signal: ctrl?.signal }).then(res => (res.ok ? res.json() : null)),
      LEGACY_TIMEOUT,
      'timeout ancienne base'
    );
    return isObj(data) ? data : null;
  } catch (error) {
    ctrl?.abort();
    console.warn('[firebase] ancienne base injoignable', error);
    return null;
  }
}

/**
 * Premier instantané du compte. Sans `migrated`, l'ancienne base est lue une fois :
 * ses collections (et dépenses reliées) sont écrites dans le nouveau nœud sans écraser
 * celles qui y sont déjà, puis appliquées comme des données distantes. Ancienne base
 * vide ou injoignable : les données de l'appareil deviennent la référence.
 */
async function start(id, latest) {
  let cloud = latest();
  let migration = null;
  let legacy = null;
  if (!cloud.migrated) {
    legacy = await readLegacy();
    if (id !== session || fatal) return;
    cloud = latest(); // instantanés reçus pendant la lecture
  }
  // Transfert terminé entre-temps par un autre appareil : sa marque et ses données priment (rien n'est réécrit).
  if (!cloud.migrated) {
    const found = isObj(legacy) ? handlers.adaptLegacy(Object.fromEntries(SLICES.filter(s => legacy[s] !== undefined && legacy[s] !== null).map(s => [s, legacy[s]]))) : {};
    const fresh = Object.fromEntries(Object.entries(found).filter(([k]) => cloud[k] === undefined || cloud[k] === null));
    // Dépenses reliées : par app, seulement si elle n'a pas encore publié dans le nouveau nœud.
    const links = isObj(legacy?.linked) ? LINK_SOURCES.filter(s => isObj(legacy.linked[s]) && !isObj(cloud.linked?.[s])) : [];
    const from = Object.keys(found).length ? new URL(LEGACY_DB_URL).host : 'local';
    migration = { ...fresh, migrated: { from, at: Date.now(), by: 'budget' } };
    links.forEach(s => (migration[`linked/${s}`] = legacy.linked[s]));
    cloud = { ...cloud, ...fresh };
    if (links.length) cloud.linked = { ...(isObj(cloud.linked) ? cloud.linked : {}), ...Object.fromEntries(links.map(s => [s, legacy.linked[s]])) };
  }
  handlers.onLinked(cloud.linked);
  let reference = null;
  if (hasBudgetData(cloud)) handlers.onRemote(cloud);
  // Nœud sans collection (vide, dépenses reliées ou thème seuls) : les données de l'appareil deviennent
  // la référence ; un thème déjà enregistré dans le compte est gardé (appliqué à l'instantané suivant).
  else reference = { ...handlers.getSnapshot(), ...(typeof cloud.theme === 'string' ? { theme: cloud.theme } : {}) };
  ready = true;
  // Une seule écriture (marque du transfert + données de l'appareil élément par élément) : un autre appareil
  // ne voit jamais `migrated` sans les données, et deux appareils qui démarrent ensemble fusionnent leurs
  // éléments au lieu de remplacer les collections l'un de l'autre.
  if (reference) send({ ...migration, ...byElement(reference) });
  else if (migration) send(migration, { ack: false });
  flush();
  handlers.onReady();
}

/* ---------- Données du compte ---------- */
function listen(u) {
  unsubscribeData?.();
  const id = ++session;
  ready = false;
  fatal = null;
  rootRef = dbMod.ref(db, `users/${u.uid}/${DB_NODE}`);
  let first = true;
  let value = {};
  unsubscribeData = dbMod.onValue(
    rootRef,
    snap => {
      if (id !== session) return;
      const raw = snap.val();
      value = isObj(raw) ? raw : {};
      if (first) {
        first = false;
        start(id, () => value);
        return;
      }
      if (!ready) return; // transfert en cours : `start` lit la dernière valeur
      handlers.onLinked(value.linked);
      // Instantané sans tranche du budget (nœud effacé, dépenses reliées seules) : ignoré, comme un nœud vide.
      if (hasBudgetData(value)) handlers.onRemote(value);
    },
    error => {
      if (id !== session) return;
      console.error('[firebase] lecture refusée', error);
      goLocal(error);
      handlers.onError(fatal);
      handlers.onReady();
    }
  );
}

function stopListening() {
  session++;
  unsubscribeData?.();
  unsubscribeData = null;
  ready = false;
  rootRef = null;
}

/* ---------- Initialisation ---------- */
export const isConfigured = () => Boolean(FIREBASE_CONFIG?.apiKey && FIREBASE_CONFIG?.databaseURL);

/** @returns {Promise<boolean>} false si la synchronisation est indisponible (mode local). */
export async function initCloud(options) {
  handlers = { ...handlers, ...options };
  if (!isConfigured()) {
    fatal = 'Synchronisation non configurée : données enregistrées sur cet appareil.';
    emitStatus();
    handlers.onReady();
    return false;
  }
  emitStatus();
  try {
    const [appMod, authM, dbM] = await withTimeout(
      Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-database.js`)]),
      LOAD_TIMEOUT,
      'timeout chargement SDK'
    );
    authMod = authM;
    dbMod = dbM;
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
    auth = authMod.getAuth(app);
    db = dbMod.getDatabase(app);
    // Même stockage de session que Mon Garage et Ma Maison (même origine : une seule connexion).
    await authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(() => {});

    dbMod.onValue(dbMod.ref(db, '.info/connected'), snap => {
      connected = snap.val() === true;
      emitStatus();
    });

    authMod.onAuthStateChanged(auth, u => {
      if (u && user && u.uid === user.uid && unsubscribeData) return; // même compte, déjà à l'écoute
      stopListening();
      // Accès refusé pendant la session précédente : sans objet pour la nouvelle (connexion de nouveau possible).
      fatal = null;
      user = u || null;
      signedOut = !u;
      if (!u) clearPending();
      // onUser d'abord : l'app peut vider les données d'un autre compte avant la synchro.
      handlers.onUser(user);
      if (u) listen(u);
      emitStatus();
    });
    return true;
  } catch (error) {
    goLocal(error);
    handlers.onReady();
    return false;
  }
}

export const currentUser = () => user;
/** Synchronisation indisponible (SDK injoignable, accès refusé…) : message, sinon null. */
export const cloudError = () => fatal;
/** Connexion possible (SDK chargé) : sinon l'app reste en mode local. */
export const canSignIn = () => Boolean(authMod && auth && !fatal);

export async function signIn(email, password) {
  return authMod.signInWithEmailAndPassword(auth, email, password);
}
export async function signUp(email, password) {
  return authMod.createUserWithEmailAndPassword(auth, email, password);
}
export async function resetPassword(email) {
  return authMod.sendPasswordResetEmail(auth, email);
}
export async function signOutUser() {
  await waitForSync(3000);
  return authMod.signOut(auth);
}
