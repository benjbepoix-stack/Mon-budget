/* Éléments d'interface partagés entre les vues du budget. */
import { $$, esc } from '../core/utils.js';
import { formatKey } from '../core/dates.js';
import { formatEUR } from '../core/money.js';
import { categoryById, goalById, monthDate } from '../core/selectors.js';
import { getMonth, isCurrentMonth, setMonth, onMonthChange } from '../core/month-state.js';
import { shiftMonth, monthKey } from '../core/selectors.js';
import { PALETTE } from '../ui/charts.js';
import { LINKED_SOURCES } from '../core/schema.js';
import { icon } from '../ui/icons.js';

export const slotColor = slot => PALETTE[(slot || 0) % PALETTE.length];

export const monthLabel = key => {
  const s = monthDate(key).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Libellé, icône et couleur d'une opération. */
export function describe(t) {
  if (t.type === 'saving') {
    const g = goalById(t.goalId);
    return { icon: g?.icon || '🐷', title: t.note || (g ? g.name : 'Épargne'), sub: g ? `Épargne · ${g.name}` : 'Épargne', color: g ? slotColor(g.color) : 'var(--violet)' };
  }
  const c = categoryById(t.categoryId);
  if (t.linked) {
    const src = LINKED_SOURCES[t.linked];
    return { icon: c?.icon || src.icon, title: t.note, sub: [c?.name, t.kind, src.name].filter(Boolean).join(' · '), color: c ? slotColor(c.color) : 'var(--text-3)' };
  }
  return { icon: c?.icon || '❔', title: t.note || c?.name || 'Sans catégorie', sub: c?.name || 'Sans catégorie', color: c ? slotColor(c.color) : 'var(--text-3)' };
}

export function txRowHTML(t, { showDate = false } = {}) {
  const d = describe(t);
  const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
  const sub = [showDate ? formatKey(t.date, { day: 'numeric', month: 'short' }) : '', d.sub].filter(Boolean).join(' · ');
  // Dépense reliée (Mon Garage, Ma Maison) : lecture seule, un appui ouvre l'app d'origine.
  const open = t.linked ? `<a class="tx tx--linked" href="${LINKED_SOURCES[t.linked].url}" title="Saisie dans ${esc(LINKED_SOURCES[t.linked].name)}">` : `<button type="button" class="tx" data-tx="${esc(t.id)}">`;
  return `${open}
    <span class="tx__icon" style="--c:${d.color}" aria-hidden="true">${esc(d.icon)}</span>
    <span class="tx__body"><span class="tx__title">${esc(d.title)}</span><span class="tx__sub">${esc(sub)}${t.recurringId ? ` <span class="tx__rec" title="Opération récurrente">${icon('repeat', 12)}</span>` : ''}${t.linked ? ` <span class="tx__rec" title="Reliée à ${esc(LINKED_SOURCES[t.linked].name)}">${icon('link', 12)}</span>` : ''}</span></span>
    <span class="tx__amount tx__amount--${t.type}">${sign}${esc(formatEUR(t.amount))}</span>
  ${t.linked ? '</a>' : '</button>'}`;
}

/* ---------- Navigation mensuelle (partagée) ---------- */
export function renderMonthNavs() {
  const key = getMonth();
  $$('[data-month-nav]').forEach(nav => {
    nav.querySelector('[data-month-label]').textContent = monthLabel(key);
    nav.querySelector('[data-month-reset]').hidden = isCurrentMonth();
    // Pas de navigation au-delà du mois prochain.
    nav.querySelector('[data-month-step="1"]').disabled = key >= shiftMonth(monthKey(), 1);
  });
}

export function initMonthNavs() {
  document.addEventListener('click', e => {
    const step = e.target.closest('[data-month-step]');
    if (step) return setMonth(shiftMonth(getMonth(), Number(step.dataset.monthStep)));
    if (e.target.closest('[data-month-reset]')) setMonth(monthKey());
  });
  onMonthChange(renderMonthNavs);
  renderMonthNavs();
}

/* ---------- Sélecteur d'icône (emoji) ---------- */
const EMOJIS = {
  goalForm: ['🎯', '✈️', '🏖️', '🚲', '🚗', '🏠', '💻', '📱', '🎓', '💍', '🎁', '🏔️', '⛷️', '🐴', '🐶', '👶', '🎸', '📷', '⌚', '🛋️', '🌴', '🏃', '🛟', '💰'],
  catForm: ['🏠', '🛒', '🚗', '⛽', '🚆', '🚴', '🎬', '🍽️', '☕', '🍺', '💊', '📱', '💡', '🛍️', '👕', '💇', '🐴', '🐶', '👶', '🎓', '📚', '✈️', '🎁', '🧾', '📦', '💼', '↩️', '➕', '💶', '🏦']
};

export function renderEmojiPicker(formId, selected) {
  const form = document.getElementById(formId);
  const host = form.querySelector('[data-emoji-for]');
  const list = EMOJIS[formId];
  const value = selected || list[0];
  form.elements.icon.value = value;
  host.innerHTML = [...new Set([value, ...list])]
    .map(e => `<button type="button" class="emoji ${e === value ? 'is-selected' : ''}" data-emoji="${e}" aria-label="Icône ${e}" aria-pressed="${e === value}">${e}</button>`)
    .join('');
}

export function initEmojiPickers() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-emoji]');
    if (!btn) return;
    const form = btn.closest('form');
    form.elements.icon.value = btn.dataset.emoji;
    form.querySelectorAll('[data-emoji]').forEach(b => {
      b.classList.toggle('is-selected', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    });
  });
}

/** Aller vers un onglet (défini dans main.js). */
export const goTo = view => document.querySelector(`[data-view="${view}"]`)?.click();
