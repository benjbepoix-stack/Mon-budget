/* Page « Noter » : une dépense ou une rentrée, le budget concerné, et c'est tout. */
import { $, esc, uid } from '../core/utils.js';
import { todayKey } from '../core/dates.js';
import { toCents, formatEUR, formatEURRound, sum } from '../core/money.js';
import { state, commit } from '../core/store.js';
import { categoriesByUsage, categoryById, monthKey, shiftMonth, monthTransactions, allTransactions, salaryCategoryIds, primeCategoryIds, salaryHistory } from '../core/selectors.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { amountRules } from './quickadd.js';
import { txRowHTML, monthLabel } from './common.js';

const OTHER = '__other';
const RECENT = 6;
const form = () => $('#noteForm');

const pickRow = (value, title, sub, checked) =>
  `<label class="pick__row"><input type="radio" name="pick" value="${esc(value)}" ${checked ? 'checked' : ''}><span class="pick__dot" aria-hidden="true"></span><span class="pick__body"><span>${esc(title)}</span>${sub ? `<small>${sub}</small>` : ''}</span></label>`;

/** Ce qui reste dans un budget sur le mois de la date saisie. */
function remaining(c, key) {
  const spent = sum(monthTransactions(key).filter(t => t.type === 'expense' && t.categoryId === c.id));
  const left = c.budget - spent;
  return left >= 0 ? `reste ${esc(formatEURRound(left))}` : `<span class="is-over">dépassé de ${esc(formatEURRound(-left))}</span>`;
}

/**
 * Dépense : les budgets suivis (les plus utilisés d'abord), puis « Hors budget » avec les autres
 * catégories dans une liste. Rentrée : les catégories de revenus.
 */
