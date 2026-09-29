/* Feuille « Nouvelle opération » : saisie rapide et édition. */
import { $, esc, uid } from '../core/utils.js';
import { todayKey } from '../core/dates.js';
import { toCents, centsToInput, formatEUR } from '../core/money.js';
import { state, commit } from '../core/store.js';
import { expenseCategories, incomeCategories, monthKey } from '../core/selectors.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { getMonth, isCurrentMonth } from '../core/month-state.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { slotColor, goTo } from './common.js';

const MAX_AMOUNT = 100000000; // 1 000 000,00 €
const form = () => $('#txForm');

function chip(value, label, emoji, color, selected, name) {
  return `<button type="button" class="chip ${selected ? 'is-selected' : ''}" data-chip="${name}" data-value="${esc(value)}" role="radio" aria-checked="${selected}" style="--c:${color}"><span aria-hidden="true">${esc(emoji)}</span><span>${esc(label)}</span></button>`;
}

function renderChoices() {
  const f = form();
  const type = f.elements.type.value;
  const isSaving = type === 'saving';
  f.querySelector('[data-for="category"]').hidden = isSaving;
  f.querySelector('[data-for="goal"]').hidden = !isSaving;
  f.querySelector('[data-for="repeat"]').hidden = isSaving || Boolean(f.elements.editId.value);
  if (isSaving) {
    const current = f.elements.goalId.value;
    $('#txGoals').innerHTML = state.goals.length
      ? state.goals.map(g => chip(g.id, g.name, g.icon, slotColor(g.color), g.id === current, 'goalId')).join('')
      : `<div class="chip-empty">Aucun objectif. <button type="button" class="link-btn" data-new-goal>Créer un objectif</button></div>`;
  } else {
    const cats = type === 'income' ? incomeCategories() : expenseCategories();
    let current = f.elements.categoryId.value;
    if (!cats.some(c => c.id === current)) current = f.elements.categoryId.value = '';
    $('#txCategories').innerHTML = cats.map(c => chip(c.id, c.name, c.icon, slotColor(c.color), c.id === current, 'categoryId')).join('');
  }
}

/**
 * Ouvre la feuille.
 * @param {{id?:string, type?:'expense'|'income'|'saving', goalId?:string}} options
 */
export function openTx({ id = null, type = 'expense', goalId = '' } = {}) {
  const f = form();
  const t = id ? state.transactions.find(x => x.id === id) : null;
  f.reset();
  clearErrors(f);
  f.elements.editId.value = t?.id || '';
  f.elements.type.value = t?.type || type;
  f.elements.amount.value = t ? centsToInput(t.amount) : '';
  f.elements.categoryId.value = t?.categoryId || '';
  f.elements.goalId.value = t?.goalId || goalId || (state.goals.length === 1 ? state.goals[0].id : '');
  // Nouvelle opération : aujourd'hui si on regarde le mois en cours, sinon le 1er du mois affiché.
  f.elements.date.value = t?.date || (isCurrentMonth() ? todayKey() : `${getMonth()}-01`);
  f.elements.note.value = t?.note || '';
  $('#txTitle').textContent = t ? 'Modifier l’opération' : 'Nouvelle opération';
  $('#txDelete').hidden = !t;
  renderChoices();
  openSheet('txSheet', { focus: false });
}

function schema(type) {
  return {
    amount: [
      rules.required('Le montant'),
      v => (toCents(v) === null ? 'Montant invalide (ex. 12,50).' : null),
      v => (toCents(v) <= 0 ? 'Le montant doit être positif.' : null),
      v => (toCents(v) > MAX_AMOUNT ? 'Montant trop élevé.' : null)
    ],
    categoryId: type === 'saving' ? [] : [rules.required('La catégorie')],
    goalId: type === 'saving' ? [rules.required('L’objectif')] : [],
    date: [rules.date({ required: true })],
    note: [rules.maxLength(200)]
  };
}

function onSubmit(e) {
  e.preventDefault();
  const f = form();
  const v = formValues(f);
  const type = v.type;
  const { valid, errors } = validate(v, schema(type));
  // Les erreurs de catégorie / objectif s'affichent sous la grille (champ caché dans le même bloc).
  if (!valid) return showErrors(f, errors);
  const existing = v.editId ? state.transactions.find(t => t.id === v.editId) : null;
  const tx = { id: existing?.id || uid(), type, amount: toCents(v.amount), date: v.date, note: v.note };
  if (type === 'saving') tx.goalId = v.goalId;
  else tx.categoryId = v.categoryId;
  if (existing?.recurringId) tx.recurringId = existing.recurringId;

  const slices = ['transactions'];
  if (!existing && v.repeat && type !== 'saving') {
    const month = v.date.slice(0, 7);
    const rec = { id: uid(), type, label: v.note || $('#txCategories .is-selected span:last-child')?.textContent || 'Récurrent', amount: tx.amount, categoryId: tx.categoryId, day: Math.min(28, Number(v.date.slice(8, 10))), start: month, lastGenerated: month, active: true };
    state.recurring.push(rec);
    tx.recurringId = rec.id;
    slices.push('recurring');
  }
  if (existing) state.transactions[state.transactions.indexOf(existing)] = tx;
  else state.transactions.push(tx);
  commit(slices);
  closeSheet('txSheet');
  const label = type === 'income' ? 'Revenu' : type === 'saving' ? 'Versement' : 'Dépense';
  toast(`${label} ${existing ? 'modifié' : 'enregistré'}${type === 'expense' ? 'e' : ''} · ${formatEUR(tx.amount)}${slices.includes('recurring') ? ' · répété chaque mois' : ''}`);
  if (!existing && v.date.slice(0, 7) !== getMonth() && v.date.slice(0, 7) !== monthKey()) toast('Opération ajoutée sur un autre mois', { type: 'info' });
}

async function onDelete() {
  const f = form();
  const t = state.transactions.find(x => x.id === f.elements.editId.value);
  if (!t) return;
  const ok = await confirmDialog({
    title: 'Supprimer cette opération ?',
    message: t.recurringId ? 'Seule cette occurrence est supprimée ; la récurrence continue les mois suivants.' : 'Cette action est définitive.',
    confirmLabel: 'Supprimer',
    danger: true
  });
  if (!ok) return;
  state.transactions = state.transactions.filter(x => x.id !== t.id);
  commit('transactions');
  closeSheet('txSheet');
  toast('Opération supprimée');
}

export function initQuickAdd() {
  const f = form();
  f.addEventListener('submit', onSubmit);
  f.addEventListener('change', e => {
    if (e.target.name === 'type') {
      clearErrors(f);
      f.querySelectorAll('.field-error').forEach(x => x.remove());
      renderChoices();
    }
  });
  f.addEventListener('click', e => {
    const c = e.target.closest('[data-chip]');
    if (c) {
      f.elements[c.dataset.chip].value = c.dataset.value;
      f.querySelectorAll(`[data-chip="${c.dataset.chip}"]`).forEach(b => {
        b.classList.toggle('is-selected', b === c);
        b.setAttribute('aria-checked', String(b === c));
      });
      c.closest('.field').querySelector('.field-error')?.remove();
      return;
    }
    if (e.target.closest('[data-new-goal]')) {
      closeSheet('txSheet');
      goTo('goalsView');
      setTimeout(() => document.querySelector('[data-goal-add]')?.click(), 350);
    }
  });
  $('#txDelete').addEventListener('click', onDelete);
  $('#fab').addEventListener('click', () => openTx());
}
