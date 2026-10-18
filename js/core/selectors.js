/* Calculs dérivés : totaux du mois, budgets, objectifs, historique. */
import { state } from './store.js';
import { sum } from './money.js';
import { dateKey, addDays } from './dates.js';

const pad = n => String(n).padStart(2, '0');

export const monthKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}
export const monthDate = key => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
export const daysInMonth = key => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();

export const categoryById = id => state.categories.find(c => c.id === id);
export const goalById = id => state.goals.find(g => g.id === id);
export const expenseCategories = () => state.categories.filter(c => c.kind === 'expense');
export const incomeCategories = () => state.categories.filter(c => c.kind === 'income');

/**
 * Catégories d'un type (saisie rapide), les plus utilisées sur les `days` derniers
 * jours en premier ; à égalité, l'ordre d'origine (celui des Réglages) est conservé.
 */
export function categoriesByUsage(kind, { days = 90, now = new Date() } = {}) {
  const from = dateKey(addDays(now, -days));
  const to = dateKey(now);
  const uses = new Map();
  state.transactions.forEach(t => {
    if (t.type === kind && t.date >= from && t.date <= to) uses.set(t.categoryId, (uses.get(t.categoryId) || 0) + 1);
  });
  return state.categories
    .filter(c => c.kind === kind)
    .map((c, index) => ({ c, index, n: uses.get(c.id) || 0 }))
    .sort((a, b) => b.n - a.n || a.index - b.index)
    .map(x => x.c);
}

/** Opérations saisies ici + dépenses reliées (Mon Garage, Ma Maison), en lecture seule. */
export const allTransactions = () => (state.linked?.length ? [...state.transactions, ...state.linked].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)) : state.transactions);
export const monthTransactions = key => allTransactions().filter(t => t.date.startsWith(key));

/** Revenus, dépenses (dont frais fixes = charges récurrentes), épargne d'un mois. */
export function monthSummary(key) {
  const list = monthTransactions(key);
  const expenses = list.filter(t => t.type === 'expense');
  const income = sum(list.filter(t => t.type === 'income'));
  const expense = sum(expenses);
  const fixed = sum(expenses.filter(t => t.recurringId));
  const saving = sum(list.filter(t => t.type === 'saving'));
  return { income, expense, fixed, variable: expense - fixed, saving, count: list.length };
}

/** Catégories de revenu « salaire » (identifiant d'origine ou nom contenant « salaire »). */
export const salaryCategoryIds = () => new Set(incomeCategories().filter(c => c.id === 'salaire' || /salaire/i.test(c.name)).map(c => c.id));

/** Salaire perçu chaque mois sur les N derniers mois (du plus ancien au plus récent). */
export function salaryMonths(n = 24, end = monthKey()) {
  const ids = salaryCategoryIds();
  const list = state.transactions.filter(t => t.type === 'income' && ids.has(t.categoryId));
  return Array.from({ length: n }, (_, i) => shiftMonth(end, i - n + 1)).map(key => ({ key, amount: sum(list.filter(t => t.date.startsWith(key))) }));
}

/** Dépenses par catégorie du mois, avec budget et progression. */
export function categorySpending(key) {
  const list = monthTransactions(key).filter(t => t.type === 'expense');
  return expenseCategories().map(c => {
    const spent = sum(list.filter(t => t.categoryId === c.id));
    return { category: c, spent, budget: c.budget, ratio: c.budget ? spent / c.budget : null };
  });
}

/** Dépenses sans catégorie existante (catégorie supprimée). */
export function orphanSpending(key) {
  const ids = new Set(expenseCategories().map(c => c.id));
  return sum(monthTransactions(key).filter(t => t.type === 'expense' && !ids.has(t.categoryId)));
}

export const goalSaved = id => sum(state.transactions.filter(t => t.type === 'saving' && t.goalId === id));

/**
 * Rythme d'épargne moyen sur les 3 derniers mois (mois en cours inclus) et
 * date estimée d'atteinte de l'objectif.
 */
