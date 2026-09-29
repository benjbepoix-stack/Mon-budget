/* Vue « Mois » : reste à vivre, jauges de budget, répartition, dernières opérations. */
import { $, esc } from '../core/utils.js';
import { formatEUR, formatEURRound } from '../core/money.js';
import { monthSummary, categorySpending, orphanSpending, monthTransactions, daysInMonth, monthKey } from '../core/selectors.js';
import { getMonth, isCurrentMonth } from '../core/month-state.js';
import { renderDonut } from '../ui/charts.js';
import { icon } from '../ui/icons.js';
import { slotColor, txRowHTML, monthLabel } from './common.js';

const WARN_RATIO = 0.8;

function renderHero(key) {
  const s = monthSummary(key);
  const spentPct = s.income ? Math.round(((s.expense + s.saving) / s.income) * 100) : null;
  let pace = '';
  if (isCurrentMonth() && s.expense > 0) {
    const day = new Date().getDate();
    const perDay = s.expense / day;
    const projected = Math.round(perDay * daysInMonth(key));
    pace = `<p class="balance__pace">${icon('trend', 14)} Au rythme actuel : ${formatEURRound(projected)} de dépenses sur le mois</p>`;
  }
  $('#monthHero').innerHTML = `
    <div class="balance__label">Reste à vivre · ${esc(monthLabel(key))}</div>
    <div class="balance__value ${s.left < 0 ? 'is-negative' : ''}">${formatEUR(s.left)}</div>
    ${spentPct !== null ? `<div class="progress balance__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(spentPct, 100)}" aria-label="Part des revenus utilisée"><div class="progress__bar ${spentPct > 100 ? 'is-over' : ''}" style="--value:${Math.min(spentPct, 100)}%"></div></div><p class="balance__hint">${spentPct} % des revenus dépensés ou épargnés</p>` : '<p class="balance__hint">Ajoutez vos revenus pour calculer le reste à vivre.</p>'}
    <div class="balance__stats">
      <div><span><i class="balance__dot balance__dot--income"></i>Revenus</span><strong>${formatEUR(s.income)}</strong></div>
      <div><span><i class="balance__dot balance__dot--expense"></i>Dépenses</span><strong>${formatEUR(s.expense)}</strong></div>
      <div><span><i class="balance__dot balance__dot--saving"></i>Épargne</span><strong>${formatEUR(s.saving)}</strong></div>
    </div>
    ${pace}`;
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
  renderDonutCard(key);
  renderRecent(key);
}

