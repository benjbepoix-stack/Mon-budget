/*
 * Page « Abonnements » : calendrier du mois avec la pastille de chaque prélèvement
 * (Netflix, Spotify, loyer…) et rentrée récurrente, résumé cash / à venir / revenu,
 * puis la liste des abonnements. Les données viennent des charges et revenus récurrents
 * (Réglages) et des opérations déjà prélevées : rien de nouveau à saisir.
 */
import { $, $$, esc } from '../core/utils.js';
import { formatEUR, formatEURRound, sum } from '../core/money.js';
import { categoryById, monthDate, monthKey, shiftMonth, subscriptionMonth } from '../core/selectors.js';
import { getMonth, setMonth, onMonthChange } from '../core/month-state.js';
import { animate, haptic, rollText } from '../ui/motion.js';
import { brandBadge, brandOf } from '../ui/brands.js';
import { icon } from '../ui/icons.js';
import { slotColor } from './common.js';
import { openRecurring } from './settings.js';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const pad = n => String(n).padStart(2, '0');
const maxMonth = () => shiftMonth(monthKey(), 1);

/** « Sept 2026 », « Oct 2026 », « Févr 2027 » */
const shortLabel = key => {
  const m = monthDate(key).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${key.slice(0, 4)}`;
};

let selectedDay = null;
let turn = 0;
let shownMonth = getMonth();
const lastText = new Map();

/** Abonnement : catégorie « Abonnements », ou service reconnu au nom (Netflix, Spotify…). */
const isSubscription = i => i.type === 'expense' && (i.subscription || Boolean(brandOf(i.label)));

function badgeFor(i, size) {
  const c = categoryById(i.categoryId);
  return brandBadge({ label: i.label, emoji: c?.icon, color: c ? slotColor(c.color) : 'var(--text-3)', kind: i.type, size });
}

/* ---------- En-tête : mois précédent, en cours, suivant ---------- */
function renderMonths(key) {
  const prev = shiftMonth(key, -1);
  const next = shiftMonth(key, 1);
  $('#subsMonths').innerHTML = `
    <button type="button" class="subs-months__side" data-subs-month="${prev}" aria-label="Mois précédent : ${esc(shortLabel(prev))}">${esc(shortLabel(prev))}</button>
    <strong class="subs-months__current" aria-live="polite">${esc(shortLabel(key))}</strong>
    <button type="button" class="subs-months__side" data-subs-month="${next}" ${next > maxMonth() ? 'disabled aria-hidden="true" tabindex="-1"' : ''} aria-label="Mois suivant : ${esc(shortLabel(next))}">${esc(shortLabel(next))}</button>`;
  $('#subsReset').hidden = key === monthKey();
}

/* ---------- Résumé et barre du mois ---------- */
function renderSummary(m) {
  const set = (id, cents) => {
    const el = $(id);
    const text = formatEURRound(cents);
    const prev = lastText.get(id);
    el.textContent = text;
    lastText.set(id, text);
    rollText(el, prev, text);
  };
  set('#subsCash', m.cash);
  set('#subsUpcoming', m.upcoming);
  set('#subsIncome', m.income);
  $('#subsCash').classList.toggle('is-negative', m.cash < 0);

  // Barre : le revenu du mois (ou le total des sorties s'il est plus grand), découpé en cash / à venir / dépensé.
  const total = Math.max(m.income, m.spent + m.upcoming, 1);
  const w = v => `${((Math.max(0, v) / total) * 100).toFixed(2)}%`;
  const bar = $('#subsBar');
  bar.querySelector('[data-seg="cash"]').style.width = w(m.cash);
  bar.querySelector('[data-seg="upcoming"]').style.width = w(m.upcoming);
  bar.querySelector('[data-seg="spent"]').style.width = w(m.spent);
  bar.setAttribute('aria-label', `${m.cash >= 0 ? `Cash ${formatEURRound(m.cash)}` : `Manque ${formatEURRound(-m.cash)}`}, à venir ${formatEURRound(m.upcoming)}, déjà dépensé ${formatEURRound(m.spent)}`);
  $('#subsLegend').innerHTML = [
    m.cash >= 0 ? `<span><i class="dot dot--cash"></i>Cash ${formatEURRound(m.cash)}</span>` : `<span class="is-over">Manque ${formatEURRound(-m.cash)}</span>`,
    `<span><i class="dot dot--upcoming"></i>À venir ${formatEURRound(m.upcoming)}</span>`,
    `<span><i class="dot dot--spent"></i>Dépensé ${formatEURRound(m.spent)}</span>`
  ].join('');
}

/* ---------- Calendrier ---------- */
function renderCalendar(m) {
  const first = (monthDate(m.key).getDay() + 6) % 7; // lundi = 0
  const byDay = new Map();
  // Un abonnement passe devant (sa pastille s'affiche dans la case du jour).
  [...m.items].sort((a, b) => isSubscription(b) - isSubscription(a)).forEach(i => byDay.set(i.day, [...(byDay.get(i.day) || []), i]));
  if (selectedDay && !byDay.has(selectedDay)) selectedDay = null;
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="subs-day is-blank" aria-hidden="true"></span>');
  for (let d = 1; d <= m.days; d++) {
    const items = byDay.get(d) || [];
    const cls = ['subs-day'];
    if (items.length) cls.push(items.every(i => i.type === 'income') ? 'has-income' : 'has-expense');
    if (m.today === d) cls.push('is-today');
    if (m.today && d < m.today) cls.push('is-past');
    if (selectedDay === d) cls.push('is-selected');
    const label = items.length ? `${d} : ${items.map(i => `${i.label} ${formatEUR(i.amount)}`).join(', ')}` : String(d);
    const more = items.length > 1 ? `<span class="subs-day__more">+${items.length - 1}</span>` : '';
    const inner = `<span class="subs-day__num">${d}</span>${items.length ? badgeFor(items[0], 28) : ''}${more}`;
    cells.push(items.length ? `<button type="button" class="${cls.join(' ')}" data-subs-day="${d}" aria-pressed="${selectedDay === d}" aria-label="${esc(label)}">${inner}</button>` : `<span class="${cls.join(' ')}">${inner}</span>`);
  }
  $('#subsCal').innerHTML = `<div class="subs-cal__head" aria-hidden="true">${WEEKDAYS.map(w => `<span>${w}</span>`).join('')}</div><div class="subs-cal__grid">${cells.join('')}</div>`;
  renderDayDetail(m, byDay);
}

function renderDayDetail(m, byDay) {
  const host = $('#subsDay');
  const items = selectedDay ? byDay.get(selectedDay) : null;
  host.hidden = !items;
  if (!items) return;
  const date = monthDate(m.key);
  date.setDate(selectedDay);
  const title = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  host.innerHTML = `<p class="subs-daydetail__title">${esc(title.charAt(0).toUpperCase() + title.slice(1))}</p>${items.map(i => rowHTML(i, m, { compact: true })).join('')}`;
}

/* ---------- Listes ---------- */
function rowHTML(i, m, { compact = false } = {}) {
  const date = `${pad(i.day)}/${m.key.slice(5, 7)}/${m.key.slice(0, 4)}`;
  const state = i.paid ? (i.type === 'income' ? 'reçu' : 'prélevé') : i.pending ? 'à venir' : i.type === 'income' ? 'non reçu' : 'non prélevé';
  const sign = i.type === 'income' ? '+' : '−';
  const open = i.tx ? `data-tx="${esc(i.tx.id)}"` : `data-subs-rec="${esc(i.recurringId)}"`;
  return `<button type="button" class="subs-row${compact ? ' subs-row--compact' : ''}${i.pending ? ' is-pending' : ''}" ${open}>
    ${badgeFor(i, compact ? 32 : 40)}
    <span class="subs-row__body"><span class="subs-row__name">${esc(i.label)}</span><small>${date} · ${state}</small></span>
    <span class="subs-row__amount subs-row__amount--${i.type}">${sign}${esc(formatEUR(i.amount))}<small>/mois</small></span>
  </button>`;
}

function renderLists(m) {
  const subs = m.items.filter(isSubscription);
  const others = m.items.filter(i => !isSubscription(i));
  const monthly = sum(subs);
  $('#subsSub').textContent = subs.length ? `${subs.length} abonnement${subs.length > 1 ? 's' : ''} · ${formatEURRound(monthly)} / mois · ${formatEURRound(monthly * 12)} / an` : '';
  $('#subsList').innerHTML = subs.length
    ? subs.map(i => rowHTML(i, m)).join('')
    : `<div class="empty-state"><span class="empty-state__icon">${icon('repeat', 22)}</span><p>Aucun abonnement ce mois-ci. Ajoutez Netflix, Spotify, la salle de sport… dans les charges récurrentes avec la catégorie « Abonnements » : leur pastille apparaît dans le calendrier au jour du prélèvement.</p><button type="button" class="btn btn--soft btn--sm" data-open-settings="recurring">Ajouter un abonnement</button></div>`;
  $('#subsOthersSection').hidden = !others.length;
  $('#subsOthers').innerHTML = others.map(i => rowHTML(i, m)).join('');
}

export function renderSubs() {
  const key = getMonth();
  const m = subscriptionMonth(key);
  renderMonths(key);
  renderSummary(m);
  renderCalendar(m);
  renderLists(m);
  if (turn) {
    const dir = turn;
    turn = 0;
    animate($('#subsMonths'), [{ transform: `translateX(${dir * 24}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'settle' });
    animate($('#subsCal'), [{ transform: `translateX(${dir * 40}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'settle', delay: 30 });
    $$('#subsView > .section').forEach((s, i) => animate(s, [{ transform: `translateX(${dir * 40}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'settle', delay: 60 + i * 40 }));
  }
}