export function goalProjection(goal, now = new Date()) {
  const saved = goalSaved(goal.id);
  const remaining = Math.max(0, goal.target - saved);
  const months = [0, -1, -2].map(d => shiftMonth(monthKey(now), d));
  const recent = sum(state.transactions.filter(t => t.type === 'saving' && t.goalId === goal.id && months.some(m => t.date.startsWith(m))));
  const perMonth = recent / 3;
  let eta = null;
  if (remaining === 0) eta = 'done';
  else if (perMonth > 0) {
    const d = new Date(now.getFullYear(), now.getMonth() + Math.ceil(remaining / perMonth), 1);
    eta = d;
  }
  let needed = null;
  if (goal.deadline && remaining > 0) {
    const end = new Date(`${goal.deadline}T12:00:00`);
    const monthsLeft = Math.max(1, (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth() + 1);
    needed = Math.ceil(remaining / monthsLeft);
  }
  return { saved, remaining, ratio: goal.target ? Math.min(1, saved / goal.target) : 0, perMonth, eta, needed };
}

/** Série des N derniers mois (du plus ancien au plus récent). */
export function lastMonths(n = 12, end = monthKey()) {
  return Array.from({ length: n }, (_, i) => shiftMonth(end, i - n + 1)).map(key => ({ key, ...monthSummary(key) }));
}

/** Abonnements / charges récurrentes actives, avec coût annuel. */
export function recurringOverview() {
  const active = state.recurring.filter(r => r.active);
  const monthlyExpense = sum(active.filter(r => r.type === 'expense'));
  const monthlyIncome = sum(active.filter(r => r.type === 'income'));
  return { active, monthlyExpense, monthlyIncome, yearlyExpense: monthlyExpense * 12 };
}

/* ---------- Suivi : budgets choisis, charges fixes, moyennes ---------- */

/** Occurrence d'une charge récurrente dans un mois, déjà saisie (ou générée) ? */
const recurringTx = (list, r) => list.find(t => t.recurringId === r.id);
const activeExpenseRecurring = key => state.recurring.filter(r => r.active && r.type === 'expense' && r.start <= key);

/**
 * Budgets suivis (catégories de dépense avec un plafond) : dépensé, cumul jour par jour et
 * projection à la fin du mois. Les charges récurrentes de la catégorie comptent une fois
 * (pas extrapolées) ; celles qui n'ont pas encore été prélevées ce mois-ci sont ajoutées.
 */
export function budgetTracking(key, now = new Date()) {
  const current = monthKey(now);
  const status = key === current ? 'current' : key < current ? 'past' : 'future';
  const days = daysInMonth(key);
  const today = status === 'current' ? now.getDate() : status === 'past' ? days : 0;
  const month = monthTransactions(key).filter(t => t.type === 'expense');
  return expenseCategories()
    .filter(c => c.budget)
    .map(c => {
      const list = month.filter(t => t.categoryId === c.id);
      const spent = sum(list);
      const daily = Array(days).fill(0);
      list.forEach(t => (daily[Number(t.date.slice(8, 10)) - 1] += t.amount));
      let acc = 0;
      const cumul = daily.map(v => (acc += v));
      const fixed = sum(list.filter(t => t.recurringId));
      const pending = sum(activeExpenseRecurring(key).filter(r => r.categoryId === c.id && !recurringTx(list, r)));
      let projected = spent;
      if (status === 'current') projected = Math.round(fixed + pending + ((spent - fixed) / today) * days);
      else if (status === 'future') projected = spent + pending;
      return { category: c, spent, budget: c.budget, projected, cumul, today, days, status };
    });
}

/** Charges fixes d'un mois : chaque charge récurrente active, prélevée ou à venir. */
export function fixedCharges(key) {
  const txs = monthTransactions(key).filter(t => t.type === 'expense' && t.recurringId);
  const days = daysInMonth(key);
  const rows = activeExpenseRecurring(key).map(r => {
    const tx = recurringTx(txs, r);
    return { id: r.id, label: r.label, categoryId: r.categoryId, amount: tx ? tx.amount : r.amount, day: tx ? Number(tx.date.slice(8, 10)) : Math.min(r.day, days), paid: Boolean(tx), tx };
  });
  // Occurrences d'une charge arrêtée depuis (ou supprimée) : déjà payées ce mois-là.
  txs.filter(t => !rows.some(r => r.tx === t)).forEach(t => rows.push({ id: t.recurringId, label: t.note || 'Charge fixe', categoryId: t.categoryId, amount: t.amount, day: Number(t.date.slice(8, 10)), paid: true, tx: t }));
  rows.sort((a, b) => a.day - b.day || b.amount - a.amount);
  const planned = sum(rows);
  const paid = sum(rows.filter(r => r.paid));
  return { rows, planned, paid, count: rows.length, paidCount: rows.filter(r => r.paid).length };
}

/** Total des charges fixes prélevées chaque mois (du plus ancien au plus récent). */
export function fixedByMonth(n = 12, end = monthKey()) {
  const list = state.transactions.filter(t => t.type === 'expense' && t.recurringId);
  return Array.from({ length: n }, (_, i) => shiftMonth(end, i - n + 1)).map(key => ({ key, amount: sum(list.filter(t => t.date.startsWith(key))) }));
}

/**
 * Charges fixes par année : moyenne mensuelle sur les mois où au moins une charge a été
 * prélevée (une année en cours ou commencée en route reste comparable aux autres ; le mois
 * en cours, incomplet, n'est pas compté).
 */
export function fixedByYear(maxYears = 5, end = monthKey()) {
  const list = state.transactions.filter(t => t.type === 'expense' && t.recurringId && t.date.slice(0, 7) <= end);
  const last = Number(end.slice(0, 4));
  const first = Math.max(last - maxYears + 1, list.reduce((y, t) => Math.min(y, Number(t.date.slice(0, 4))), last));
  return Array.from({ length: last - first + 1 }, (_, i) => String(first + i)).map(year => {
    let items = list.filter(t => t.date.startsWith(year));
    // Mois en cours pas encore complet : écarté, sauf s'il est le seul de l'année.
    const now = monthKey();
    if (items.some(t => !t.date.startsWith(now))) items = items.filter(t => !t.date.startsWith(now));
    const months = new Set(items.map(t => t.date.slice(0, 7))).size;
    return { key: year, total: sum(items), months, average: months ? Math.round(sum(items) / months) : 0 };
  });
}

/** Les N mois complets précédant `end` qui contiennent au moins une opération. */
export function completeMonths(n = 6, end = monthKey()) {
  return Array.from({ length: n }, (_, i) => shiftMonth(end, -1 - i)).filter(key => monthTransactions(key).length > 0);
}

/**
 * Moyenne mensuelle des dépenses par catégorie, hors charges fixes, sur les mois complets
 * récents : de quoi ajuster les plafonds.
 */
export function categoryAverages(n = 6, end = monthKey()) {
  const months = completeMonths(n, end);
  if (!months.length) return { months, rows: [] };
  const set = new Set(months);
  const list = allTransactions().filter(t => t.type === 'expense' && !t.recurringId && set.has(t.date.slice(0, 7)));
  const rows = expenseCategories()
    .map(c => {
      const own = list.filter(t => t.categoryId === c.id);
      const perMonth = months.map(m => sum(own.filter(t => t.date.startsWith(m))));
      return { category: c, average: Math.round(sum(own) / months.length), highest: Math.max(...perMonth), budget: c.budget };
    })
    .filter(r => r.average > 0 || r.budget)
    .sort((a, b) => b.average - a.average);
  return { months, rows };
}

/* ---------- Tendances d'un budget ---------- */

const spentIn = (categoryId, prefix, maxDay = 31) =>
  sum(allTransactions().filter(t => t.type === 'expense' && t.categoryId === categoryId && t.date.startsWith(prefix) && Number(t.date.slice(8, 10)) <= maxDay));

/**
 * Tendances d'une catégorie pour le mois `key` :
 * - `month` : ce mois face au mois précédent, au même jour pour le mois en cours (mois entiers sinon) ;
 * - `year` : moyenne mensuelle de l'année (mois complets) face à celle de l'année précédente.
 * Chaque tendance vaut null quand la comparaison n'a pas de base.
 */
export function budgetTrends(categoryId, key, now = new Date()) {
  const current = monthKey(now);
  const prev = shiftMonth(key, -1);
  const day = key === current ? Math.min(now.getDate(), daysInMonth(prev)) : 31;
  const a = spentIn(categoryId, key, key === current ? now.getDate() : 31);
  const b = spentIn(categoryId, prev, day);
  const month = b ? { now: a, before: b, pct: ((a - b) / b) * 100, day: key === current ? now.getDate() : null, prev } : null;

  // Mois complets de l'année du mois affiché (le mois en cours ne compte pas).
  const year = key.slice(0, 4);
  const lastFull = key < current ? key : shiftMonth(current, -1);
  const months = year => Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`).filter(m => m <= lastFull && monthTransactions(m).length > 0);
  const avg = list => (list.length ? sum(list, m => spentIn(categoryId, m)) / list.length : 0);
  const thisYear = months(year).filter(m => m.startsWith(year));
  const lastYear = months(String(Number(year) - 1));
  const y1 = avg(thisYear);
  const y0 = avg(lastYear);
  const yearTrend = thisYear.length && y0 ? { now: Math.round(y1), before: Math.round(y0), pct: ((y1 - y0) / y0) * 100 } : null;
  return { month, year: yearTrend };
}

/* ---------- Salaire : niveau habituel et augmentations ---------- */

/** Écart à partir duquel un changement de salaire compte (les petites variations mensuelles sont ignorées). */
export const RAISE_THRESHOLD = 0.015;

/**
 * Salaire habituel (moyenne des 3 derniers salaires depuis le dernier changement) et changements durables : un changement
 * est retenu quand deux mois de suite s'écartent de plus de 1,5 % du niveau précédent, dans le
 * même sens. Le niveau suit ensuite la moyenne des mois qui restent dans la bande.
 */
export function salaryHistory(end = monthKey()) {
  const ids = salaryCategoryIds();
  const list = state.transactions.filter(t => t.type === 'income' && ids.has(t.categoryId) && t.date.slice(0, 7) <= end);
  const byMonth = new Map();
  list.forEach(t => byMonth.set(t.date.slice(0, 7), (byMonth.get(t.date.slice(0, 7)) || 0) + t.amount));
  const paid = [...byMonth.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([key, amount]) => ({ key, amount }));
  if (!paid.length) return { usual: 0, last: null, changes: [] };
  const changes = [];
  let band = [paid[0].amount];
  const level = () => sum(band, v => v) / band.length;
  for (let i = 1; i < paid.length; i++) {
    const ref = level();
    const d1 = (paid[i].amount - ref) / ref;
    const next = paid[i + 1];
    const d2 = next ? (next.amount - ref) / ref : 0;
    if (Math.abs(d1) > RAISE_THRESHOLD && next && Math.abs(d2) > RAISE_THRESHOLD && Math.sign(d1) === Math.sign(d2)) {
      const to = (paid[i].amount + next.amount) / 2;
      changes.push({ key: paid[i].key, from: Math.round(ref), to: Math.round(to), pct: ((to - ref) / ref) * 100 });
      band = [paid[i].amount, next.amount];
      i++;
    } else if (Math.abs(d1) <= RAISE_THRESHOLD) {
      band = [...band.slice(-2), paid[i].amount];
    }
  }
  return { usual: Math.round(level()), last: paid[paid.length - 1], changes: changes.reverse() };
}

/* ---------- Primes par année ---------- */

export const primeCategoryIds = () => new Set(incomeCategories().filter(c => c.id === 'prime' || /prime/i.test(c.name)).map(c => c.id));

/** Primes reçues par année (les `n` dernières), et ce que l'an dernier avait reçu après le mois en cours. */
export function primesByYear(n = 3, now = new Date()) {
  const ids = primeCategoryIds();
  const list = state.transactions.filter(t => t.type === 'income' && ids.has(t.categoryId));
  const current = now.getFullYear();
  const years = Array.from({ length: n }, (_, i) => String(current - n + 1 + i)).map(year => ({ year, total: sum(list.filter(t => t.date.startsWith(year))) }));
  const month = monthKey(now).slice(5);
  const lastYear = String(current - 1);
  const laterLastYear = sum(list.filter(t => t.date.startsWith(lastYear) && t.date.slice(5, 7) > month));
  // Années d'avant la première prime : pas affichées.
  const first = years.findIndex(y => y.total);
  return { years: first === -1 ? [] : years.slice(first), laterLastYear, thisYear: years[years.length - 1]?.total || 0 };
}
