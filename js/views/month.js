/* Vue « Mois » : suivi du budget (dépenses du mois face aux budgets), frais fixes, répartition, dernières opérations. */
import { $, esc } from '../core/utils.js';
import { formatEUR, formatEURRound } from '../core/money.js';
import { monthSummary, categorySpending, orphanSpending, monthTransactions, daysInMonth, monthKey, recurringOverview, categoryById } from '../core/selectors.js';
import { getMonth, isCurrentMonth } from '../core/month-state.js';
import { renderDonut } from '../ui/charts.js';
import { icon } from '../ui/icons.js';
import { slotColor, txRowHTML, monthLabel } from './common.js';

const WARN_RATIO = 0.8;

/** Dépenses du mois, comparées à la somme des budgets par catégorie ; frais fixes et revenus du mois. */
function renderHero(key) {
  const s = monthSummary(key);
  const budgeted = categorySpending(key).filter(r => r.budget);
  const totalBudget = budgeted.reduce((t, r) => t + r.budget, 0);
  const ratio = totalBudget ? s.expense / totalBudget : null;
  const pct = ratio === null ? 0 : Math.round(ratio * 100);
  let pace = '';
  if (isCurrentMonth() && s.variable > 0) {
    // Projection sur les dépenses courantes (les frais fixes tombent une fois par mois, pas au jour le jour).
    const day = new Date().getDate();
    const projected = Math.round(s.fixed + (s.variable / day) * daysInMonth(key));
    pace = `<p class="balance__pace">${icon('trend', 14)} Au rythme actuel : ${formatEURRound(projected)} de dépenses sur le mois</p>`;
  }
  $('#monthHero').innerHTML = `
    <div class="balance__label">Dépenses · ${esc(monthLabel(key))}</div>
    <div class="balance__value ${ratio !== null && ratio > 1 ? 'is-negative' : ''}">${formatEUR(s.expense)}</div>
    ${totalBudget
      ? `<div class="progress balance__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(pct, 100)}" aria-label="Part du budget du mois utilisée"><div class="progress__bar ${pct > 100 ? 'is-over' : ''}" style="--value:${Math.min(pct, 100)}%"></div></div><p class="balance__hint">${pct} % du budget du mois (${formatEURRound(totalBudget)})${pct > 100 ? ` · dépassé de ${formatEUR(s.expense - totalBudget)}` : ` · reste ${formatEUR(totalBudget - s.expense)}`}</p>`
      : '<p class="balance__hint">Fixez un budget par catégorie pour suivre le mois.</p>'}
    <div class="balance__stats">
      <div><span><i class="balance__dot balance__dot--fixed"></i>Frais fixes</span><strong>${formatEUR(s.fixed)}</strong></div>
      <div><span><i class="balance__dot balance__dot--expense"></i>Dépenses courantes</span><strong>${formatEUR(s.variable)}</strong></div>
      <div><span><i class="balance__dot balance__dot--income"></i>Revenus</span><strong>${formatEUR(s.income)}</strong></div>
    </div>
    ${pace}`;
}

/** Charges récurrentes actives : montant mensuel et coût annuel. */
function renderFixed() {
  const o = recurringOverview();
  const expenses = o.active.filter(r => r.type === 'expense').sort((a, b) => b.amount - a.amount);
  $('#fixedSub').textContent = expenses.length ? `${formatEUR(o.monthlyExpense)} / mois · ${formatEURRound(o.yearlyExpense)} / an` : '';
  $('#fixedList').innerHTML = expenses.length
    ? `<div class="rec-list">${expenses
        .map(r => {
          const c = categoryById(r.categoryId);
          return `<div class="rec-row"><span class="rec-row__icon" aria-hidden="true">${esc(c?.icon || '🔁')}</span><span class="rec-row__label">${esc(r.label)}<small>le ${r.day} du mois${c ? ` · ${esc(c.name)}` : ''}</small></span><span class="rec-row__amount">${formatEUR(r.amount)}<small>${formatEURRound(r.amount * 12)} / an</small></span></div>`;
        })
        .join('')}</div>`
    : `<div class="empty-state"><span class="empty-state__icon">${icon('repeat', 22)}</span><p>Aucun frais fixe. Ajoutez loyer, assurances, abonnements… : ils sont saisis automatiquement chaque mois.</p><button type="button" class="btn btn--soft btn--sm" data-open-settings="recurring">Ajouter un frais fixe</button></div>`;
}

