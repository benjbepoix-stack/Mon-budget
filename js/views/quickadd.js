/* Feuille « Modifier l'opération » (la saisie se fait sur la page Noter). */
import { $, esc } from '../core/utils.js';
import { toCents, centsToInput, formatEUR } from '../core/money.js';
import { state, commit } from '../core/store.js';
import { categoriesByUsage, linkedTransactions } from '../core/selectors.js';
import { formatKey } from '../core/dates.js';
import { LINKED_SOURCES } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { slotColor, describe } from './common.js';

export const MAX_AMOUNT = 100000000; // 1 000 000,00 €
const form = () => $('#txForm');

function chip(value, label, emoji, color, selected, name) {
  return `<button type="button" class="chip ${selected ? 'is-selected' : ''}" data-chip="${name}" data-value="${esc(value)}" role="radio" aria-checked="${selected}" style="--c:${color}"><span aria-hidden="true">${esc(emoji)}</span><span>${esc(label)}</span></button>`;
}

function renderChoices() {
  const f = form();
  // Les plus utilisées sur 90 jours d'abord : la catégorie habituelle est en tête.
  const cats = categoriesByUsage(f.elements.type.value === 'income' ? 'income' : 'expense');
  let current = f.elements.categoryId.value;
  if (!cats.some(c => c.id === current)) current = f.elements.categoryId.value = '';
  $('#txCategories').innerHTML = cats.map(c => chip(c.id, c.name, c.icon, slotColor(c.color), c.id === current, 'categoryId')).join('');
}

/** Ouvre la feuille d'édition d'une opération saisie dans l'app. */
export function openTx({ id }) {
  const f = form();
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  f.reset();
  clearErrors(f);
  f.elements.editId.value = t.id;
  f.elements.type.value = t.type === 'income' ? 'income' : 'expense';
  f.elements.amount.value = centsToInput(t.amount);
  f.elements.categoryId.value = t.categoryId || '';
  f.elements.date.value = t.date;
  f.elements.note.value = t.note || '';
  renderChoices();
  openSheet('txSheet', { focus: false });
}

/** Règles du montant, partagées avec la page Noter. */
export const amountRules = [
  rules.required('Le montant'),
  v => (toCents(v) === null ? 'Montant invalide (ex. 12,50).' : null),
  v => (toCents(v) <= 0 ? 'Le montant doit être positif.' : null),
  v => (toCents(v) > MAX_AMOUNT ? 'Montant trop élevé.' : null)
];

const schema = {
  amount: amountRules,
  categoryId: [rules.required('La catégorie')],
  date: [rules.date({ required: true })],
  note: [rules.maxLength(200)]
};

function onSubmit(e) {
  e.preventDefault();
  const f = form();
  const v = formValues(f);
  const { valid, errors } = validate(v, schema);
  // L'erreur de catégorie s'affiche sous la grille (champ caché dans le même bloc).
  if (!valid) return showErrors(f, errors);
  const existing = state.transactions.find(t => t.id === v.editId);
  if (!existing) return closeSheet('txSheet');
  const tx = { id: existing.id, type: v.type, amount: toCents(v.amount), date: v.date, note: v.note, categoryId: v.categoryId };
  if (existing.recurringId) tx.recurringId = existing.recurringId;
  state.transactions[state.transactions.indexOf(existing)] = tx;
  commit('transactions');
  closeSheet('txSheet');
  toast(`${v.type === 'income' ? 'Rentrée modifiée' : 'Dépense modifiée'} · ${formatEUR(tx.amount)}`);
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

/* ---------- Dépense reliée : ouvrir l'app d'origine, ou la retirer du budget ---------- */
let linkedId = null;

export function openLinked({ id }) {
  const t = linkedTransactions().find(x => x.id === id);
  if (!t) return;
  const src = LINKED_SOURCES[t.linked];
  const d = describe(t);
  linkedId = t.id;
  $('#linkedTitle').textContent = `Dépense de ${src.name}`;
  $('#linkedSum').innerHTML = `<span class="tx__icon" style="--c:${d.color}" aria-hidden="true">${esc(d.icon)}</span><span class="linked-sum__body"><strong>${esc(d.title)}</strong><small>${esc(formatKey(t.date, { day: 'numeric', month: 'long', year: 'numeric' }))} · ${esc(d.sub)}</small></span><span class="tx__amount tx__amount--expense">−${esc(formatEUR(t.amount))}</span>`;
  $('#linkedNote').textContent = `Ajoutée automatiquement depuis ${src.name}. Elle se modifie là-bas ; ici, vous pouvez la retirer de vos budgets.`;
  $('#linkedOpen').href = src.url;
  $('#linkedOpenLabel').textContent = `Ouvrir ${src.name}`;
  openSheet('linkedSheet', { focus: false });
}

async function onRemoveLinked() {
  const t = linkedTransactions().find(x => x.id === linkedId);
  if (!t) return closeSheet('linkedSheet');
  const src = LINKED_SOURCES[t.linked];
  const ok = await confirmDialog({
    title: 'Retirer cette dépense du budget ?',
    message: `Elle ne comptera plus dans vos budgets. Elle reste enregistrée dans ${src.name}.`,
    confirmLabel: 'Retirer',
    danger: true
  });
  if (!ok) return;
  state.hidden.push({ id: t.id, date: t.date });
  commit('hidden');
  closeSheet('linkedSheet');
  toast('Dépense retirée du budget');
}

export function initQuickAdd() {
  $('#linkedRemove').addEventListener('click', onRemoveLinked);
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
    if (!c) return;
    f.elements[c.dataset.chip].value = c.dataset.value;
    f.querySelectorAll(`[data-chip="${c.dataset.chip}"]`).forEach(b => {
      b.classList.toggle('is-selected', b === c);
      b.setAttribute('aria-checked', String(b === c));
    });
    c.closest('.field').querySelector('.field-error')?.remove();
  });
  $('#txDelete').addEventListener('click', onDelete);
}
