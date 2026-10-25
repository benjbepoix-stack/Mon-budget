/* Page « Suivre » : budgets choisis avec projection, charges fixes, rentrées et moyennes par catégorie. */
import { $, $$, esc } from '../core/utils.js';
import { formatEUR, formatEURRound } from '../core/money.js';
import { state, commit } from '../core/store.js';
import { budgetTracking, budgetTrends, fixedCharges, fixedByMonth, fixedByYear, categoryAverages, categoryById, monthDate, monthKey, shiftMonth, salaryHistory, primesByYear, daysInMonth } from '../core/selectors.js';
import { getMonth, setMonth, onMonthChange } from '../core/month-state.js';
import { animate, stagger, haptic, rollText } from '../ui/motion.js';
import { toast } from '../ui/toast.js';
import { renderBarChart, renderBudgetCurve } from '../ui/charts.js';
import { icon } from '../ui/icons.js';
import { monthLabel } from './common.js';
import { openCategory } from './settings.js';

let fixedScale = 'month';
/** Animations d'arrivée à jouer au prochain rendu (onglet ouvert, mois changé). */
let entering = false;
let turn = 0;
let shownMonth = getMonth();
/** Charge fixe tout juste cochée ou retirée : sa coche rebondit au rendu suivant. */
let justTicked = null;

/** Dernier texte affiché par clé : un montant qui change roule vers sa nouvelle valeur. */
const lastText = new Map();
function roll(el, key) {
  if (!el) return;
  const now = el.textContent;
  const prev = lastText.get(key);
  lastText.set(key, now);
  rollText(el, prev, now);
}

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
        <div class="budget__top">${check(kind, label)}<span class="budget__name">${esc(c.icon)} ${esc(c.name)}</span><span class="budget__amount"><strong data-roll="${esc(c.id)}">${formatEURRound(b.spent)}</strong> / ${formatEURRound(b.budget)}</span></div>
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
  $$('[data-roll]', host).forEach(el => roll(el, `budget:${el.dataset.roll}`));
  if (entering) host.querySelectorAll('.budget').forEach(drawBudget);
}

/**
 * La courbe se trace jusqu'à aujourd'hui, la projection suit en pointillé ; si elle passe
 * le plafond, la ligne du plafond s'allume et la pastille « ! » sursaute.
 */
function drawBudget(el, i) {
  const svg = el.querySelector('svg');
  if (!svg) return;
  const d = i * 120;
  const line = svg.querySelector('.bcurve__line');
  if (line) {
    const len = line.getTotalLength();
    animate(line, [{ strokeDasharray: len, strokeDashoffset: len }, { strokeDasharray: len, strokeDashoffset: 0 }], { duration: 900, delay: d, easing: 'cubic-bezier(.4, 0, .2, 1)' });
  }
  animate(svg.querySelector('.bcurve__area'), [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: d + 450 });
  animate(svg.querySelector('.bcurve__now'), [{ transform: 'scale(0)' }, { transform: 'none' }], { spring: 'bounce', delay: d + 850 });
  animate(svg.querySelector('.bcurve__proj'), [{ strokeDashoffset: 28, opacity: 0 }, { strokeDashoffset: 0, opacity: 1 }], { duration: 650, delay: d + 900, easing: 'linear' });
  animate(svg.querySelector('.bcurve__end'), [{ transform: 'scale(0)' }, { transform: 'none' }], { spring: 'bounce', delay: d + 1500 });
  animate(svg.querySelector('.bcurve__value'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: d + 1500 });
  const cap = svg.querySelector('.bcurve__budget.is-over');
  if (cap) animate(cap, [{ strokeWidth: 1 }, { strokeWidth: 3, filter: 'drop-shadow(0 0 4px var(--amber))' }, { strokeWidth: 1 }, { strokeWidth: 2.5, filter: 'drop-shadow(0 0 3px var(--amber))' }, { strokeWidth: 1 }], { duration: 1200, delay: d + 1550 });
  const badge = el.querySelector('.check--warn, .check--over');
  if (badge) animate(badge, [{ transform: 'scale(0)' }, { transform: 'scale(1.25) rotate(-12deg)', offset: 0.5 }, { transform: 'rotate(8deg)', offset: 0.75 }, { transform: 'none' }], { duration: 600, delay: d + 1550, easing: 'ease-out' });
}

