/*
 * Schéma et normalisation des données du budget.
 * Toute donnée lue (localStorage ou Firebase) passe par ici.
 */
import { uid } from './utils.js';
import { isDateKey } from './dates.js';

export const TYPES = { expense: 'Dépense', income: 'Revenu', saving: 'Épargne' };
export const COLOR_SLOTS = 8;

export const DEFAULT_CATEGORIES = [
  { id: 'logement', kind: 'expense', name: 'Logement', icon: '🏠', budget: null, color: 0 },
  { id: 'courses', kind: 'expense', name: 'Courses', icon: '🛒', budget: null, color: 1 },
  { id: 'transport', kind: 'expense', name: 'Transport', icon: '🚗', budget: null, color: 2 },
  { id: 'sport', kind: 'expense', name: 'Sport', icon: '🚴', budget: null, color: 3 },
  { id: 'loisirs', kind: 'expense', name: 'Loisirs', icon: '🎬', budget: null, color: 4 },
  { id: 'restaurants', kind: 'expense', name: 'Restaurants', icon: '🍽️', budget: null, color: 5 },
  { id: 'sante', kind: 'expense', name: 'Santé', icon: '💊', budget: null, color: 6 },
  { id: 'abonnements', kind: 'expense', name: 'Abonnements', icon: '📱', budget: null, color: 7 },
  { id: 'shopping', kind: 'expense', name: 'Shopping', icon: '🛍️', budget: null, color: 0 },
  { id: 'divers', kind: 'expense', name: 'Divers', icon: '📦', budget: null, color: 1 },
  { id: 'salaire', kind: 'income', name: 'Salaire', icon: '💼', budget: null, color: 0 },
  { id: 'prime', kind: 'income', name: 'Prime', icon: '🎁', budget: null, color: 1 },
  { id: 'remboursement', kind: 'income', name: 'Remboursement', icon: '↩️', budget: null, color: 2 },
  { id: 'autre-revenu', kind: 'income', name: 'Autre revenu', icon: '➕', budget: null, color: 3 }
];

export const asArray = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 200) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)).slice(0, max);
const cents = v => (Number.isSafeInteger(v) && v > 0 ? v : null);
const isMonth = v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function normalizeCategories(raw) {
  const list = asArray(raw)
    .filter(isObj)
    .map(c => ({
      id: str(c.id, 60) || uid(),
      kind: c.kind === 'income' ? 'income' : 'expense',
      name: str(c.name, 40).trim(),
      icon: str(c.icon, 8) || '•',
      budget: cents(c.budget),
      color: Number.isInteger(c.color) ? ((c.color % COLOR_SLOTS) + COLOR_SLOTS) % COLOR_SLOTS : 0
    }))
    .filter(c => c.name);
  const unique = [...new Map(list.map(c => [c.id, c])).values()];
  return unique.length ? unique : DEFAULT_CATEGORIES.map(c => ({ ...c }));
}

export function normalizeTransactions(raw) {
  const list = asArray(raw)
    .filter(isObj)
    .map(t => {
      const type = TYPES[t.type] ? t.type : 'expense';
      const item = { id: str(t.id, 80) || uid(), type, amount: cents(t.amount), date: t.date, note: str(t.note, 200) };
      if (type === 'saving') item.goalId = str(t.goalId, 60);
      else item.categoryId = str(t.categoryId, 60);
      if (t.recurringId) item.recurringId = str(t.recurringId, 60);
      return item;
    })
    .filter(t => t.amount !== null && isDateKey(t.date));
  // Dédoublonnage par identifiant (les opérations récurrentes ont un id déterministe).
  return [...new Map(list.map(t => [t.id, t])).values()].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function normalizeRecurring(raw) {
  return asArray(raw)
    .filter(isObj)
    .map(r => ({
      id: str(r.id, 60) || uid(),
      type: r.type === 'income' ? 'income' : 'expense',
      label: str(r.label, 60).trim(),
      amount: cents(r.amount),
      categoryId: str(r.categoryId, 60),
      day: Math.min(28, Math.max(1, Number.parseInt(r.day, 10) || 1)),
      start: isMonth(r.start) ? r.start : '',
      lastGenerated: isMonth(r.lastGenerated) ? r.lastGenerated : '',
      active: r.active !== false
    }))
    .filter(r => r.label && r.amount !== null && r.start);
}

export function normalizeGoals(raw) {
  return asArray(raw)
    .filter(isObj)
    .map(g => ({
      id: str(g.id, 60) || uid(),
      name: str(g.name, 40).trim(),
      icon: str(g.icon, 8) || '🎯',
      target: cents(g.target),
      deadline: isDateKey(g.deadline) ? g.deadline : '',
      color: Number.isInteger(g.color) ? ((g.color % COLOR_SLOTS) + COLOR_SLOTS) % COLOR_SLOTS : 0
    }))
    .filter(g => g.name && g.target !== null);
}

export const normalizeTheme = v => (v === 'light' ? 'light' : 'dark');
export { isMonth };
