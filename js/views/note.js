/*
 * Page « Noter » : un seul bouton « Ajouter », puis un fil d'une question par écran
 * (dépense ou rentrée ? pour quoi ? combien ?) et « C'est noté ».
 */
import { $, $$, esc, uid } from '../core/utils.js';
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
import { animate, stagger, shake, haptic, wait, circleOpen, circleClose, Odometer, rollText, reducedMotion } from '../ui/motion.js';

const RECENT = 6;
const STEPS = ['type', 'category', 'amount'];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];

/* ---------- Le fil ---------- */
let flow = null;
let closing = false;
let odo = null; // montant en rouleaux
/** Saisies notées depuis l'ouverture du fil : elles se glissent dans la liste à la fermeture. */
let added = [];

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

/** Jauge sous le montant : déjà dépensé, plus cette dépense (en ambre au-delà du plafond). */
function amountGauge() {
  const c = categoryById(flow.categoryId);
  if (flow.type !== 'expense' || !c?.budget) return '';
  return `<span class="flow-gauge" id="flowGauge" aria-hidden="true"><span class="flow-gauge__spent"></span><span class="flow-gauge__new"></span></span>`;
}

let wasOver = false;
function updateGauge({ first = false } = {}) {
  const g = $('#flowGauge');
  if (!g) return;
  const c = categoryById(flow.categoryId);
  const spent = spentIn(c.id, flow.date.slice(0, 7));
  const base = Math.min(100, (spent / c.budget) * 100);
  const add = Math.min(100 - base, (cents() / c.budget) * 100);
  const over = spent + cents() > c.budget;
  g.querySelector('.flow-gauge__spent').style.width = `${base}%`;
  g.querySelector('.flow-gauge__new').style.width = `${add}%`;
  g.classList.toggle('is-over', over);
  // Le plafond franchi en tapant : la jauge tressaille une fois.
  if (over && !wasOver && !first) {
    shake(g);
    haptic([12, 40, 12]);
  }
  wasOver = over;
}

function stepAmount() {
  const dateLabel = flow.date === todayKey() ? 'Aujourd’hui' : relativeDay(flow.date) === 'Hier' ? 'Hier' : formatKey(flow.date, { day: 'numeric', month: 'short' });
  return `<h2 class="flow__title" id="flowTitle">Combien ?</h2>
    <div class="flow-amount">
      <output class="flow-amount__value${flow.digits ? '' : ' is-zero'}" id="flowAmount" aria-live="polite"><span id="flowDigits"></span><span class="flow-amount__eur">€</span></output>
      <p class="flow-amount__hint" id="flowHint">${amountHint()}</p>
      ${amountGauge()}
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
    gauge = `<div class="flow-done__gauge${l.left < 0 ? ' is-over' : ''}"><div><span>${esc(c.name)}</span><strong><span data-done-left>${esc(l.text)}</span> sur ${esc(formatEURRound(c.budget))}</strong></div><span class="flow-done__bar"><span style="width:${Math.min(100, Math.round((spent / c.budget) * 100))}%"></span></span></div>`;
  }
  return `<div class="flow-done">
      <span class="flow-done__check" aria-hidden="true">${icon('check', 52)}</span>
      <h2 class="flow__title" id="flowTitle">C’est noté</h2>
      <p class="flow-done__text">${esc(formatEUR(t.amount))} ${t.type === 'income' ? 'de' : 'en'} ${esc((c?.name || 'Sans catégorie').toLowerCase())}, ${esc(when)}${t.recurringId ? ', et chaque mois' : ''}.</p>
      ${gauge}
    </div>
    <div class="flow-done__actions">
      <button type="button" class="btn btn--lg btn--block flow-done__again" data-flow-again>Ajouter une autre</button>
      <button type="button" class="link-btn flow-done__close" data-flow-close>Terminé</button>
    </div>`;
}

/**
 * Rendu de l'étape. `dir` (1 : suivante, −1 : précédente) fait glisser l'ancienne étape
 * dehors et la nouvelle dedans, comme des cartes ; sans `dir`, simple remplacement.
 */
function renderFlow({ dir = 0 } = {}) {
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
  const host = $('#flowBody');
  const old = host.querySelector('.flow__step');
  const step = document.createElement('div');
  step.className = 'flow__step';
  step.innerHTML = body;
  if (old && dir && !reducedMotion()) {
    // L'ancienne étape sort du flux, à sa place, puis glisse de côté.
    Object.assign(old.style, { position: 'absolute', top: `${old.offsetTop}px`, left: `${old.offsetLeft}px`, width: `${old.offsetWidth}px`, height: `${old.offsetHeight}px`, pointerEvents: 'none' });
    animate(old, [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 30}%)`, opacity: 0 }], { spring: 'settle', fill: 'forwards' }).finished.then(() => old.remove());
  } else old?.remove();
  host.append(step);
  if (flow.step === 'amount') {
    odo = new Odometer($('#flowDigits'));
    odo.set(flow.digits || '0', { pop: false });
    wasOver = false;
    updateGauge({ first: true });
  }
  if (dir) {
    animate(step, [{ transform: `translateX(${dir * 100}%)` }, { transform: 'none' }], { spring: 'settle' });
    if (dir > 0) stagger(step.querySelectorAll('.flow__title, .flow-type, .flow-choice, .flow-more, .flow-amount, .flow-extras, .flow-key'), { delay: 70, step: 28 });
  }
}

