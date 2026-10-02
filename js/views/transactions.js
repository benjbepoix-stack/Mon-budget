/* Vue « Opérations » : liste du mois groupée par jour, filtre par type, par
   catégorie et recherche texte (note ou catégorie). */
import { $, $$, esc, plural, debounce } from '../core/utils.js';
import { formatKey } from '../core/dates.js';
import { formatEUR, formatSigned, sum } from '../core/money.js';
import { monthTransactions, categoryById, expenseCategories, incomeCategories } from '../core/selectors.js';
import { getMonth } from '../core/month-state.js';
import { icon } from '../ui/icons.js';
import { txRowHTML, slotColor } from './common.js';

let filter = 'all';
let catFilter = null;
let search = '';

/** Catégorie utilisée pour le filtre et la recherche (pas de catégorie pour une épargne). */
const categoryOf = t => (t.type === 'saving' ? null : categoryById(t.categoryId));

function matchesSearch(t, q) {
  if (!q) return true;
  const haystack = `${t.note || ''} ${categoryOf(t)?.name || ''}`.toLowerCase();
  return haystack.includes(q);
}

/** Chips de catégorie : seulement pour Dépenses / Revenus, et seulement celles utilisées ce mois-ci. */
function renderCatFilter(byType, kind) {
  const host = $('#txCatFilter');
  const cats = kind === 'income' ? incomeCategories() : kind === 'expense' ? expenseCategories() : [];
  const used = cats.filter(c => byType.some(t => t.categoryId === c.id));
  if (!used.some(c => c.id === catFilter)) catFilter = null;
  host.hidden = !used.length;
  if (!used.length) return;
  host.innerHTML = used
    .map(
      c => `<button type="button" class="chip ${c.id === catFilter ? 'is-selected' : ''}" data-cat-filter="${esc(c.id)}" role="radio" aria-checked="${c.id === catFilter}" style="--c:${slotColor(c.color)}"><span aria-hidden="true">${esc(c.icon)}</span><span>${esc(c.name)}</span></button>`
    )
    .join('');
}

export function renderTransactions() {
  const all = monthTransactions(getMonth());
  const byType = filter === 'all' ? all : all.filter(t => t.type === filter);
  renderCatFilter(byType, filter);
  $$('#txFilter [data-filter]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.filter === filter)));

  let list = catFilter ? byType.filter(t => t.categoryId === catFilter) : byType;
  const q = search.trim().toLowerCase();
  if (q) list = list.filter(t => matchesSearch(t, q));

  const net = sum(list, t => (t.type === 'income' ? t.amount : -t.amount));
  $('#txSummary').innerHTML = list.length
    ? `<span>${list.length} ${plural(list.length, 'opération')}</span><strong>${filter === 'all' ? formatSigned(net) : formatEUR(sum(list))}</strong>`
    : '';

  const host = $('#txList');
  if (!list.length) {
    const reason = q ? ' pour cette recherche' : catFilter ? ' pour cette catégorie' : filter === 'all' ? '' : ' de ce type';
    host.innerHTML = `<div class="empty-state"><span class="empty-state__icon">${icon('list', 22)}</span><p>Aucune opération${reason} pour ce mois.</p></div>`;
    return;
  }
  const days = new Map();
  list.forEach(t => {
    if (!days.has(t.date)) days.set(t.date, []);
    days.get(t.date).push(t);
  });
  host.innerHTML = [...days]
    .map(([date, items]) => {
      const dayNet = sum(items, t => (t.type === 'income' ? t.amount : -t.amount));
      return `<section class="tx-day"><header class="tx-day__head"><span>${esc(formatKey(date, { weekday: 'long', day: 'numeric', month: 'long' }))}</span><span>${formatSigned(dayNet)}</span></header>
        <div class="card card--list">${items.map(t => txRowHTML(t)).join('')}</div></section>`;
    })
    .join('');
}

export function initTransactions() {
  $('#txFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    renderTransactions();
  });
  $('#txCatFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-cat-filter]');
    if (!b) return;
    const id = b.dataset.catFilter;
    catFilter = catFilter === id ? null : id;
    renderTransactions();
  });
  $('#txSearch').addEventListener(
    'input',
    debounce(e => {
      search = e.target.value;
      renderTransactions();
    }, 150)
  );
}