function gaugeRow({ category: c, spent, budget, ratio }) {
  const state = ratio === null ? 'none' : ratio > 1 ? 'over' : ratio >= WARN_RATIO ? 'warn' : 'ok';
  const pct = ratio === null ? 0 : Math.min(ratio, 1) * 100;
  let status = '';
  if (state === 'over') status = `<span class="gauge__status is-over">${icon('alert', 13)} Dépassé de ${formatEUR(spent - budget)}</span>`;
  else if (state === 'warn') status = `<span class="gauge__status is-warn">${icon('alert', 13)} Reste ${formatEUR(budget - spent)}</span>`;
  else if (state === 'ok') status = `<span class="gauge__status">Reste ${formatEUR(budget - spent)}</span>`;
  else status = '<span class="gauge__status">Sans plafond</span>';
  return `<div class="gauge gauge--${state}">
    <span class="gauge__icon" style="--c:${slotColor(c.color)}" aria-hidden="true">${esc(c.icon)}</span>
    <div class="gauge__body">
      <div class="gauge__top"><span class="gauge__name">${esc(c.name)}</span><span class="gauge__amount"><strong>${formatEUR(spent)}</strong>${budget ? ` / ${formatEURRound(budget)}` : ''}</span></div>
      ${budget ? `<div class="gauge__track" role="progressbar" aria-label="${esc(c.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><div class="gauge__fill" style="--value:${pct}%"></div></div>` : ''}
      ${status}
    </div>
  </div>`;
}

function renderBudgets(key) {
  const rows = categorySpending(key)
    .filter(r => r.budget || r.spent)
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || b.spent - a.spent);
  const host = $('#budgetList');
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><span class="empty-state__icon">${icon('target', 22)}</span><p>Aucun budget défini ni dépense ce mois-ci.</p><button type="button" class="btn btn--soft btn--sm" data-open-settings="categories">Définir mes budgets</button></div>`;
    return;
  }
  const budgeted = rows.filter(r => r.budget);
  const totalBudget = budgeted.reduce((s, r) => s + r.budget, 0);
  const totalSpent = budgeted.reduce((s, r) => s + r.spent, 0);
  const head = totalBudget ? `<div class="budget-total"><span>Budgets du mois</span><strong>${formatEUR(totalSpent)} <small>/ ${formatEURRound(totalBudget)}</small></strong></div>` : '';
  host.innerHTML = head + rows.map(gaugeRow).join('');
}

function renderDonutCard(key) {
  const rows = categorySpending(key).filter(r => r.spent > 0).sort((a, b) => b.spent - a.spent);
  let entries = rows.map(r => [`${r.category.icon} ${r.category.name}`, r.spent, slotColor(r.category.color)]);
  const orphan = orphanSpending(key);
  // Au-delà de 6 catégories, regroupement dans « Autres » (lisibilité des couleurs).
  if (entries.length > 6 || orphan) {
    const rest = entries.slice(6).reduce((s, e) => s + e[1], 0) + orphan;
    entries = entries.slice(0, 6);
    if (rest) entries.push(['Autres', rest, 'var(--text-3)']);
  }
  $('#donutSub').textContent = monthLabel(key);
  renderDonut({ donut: $('#monthDonut'), legend: $('#monthLegend'), total: $('#monthDonutTotal') }, entries, 'Aucune dépense ce mois-ci.', { format: formatEURRound });
}

function renderRecent(key) {
  const list = monthTransactions(key).slice(0, 5);
  $('#recentList').innerHTML = list.length
    ? list.map(t => txRowHTML(t, { showDate: true })).join('')
    : `<div class="empty-state"><span class="empty-state__icon">${icon('list', 22)}</span><p>Aucune opération ${key === monthKey() ? 'ce mois-ci' : 'ce mois-là'}.</p><p class="empty-state__hint">Touchez le bouton <strong>+</strong> pour commencer.</p></div>`;
}

export function renderMonth() {
  const key = getMonth();
  renderHero(key);
  renderBudgets(key);
  renderFixed();
  renderDonutCard(key);
  renderRecent(key);
}