/** Après une touche : seuls le montant, le rappel et le bouton changent (pas de nouvelle animation). */
function refreshAmount() {
  odo?.set(flow.digits || '0');
  $('#flowAmount').classList.toggle('is-zero', !flow.digits);
  $('#flowHint').innerHTML = amountHint();
  updateGauge();
  $('#flowBody [data-flow-save]').disabled = !(cents() > 0);
}

const ORDER = [...STEPS, 'done'];

function go(step, { slide = true } = {}) {
  const dir = slide ? Math.sign(ORDER.indexOf(step) - ORDER.indexOf(flow.step)) || 1 : 0;
  flow.step = step;
  renderFlow({ dir });
  $('#flowBody').scrollTop = 0;
}

/** Le bouton « Ajouter » s'agrandit jusqu'à devenir le fil. */
function openFlow() {
  if (closing || isOpen()) return;
  flow = fresh();
  added = [];
  const el = $('#flow');
  el.hidden = false;
  document.documentElement.classList.add('flow-open');
  renderFlow();
  haptic(6);
  circleOpen(el, $('#noteStart'));
  stagger($$('.flow__head > *, .flow__title, .flow-type'), { delay: 140, step: 45 });
  $('#flowBack').focus({ preventScroll: true });
}

/** Le fil se referme dans le bouton ; les nouvelles saisies se glissent en tête de liste. */
async function closeFlow() {
  if (closing || !isOpen()) return;
  closing = true;
  const el = $('#flow');
  const start = $('#noteStart');
  await circleClose(el, start).finished;
  el.hidden = true;
  el.getAnimations().forEach(a => a.cancel());
  document.documentElement.classList.remove('flow-open');
  flow = null;
  closing = false;
  animate(start, [{ transform: 'scale(.86)' }, { transform: 'none' }], { spring: 'bounce' });
  start.focus({ preventScroll: true });
  revealAdded();
}

