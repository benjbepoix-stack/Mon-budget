/* Calculs dérivés : totaux du mois, budgets, objectifs, historique. */
import { state } from './store.js';
import { sum } from './money.js';

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
