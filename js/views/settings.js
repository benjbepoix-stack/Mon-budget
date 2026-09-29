/* Réglages : catégories & budgets, récurrences, code PIN, thème, sauvegarde. */
import { $, $$, esc, uid, slugify } from '../core/utils.js';
import { formatEUR, toCents, centsToInput } from '../core/money.js';
import { state, commit } from '../core/store.js';
import { COLOR_SLOTS, normalizeCategories, normalizeTransactions, normalizeRecurring, normalizeGoals, isMonth } from '../core/schema.js';
import { categoryById, monthKey } from '../core/selectors.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog, isOpen } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { slotColor, renderEmojiPicker } from './common.js';
import { hasPin, changePin, removePin } from '../features/pin.js';
import { generateRecurring } from '../features/recurring.js';

let catKind = 'expense';

/* ---------- Rendu ---------- */
function renderCategories() {
  $$('#catKind [data-kind]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.kind === catKind)));
  const cats = state.categories.filter(c => c.kind === catKind);
  $('#catList').innerHTML = cats
    .map(
      c => `<button type="button" class="settings__row" data-cat="${esc(c.id)}">
        <span class="tx__icon" style="--c:${slotColor(c.color)}" aria-hidden="true">${esc(c.icon)}</span>
        <span class="settings__label">${esc(c.name)}</span>
        ${catKind === 'expense' ? `<span class="settings__value">${c.budget ? `${formatEUR(c.budget)} / mois` : 'Sans plafond'}</span>` : ''}
        ${icon('chevronRight', 16)}
      </button>`
    )
    .join('');
}

function renderRecurringList() {
  const host = $('#recList');
  if (!state.recurring.length) {
    host.innerHTML = '<p class="settings__empty">Aucune opération récurrente.</p>';
    return;
  }
  host.innerHTML = [...state.recurring]
    .sort((a, b) => a.day - b.day)
    .map(r => {
      const c = categoryById(r.categoryId);
      return `<button type="button" class="settings__row ${r.active ? '' : 'is-muted'}" data-rec="${esc(r.id)}">
        <span class="tx__icon" style="--c:${c ? slotColor(c.color) : 'var(--text-3)'}" aria-hidden="true">${esc(c?.icon || '🔁')}</span>
        <span class="settings__label">${esc(r.label)}<small>${r.active ? `le ${r.day} du mois` : 'en pause'}</small></span>
        <span class="settings__value tx__amount--${r.type}">${r.type === 'income' ? '+' : '−'}${formatEUR(r.amount)}</span>
        ${icon('chevronRight', 16)}
      </button>`;
    })
    .join('');
}

export function renderSettings() {
  if (!isOpen('settingsSheet')) return;
  renderCategories();
  renderRecurringList();
  $('#pinRowLabel').textContent = hasPin() ? 'Changer le code PIN' : 'Activer un code PIN';
  $('#pinRemoveRow').hidden = !hasPin();
  $$('#themeChoice [data-theme-choice]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.themeChoice === state.theme)));
}

export function openSettings(section) {
  openSheet('settingsSheet', { focus: false });
  renderSettings();
  if (section) requestAnimationFrame(() => document.getElementById(`settings${section.charAt(0).toUpperCase()}${section.slice(1)}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
}

/* ---------- Catégories ---------- */
function openCategory(id = null) {
  const c = id ? categoryById(id) : null;
  const f = $('#catForm');
  f.reset();
  clearErrors(f);
  f.elements.editId.value = c?.id || '';
  f.elements.kind.value = c?.kind || catKind;
  f.elements.name.value = c?.name || '';
  f.elements.budget.value = c?.budget ? centsToInput(c.budget) : '';
  f.querySelector('[data-for="budget"]').hidden = f.elements.kind.value !== 'expense';
  renderEmojiPicker('catForm', c?.icon);
  $('#catTitle').textContent = c ? 'Modifier la catégorie' : 'Nouvelle catégorie';
  $('#catDelete').hidden = !c;
  openSheet('catSheet', { focus: false });
}

const catSchema = {
  name: [rules.required('Le nom'), rules.maxLength(40)],
  budget: [v => (v && (toCents(v) === null || toCents(v) <= 0) ? 'Montant invalide (ex. 400).' : null)]
};

function onCategorySubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = formValues(f);
  const { valid, errors } = validate(v, catSchema);
  if (!valid) return showErrors(f, errors);
  const existing = v.editId ? categoryById(v.editId) : null;
  if (state.categories.some(c => c !== existing && c.kind === v.kind && c.name.toLowerCase() === v.name.toLowerCase())) return showErrors(f, { name: 'Cette catégorie existe déjà.' });
  let id = existing?.id || slugify(v.name) || uid();
  if (!existing && categoryById(id)) id = `${id}-${uid().slice(-4)}`;
  const cat = { id, kind: v.kind, name: v.name, icon: v.icon, budget: v.kind === 'expense' && v.budget ? toCents(v.budget) : null, color: existing?.color ?? state.categories.filter(c => c.kind === v.kind).length % COLOR_SLOTS };
  if (existing) state.categories[state.categories.indexOf(existing)] = cat;
  else state.categories.push(cat);
  commit('categories');
  closeSheet('catSheet');
  toast(existing ? 'Catégorie modifiée' : 'Catégorie ajoutée');
}

async function onCategoryDelete() {
  const c = categoryById($('#catForm').elements.editId.value);
  if (!c) return;
  if (state.categories.filter(x => x.kind === c.kind).length <= 1) return toastError('Conservez au moins une catégorie.');
  const used = state.transactions.filter(t => t.categoryId === c.id).length;
  const ok = await confirmDialog({
    title: `Supprimer « ${c.name} » ?`,
    message: used ? `${used} opération(s) resteront enregistrées dans « Sans catégorie ».` : 'Cette action est définitive.',
    confirmLabel: 'Supprimer',
    danger: true
  });
  if (!ok) return;
  state.categories = state.categories.filter(x => x.id !== c.id);
  commit('categories');
  closeSheet('catSheet');
  toast('Catégorie supprimée');
}

/* ---------- Récurrences ---------- */
function fillRecCategories(type, selected) {
  const cats = state.categories.filter(c => c.kind === (type === 'income' ? 'income' : 'expense'));
  $('#recCategory').innerHTML = cats.map(c => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('');
}

function openRecurring(id = null) {
  const r = id ? state.recurring.find(x => x.id === id) : null;
  const f = $('#recForm');
  f.reset();
  clearErrors(f);
  f.elements.editId.value = r?.id || '';
  f.elements.type.value = r?.type || 'expense';
  f.elements.label.value = r?.label || '';
  f.elements.amount.value = r ? centsToInput(r.amount) : '';
  f.elements.day.value = r?.day || Math.min(28, new Date().getDate());
  f.elements.start.value = r?.start || monthKey();
  f.elements.active.checked = r ? r.active : true;
  fillRecCategories(f.elements.type.value, r?.categoryId);
  $('#recTitle').textContent = r ? 'Modifier la récurrence' : 'Nouvelle récurrence';
  $('#recDelete').hidden = !r;
  openSheet('recSheet', { focus: false });
}

const recSchema = {
  label: [rules.required('Le libellé'), rules.maxLength(60)],
  amount: [rules.required('Le montant'), v => (toCents(v) === null || toCents(v) <= 0 ? 'Montant invalide.' : null)],
  day: [rules.number({ min: 1, max: 28, integer: true, required: true, label: 'Le jour' })],
  categoryId: [rules.required('La catégorie')],
  start: [rules.required('Le mois de départ'), v => (isMonth(v) ? null : 'Mois invalide.')]
};

function onRecurringSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = formValues(f);
  const { valid, errors } = validate(v, recSchema);
  if (!valid) return showErrors(f, errors);
  const existing = v.editId ? state.recurring.find(x => x.id === v.editId) : null;
  const rec = {
    id: existing?.id || uid(),
    type: v.type,
    label: v.label,
    amount: toCents(v.amount),
    categoryId: v.categoryId,
    day: Number(v.day),
    start: v.start,
    // Changer le mois de départ vers le passé relance la génération depuis ce mois.
    lastGenerated: existing && existing.start === v.start ? existing.lastGenerated : '',
    active: f.elements.active.checked
  };
  if (existing) state.recurring[state.recurring.indexOf(existing)] = rec;
  else state.recurring.push(rec);
  commit('recurring');
  const created = generateRecurring();
  closeSheet('recSheet');
  toast(`${existing ? 'Récurrence modifiée' : 'Récurrence ajoutée'}${created ? ` · ${created} opération(s) générée(s)` : ''}`);
}

async function onRecurringDelete() {
  const r = state.recurring.find(x => x.id === $('#recForm').elements.editId.value);
  if (!r) return;
  const ok = await confirmDialog({ title: `Supprimer « ${r.label} » ?`, message: 'Les opérations déjà générées sont conservées.', confirmLabel: 'Supprimer', danger: true });
  if (!ok) return;
  state.recurring = state.recurring.filter(x => x.id !== r.id);
  commit('recurring');
  closeSheet('recSheet');
  toast('Récurrence supprimée');
}

/* ---------- Sauvegarde ---------- */
function exportData() {
  const data = { app: 'mon-budget', version: 1, exportedAt: new Date().toISOString(), categories: state.categories, transactions: state.transactions, recurring: state.recurring, goals: state.goals };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `mon-budget-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Sauvegarde exportée');
}

async function importData(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toastError('Fichier illisible (JSON invalide).');
  }
  if (!data || data.app !== 'mon-budget') return toastError('Ce fichier n’est pas une sauvegarde Mon budget.');
  const next = {
    categories: normalizeCategories(data.categories),
    transactions: normalizeTransactions(data.transactions),
    recurring: normalizeRecurring(data.recurring),
    goals: normalizeGoals(data.goals)
  };
  const ok = await confirmDialog({
    title: 'Remplacer vos données ?',
    message: `La sauvegarde contient ${next.transactions.length} opération(s) et ${next.goals.length} objectif(s). Les données actuelles seront remplacées sur tous vos appareils.`,
    confirmLabel: 'Importer',
    danger: true
  });
  if (!ok) return;
  commit(['categories', 'transactions', 'recurring', 'goals'], next);
  toast('Sauvegarde importée');
}

/* ---------- Initialisation ---------- */
export function initSettings() {
  $('#settingsBtn').addEventListener('click', () => openSettings());
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open-settings]');
    if (open) openSettings(open.dataset.openSettings);
  });
  const sheet = $('#settingsSheet');
  sheet.addEventListener('click', async e => {
    const kind = e.target.closest('[data-kind]');
    if (kind) {
      catKind = kind.dataset.kind;
      return renderCategories();
    }
    if (e.target.closest('[data-cat-add]')) return openCategory();
    const cat = e.target.closest('[data-cat]');
    if (cat) return openCategory(cat.dataset.cat);
    if (e.target.closest('[data-rec-add]')) return openRecurring();
    const rec = e.target.closest('[data-rec]');
    if (rec) return openRecurring(rec.dataset.rec);
    const theme = e.target.closest('[data-theme-choice]');
    if (theme) return commit('theme', { theme: theme.dataset.themeChoice });
    const setting = e.target.closest('[data-setting]')?.dataset.setting;
    if (setting === 'export') exportData();
    else if (setting === 'pin-change') {
      closeSheet('settingsSheet');
      changePin();
    } else if (setting === 'pin-remove') {
      if (await confirmDialog({ title: 'Désactiver le code PIN ?', message: 'L’application s’ouvrira sans code sur cet appareil.', confirmLabel: 'Désactiver', danger: true })) {
        removePin();
        renderSettings();
        toast('Code PIN désactivé');
      }
    }
  });
  $('#importFile').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) importData(file);
    e.target.value = '';
  });
  $('#catForm').addEventListener('submit', onCategorySubmit);
  $('#catDelete').addEventListener('click', onCategoryDelete);
  $('#recForm').addEventListener('submit', onRecurringSubmit);
  $('#recDelete').addEventListener('click', onRecurringDelete);
  $('#recForm').addEventListener('change', e => {
    if (e.target.name === 'type') fillRecCategories(e.target.value);
  });
}
