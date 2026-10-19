/*
 * Page « Prévoir » : achats et dépenses à venir (taxe foncière, impôts, nouvelle cafetière…).
 * Date et périodicité facultatives ; rappel sur « Noter » quelques jours avant l'échéance.
 * Cocher une ligne note la dépense dans le budget (au choix) : une dépense qui revient passe
 * à l'échéance suivante, une dépense ponctuelle disparaît de la liste.
 */
import { $, $$, esc, uid } from '../core/utils.js';
import { todayKey, fromKey, dateKey, formatKey } from '../core/dates.js';
import { toCents, centsToInput, formatEUR, formatEURRound, sum } from '../core/money.js';
import { state, commit } from '../core/store.js';
import { PLAN_REPEATS } from '../core/schema.js';
import { categoryById, categoriesByUsage } from '../core/selectors.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { amountRules } from './quickadd.js';

/** Horizon du total en tête de page. */
const HORIZON = 90;
const STEP_MONTHS = { month: 1, quarter: 3, year: 12 };

/* ---------- Dates ---------- */
const today = () => fromKey(todayKey());
export const daysUntil = key => Math.round((fromKey(key) - today()) / 86400000);

/** Date + n mois, jour gardé (ramené au dernier jour d'un mois plus court : 31 janv. → 28 févr.). */
function addMonths(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  return dateKey(new Date(y, m - 1 + n, Math.min(d, last), 12));
}
const nextDate = p => addMonths(p.date, STEP_MONTHS[p.repeat]);

/** Échéances d'une dépense datée jusqu'à `until` (une dépense qui revient compte à chaque passage). */
function occurrences(p, until) {
  if (!p.date) return [];
  const out = [];
  for (let d = p.date; d <= until && out.length < 60; d = addMonths(d, STEP_MONTHS[p.repeat])) {
    out.push(d);
    if (p.repeat === 'none') break;
  }
  return out;
}

/** « aujourd'hui », « demain », « dans 12 jours », « dans 4 mois », « en retard de 3 jours ». */
function whenLabel(days) {
  if (days < 0) return `en retard de ${-days} jour${days < -1 ? 's' : ''}`;
  if (days === 0) return 'aujourd’hui';
  if (days === 1) return 'demain';
  if (days <= 45) return `dans ${days} jours`;
  const months = Math.round(days / 30.4);
  return months >= 12 && months % 12 === 0 ? `dans ${months / 12} an${months > 12 ? 's' : ''}` : `dans ${months} mois`;
}

const isDue = p => p.date && daysUntil(p.date) <= p.remind;
/** Dépenses dont le rappel est atteint (ou en retard), la plus proche d'abord. */
export const duePlans = () => state.plans.filter(isDue).sort((a, b) => a.date.localeCompare(b.date));

const dateLabel = key => formatKey(key, fromKey(key).getFullYear() === today().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });

