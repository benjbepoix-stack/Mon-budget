/*
 * Montants : toujours stockés en CENTIMES entiers pour éviter les erreurs
 * d'arrondi des nombres flottants (0,1 + 0,2 ≠ 0,3).
 */

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eurRound = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** « 12,5 » / « 12.50 » / « 1 234,56 » -> 1250 / 1250 / 123456 ; null si invalide. */
export function toCents(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(/[\s €]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return Number.isSafeInteger(n) ? n : null;
}

/** 123456 -> « 1 234,56 € » */
export const formatEUR = cents => eur.format((cents || 0) / 100);

/** 123456 -> « 1 235 € » (arrondi, pour les graphiques et grands totaux) */
export const formatEURRound = cents => eurRound.format(Math.round((cents || 0) / 100));

/** Signe explicite : +12,00 € / −12,00 € */
export const formatSigned = cents => `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${eur.format(Math.abs(cents || 0) / 100)}`;

/** 1250 -> « 12,50 » (valeur de champ de saisie) */
export const centsToInput = cents => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ','));

export const sum = (list, pick = x => x.amount) => list.reduce((s, x) => s + (pick(x) || 0), 0);
