/* Point d'entrée : état, verrou PIN, compte, vues, navigation et synchronisation. */
import { $, $$, debounce } from './core/utils.js';
import { state, loadLocal, subscribe, applyRemote, applyLinked, setCloudSink, resendUnsynced, resetLocal, cloudSnapshot, acknowledge } from './core/store.js';
import { onMonthChange } from './core/month-state.js';
import { readText, write } from './services/storage.js';
import { initCloud, pushCloud, flushNow, clearPending, cloudError, currentUser } from './services/firebase.js';
import { initDialogs } from './ui/dialog.js';
import { applyTheme } from './ui/theme.js';
import { renderStatus } from './ui/status.js';
import { toastError } from './ui/toast.js';
import { icon } from './ui/icons.js';
import { initPin } from './features/pin.js';
import { initAuth, authChanged, authPending, resumeAuth, renderAccount } from './features/auth.js';
import { generateRecurring } from './features/recurring.js';
import { initMonthNavs, initEmojiPickers } from './views/common.js';
import { initNote, renderNote } from './views/note.js';
import { initTrack, renderTrack } from './views/track.js';
import { initPlan, renderPlan, renderPlanBadge } from './views/plan.js';
import { initQuickAdd, openTx, openLinked } from './views/quickadd.js';
import { initSettings, renderSettings } from './views/settings.js';

const VIEWS = {
  noteView: { title: 'Noter', render: renderNote },
  planView: { title: 'Prévoir', render: renderPlan },
  trackView: { title: 'Suivre', render: renderTrack }
};
const VIEW_KEY = 'budget_last_view';
/** Dernier compte connecté sur cet appareil (changement de compte : données locales vidées). */
const LAST_UID = 'budget_last_uid';
let currentView = 'noteView';
let ready = false;

function switchView(id, { scroll = true } = {}) {
  if (!VIEWS[id]) id = 'noteView';
  currentView = id;
  $$('.view').forEach(v => (v.hidden = v.id !== id));
  $$('[data-view]').forEach(b => {
    const active = b.dataset.view === id;
    b.classList.toggle('is-active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('#headerTitle').textContent = VIEWS[id].title;
  document.title = `${VIEWS[id].title} · Mon budget`;
  VIEWS[id].render();
  try {
    sessionStorage.setItem(VIEW_KEY, id);
  } catch {
    /* navigation privée : sans importance */
  }
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

const renderCurrent = () => VIEWS[currentView].render();

function onStateChange(slices) {
  if (slices.includes('theme')) applyTheme(state.theme, { animate: true });
  renderCurrent();
  renderPlanBadge();
  renderSettings();
}

function initGlobalErrors() {
  let last = 0;
  const report = error => {
    console.error(error);
    if (Date.now() - last < 4000) return;
    last = Date.now();
    toastError('Une erreur inattendue est survenue. Vos données sont conservées.');
  };
  window.addEventListener('error', e => report(e.error || e.message));
  window.addEventListener('unhandledrejection', e => report(e.reason));
}

/** Synchronisation du compte terminée (ou mode local / sans compte) : on génère les récurrences. */
function onCloudReady() {
  ready = true;
  generateRecurring(); // identifiants déterministes : sans effet si déjà générées
}

/** Réponse de Firebase : compte connecté, ou « pas de compte ». */
function onUser(user) {
  if (user) {
    // Autre compte que le précédent sur cet appareil : on repart d'une base vide (premier compte mémorisé : rien n'est vidé).
    const last = readText(LAST_UID, '');
    if (last && last !== user.uid) {
      clearPending();
      resetLocal();
    }
    write(LAST_UID, user.uid);
    // Écritures faites sans réseau ou sans compte, pas encore confirmées : envoyées après la première lecture.
    resendUnsynced();
  }
  authChanged(user);
  // Sans compte : l'app fonctionne avec les données de l'appareil. Si la connexion est proposée, les récurrences
  // attendent la réponse (connecté : générées sur les données du compte, pas sur une copie peut-être ancienne).
  if (!user && !authPending()) onCloudReady();
}

/** « Continuer sans compte » (feuille de connexion refermée) : récurrences générées sur l'appareil. */
function onLocalChoice() {
  renderSettings();
  if (!currentUser()) onCloudReady();
}

/** Transfert depuis l'ancienne base : un thème « sombre » (ancien défaut) devient « Auto ». */
const adaptLegacy = data => (data.theme === 'dark' ? { ...data, theme: 'auto' } : data);

function init() {
  initGlobalErrors();
  loadLocal();
  applyTheme(state.theme);
  $$('[data-icon]').forEach(el => (el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22)));

  initDialogs();
  // Code PIN d'abord (s'il existe), puis la connexion si elle est nécessaire.
  initPin({ onUnlock: resumeAuth });
  initAuth({ onChange: onLocalChoice });
  initMonthNavs();
  initEmojiPickers();
  initQuickAdd();
  initNote();
  initTrack();
  initPlan();
  initSettings();

  subscribe(onStateChange);
  onMonthChange(renderCurrent);
  $$('[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-view-link]');
    if (link) switchView(link.dataset.viewLink);
    const tx = e.target.closest('[data-tx]');
    if (tx) openTx({ id: tx.dataset.tx });
    const linked = e.target.closest('[data-linked]');
    if (linked) openLinked({ id: linked.dataset.linked });
  });

  let initial = 'noteView';
  try {
    initial = sessionStorage.getItem(VIEW_KEY) || initial;
  } catch {
    /* ignore */
  }
  switchView(initial, { scroll: false });
  renderPlanBadge();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
    else if (ready) {
      generateRecurring(); // passage à un nouveau mois / jour de prélèvement atteint
      renderCurrent();
      renderPlanBadge(); // nouveau jour : rappels atteints
    }
  });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('resize', debounce(() => currentView === 'trackView' && renderTrack(), 150));

  setCloudSink(pushCloud);
  initCloud({
    onUser,
    onRemote: cloud => applyRemote(cloud),
    onLinked: applyLinked,
    onStatus: (status, detail) => {
      renderStatus(status, detail);
      const note = $('#syncNote');
      // Sans compte : déjà indiqué par la ligne « Compte ».
      if (note) note.textContent = status === 'online' ? 'Données synchronisées entre vos appareils.' : detail && (status !== 'local' || cloudError()) ? `Synchronisation : ${detail}` : '';
      renderAccount();
    },
    onError: message => toastError(`Synchronisation : ${message}`),
    onAck: acknowledge,
    onReady: onCloudReady,
    getSnapshot: cloudSnapshot,
    adaptLegacy
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
