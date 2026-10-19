/*
 * Page « Noter » : un seul bouton « Ajouter », puis un fil d'une question par écran
 * (dépense ou rentrée ? pour quoi ? combien ?) et « C'est noté ».
 */
import { $, esc, uid } from '../core/utils.js';
import { todayKey, formatKey, relativeDay } from '../core/dates.js';
import { toCents, formatEUR, formatEURRound, sum } from '../core/money.js';
import { state, commit } from '../core/store.js';
import { categoriesByUsage, categoryById, monthKey, shiftMonth, monthTransactions, allTransactions, salaryCategoryIds, primeCategoryIds, salaryHistory } from '../core/selectors.js';
import { promptDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { MAX_AMOUNT } from './quickadd.js';
import { txRowHTML, monthLabel } from './common.js';
import { renderPlanReminders } from './plan.js';

const RECENT = 6;
const STEPS = ['type', 'category', 'amount'];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];

/* ---------- Le fil ---------- */
let flow = null;

const fresh = () => ({ step: 'type', type: 'expense', categoryId: '', digits: '', date: todayKey(), note: '', repeat: false, others: false, saved: null });
const cents = () => toCents(flow.digits) || 0;
const isOpen = () => !$('#flow').hidden;

/** Dépensé dans une catégorie sur le mois de la date choisie. */
const spentIn = (id, key) => sum(monthTransactions(key).filter(t => t.type === 'expense' && t.categoryId === id));

/** Ce qui reste (ou le dépassement) dans un budget, `extra` compris. */
function leftLabel(c, key, extra = 0) {
  const left = c.budget - spentIn(c.id, key) - extra;
  return { left, text: left >= 0 ? `reste ${formatEURRound(left)}` : `dépassé de ${formatEURRound(-left)}` };
}

const choice = (attr, value, title, sub = '', cls = '') =>
  `<button type="button" class="flow-choice ${cls}" ${attr}="${esc(value)}"><span class="flow-choice__title">${esc(title)}</span>${sub ? `<span class="flow-choice__sub">${esc(sub)}</span>` : ''}</button>`;

function stepType() {
  return `<h2 class="flow__title" id="flowTitle">C’est une dépense ou une rentrée ?</h2>
    <div class="flow-types">
      <button type="button" class="flow-type flow-type--expense" data-flow-type="expense">${icon('arrowDown', 40)}<span><strong>Dépense</strong><small>Courses, essence, restaurant…</small></span></button>
      <button type="button" class="flow-type flow-type--income" data-flow-type="income">${icon('arrowUp', 40)}<span><strong>Rentrée</strong><small>Salaire, prime, remboursement…</small></span></button>
    </div>`;
}

function stepCategory() {
  const key = flow.date.slice(0, 7);
  const cats = categoriesByUsage(flow.type);
  let html;
  if (flow.type === 'income') {
    const salary = salaryCategoryIds();
    const primes = primeCategoryIds();
    const usual = salaryHistory().usual;
    const year = key.slice(0, 4);
    const primeTotal = sum(state.transactions.filter(t => t.type === 'income' && primes.has(t.categoryId) && t.date.startsWith(year)));
    const hint = c => (salary.has(c.id) && usual ? `habituel ≈ ${formatEURRound(usual)}` : primes.has(c.id) && primeTotal ? `déjà ${formatEURRound(primeTotal)} en ${year}` : '');
    html = cats.map(c => choice('data-flow-cat', c.id, `${c.icon} ${c.name}`, hint(c))).join('');
  } else {
    const tracked = cats.filter(c => c.budget);
    const others = cats.filter(c => !c.budget);
    const showOthers = flow.others || !tracked.length;
    html =
      tracked
        .map(c => {
          const l = leftLabel(c, key);
          return choice('data-flow-cat', c.id, `${c.icon} ${c.name}`, l.text, l.left < 0 ? 'is-over' : '');
        })
        .join('') +
      (showOthers ? others.map(c => choice('data-flow-cat', c.id, `${c.icon} ${c.name}`, 'hors budget', 'is-plain')).join('') : '') +
      (!showOthers && others.length ? `<button type="button" class="flow-more" data-flow-more>Autre catégorie…</button>` : '');
  }
  return `<h2 class="flow__title" id="flowTitle">${flow.type === 'income' ? 'Quelle rentrée ?' : 'Pour quoi ?'}</h2><div class="flow-choices">${html}</div>`;
}