export function initSubs() {
  onMonthChange(key => {
    turn = key > shownMonth ? 1 : -1;
    shownMonth = key;
    selectedDay = null;
  });
  const view = $('#subsView');
  view.addEventListener('click', e => {
    const month = e.target.closest('[data-subs-month]');
    if (month && !month.disabled) {
      haptic(6);
      return setMonth(month.dataset.subsMonth);
    }
    if (e.target.closest('#subsReset')) return setMonth(monthKey());
    const day = e.target.closest('[data-subs-day]');
    if (day) {
      const d = Number(day.dataset.subsDay);
      selectedDay = selectedDay === d ? null : d;
      haptic(4);
      const m = subscriptionMonth(getMonth());
      renderCalendar(m);
      if (selectedDay) animate($('#subsDay'), [{ transform: 'translateY(-6px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'settle' });
      return;
    }
    const rec = e.target.closest('[data-subs-rec]');
    if (rec) openRecurring(rec.dataset.subsRec);
  });
  // Balayer l'en-tête : mois suivant ou précédent (pas au-delà du mois prochain).
  let swipe = null;
  const band = $('#subsBand');
  band.style.touchAction = 'pan-y';
  band.addEventListener('pointerdown', e => {
    swipe = { x: e.clientX, id: e.pointerId };
  });
  window.addEventListener('pointerup', e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x;
    swipe = null;
    if (Math.abs(dx) < 48) return;
    const next = shiftMonth(getMonth(), dx < 0 ? 1 : -1);
    if (next <= maxMonth()) setMonth(next);
  });
}
