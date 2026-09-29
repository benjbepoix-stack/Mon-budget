/* Mois affiché, partagé par les onglets « Mois » et « Opérations ». */
import { monthKey } from './selectors.js';

let current = monthKey();
const listeners = new Set();

export const getMonth = () => current;
export const isCurrentMonth = () => current === monthKey();
export function setMonth(key) {
  if (key === current) return;
  current = key;
  listeners.forEach(fn => fn(key));
}
export const onMonthChange = fn => listeners.add(fn);