function renderPick({ keep = true } = {}) {
  const f = form();
  const type = f.elements.type.value;
  const previous = keep ? f.querySelector('[name="pick"]:checked')?.value : null;
  const previousOther = keep ? f.elements.otherCategory?.value : null;
  const key = (f.elements.date.value || todayKey()).slice(0, 7);
  const cats = categoriesByUsage(type);
  let html;
  if (type === 'income') {
    $('#notePickLabel').textContent = 'Quelle rentrée ?';
    const current = cats.some(c => c.id === previous) ? previous : cats[0]?.id;
    // Rappels : salaire habituel, primes déjà reçues dans l'année.
    const salary = salaryCategoryIds();
    const primes = primeCategoryIds();
    const usual = salaryHistory().usual;
    const year = key.slice(0, 4);
    const primeTotal = sum(state.transactions.filter(t => t.type === 'income' && primes.has(t.categoryId) && t.date.startsWith(year)));
    const hint = c => (salary.has(c.id) && usual ? `habituel ≈ ${esc(formatEURRound(usual))}` : primes.has(c.id) && primeTotal ? `déjà ${esc(formatEURRound(primeTotal))} en ${year}` : '');
    html = cats.map(c => pickRow(c.id, `${c.icon} ${c.name}`, hint(c), c.id === current)).join('');
  } else {
    $('#notePickLabel').textContent = 'Dans quel budget ?';
    const tracked = cats.filter(c => c.budget);
    const others = cats.filter(c => !c.budget);
    const current = [...tracked.map(c => c.id), OTHER].includes(previous) ? previous : tracked[0]?.id || OTHER;
    const options = others.map(c => `<option value="${esc(c.id)}" ${c.id === previousOther ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('');
    html =
      tracked.map(c => pickRow(c.id, `${c.icon} ${c.name}`, remaining(c, key), c.id === current)).join('') +
      (others.length
        ? `<div class="pick__other">${pickRow(OTHER, 'Hors budget', 'noté, mais pas suivi', current === OTHER)}<select class="input select pick__select" name="otherCategory" aria-label="Catégorie hors budget">${options}</select></div>`
        : '') +
      (tracked.length ? '' : `<p class="pick__hint">Aucun budget suivi. <button type="button" class="link-btn" data-open-settings="categories">Choisir un budget à suivre</button></p>`);
  }
  $('#notePick').innerHTML = html;
}

let showAll = false;

/** Dernières saisies ; « Voir plus » : tout le mois en cours et le mois précédent, par mois. */
function renderRecent() {
  // Même jour : la dernière notée en tête (tri stable sur la liste inversée). Avec les dépenses reliées.
  const list = [...allTransactions()]
    .reverse()
    .filter(t => t.type !== 'saving')
    .sort((a, b) => b.date.localeCompare(a.date));
  const current = monthKey();
  const months = [current, shiftMonth(current, -1)];
  const extended = list.filter(t => months.includes(t.date.slice(0, 7)));
  const host = $('#noteRecent');
  const more = $('#noteMore');
  if (!list.length) {
    host.innerHTML = `<div class="empty-state"><span class="empty-state__icon">${icon('edit', 22)}</span><p>Rien de noté pour l’instant.</p></div>`;
    more.hidden = true;
    return;
  }
  more.hidden = extended.length <= RECENT;
  more.textContent = showAll ? 'Voir moins' : `Voir plus · ${extended.length} saisies sur 2 mois`;
  more.setAttribute('aria-expanded', String(showAll));
  if (!showAll || more.hidden) {
    host.innerHTML = list.slice(0, RECENT).map(t => txRowHTML(t, { showDate: true })).join('');
    return;
  }
  host.innerHTML = months
    .map(m => {
      const rows = extended.filter(t => t.date.startsWith(m));
      return `<div class="recent-month"><span>${esc(monthLabel(m))}</span><span>${rows.length} saisie${rows.length > 1 ? 's' : ''}</span></div>${
        rows.length ? rows.map(t => txRowHTML(t, { showDate: true })).join('') : '<p class="check-empty">Rien de noté ce mois-là.</p>'
      }`;
    })
    .join('');
}

export function renderNote() {
  const f = form();
  if (!f.elements.date.value) f.elements.date.value = todayKey();
  renderPick();
  renderRecent();
}

const schema = {
  amount: amountRules,
  date: [rules.date({ required: true })],
  note: [rules.maxLength(200)]
};

function onSubmit(e) {
  e.preventDefault();
  const f = form();
  const v = formValues(f);
  const { valid, errors } = validate(v, schema);
  const categoryId = v.pick === OTHER ? v.otherCategory : v.pick;
  if (!categoryId) errors.pick = v.type === 'income' ? 'Choisissez le type de rentrée.' : 'Choisissez un budget.';
  if (!valid || errors.pick) return showErrors(f, errors);

  const tx = { id: uid(), type: v.type, amount: toCents(v.amount), date: v.date, note: v.note, categoryId };
  const slices = ['transactions'];
  if (v.repeat) {
    // Charge fixe ou salaire : saisi automatiquement les mois suivants (même jour, 28 au plus).
    const month = v.date.slice(0, 7);
    const rec = { id: uid(), type: v.type, label: v.note || categoryById(categoryId)?.name || 'Chaque mois', amount: tx.amount, categoryId, day: Math.min(28, Number(v.date.slice(8, 10))), start: month, lastGenerated: month, active: true };
    state.recurring.push(rec);
    tx.recurringId = rec.id;
    slices.push('recurring');
  }
  state.transactions.push(tx);
  f.elements.amount.value = '';
  f.elements.note.value = '';
  f.elements.repeat.checked = false;
  commit(slices);
  toast(`${v.type === 'income' ? 'Rentrée enregistrée' : 'Dépense enregistrée'} · ${formatEUR(tx.amount)}${v.repeat ? ' · chaque mois' : ''}`);
  if (v.date.slice(0, 7) !== monthKey()) toast('Notée sur un autre mois', { type: 'info' });
}

export function initNote() {
  $('#noteMore').addEventListener('click', () => {
    showAll = !showAll;
    renderRecent();
  });
  const f = form();
  f.addEventListener('submit', onSubmit);
  f.addEventListener('change', e => {
    const name = e.target.name;
    if (name === 'type' || name === 'date') {
      clearErrors(f);
      f.querySelectorAll('.field-error').forEach(x => x.remove());
      renderPick({ keep: name === 'date' });
    }
    if (name === 'pick') f.querySelector('.pick .field-error')?.remove();
    // Choisir une catégorie hors budget coche la ligne « Hors budget ».
    if (name === 'otherCategory') f.querySelector(`[name="pick"][value="${OTHER}"]`).checked = true;
  });
}