/** Nouvelles lignes de « Dernières saisies » : elles s'ouvrent en hauteur et poussent les autres. */
function revealAdded() {
  const ids = added;
  added = [];
  ids.forEach((id, i) => {
    const row = $(`#noteRecent [data-tx="${CSS.escape(id)}"]`);
    if (!row) return;
    const cs = getComputedStyle(row);
    const h = row.offsetHeight;
    row.style.overflow = 'hidden';
    animate(row, [{ height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 }, { height: `${h}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 }], { spring: 'settle', delay: 80 + i * 60 }).finished.then(() => (row.style.overflow = ''));
    animate(row, [{ transform: 'translateX(-24px)' }, { transform: 'none' }], { spring: 'bounce', delay: 120 + i * 60 });
    animate(row, [{ background: 'var(--accent-soft)' }, { background: 'transparent' }], { duration: 1400, delay: 500 });
  });
}

function back() {
  if (flow.step === 'amount') return go('category');
  if (flow.step === 'category') return go('type');
  closeFlow();
}

function press(key) {
  let d = flow.digits;
  if (key === 'back') {
    if (!d) return refuse();
    d = d.slice(0, -1);
  }
  else if (key === ',') d = d.includes(',') ? d : `${d || '0'},`;
  else {
    if (/,\d\d$/.test(d)) return refuse(); // deux décimales au plus
    d = d === '0' ? key : d + key;
  }
  if ((toCents(d) || 0) > MAX_AMOUNT) return refuse();
  haptic(5);
  flow.digits = d;
  refreshAmount();
}

/** Saisie refusée (troisième décimale, montant trop grand) : le montant tressaille. */
function refuse() {
  shake($('#flowAmount'));
  haptic([12, 40, 12]);
}

function save() {
  const amount = cents();
  if (!(amount > 0)) return refuse();
  if (!flow.categoryId) return;
  const button = $('#flowBody [data-flow-save]');
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
  added.push(tx.id);
  playDone(button);
  if (flow.date.slice(0, 7) !== monthKey()) toast('Notée sur un autre mois', { type: 'info' });
}

/**
 * « C'est noté » : l'écran bleu s'ouvre depuis « Valider », la coche se dessine, puis le
 * montant part en pièce vers la jauge du budget, qui l'encaisse ; le reste se recompte.
 */
async function playDone(button) {
  const t = flow.saved;
  haptic(14);
  // Voile de la couleur de « C'est noté » : il s'ouvre en cercle, l'étape change dessous.
  const veil = document.createElement('div');
  veil.className = 'flow-veil';
  document.body.append(veil);
  await circleOpen(veil, button || $('#flowBody'), { duration: 480 }).finished;
  if (!flow || flow.saved !== t) return veil.remove();
  go('done', { slide: false });
  animate(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.then(() => veil.remove());

  const step = $('#flowBody .flow__step');
  animate(step.querySelector('.flow-done__check'), [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'bounce', delay: 60 });
  const path = step.querySelector('.flow-done__check path');
  if (path) animate(path, [{ strokeDasharray: 24, strokeDashoffset: 24 }, { strokeDasharray: 24, strokeDashoffset: 0 }], { duration: 380, delay: 220, easing: 'cubic-bezier(.6, 0, .2, 1)' });
  stagger(step.querySelectorAll('.flow__title, .flow-done__text, .flow-done__gauge, .flow-done__actions > *'), { delay: 260, step: 60, distance: 14 });

  const gauge = step.querySelector('.flow-done__gauge');
  const c = categoryById(t.categoryId);
  if (!gauge || !c?.budget) return;
  // La jauge part de l'état d'avant cette dépense.
  const key = t.date.slice(0, 7);
  const spent = spentIn(c.id, key);
  const before = leftLabel(c, key, -t.amount);
  const after = leftLabel(c, key);
  const fill = gauge.querySelector('.flow-done__bar > span');
  const label = gauge.querySelector('[data-done-left]');
  const from = Math.min(1, (spent - t.amount) / c.budget);
  const to = Math.min(1, spent / c.budget);
  fill.style.transformOrigin = 'left';
  const hold = animate(fill, [{ transform: `scaleX(${from / (to || 1)})` }, { transform: `scaleX(${from / (to || 1)})` }], { duration: 2000, fill: 'forwards' });
  label.textContent = before.text;
  gauge.classList.toggle('is-over', before.left < 0);
  await wait(900);
  if (!flow || flow.saved !== t) return;

  if (!reducedMotion()) await flyCoin(step.querySelector('.flow-done__text'), fill, to, `−${formatEUR(t.amount)}`);
  if (!flow || flow.saved !== t) return;
  haptic(18);
  hold.cancel();
  animate(fill, [{ transform: `scaleX(${from / (to || 1)})` }, { transform: 'none' }], { spring: 'bounce' });
  animate(gauge, [{ transform: 'none' }, { transform: 'scale(1.035)', offset: 0.3 }, { transform: 'none' }], { duration: 420 });
  gauge.classList.toggle('is-over', after.left < 0);
  // Même mot (« reste ») : seuls les chiffres roulent ; sinon le texte change d'un coup.
  if ((before.left >= 0) === (after.left >= 0)) rollText(label, before.text, after.text);
  else {
    label.textContent = after.text;
    shake(gauge);
  }
}

/** Une pastille du montant suit un arc jusqu'au bout de la jauge, puis s'y fond. */
async function flyCoin(fromEl, bar, ratio, text) {
  if (!fromEl || !bar) return;
  const coin = document.createElement('span');
  coin.className = 'flow-coin';
  coin.textContent = text;
  coin.setAttribute('aria-hidden', 'true');
  document.body.append(coin);
  const a = fromEl.getBoundingClientRect();
  const b = bar.parentElement.getBoundingClientRect();
  const w = coin.offsetWidth;
  const h = coin.offsetHeight;
  const sx = a.left + a.width / 2;
  const sy = a.top + a.height / 2;
  const ex = b.left + b.width * ratio;
  const ey = b.top + b.height / 2;
  const frames = Array.from({ length: 15 }, (_, i) => {
    const p = i / 14;
    const x = sx + (ex - sx) * p;
    const y = sy + (ey - sy) * p - Math.sin(Math.PI * p) * 70;
    return { transform: `translate(${x - w / 2}px, ${y - h / 2}px) scale(${1 - 0.65 * p * p})`, opacity: p < 0.08 ? p / 0.08 : p > 0.9 ? (1 - p) * 10 : 1 };
  });
  await animate(coin, frames, { duration: 680, easing: 'cubic-bezier(.45, 0, .55, 1)' }).finished;
  coin.remove();
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
