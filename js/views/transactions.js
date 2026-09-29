/* Vue « Opérations » : liste du mois groupée par jour, filtre par type. */
import { $, $$, esc, plural } from '../core/utils.js';
import { formatKey } from '../core/dates.js';
import { formatEUR, formatSigned, sum } from '../core/money.js';
import { monthTransactions } from '../core/selectors.js';
import { getMonth } from '../core/month-state.js';
import { icon } from '../ui/icons.js';
import { txRowHTML } from './common.js';

let filter = 'all';

export function renderTransactions() {
  const all = monthTransactions(getMonth());
  const list = filter === 'all' ? all : all.filter(t => t.type === filter);
  $$('#txFilter [data-filter]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.filter === filter)));

  const net = sum(list, t => (t.type === 'income' ? t.amount : -t.amount));
  $('#txSummary').innerHTML = list.length
    ? `<span>${list.length} ${plural(list.length, 'opération')}</span><strong>${filter === 'all' ? formatSigned(net) : formatEUR(sum(list))}</strong>`
    : '';

  const host = $('#txList');
  if (!list.length) {
    host.innerHTML = `<div class="empty-state"><span class="empty-state__icon">${icon('list', 22)}</span><p>Aucune opération${filter === 'all' ? '' : ' de ce type'} pour ce mois.</p></div>`;
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
}