/** Sous le montant : ce qui restera dans le budget, ou le rappel du salaire habituel. */
function amountHint() {
  const c = categoryById(flow.categoryId);
  if (!c) return '';
  if (flow.type === 'expense' && c.budget) {
    const { left } = leftLabel(c, flow.date.slice(0, 7), cents());
    return left >= 0
      ? `Il restera <strong>${esc(formatEURRound(left))}</strong> sur ${esc(formatEURRound(c.budget))}`
      : `<span class="is-over">Dépassement de <strong>${esc(formatEURRound(-left))}</strong> sur ${esc(formatEURRound(c.budget))}</span>`;
  }
  if (flow.type === 'income' && salaryCategoryIds().has(c.id) && salaryHistory().usual) return `Habituel ≈ ${esc(formatEURRound(salaryHistory().usual))}`;
  return flow.type === 'expense' ? 'Hors budget : notée, mais pas suivie' : '';
}

function amountDisplay() {
  const d = flow.digits;
  return d ? esc(d) : '<span class="flow-amount__zero">0</span>';
}

function stepAmount() {
  const dateLabel = flow.date === todayKey() ? 'Aujourd’hui' : relativeDay(flow.date) === 'Hier' ? 'Hier' : formatKey(flow.date, { day: 'numeric', month: 'short' });
  return `<h2 class="flow__title" id="flowTitle">Combien ?</h2>
    <div class="flow-amount">
      <output class="flow-amount__value" id="flowAmount" aria-live="polite">${amountDisplay()}<span class="flow-amount__eur">€</span></output>
      <p class="flow-amount__hint" id="flowHint">${amountHint()}</p>
    </div>
    <div class="flow-extras">
      <label class="flow-chip">${icon('calendar', 16)}<span>${esc(dateLabel)}</span><input type="date" id="flowDate" value="${esc(flow.date)}" aria-label="Date"></label>
      <button type="button" class="flow-chip${flow.note ? ' is-on' : ''}" data-flow-note>${icon('edit', 16)}<span>${flow.note ? esc(flow.note) : 'Note'}</span></button>
      <button type="button" class="flow-chip${flow.repeat ? ' is-on' : ''}" data-flow-repeat aria-pressed="${flow.repeat}">${icon('repeat', 16)}<span>Chaque mois</span></button>
    </div>
    <div class="flow-keys">${KEYS.map(k => `<button type="button" class="flow-key" data-flow-key="${k}" ${k === 'back' ? 'aria-label="Effacer"' : ''}>${k === 'back' ? icon('chevronLeft', 26) : k}</button>`).join('')}</div>
    <button type="button" class="btn btn--primary btn--lg btn--block" data-flow-save ${cents() > 0 ? '' : 'disabled'}>Valider</button>`;
}

function stepDone() {
  const t = flow.saved;
  const c = categoryById(t.categoryId);
  const when = t.date === todayKey() ? 'aujourd’hui' : `le ${formatKey(t.date, { day: 'numeric', month: 'long' })}`;
  let gauge = '';
  if (t.type === 'expense' && c?.budget) {
    const spent = spentIn(c.id, t.date.slice(0, 7));
    const l = leftLabel(c, t.date.slice(0, 7));
    gauge = `<div class="flow-done__gauge${l.left < 0 ? ' is-over' : ''}"><div><span>${esc(c.name)}</span><strong>${esc(l.text)} sur ${esc(formatEURRound(c.budget))}</strong></div><span class="flow-done__bar"><span style="width:${Math.min(100, Math.round((spent / c.budget) * 100))}%"></span></span></div>`;
  }
  return `<div class="flow-done">
      <span class="flow-done__check">${icon('check', 52)}</span>
      <h2 class="flow__title" id="flowTitle">C’est noté</h2>
      <p class="flow-done__text">${esc(formatEUR(t.amount))} ${t.type === 'income' ? 'de' : 'en'} ${esc((c?.name || 'Sans catégorie').toLowerCase())}, ${esc(when)}${t.recurringId ? ', et chaque mois' : ''}.</p>
      ${gauge}
    </div>
    <div class="flow-done__actions">
      <button type="button" class="btn btn--lg btn--block flow-done__again" data-flow-again>Ajouter une autre</button>
      <button type="button" class="link-btn flow-done__close" data-flow-close>Terminé</button>
    </div>`;
}

