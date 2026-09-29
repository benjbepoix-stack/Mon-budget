/* Vue « Épargne » : objectifs, progression, projection, versements. */
import { $, esc, uid } from '../core/utils.js';
import { formatKey, todayKey } from '../core/dates.js';
import { formatEUR, formatEURRound, toCents, centsToInput, sum } from '../core/money.js';
import { state, commit } from '../core/store.js';
import { goalProjection, monthKey } from '../core/selectors.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { slotColor, renderEmojiPicker } from './common.js';
import { openTx } from './quickadd.js';
import { COLOR_SLOTS } from '../core/schema.js';

function projectionText(goal, p) {
  if (p.eta === 'done') return `<span class="goal__eta is-done">${icon('check', 14)} Objectif atteint</span>`;
  const parts = [];
  if (p.eta) parts.push(`À ce rythme : atteint en <strong>${p.eta.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</strong>`);
  else parts.push('Aucun versement ces 3 derniers mois');
  if (p.needed) parts.push(`Pour le ${formatKey(goal.deadline)} : <strong>${formatEURRound(p.needed)}/mois</strong>`);
  return parts.map(x => `<span class="goal__eta">${x}</span>`).join('');
}

export function renderGoals() {
  const savings = state.transactions.filter(t => t.type === 'saving');
  const total = sum(savings);
  const thisMonth = sum(savings.filter(t => t.date.startsWith(monthKey())));
  const targets = sum(state.goals, g => g.target);
  $('#savingsHero').innerHTML = `
    <div class="balance__label">Total épargné</div>
    <div class="balance__value">${formatEUR(total)}</div>
    <div class="balance__stats balance__stats--2">
      <div><span>Ce mois-ci</span><strong>${formatEUR(thisMonth)}</strong></div>
      <div><span>Objectifs cumulés</span><strong>${formatEURRound(targets)}</strong></div>
    </div>`;

  const host = $('#goalList');
  if (!state.goals.length) {
    host.innerHTML = `<div class="empty-state"><span class="empty-state__icon">${icon('piggy', 22)}</span><p>Créez un objectif (vacances, vélo, apport…) pour suivre votre épargne.</p><button type="button" class="btn btn--soft btn--sm" data-goal-add>${icon('plus', 16)}<span>Nouvel objectif</span></button></div>`;
    return;
  }
  host.innerHTML = state.goals
    .map(g => {
      const p = goalProjection(g);
      const color = slotColor(g.color);
      return `<article class="goal card" data-goal="${esc(g.id)}" style="--c:${color}">
        <header class="goal__head">
          <span class="goal__icon" aria-hidden="true">${esc(g.icon)}</span>
          <div class="goal__titles"><h3 class="goal__name">${esc(g.name)}</h3><p class="goal__amounts"><strong>${formatEUR(p.saved)}</strong> / ${formatEURRound(g.target)}</p></div>
          <span class="goal__pct">${Math.round(p.ratio * 100)} %</span>
        </header>
        <div class="gauge__track goal__track" role="progressbar" aria-label="Progression ${esc(g.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.ratio * 100)}"><div class="gauge__fill" style="--value:${p.ratio * 100}%"></div></div>
        <div class="goal__meta">${projectionText(g, p)}${p.remaining > 0 ? `<span class="goal__eta">Reste ${formatEUR(p.remaining)}</span>` : ''}</div>
        <footer class="goal__actions">
          <button type="button" class="btn btn--add btn--sm" data-goal-deposit>${icon('plus', 16)}<span>Verser</span></button>
          <button type="button" class="icon-btn" data-goal-edit aria-label="Modifier l’objectif">${icon('edit', 18)}</button>
        </footer>
      </article>`;
    })
    .join('');
}

/* ---------- Formulaire ---------- */
function openGoal(id = null) {
  const g = id ? state.goals.find(x => x.id === id) : null;
  const f = $('#goalForm');
  f.reset();
  clearErrors(f);
  f.elements.editId.value = g?.id || '';
  f.elements.name.value = g?.name || '';
  f.elements.target.value = g ? centsToInput(g.target) : '';
  f.elements.deadline.value = g?.deadline || '';
  renderEmojiPicker('goalForm', g?.icon);
  $('#goalTitle').textContent = g ? 'Modifier l’objectif' : 'Nouvel objectif';
  $('#goalDelete').hidden = !g;
  openSheet('goalSheet', { focus: false });
}

const schema = {
  name: [rules.required('Le nom'), rules.maxLength(40)],
  target: [rules.required('Le montant visé'), v => (toCents(v) === null || toCents(v) <= 0 ? 'Montant invalide (ex. 1500).' : null)],
  deadline: [rules.date(), v => (v && v < todayKey() ? 'L’échéance est déjà passée.' : null)]
};

function onSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = formValues(f);
  const { valid, errors } = validate(v, schema);
  if (!valid) return showErrors(f, errors);
  const existing = v.editId ? state.goals.find(g => g.id === v.editId) : null;
  const goal = { id: existing?.id || uid(), name: v.name, icon: v.icon, target: toCents(v.target), deadline: v.deadline, color: existing?.color ?? state.goals.length % COLOR_SLOTS };
  if (existing) state.goals[state.goals.indexOf(existing)] = goal;
  else state.goals.push(goal);
  commit('goals');
  closeSheet('goalSheet');
  toast(existing ? 'Objectif modifié' : 'Objectif créé');
}

async function onDelete() {
  const id = $('#goalForm').elements.editId.value;
  const g = state.goals.find(x => x.id === id);
  if (!g) return;
  const deposits = state.transactions.filter(t => t.type === 'saving' && t.goalId === id);
  const ok = await confirmDialog({
    title: `Supprimer « ${g.name} » ?`,
    message: deposits.length ? `Ses ${deposits.length} versement(s) seront aussi supprimés.` : 'Cette action est définitive.',
    confirmLabel: 'Supprimer',
    danger: true
  });
  if (!ok) return;
  state.goals = state.goals.filter(x => x.id !== id);
  state.transactions = state.transactions.filter(t => !(t.type === 'saving' && t.goalId === id));
  commit(['goals', 'transactions']);
  closeSheet('goalSheet');
  toast('Objectif supprimé');
}

export function initGoals() {
  document.addEventListener('click', e => {
    if (e.target.closest('[data-goal-add]')) return openGoal();
    const card = e.target.closest('[data-goal]');
    if (!card) return;
    if (e.target.closest('[data-goal-edit]')) openGoal(card.dataset.goal);
    else if (e.target.closest('[data-goal-deposit]')) openTx({ type: 'saving', goalId: card.dataset.goal });
  });
  $('#goalForm').addEventListener('submit', onSubmit);
  $('#goalDelete').addEventListener('click', onDelete);
}
