/* Point d'entrée : état, verrou PIN, vues, navigation et synchronisation. */
import { $, $$, debounce } from './core/utils.js';
import { state, loadLocal, subscribe, applyRemote, setCloudSink, cloudSnapshot, acknowledge } from './core/store.js';
import { onMonthChange } from './core/month-state.js';
import { initCloud, pushCloud, flushNow } from './services/firebase.js';
import { initDialogs } from './ui/dialog.js';
import { applyTheme } from './ui/theme.js';
import { renderStatus } from './ui/status.js';
import { toastError } from './ui/toast.js';
import { icon } from './ui/icons.js';
import { initPin } from './features/pin.js';
import { generateRecurring } from './features/recurring.js';
import { initMonthNavs, initEmojiPickers } from './views/common.js';
import { renderMonth } from './views/month.js';
import { initTransactions, renderTransactions } from './views/transactions.js';
import { initGoals, renderGoals } from './views/goals.js';
import { renderAnalysis } from './views/analysis.js';
import { initQuickAdd, openTx } from './views/quickadd.js';
import { initSettings, renderSettings } from './views/settings.js';

const VIEWS = {
  monthView: { title: 'Ce mois-ci', render: renderMonth },
  txView: { title: 'Opérations', render: renderTransactions },
  goalsView: { title: 'Épargne', render: renderGoals },
  analysisView: { title: 'Analyse', render: renderAnalysis }
};
const VIEW_KEY = 'budget_last_view';
let currentView = 'monthView';
let ready = false;

function switchView(id, { scroll = true } = {}) {
  if (!VIEWS[id]) id = 'monthView';
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

/** Première synchronisation terminée (ou mode local) : on génère les récurrences. */
function onCloudReady() {
  if (ready) return;
  ready = true;
  generateRecurring();
}

function init() {
  initGlobalErrors();
  loadLocal();
  applyTheme(state.theme);
  $$('[data-icon]').forEach(el => (el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22)));

  initDialogs();
  initPin();
  initMonthNavs();
  initEmojiPickers();
  initQuickAdd();
  initTransactions();
  initGoals();
  initSettings();

  subscribe(onStateChange);
  onMonthChange(renderCurrent);
  $$('[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-view-link]');
    if (link) switchView(link.dataset.viewLink);
    const tx = e.target.closest('[data-tx]');
    if (tx) openTx({ id: tx.dataset.tx });
  });

  let initial = 'monthView';
  try {
    initial = sessionStorage.getItem(VIEW_KEY) || initial;
  } catch {
    /* ignore */
  }
  switchView(initial, { scroll: false });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
    else if (ready) {
      generateRecurring(); // passage à un nouveau mois / jour de prélèvement atteint
      renderCurrent();
    }
  });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('resize', debounce(() => currentView === 'analysisView' && renderAnalysis(), 150));

  setCloudSink(pushCloud);
  initCloud({
    onRemote: cloud => applyRemote(cloud),
    onStatus: (status, detail) => {
      renderStatus(status, detail);
      const note = $('#syncNote');
      if (note) note.textContent = detail ? `Synchronisation : ${detail}` : status === 'online' ? 'Données synchronisées entre vos appareils.' : '';
    },
    onError: message => toastError(`Synchronisation : ${message}`),
    onAck: acknowledge,
    onReady: onCloudReady,
    getSnapshot: cloudSnapshot
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