function renderFlow() {
  const el = $('#flow');
  const index = STEPS.indexOf(flow.step);
  el.dataset.step = flow.step;
  $('#flowDots').querySelectorAll('span').forEach((d, i) => d.classList.toggle('is-on', i <= index));
  $('#flowDots').hidden = flow.step === 'done';
  $('#flowBack').hidden = flow.step === 'done';
  $('#flowBack').setAttribute('aria-label', flow.step === 'type' ? 'Fermer' : 'Retour');
  const tag = flow.step === 'category' ? (flow.type === 'income' ? 'Rentrée' : 'Dépense') : flow.step === 'amount' ? categoryById(flow.categoryId)?.name || '' : '';
  $('#flowTag').textContent = tag;
  $('#flowTag').hidden = !tag;
  const body = { type: stepType, category: stepCategory, amount: stepAmount, done: stepDone }[flow.step]();
  $('#flowBody').innerHTML = `<div class="flow__step">${body}</div>`;
}

/** Après une touche : seuls le montant, le rappel et le bouton changent (pas de nouvelle animation). */
function refreshAmount() {
  $('#flowAmount').innerHTML = `${amountDisplay()}<span class="flow-amount__eur">€</span>`;
  $('#flowHint').innerHTML = amountHint();
  $('#flowBody [data-flow-save]').disabled = !(cents() > 0);
}

function go(step) {
  flow.step = step;
  renderFlow();
  $('#flowBody').scrollTop = 0;
}

function openFlow() {
  flow = fresh();
  $('#flow').hidden = false;
  document.documentElement.classList.add('flow-open');
  renderFlow();
  $('#flowBack').focus({ preventScroll: true });
}

function closeFlow() {
  $('#flow').hidden = true;
  document.documentElement.classList.remove('flow-open');
  flow = null;
  $('#noteStart').focus({ preventScroll: true });
}

function back() {
  if (flow.step === 'amount') return go('category');
  if (flow.step === 'category') return go('type');
  closeFlow();
}

function press(key) {
  let d = flow.digits;
  if (key === 'back') d = d.slice(0, -1);
  else if (key === ',') d = d.includes(',') ? d : `${d || '0'},`;
  else {
    if (/,\d\d$/.test(d)) return; // deux décimales au plus
    d = d === '0' ? key : d + key;
  }
  if ((toCents(d) || 0) > MAX_AMOUNT) return;
  flow.digits = d;
  refreshAmount();
}

function save() {
  const amount = cents();
  if (!(amount > 0) || !flow.categoryId) return;
  const tx = { id: uid(), type: flow.type, amount, date: flow.date, note: flow.note, categoryId: flow.categoryId };
  const slices = ['transactions'];
  if (flow.repeat) {
    // Charge fixe ou salaire : saisi automatiquement les mois suivants (même jour, 28 au plus).
    const month = flow.date.slice(0, 7);
    const rec = { id: uid(), type: flow.type, label: flow.note || categoryById(flow.categoryId)?.name || 'Chaque mois', amount, categoryId: flow.categoryId, day: Math.min(28, Number(flow.date.slice(8, 10))), start: month, lastGenerated: month, active: true };
    state.recurring.push(rec);
    tx.recurringId = rec.id;
    slices.push('recurring');
  }
  state.transactions.push(tx);
  commit(slices);
  flow.saved = tx;
  go('done');
  if (flow.date.slice(0, 7) !== monthKey()) toast('Notée sur un autre mois', { type: 'info' });
}

async function editNote() {
  const value = await promptDialog({ title: 'Une note ?', label: 'Note (facultative)', value: flow.note, placeholder: 'Ex. Carrefour', maxLength: 200, confirmLabel: 'OK' });
  if (value === null || !flow) return;
  flow.note = value.trim();
  renderFlow();
}

