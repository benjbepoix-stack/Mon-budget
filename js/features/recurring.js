/*
 * Génération automatique des opérations récurrentes (loyer, abonnements,
 * salaire…). Chaque occurrence a un identifiant déterministe
 * « rec-<id>-<AAAA-MM> » : deux appareils qui la génèrent en même temps
 * produisent la même opération (pas de doublon). `lastGenerated` évite de
 * recréer une occurrence que vous avez supprimée volontairement.
 */
import { state, commit } from '../core/store.js';
import { monthKey, shiftMonth, daysInMonth } from '../core/selectors.js';

const pad = n => String(n).padStart(2, '0');
const MAX_BACKFILL = 24; // sécurité : jamais plus de 2 ans rattrapés d'un coup

export function generateRecurring(now = new Date()) {
  const current = monthKey(now);
  let created = 0;
  let touched = false;
  for (const r of state.recurring) {
    if (!r.active) continue;
    let m = r.lastGenerated ? shiftMonth(r.lastGenerated, 1) : r.start;
    let guard = 0;
    while (m <= current && guard++ < MAX_BACKFILL) {
      const day = Math.min(r.day, daysInMonth(m));
      if (m === current && now.getDate() < day) break;
      const id = `rec-${r.id}-${m}`;
      if (!state.transactions.some(t => t.id === id)) {
        state.transactions.push({ id, type: r.type, amount: r.amount, date: `${m}-${pad(day)}`, categoryId: r.categoryId, note: r.label, recurringId: r.id });
        created++;
      }
      r.lastGenerated = m;
      touched = true;
      m = shiftMonth(m, 1);
    }
  }
  if (touched) commit(['transactions', 'recurring']);
  return created;
}