/* ---------- Charges fixes ---------- */
function renderFixedList(key) {
  const f = fixedCharges(key);
  const host = $('#fixedList');
  const past = key < monthKey();
  // Mois en cours ou passé : une charge se glisse pour la noter prélevée (ou la retirer).
  const swipe = key <= monthKey();
  $('#fixedSub').innerHTML = f.count ? `${formatEURRound(f.planned)} / mois · ${formatEURRound(f.planned * 12)} / an · <span data-paid-count>${f.paidCount}</span> sur ${f.count} prélevée${f.paidCount > 1 ? 's' : ''}` : '';
  roll($('#fixedSub [data-paid-count]'), 'fixed:paid');
  $('#fixedHint').hidden = !swipe || !f.rows.some(r => !r.paid);
  $('#fixedTrendCard').hidden = !f.count && !state.transactions.some(t => t.recurringId && t.type === 'expense');
  if (!f.count) {
    host.innerHTML = `<div class="empty-state"><span class="empty-state__icon">${icon('repeat', 22)}</span><p>Aucune charge fixe. Cochez « Chaque mois » en notant une dépense (loyer, assurance, abonnement) : elle est saisie toute seule les mois suivants.</p></div>`;
    return;
  }
  host.innerHTML = f.rows
    .map(r => {
      const c = categoryById(r.categoryId);
      const sub = r.paid ? `prélevée le ${r.day}` : past ? `non prélevée` : `le ${r.day} · à venir`;
      const tick = swipe && !r.paid ? `<button type="button" class="check-row__tick" data-fixed-tick aria-label="${esc(`Noter ${r.label} comme prélevée`)}">${check('todo', 'À venir')}</button>` : check(r.paid ? 'done' : 'todo', r.paid ? 'Prélevée' : 'À venir');
      const body = `${tick}<span class="check-row__body"><span>${esc(r.label)}</span><small>${sub}${c ? ` · ${esc(c.name)}` : ''}</small></span><span class="check-row__amount">${formatEUR(r.amount)}</span>`;
      const row = r.tx ? `<button type="button" class="check-row is-done" data-tx="${esc(r.tx.id)}">${body}</button>` : `<div class="check-row">${body}</div>`;
      return swipe ? `<div class="swipe-row${r.paid ? ' is-paid' : ''}" data-fixed="${esc(r.id)}"><span class="swipe-row__back" aria-hidden="true">${icon(r.paid ? 'close' : 'check', 22)}</span>${row}</div>` : row;
    })
    .join('');
  if (justTicked) {
    const row = host.querySelector(`[data-fixed="${CSS.escape(justTicked)}"]`);
    justTicked = null;
    if (row) {
      animate(row.querySelector('.check'), [{ transform: 'scale(.4)' }, { transform: 'none' }], { spring: 'bounce' });
      animate(row.querySelector('.check svg'), [{ transform: 'scale(0) rotate(-30deg)' }, { transform: 'none' }], { spring: 'bounce', delay: 60 });
      animate(row.querySelector('.check-row__amount'), [{ transform: 'none' }, { transform: 'translateY(-3px)', offset: 0.4 }, { transform: 'none' }], { duration: 360 });
    }
  }
}

/** Coche ou retire le prélèvement d'une charge fixe (même identifiant que la génération automatique). */
function toggleFixed(id) {
  const key = getMonth();
  const r = fixedCharges(key).rows.find(x => x.id === id);
  if (!r) return;
  justTicked = id;
  if (r.paid) {
    state.transactions = state.transactions.filter(t => t.id !== r.tx.id);
    haptic(8);
    commit('transactions');
    toast(`${r.label} : prélèvement retiré`, { type: 'info' });
    return;
  }
  // Payée avant le jour prévu : notée aujourd'hui ; sinon au jour prévu.
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = key === monthKey() && today.getDate() < r.day ? `${key}-${pad(today.getDate())}` : `${key}-${pad(r.day)}`;
  const id2 = `rec-${r.id}-${key}`;
  state.transactions = state.transactions.filter(t => t.id !== id2);
  state.transactions.push({ id: id2, type: 'expense', amount: r.amount, date, categoryId: r.categoryId, note: r.label, recurringId: r.id });
  haptic(16);
  commit('transactions');
}