function onFlowClick(e) {
  const t = e.target.closest('button');
  if (!t || !flow) return;
  if (t.id === 'flowBack') return back();
  if (t.dataset.flowType) {
    if (t.dataset.flowType !== flow.type) flow.categoryId = '';
    flow.type = t.dataset.flowType;
    flow.others = false;
    return go('category');
  }
  if (t.dataset.flowCat) {
    flow.categoryId = t.dataset.flowCat;
    return go('amount');
  }
  if ('flowMore' in t.dataset) {
    flow.others = true;
    return renderFlow();
  }
  if (t.dataset.flowKey) return press(t.dataset.flowKey);
  if ('flowNote' in t.dataset) return editNote();
  if ('flowRepeat' in t.dataset) {
    flow.repeat = !flow.repeat;
    return renderFlow();
  }
  if ('flowSave' in t.dataset) return save();
  if ('flowAgain' in t.dataset) {
    flow = fresh();
    return go('type');
  }
  if ('flowClose' in t.dataset) return closeFlow();
}

function onFlowKey(e) {
  // Une feuille ou un dialogue par-dessus (note) garde son clavier.
  if (!flow || !isOpen() || document.documentElement.classList.contains('is-locked')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    return flow.step === 'done' ? closeFlow() : back();
  }
  if (flow.step !== 'amount' || e.target.matches?.('input, textarea, select')) return;
  if (/^\d$/.test(e.key)) press(e.key);
  else if (e.key === ',' || e.key === '.') press(',');
  else if (e.key === 'Backspace') press('back');
  else if (e.key === 'Enter') save();
  else return;
  e.preventDefault();
}

/* ---------- Dernières saisies ---------- */
let showAll = false;

/** Dernières saisies ; « Voir plus » : tout le mois en cours et le mois précédent, par mois. */
function renderRecent() {
  // Même jour : la dernière notée en tête (tri stable sur la liste inversée). Avec les dépenses reliées.
  const list = [...allTransactions()]
    .reverse()
    .filter(t => t.type !== 'saving')
    .sort((a, b) => b.date.localeCompare(a.date));
  const current = monthKey();
  const months = [current, shiftMonth(current, -1)];
  const extended = list.filter(t => months.includes(t.date.slice(0, 7)));
  const host = $('#noteRecent');
  const more = $('#noteMore');
  if (!list.length) {
    host.innerHTML = `<div class="empty-state"><span class="empty-state__icon">${icon('edit', 22)}</span><p>Rien de noté pour l’instant.</p></div>`;
    more.hidden = true;
    return;
  }
  more.hidden = extended.length <= RECENT;
  more.textContent = showAll ? 'Voir moins' : `Voir plus · ${extended.length} saisies sur 2 mois`;
  more.setAttribute('aria-expanded', String(showAll));
  if (!showAll || more.hidden) {
    host.innerHTML = list.slice(0, RECENT).map(t => txRowHTML(t, { showDate: true })).join('');
    return;
  }
  host.innerHTML = months
    .map(m => {
      const rows = extended.filter(t => t.date.startsWith(m));
      return `<div class="recent-month"><span>${esc(monthLabel(m))}</span><span>${rows.length} saisie${rows.length > 1 ? 's' : ''}</span></div>${
        rows.length ? rows.map(t => txRowHTML(t, { showDate: true })).join('') : '<p class="check-empty">Rien de noté ce mois-là.</p>'
      }`;
    })
    .join('');
}

export function renderNote() {
  renderPlanReminders();
  renderRecent();
  // Données reçues pendant le fil (autre appareil) : les montants restants se mettent à jour.
  if (flow && isOpen() && flow.step === 'category') renderFlow();
}

export function initNote() {
  $('#noteStart').addEventListener('click', openFlow);
  $('#noteMore').addEventListener('click', () => {
    showAll = !showAll;
    renderRecent();
  });
  $('#flow').addEventListener('click', onFlowClick);
  $('#flow').addEventListener('change', e => {
    if (e.target.id !== 'flowDate' || !flow) return;
    flow.date = e.target.value || todayKey();
    renderFlow();
  });
  document.addEventListener('keydown', onFlowKey);
}
