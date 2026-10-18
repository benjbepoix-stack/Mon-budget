/* Page « Suivre » : budgets choisis avec projection, charges fixes, rentrées et moyennes par catégorie. */
import { $, $$, esc } from '../core/utils.js';
import { formatEUR, formatEURRound } from '../core/money.js';
import { state } from '../core/store.js';
import { budgetTracking, budgetTrends, fixedCharges, fixedByMonth, fixedByYear, categoryAverages, categoryById, monthDate, monthKey, salaryHistory, primesByYear, daysInMonth } from '../core/selectors.js';
import { getMonth } from '../core/month-state.js';
import { renderBarChart, renderBudgetCurve } from '../ui/charts.js';
import { icon } from '../ui/icons.js';
import { monthLabel } from './common.js';
import { openCategory } from './settings.js';

let fixedScale = 'month';

const shortMonth = key => monthDate(key).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
// Valeurs en centimes : ≥ 1 000 € affiché en k€.
const axisFmt = v => (v >= 100000 ? `${(v / 100000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : `${Math.round(v / 100)} €`);
const percent = (a, b) => {
  const p = ((a - b) / b) * 100;
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
};
const signed = cents => `${cents >= 0 ? '+' : '−'}${formatEURRound(Math.abs(cents))}`;

/** Case à cocher façon échéancier : ✓ (ça tient / payé), ! (attention), ○ (à venir). */
const check = (kind, label) => `<span class="check check--${kind}" role="img" aria-label="${esc(label)}">${kind === 'ok' || kind === 'done' ? icon('check', 13) : kind === 'todo' ? '' : '!'}</span>`;

const pct = p => `${p >= 0 ? '+' : '−'}${Math.abs(p).toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(p) < 10 ? 1 : 0 })} %`;

/** Pastille de tendance d'une dépense : hausse en ambre, baisse en vert, flèche toujours présente. */
function spendChip(p, label, title) {
  const flat = Math.abs(p) < 1;
  const kind = flat ? 'flat' : p > 0 ? 'up' : 'down';
  return `<span class="trend-chip is-${kind}" title="${esc(title)}"><i aria-hidden="true">${flat ? '=' : p > 0 ? '▲' : '▼'}</i>${flat ? 'stable' : pct(p)} ${esc(label)}</span>`;
}

function trendChips(categoryId, key) {
  const t = budgetTrends(categoryId, key);
  const chips = [];
  if (t.month) {
    const prev = shortMonth(t.month.prev);
    chips.push(spendChip(t.month.pct, t.month.day ? `vs ${t.month.day} ${prev}` : `vs ${prev}`, `${formatEURRound(t.month.now)} contre ${formatEURRound(t.month.before)}`));
  }
  if (t.year) chips.push(spendChip(t.year.pct, `depuis janv.`, `${formatEURRound(t.year.now)} par mois en moyenne cette année, contre ${formatEURRound(t.year.before)} l'an dernier`));
  return chips.length ? `<div class="trend-chips">${chips.join('')}</div>` : '';
}

