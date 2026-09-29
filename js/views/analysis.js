/* Vue « Analyse » : 12 derniers mois, moyennes, top dépenses, charges fixes. */
import { $, esc } from '../core/utils.js';
import { formatEUR, formatEURRound, sum } from '../core/money.js';
import { state } from '../core/store.js';
import { lastMonths, monthDate, monthKey, shiftMonth, expenseCategories, recurringOverview, categoryById } from '../core/selectors.js';
import { renderBarChart, PALETTE } from '../ui/charts.js';
import { icon } from '../ui/icons.js';
import { slotColor } from './common.js';

const SERIES = {
  expense: { key: 'expense', label: 'Dépenses', color: PALETTE[1] },
  saving: { key: 'saving', label: 'Épargne', color: PALETTE[0] },
  income: { key: 'income', label: 'Revenus', color: PALETTE[2] }
};

// Valeurs en centimes : ≥ 1 000 € affiché en k€.
const axisFmt = v => (v >= 100000 ?`${(v / 100000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : `${Math.round(v / 100)} €`);

function renderTrend() {
  const months = lastMonths(12);
  const groups = months.map(m => {
    const d = monthDate(m.key);
    const title = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return {
      key: m.key,
      label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      title: title.charAt(0).toUpperCase() + title.slice(1),
      hasData: m.count > 0,
      values: { expense: m.expense, saving: m.saving, income: m.income, left: m.left }
    };
  });
  renderBarChart($('#trendChart'), groups, {
    bars: [SERIES.expense, SERIES.saving],
    line: SERIES.income,
    fmt: formatEUR,
    axisFmt,
    highlight: monthKey(),
    extra: g => `<span class="chart-tip__row chart-tip__row--total">Reste<b>${esc(formatEUR(g.values.left))}</b></span>`
  });

  // Moyennes sur les mois qui contiennent des données (mois en cours exclu).
  const complete = months.filter(m => m.key !== monthKey() && m.count > 0);
  const avg = key => (complete.length ? formatEURRound(Math.round(sum(complete, m => m[key]) / complete.length)) : '—');
  const income12 = sum(months, m => m.income);
  const saving12 = sum(months, m => m.saving);
  const rate = income12 ? Math.round((saving12 / income12) * 100) : null;
  $('#trendStats').innerHTML = [
    [avg('income'), 'revenus / mois'],
    [avg('expense'), 'dépenses / mois'],
    [avg('saving'), 'épargne / mois'],
    [rate === null ? '—' : `${rate} %`, 'taux d’épargne']
  ]
    .map(([v, l]) => `<div class="stat"><strong>${esc(v)}</strong><span>${l}</span></div>`)
    .join('');
}

function renderTop() {
  const since = shiftMonth(monthKey(), -11);
  const expenses = state.transactions.filter(t => t.type === 'expense' && t.date.slice(0, 7) >= since);
  const total = sum(expenses);
  const rows = expenseCategories()
    .map(c => ({ c, amount: sum(expenses.filter(t => t.categoryId === c.id)) }))
    .filter(r => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);
  const host = $('#topCategories');
  if (!rows.length) {
    host.innerHTML = '<p class="chart-empty">Pas encore de dépenses sur 12 mois.</p>';
    return;
  }
  const max = rows[0].amount;
  host.innerHTML = rows
    .map(
      ({ c, amount }) => `<div class="hbar">
        <div class="hbar__top"><span>${esc(c.icon)} ${esc(c.name)}</span><span><strong>${formatEURRound(amount)}</strong> · ${Math.round((amount / total) * 100)} %</span></div>
        <div class="hbar__track"><div class="hbar__fill" style="--value:${(amount / max) * 100}%; --c:${slotColor(c.color)}"></div></div>
      </div>`
    )
    .join('');
}

function renderRecurring() {
  const o = recurringOverview();
  const host = $('#recurringOverview');
  if (!o.active.length) {
    host.innerHTML = `<div class="empty-state"><span class="empty-state__icon">${icon('repeat', 22)}</span><p>Aucune charge fixe. Cochez « Répéter chaque mois » lors d’une saisie, ou ajoutez-les dans les réglages.</p></div>`;
    return;
  }
  const expenses = o.active.filter(r => r.type === 'expense').sort((a, b) => b.amount - a.amount);
  host.innerHTML = `<div class="stats-grid stats-grid--2">
      <div class="stat"><strong>${formatEUR(o.monthlyExpense)}</strong><span>charges / mois</span></div>
      <div class="stat"><strong>${formatEURRound(o.yearlyExpense)}</strong><span>coût annuel</span></div>
    </div>
    <div class="rec-list">${expenses
      .map(r => {
        const c = categoryById(r.categoryId);
        return `<div class="rec-row"><span class="rec-row__icon" aria-hidden="true">${esc(c?.icon || '🔁')}</span><span class="rec-row__label">${esc(r.label)}<small>le ${r.day} du mois</small></span><span class="rec-row__amount">${formatEUR(r.amount)}<small>${formatEURRound(r.amount * 12)} / an</small></span></div>`;
      })
      .join('')}</div>`;
}

export function renderAnalysis() {
  renderTrend();
  renderTop();
  renderRecurring();
}
