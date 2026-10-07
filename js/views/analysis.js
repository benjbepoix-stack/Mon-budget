/* Vue « Analyse » : 12 derniers mois, moyennes, top dépenses, évolution du salaire. */
import { $, esc } from '../core/utils.js';
import { formatEUR, formatEURRound, sum } from '../core/money.js';
import { lastMonths, monthDate, monthKey, shiftMonth, expenseCategories, recurringOverview, allTransactions, salaryMonths } from '../core/selectors.js';
import { renderBarChart, PALETTE } from '../ui/charts.js';
import { slotColor } from './common.js';

const SERIES = {
  expense: { key: 'expense', label: 'Dépenses', color: PALETTE[1] },
  saving: { key: 'saving', label: 'Épargne', color: PALETTE[0] },
  income: { key: 'income', label: 'Revenus', color: PALETTE[2] },
  salary: { key: 'salary', label: 'Salaire', color: PALETTE[2] }
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
      values: { expense: m.expense, saving: m.saving, income: m.income }
    };
  });
  renderBarChart($('#trendChart'), groups, {
    bars: [SERIES.expense, SERIES.saving],
    line: SERIES.income,
    fmt: formatEUR,
    axisFmt,
    highlight: monthKey()
  });

  // Moyennes sur les mois qui contiennent des données (mois en cours exclu).
  const complete = months.filter(m => m.key !== monthKey() && m.count > 0);
  const avg = key => (complete.length ? formatEURRound(Math.round(sum(complete, m => m[key]) / complete.length)) : '—');
  const fixed = recurringOverview().monthlyExpense;
  $('#trendStats').innerHTML = [
    [avg('income'), 'revenus / mois'],
    [avg('expense'), 'dépenses / mois'],
    [fixed ? formatEURRound(fixed) : '—', 'frais fixes / mois'],
    [avg('saving'), 'épargne / mois']
  ]
    .map(([v, l]) => `<div class="stat"><strong>${esc(v)}</strong><span>${l}</span></div>`)
    .join('');
}

function renderTop() {
  const since = shiftMonth(monthKey(), -11);
  const expenses = allTransactions().filter(t => t.type === 'expense' && t.date.slice(0, 7) >= since);
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

/** Évolution du salaire : 24 derniers mois, dernier salaire, moyenne et évolution sur un an. */
function renderSalary() {
  const months = salaryMonths(24);
  const paid = months.filter(m => m.amount > 0);
  const last12 = months.slice(12);
  const prev12 = months.slice(0, 12);
  const avg = list => {
    const withPay = list.filter(m => m.amount > 0);
    return withPay.length ? Math.round(sum(withPay, m => m.amount) / withPay.length) : 0;
  };
  const a1 = avg(last12);
  const a0 = avg(prev12);
  const label = key => {
    const s = monthDate(key).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const lastPaid = paid[paid.length - 1];
  $('#salarySub').textContent = lastPaid ? `Catégorie « Salaire » · 24 derniers mois` : 'Saisissez vos salaires dans la catégorie « Salaire »';
  renderBarChart(
    $('#salaryChart'),
    months.map((m, i) => ({
      key: m.key,
      label: monthDate(m.key).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      title: label(m.key),
      values: { salary: m.amount },
      before: i >= 12 ? months[i - 12].amount : null
    })),
    {
      bars: [SERIES.salary],
      fmt: formatEUR,
      axisFmt,
      highlight: monthKey(),
      extra: g => (g.before && g.values.salary ? `<span class="chart-tip__row">Un an avant<b>${esc(formatEUR(g.before))}</b></span>` : '')
    }
  );
  const evolution = a0 && a1 ? ((a1 - a0) / a0) * 100 : null;
  $('#salaryStats').innerHTML = [
    [lastPaid ? formatEURRound(lastPaid.amount) : '—', lastPaid ? `dernier salaire · ${monthDate(lastPaid.key).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}` : 'dernier salaire'],
    [a1 ? formatEURRound(a1) : '—', 'moyenne sur 12 mois'],
    [evolution === null ? '—' : `${evolution >= 0 ? '+' : '−'}${Math.abs(evolution).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`, 'sur un an']
  ]
    .map(([v, l]) => `<div class="stat"><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`)
    .join('');
}

export function renderAnalysis() {
  renderTrend();
  renderTop();
  renderSalary();
}