/* ---------- Glisser pour cocher ---------- */
const THRESHOLD = 84;
let drag = null;
// Au-delà du seuil la ligne résiste (élastique) ; dans le mauvais sens elle bouge à peine.
const rubber = d => (d < 0 ? d * 0.18 : d < THRESHOLD ? d : THRESHOLD + (d - THRESHOLD) * 0.32);

function dragTo(dx) {
  const dir = drag.row.classList.contains('is-paid') ? -1 : 1;
  const d = rubber(dx * dir);
  drag.front.style.transform = `translateX(${d * dir}px)`;
  drag.row.style.setProperty('--p', Math.max(0, Math.min(1, d / THRESHOLD)).toFixed(3));
  const armed = d >= THRESHOLD;
  if (armed !== drag.armed) {
    drag.armed = armed;
    drag.row.classList.toggle('is-armed', armed);
    if (armed) haptic(10);
  }
}

function release() {
  const { row, front, armed } = drag;
  const from = front.style.transform || 'none';
  front.style.transform = '';
  row.style.removeProperty('--p');
  row.classList.remove('is-armed');
  animate(front, [{ transform: from }, { transform: 'none' }], { spring: 'bounce' });
  // Le relâchement ne doit pas ouvrir l'opération (clic qui suit le glisser).
  const eat = e => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', eat, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 350);
  if (armed) setTimeout(() => toggleFixed(row.dataset.fixed), 120);
}

function initSwipe() {
  const host = $('#fixedList');
  host.addEventListener('click', e => {
    const t = e.target.closest('[data-fixed-tick]');
    if (t) toggleFixed(t.closest('[data-fixed]').dataset.fixed);
  });
  host.addEventListener('pointerdown', e => {
    const row = e.target.closest('[data-fixed]');
    if (!row || e.target.closest('[data-fixed-tick]') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { row, front: row.querySelector('.check-row'), x: e.clientX, y: e.clientY, id: e.pointerId, moving: false, armed: false };
  });
  window.addEventListener(
    'pointermove',
    e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moving) {
        // Geste vertical : on laisse défiler la page.
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) return (drag = null);
        if (Math.abs(dx) < 8) return;
        drag.moving = true;
        try {
          drag.front.setPointerCapture(drag.id);
        } catch {
          /* pointeur déjà relâché */
        }
      }
      e.preventDefault();
      dragTo(dx);
    },
    { passive: false }
  );
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moving) release();
    drag = null;
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
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

/** Barres des charges fixes : elles montent l'une après l'autre. */
function growBars() {
  $$('#fixedChart path[fill]').forEach((b, i) => animate(b, [{ transform: 'scaleY(0)' }, { transform: 'none' }], { spring: 'soft', delay: 300 + i * 35 }));
}

/**
 * Rendu de Suivre. `enter` : l'onglet vient d'être ouvert (courbes tracées, barres qui montent).
 * Après un changement de mois, la page glisse dans le sens du geste.
 */
export function renderTrack({ enter = false } = {}) {
  const key = getMonth();
  entering = enter || Boolean(turn);
  renderBudgets(key);
  renderFixedList(key);
  renderFixedTrend(key);
  renderSalary(key);
  renderPrimes();
  renderAverages();
  if (entering) growBars();
  if (turn) {
    const dir = turn;
    animate($('#trackView [data-month-label]'), [{ transform: `translateX(${dir * 40}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'settle' });
    $$('#trackView > .section').forEach((s, i) => animate(s, [{ transform: `translateX(${dir * 48}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'settle', delay: i * 40 }));
  }
  entering = false;
  turn = 0;
}

export function initTrack() {
  initSwipe();
  onMonthChange(key => {
    turn = key > shownMonth ? 1 : -1;
    shownMonth = key;
    haptic(6);
  });
  // Balayer le nom du mois : mois suivant ou précédent (pas au-delà du mois prochain).
  let swipeX = null;
  const nav = $('#trackView [data-month-nav]');
  nav.style.touchAction = 'pan-y';
  nav.addEventListener('pointerdown', e => {
    if (!e.target.closest('button')) swipeX = { x: e.clientX, id: e.pointerId };
  });
  window.addEventListener('pointerup', e => {
    if (!swipeX || e.pointerId !== swipeX.id) return;
    const dx = e.clientX - swipeX.x;
    swipeX = null;
    if (Math.abs(dx) < 48) return;
    const next = shiftMonth(getMonth(), dx < 0 ? 1 : -1);
    if (next <= shiftMonth(monthKey(), 1)) setMonth(next);
  });
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