/* ---------- Budgets suivis ---------- */
function renderBudgets(key) {
  const rows = budgetTracking(key);
  const host = $('#budgetList');
  const days = daysInMonth(key);
  const current = key === monthKey();
  $('#budgetSub').textContent = current ? `Au ${new Date().getDate()} sur ${days} jours` : key < monthKey() ? 'Mois terminé' : 'Mois à venir';
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><span class="empty-state__icon">${icon('target', 22)}</span><p>Aucun budget suivi. Choisissez seulement ceux qui comptent, par exemple les courses.</p><button type="button" class="btn btn--soft btn--sm" data-open-settings="categories">Choisir un budget</button></div>`;
    return;
  }
  host.innerHTML = rows
    .map((b, i) => {
      const c = b.category;
      const over = b.spent > b.budget;
      const risk = !over && b.projected > b.budget;
      const kind = over ? 'over' : risk ? 'warn' : b.status === 'future' ? 'todo' : 'ok';
      const label = over ? 'Dépassé' : risk ? 'Risque de dépasser' : b.status === 'future' ? 'À venir' : 'Ça tient';
      let note;
      if (b.status === 'past') note = `Fin du mois : <b>${formatEURRound(b.spent)}</b> · ${over ? `<span class="is-over">${formatEURRound(b.spent - b.budget)} au-dessus</span>` : `${formatEURRound(b.budget - b.spent)} de marge`}`;
      else if (b.status === 'future') note = b.projected ? `Déjà prévu : <b>${formatEURRound(b.projected)}</b> de charges fixes` : 'Mois à venir';
      else note = `Projection au ${b.days} : <b>≈ ${formatEURRound(b.projected)}</b> · ${b.projected > b.budget ? `<span class="is-warn">${formatEURRound(b.projected - b.budget)} au-dessus</span>` : `${formatEURRound(b.budget - b.projected)} de marge`}`;
      return `<div class="budget budget--${kind}">
        <div class="budget__top">${check(kind, label)}<span class="budget__name">${esc(c.icon)} ${esc(c.name)}</span><span class="budget__amount"><strong>${formatEURRound(b.spent)}</strong> / ${formatEURRound(b.budget)}</span></div>
        ${b.status === 'future' ? '' : `<div class="budget__curve" data-curve="${i}"></div>`}
        <p class="budget__note">${note}</p>
        ${b.status === 'future' ? '' : trendChips(c.id, key)}
      </div>`;
    })
    .join('');
  rows.forEach((b, i) => {
    const el = host.querySelector(`[data-curve="${i}"]`);
    if (!el) return;
    const label = b.status === 'past' ? `${b.category.name} : ${formatEURRound(b.spent)} dépensés pour ${formatEURRound(b.budget)}` : `${b.category.name} : ${formatEURRound(b.spent)} au ${b.today}, projection ${formatEURRound(b.projected)} pour ${formatEURRound(b.budget)}`;
    renderBudgetCurve(el, b, { fmt: formatEURRound, label });
  });
}

/* ---------- Charges fixes ---------- */
function renderFixedList(key) {
  const f = fixedCharges(key);
  const host = $('#fixedList');
  const past = key < monthKey();
  $('#fixedSub').textContent = f.count ? `${formatEURRound(f.planned)} / mois · ${formatEURRound(f.planned * 12)} / an · ${f.paidCount} sur ${f.count} prélevée${f.paidCount > 1 ? 's' : ''}` : '';
  $('#fixedTrendCard').hidden = !f.count && !state.transactions.some(t => t.recurringId && t.type === 'expense');
  if (!f.count) {
    host.innerHTML = `<div class="empty-state"><span class="empty-state__icon">${icon('repeat', 22)}</span><p>Aucune charge fixe. Cochez « Chaque mois » en notant une dépense (loyer, assurance, abonnement) : elle est saisie toute seule les mois suivants.</p></div>`;
    return;
  }
  host.innerHTML = f.rows
    .map(r => {
      const c = categoryById(r.categoryId);
      const sub = r.paid ? `prélevée le ${r.day}` : past ? `non prélevée` : `le ${r.day} · à venir`;
      const body = `${check(r.paid ? 'done' : 'todo', r.paid ? 'Prélevée' : 'À venir')}<span class="check-row__body"><span>${esc(r.label)}</span><small>${sub}${c ? ` · ${esc(c.name)}` : ''}</small></span><span class="check-row__amount">${formatEUR(r.amount)}</span>`;
      return r.tx ? `<button type="button" class="check-row is-done" data-tx="${esc(r.tx.id)}">${body}</button>` : `<div class="check-row">${body}</div>`;
    })
    .join('');
}

/** Évolution des charges fixes : 12 derniers mois, ou moyenne mensuelle par année. */
function renderFixedTrend(key) {
  if ($('#fixedTrendCard').hidden) return;
  const now = monthKey();
  const end = key < now ? key : now;
  $$('#fixedScale [data-scale]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.scale === fixedScale)));
  const series = { key: 'fixed', label: fixedScale === 'month' ? 'Charges fixes' : 'Moyenne par mois', color: 'var(--accent)' };
  const note = $('#fixedNote');
  if (fixedScale === 'month') {
    // Mois en cours : charges prévues (prélevées + à venir), pour comparer des mois entiers.
    const months = fixedByMonth(13, end).map(m => (m.key === now ? { ...m, amount: fixedCharges(now).planned } : m));
    const shown = months.slice(1);
    renderBarChart(
      $('#fixedChart'),
      shown.map((m, i) => ({ key: m.key, label: shortMonth(m.key), title: monthLabel(m.key) + (m.key === now ? ' (prévu)' : ''), values: { fixed: m.amount }, before: months[i].amount })),
      {
        bars: [series],
        fmt: formatEUR,
        axisFmt,
        highlight: now,
        extra: g => (g.before ? `<span class="chart-tip__row">Un an avant<b>${esc(formatEUR(g.before))}</b></span>` : '')
      }
    );
    const last = months[months.length - 1];
    const yearAgo = months[0];
    note.innerHTML = yearAgo.amount && last.amount ? `${esc(monthLabel(last.key))} : <b>${formatEURRound(last.amount)}</b> · ${signed(last.amount - yearAgo.amount)} (${percent(last.amount, yearAgo.amount)}) par rapport à ${esc(monthLabel(yearAgo.key).toLowerCase())}` : 'La comparaison sur un an apparaîtra après douze mois de charges saisies.';
  } else {
    const years = fixedByYear(5, end).filter(y => y.months);
    renderBarChart(
      $('#fixedChart'),
      years.map(y => ({ key: y.key, label: y.key, title: `${y.key} · ${y.months} mois`, values: { fixed: y.average } })),
      { bars: [series], fmt: formatEUR, axisFmt, highlight: end.slice(0, 4) }
    );
    const [prev, last] = years.slice(-2);
    note.innerHTML = last && prev ? `En ${last.key} : <b>${formatEURRound(last.average)} / mois</b> · ${signed(last.average - prev.average)} (${percent(last.average, prev.average)}) par rapport à ${prev.key}` : last ? `En ${last.key} : <b>${formatEURRound(last.average)} / mois</b> en moyenne` : '';
  }
}

/* ---------- Salaire : niveau habituel et augmentations ; primes par année ---------- */
function renderSalary(key) {
  const end = key < monthKey() ? key : monthKey();
  const h = salaryHistory(end);
  const host = $('#salaryList');
  $('#salarySub').textContent = h.usual ? 'Les petites variations d’un mois à l’autre ne sont pas comptées' : '';
  if (!h.usual) {
    host.innerHTML = `<p class="check-empty">Notez vos salaires (Rentrée › Salaire) : les augmentations apparaîtront ici.</p>`;
    return;
  }
  const rows = h.changes.slice(0, 4).map(c => {
    const up = c.to >= c.from;
    const diff = c.to - c.from;
    return `<div class="raise-row"><span class="raise-row__body"><span>${esc(monthLabel(c.key))} : ${formatEURRound(c.from)} → ${formatEURRound(c.to)}</span><small>${up ? '+' : '−'}${formatEURRound(Math.abs(diff))} par mois · ${up ? 'augmentation' : 'baisse'}</small></span><span class="trend-chip ${up ? 'is-gain' : 'is-up'}"><i aria-hidden="true">${up ? '▲' : '▼'}</i>${pct(c.pct)}</span></div>`;
  });
  host.innerHTML = `<div class="raise-row raise-row--head"><span class="raise-row__body"><span>Salaire habituel</span><small>moyenne des derniers salaires · dernier ${formatEUR(h.last.amount)} (${esc(shortMonth(h.last.key))})</small></span><strong>${formatEURRound(h.usual)}</strong></div>${
    rows.length ? rows.join('') : '<p class="check-empty">Pas d’augmentation repérée pour l’instant.</p>'
  }`;
}

function renderPrimes() {
  const p = primesByYear(3);
  const host = $('#primeList');
  if (!p.years.length) {
    host.innerHTML = `<p class="check-empty">Notez vos primes (Rentrée › Prime) pour les suivre d’une année sur l’autre.</p>`;
    return;
  }
  const max = Math.max(...p.years.map(y => y.total)) || 1;
  const last = p.years.length - 1;
  const rows = p.years
    .map((y, i) => `<div class="year-bar"><span>${y.year}</span><span class="year-bar__track"><span class="year-bar__fill ${i === last ? 'is-partial' : ''}" style="--value:${(y.total / max) * 100}%"></span></span><b>${formatEURRound(y.total)}</b></div>`)
    .join('');
  const prev = p.years[last - 1];
  const note = p.laterLastYear && prev ? `${p.years[last].year} pour l’instant. En ${prev.year}, <b>${formatEURRound(p.laterLastYear)}</b> étaient arrivés plus tard dans l’année.` : `${p.years[last].year} pour l’instant.`;
  host.innerHTML = `${rows}<p class="trend-card__note">${note}</p>`;
}

/* ---------- Moyennes par catégorie (pour ajuster les plafonds) ---------- */
function renderAverages() {
  const { months, rows } = categoryAverages(6);
  const host = $('#averageList');
  $('#averageSub').textContent = months.length ? `Par mois, sur ${months.length > 1 ? `les ${months.length} derniers mois complets` : 'le dernier mois complet'}, hors charges fixes` : '';
  if (!rows.length) {
    host.innerHTML = `<p class="check-empty">Les moyennes apparaîtront après un mois complet de dépenses notées.</p>`;
    return;
  }
  const max = Math.max(...rows.map(r => Math.max(r.average, r.budget || 0)));
  host.innerHTML = rows
    .map(({ category: c, average, highest, budget }) => {
      const above = budget && average > budget;
      const sub = budget ? `plafond ${formatEURRound(budget)}${above ? ` · <span class="is-warn">moyenne au-dessus</span>` : ''}` : 'pas de plafond';
      return `<button type="button" class="avg-row" data-edit-cat="${esc(c.id)}" aria-label="${esc(`${c.name} : ${formatEURRound(average)} par mois en moyenne. Ajuster le plafond`)}">
        <span class="avg-row__top"><span class="avg-row__name">${esc(c.icon)} ${esc(c.name)}</span><span class="avg-row__amount"><strong>${formatEURRound(average)}</strong> / mois</span>${icon('chevronRight', 16)}</span>
        <span class="avg-row__track" aria-hidden="true"><span class="avg-row__fill ${above ? 'is-warn' : ''}" style="--value:${(average / max) * 100}%"></span>${budget ? `<span class="avg-row__cap" style="--value:${(budget / max) * 100}%"></span>` : ''}</span>
        <span class="avg-row__sub">${sub}${months.length > 1 ? ` · mois le plus haut ${formatEURRound(highest)}` : ''}</span>
      </button>`;
    })
    .join('');
}

export function renderTrack() {
  const key = getMonth();
  renderBudgets(key);
  renderFixedList(key);
  renderFixedTrend(key);
  renderSalary(key);
  renderPrimes();
  renderAverages();
}

export function initTrack() {
  $('#fixedScale').addEventListener('click', e => {
    const b = e.target.closest('[data-scale]');
    if (!b || b.dataset.scale === fixedScale) return;
    fixedScale = b.dataset.scale;
    renderFixedTrend(getMonth());
  });
  $('#averageList').addEventListener('click', e => {
    const row = e.target.closest('[data-edit-cat]');
    if (row) openCategory(row.dataset.editCat);
  });
}