/* ---------- Rendu ---------- */
function rowHTML(p) {
  const c = categoryById(p.categoryId);
  const days = p.date ? daysUntil(p.date) : null;
  const sub = [p.date ? dateLabel(p.date) : '', p.date ? PLAN_REPEATS[p.repeat] : '', c?.name].filter(Boolean).join(' · ');
  const when = days === null ? '' : `<span class="plan-row__when ${days < 0 ? 'is-late' : isDue(p) ? 'is-soon' : ''}">${esc(whenLabel(days))}</span>`;
  return `<div class="plan-row">
    <button type="button" class="plan-row__tick" data-plan-done="${esc(p.id)}" aria-label="${esc(`« ${p.name} » : c'est fait`)}"><span class="check check--todo ${days !== null && isDue(p) ? (days < 0 ? 'is-late' : 'is-soon') : ''}"></span></button>
    <button type="button" class="plan-row__main" data-plan="${esc(p.id)}">
      <span class="check-row__body"><span>${esc(p.name)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      <span class="plan-row__end"><span class="check-row__amount">${p.amount ? formatEUR(p.amount) : '—'}</span>${when}</span>
    </button>
  </div>`;
}

export function renderPlan() {
  const dated = state.plans.filter(p => p.date).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const wishes = state.plans.filter(p => !p.date);
  const until = dateKey(new Date(today().getTime() + HORIZON * 86400000));
  const soon = dated.flatMap(p => occurrences(p, until).map(() => p.amount || 0));
  const wishTotal = sum(wishes, p => p.amount);

  $('#planTotal').textContent = formatEURRound(sum(soon, x => x));
  $('#planTotalSub').textContent = [
    soon.length ? `${soon.length} échéance${soon.length > 1 ? 's' : ''}` : 'Aucune échéance',
    wishTotal ? `+ ${formatEURRound(wishTotal)} d’envies sans date` : ''
  ]
    .filter(Boolean)
    .join(' · ');

  $('#planDated').innerHTML = dated.length
    ? dated.map(rowHTML).join('')
    : '<p class="check-empty">Ex. taxe foncière, impôts, assurance, cadeau d’anniversaire : avec une date, un rappel s’affiche sur « Noter » avant l’échéance.</p>';
  $('#planWishes').innerHTML = wishes.length ? wishes.map(rowHTML).join('') : '<p class="check-empty">Ex. nouvelle cafetière, chaussures : à garder en tête, sans date.</p>';
  renderPlanBadge();
}

/** Pastille sur l'onglet « Prévoir » : nombre de rappels atteints. */
export function renderPlanBadge() {
  const n = duePlans().length;
  const badge = $('#planBadge');
  badge.hidden = !n;
  badge.textContent = n;
  $('[data-view="planView"]').setAttribute('aria-label', n ? `Prévoir, ${n} rappel${n > 1 ? 's' : ''}` : 'Prévoir');
}

/** Rappels en haut de « Noter » (deux au plus, puis « et N autres »). */
export function renderPlanReminders() {
  const due = duePlans();
  const host = $('#noteReminders');
  host.hidden = !due.length;
  host.innerHTML = due
    .slice(0, 2)
    .map(p => {
      const days = daysUntil(p.date);
      // En retard : le nom seul en titre (il resterait coupé sur iPhone), le retard en dessous.
      const title = days < 0 ? p.name : `${p.name} ${whenLabel(days)}`;
      return `<button type="button" class="reminder ${days < 0 ? 'is-late' : ''}" data-view-link="planView">
        <span class="reminder__icon">${icon('calendar', 20)}</span>
        <span class="reminder__body"><strong>${esc(title)}</strong><small>${days < 0 ? `${esc(whenLabel(days))} · ` : ''}${p.amount ? `${esc(formatEUR(p.amount))} · ` : ''}${esc(dateLabel(p.date))}${days < 0 ? '' : ' · à prévoir'}</small></span>
        ${icon('chevronRight', 18)}
      </button>`;
    })
    .join('')
    .concat(due.length > 2 ? `<button type="button" class="link-btn reminder__more" data-view-link="planView">Et ${due.length - 2} autre${due.length > 3 ? 's' : ''} à prévoir</button>` : '');
}

/* ---------- Ajouter / modifier ---------- */
const planForm = () => $('#planForm');

function fillCategories(select, selected) {
  select.innerHTML = `<option value="">Aucune</option>${categoriesByUsage('expense')
    .map(c => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`)
    .join('')}`;
}

function syncDateFields() {
  const f = planForm();
  const hasDate = Boolean(f.elements.date.value);
  $('#planDateOnly').hidden = !hasDate;
}

function openPlan(id = null) {
  const p = id ? state.plans.find(x => x.id === id) : null;
  const f = planForm();
  f.reset();
  clearErrors(f);
  f.elements.editId.value = p?.id || '';
  f.elements.name.value = p?.name || '';
  f.elements.amount.value = p?.amount ? centsToInput(p.amount) : '';
  f.elements.date.value = p?.date || '';
  f.elements.repeat.value = p?.repeat || 'none';
  f.elements.remind.value = String(p?.remind || 30);
  fillCategories(f.elements.categoryId, p?.categoryId);
  syncDateFields();
  $('#planTitle').textContent = p ? 'Modifier' : 'À prévoir';
  $('#planDelete').hidden = !p;
  openSheet('planSheet', { focus: false });
}

const planSchema = {
  name: [rules.required('Le nom'), rules.maxLength(60)],
  amount: [v => (v ? amountRules.slice(1).map(r => r(v)).find(Boolean) || null : null)],
  date: [rules.date(), (v, all) => (!v && all.repeat !== 'none' ? 'Une date est nécessaire pour une dépense qui revient.' : null)]
};

function onPlanSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = formValues(f);
  const { valid, errors } = validate(v, planSchema);
  if (!valid) return showErrors(f, errors);
  const existing = state.plans.find(x => x.id === v.editId);
  const plan = { id: existing?.id || uid(), name: v.name, amount: v.amount ? toCents(v.amount) : null, date: v.date, repeat: v.date ? v.repeat : 'none', remind: Number(v.remind), categoryId: v.categoryId };
  if (existing) state.plans[state.plans.indexOf(existing)] = plan;
  else state.plans.push(plan);
  commit('plans');
  closeSheet('planSheet');
  toast(existing ? 'Modifié' : `Ajouté à prévoir${plan.date && isDue(plan) ? ' · rappel affiché sur « Noter »' : ''}`);
}

async function onPlanDelete() {
  const p = state.plans.find(x => x.id === planForm().elements.editId.value);
  if (!p) return closeSheet('planSheet');
  const ok = await confirmDialog({ title: `Supprimer « ${p.name} » ?`, message: p.repeat !== 'none' ? 'Les échéances suivantes ne seront plus rappelées.' : 'Cette action est définitive.', confirmLabel: 'Supprimer', danger: true });
  if (!ok) return;
  state.plans = state.plans.filter(x => x.id !== p.id);
  commit('plans');
  closeSheet('planSheet');
  toast('Supprimé');
}

/* ---------- C'est fait : noter la dépense, passer à l'échéance suivante ---------- */
const doneForm = () => $('#planDoneForm');

function openDone(id) {
  const p = state.plans.find(x => x.id === id);
  if (!p) return;
  const f = doneForm();
  f.reset();
  clearErrors(f);
  f.elements.planId.value = p.id;
  f.elements.amount.value = p.amount ? centsToInput(p.amount) : '';
  f.elements.date.value = todayKey();
  f.elements.record.checked = true;
  fillCategories(f.elements.categoryId, p.categoryId);
  $('#planDoneTitle').textContent = p.name;
  let next = p.repeat !== 'none' ? nextDate(p) : '';
  while (next && next < todayKey()) next = addMonths(next, STEP_MONTHS[p.repeat]);
  $('#planDoneNext').textContent = next ? `Elle reviendra le ${formatKey(next, { day: 'numeric', month: 'long', year: 'numeric' })}, avec le même rappel.` : 'Elle disparaîtra de la liste.';
  syncRecord();
  openSheet('planDoneSheet', { focus: false });
}

function syncRecord() {
  $('#planDoneRecordFields').hidden = !doneForm().elements.record.checked;
}

const doneSchema = {
  amount: [(v, all) => (all.record ? amountRules.map(r => r(v)).find(Boolean) || null : null)],
  categoryId: [(v, all) => (all.record && !v ? 'Choisissez la catégorie du budget.' : null)],
  date: [(v, all) => (all.record ? rules.date({ required: true })(v) : null)]
};

function onDoneSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = { ...formValues(f), record: f.elements.record.checked };
  const { valid, errors } = validate(v, doneSchema);
  if (!valid) return showErrors(f, errors);
  const p = state.plans.find(x => x.id === v.planId);
  if (!p) return closeSheet('planDoneSheet');
  const slices = ['plans'];
  if (v.record) {
    state.transactions.push({ id: uid(), type: 'expense', amount: toCents(v.amount), date: v.date, categoryId: v.categoryId, note: p.name });
    slices.push('transactions');
  }
  if (p.repeat === 'none') state.plans = state.plans.filter(x => x.id !== p.id);
  else {
    // Payée en retard : la prochaine échéance est la première à venir.
    let next = nextDate(p);
    while (next < todayKey()) next = addMonths(next, STEP_MONTHS[p.repeat]);
    // Montant payé retenu pour la prochaine fois (une taxe change d'une année sur l'autre).
    state.plans[state.plans.indexOf(p)] = { ...p, date: next, amount: v.record ? toCents(v.amount) : p.amount, categoryId: v.record ? v.categoryId : p.categoryId };
  }
  commit(slices);
  closeSheet('planDoneSheet');
  toast(v.record ? `Dépense notée · ${formatEUR(toCents(v.amount))}` : 'C’est fait');
}

/* ---------- Initialisation ---------- */
export function initPlan() {
  $('#planAdd').addEventListener('click', () => openPlan());
  $('#planView').addEventListener('click', e => {
    const done = e.target.closest('[data-plan-done]');
    if (done) return openDone(done.dataset.planDone);
    const row = e.target.closest('[data-plan]');
    if (row) openPlan(row.dataset.plan);
  });
  const f = planForm();
  f.addEventListener('submit', onPlanSubmit);
  f.addEventListener('input', e => e.target.name === 'date' && syncDateFields());
  f.addEventListener('change', e => e.target.name === 'date' && syncDateFields());
  $('#planDelete').addEventListener('click', onPlanDelete);
  const d = doneForm();
  d.addEventListener('submit', onDoneSubmit);
  d.addEventListener('change', e => e.target.name === 'record' && syncRecord());
}
