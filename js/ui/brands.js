/*
 * Pastilles des services connus (Netflix, Spotify, Amazon Prime…), reconnus au nom de la
 * charge récurrente. Pas d'image : un rond aux couleurs du service avec une ou deux lettres,
 * léger, hors ligne et lisible en clair comme en sombre. Inconnu : l'icône de la catégorie.
 */
import { esc } from '../core/utils.js';

/** [motif du nom, fond, couleur du texte, texte de la pastille] — le premier qui correspond gagne. */
const BRANDS = [
  [/netflix/i, '#000000', '#e50914', 'N'],
  [/spotify/i, '#1db954', '#000000', '♫'],
  [/deezer/i, '#a238ff', '#ffffff', 'dz'],
  [/prime\s*video/i, '#00a8e1', '#ffffff', 'pv'],
  [/amazon/i, '#ffffff', '#111111', 'a', '#ff9900'],
  [/disney/i, '#0e2a8a', '#ffffff', 'D+'],
  [/canal/i, '#000000', '#ffffff', 'C+'],
  [/paramount/i, '#0064ff', '#ffffff', 'P+'],
  [/\bmax\b|hbo/i, '#002be7', '#ffffff', 'max'],
  [/crunchyroll/i, '#f47521', '#ffffff', 'cr'],
  [/youtube/i, '#ff0000', '#ffffff', '▶'],
  [/twitch/i, '#9146ff', '#ffffff', 'tw'],
  [/apple\s*tv/i, '#000000', '#ffffff', 'tv'],
  [/apple\s*music/i, '#fa2d48', '#ffffff', '♪'],
  [/icloud/i, '#ffffff', '#3693f3', '☁'],
  [/apple/i, '#000000', '#ffffff', 'A'],
  [/google/i, '#ffffff', '#4285f4', 'G'],
  [/microsoft|office|365/i, '#d83b01', '#ffffff', 'M'],
  [/xbox|game\s*pass/i, '#107c10', '#ffffff', 'X'],
  [/playstation|\bps\s*(plus|\+)/i, '#003791', '#ffffff', 'PS'],
  [/nintendo/i, '#e60012', '#ffffff', 'N'],
  [/adobe/i, '#fa0f00', '#ffffff', 'Ad'],
  [/dropbox/i, '#0061ff', '#ffffff', 'db'],
  [/chatgpt|openai/i, '#10a37f', '#ffffff', 'AI'],
  [/claude/i, '#d97757', '#ffffff', 'C'],
  [/audible/i, '#f8991c', '#000000', 'au'],
  [/basic[\s-]*fit/i, '#f47920', '#ffffff', 'BF'],
  [/fitness\s*park/i, '#e30613', '#ffffff', 'FP'],
  [/keep\s*cool/i, '#e6007e', '#ffffff', 'KC'],
  [/on\s*air|neoness|l'orange bleue|orange bleue/i, '#0050a0', '#ffffff', 'OB'],
  [/deliveroo/i, '#00ccbc', '#ffffff', 'dl'],
  [/uber/i, '#000000', '#ffffff', 'U'],
  [/free\b|freebox/i, '#cd1e25', '#ffffff', 'f'],
  [/sfr/i, '#e2001a', '#ffffff', 'SFR'],
  [/bouygues|b&you/i, '#00295f', '#ffffff', 'B'],
  [/orange|sosh/i, '#ff7900', '#000000', 'o'],
  [/edf/i, '#ff5f00', '#ffffff', 'edf'],
  [/engie/i, '#00aaff', '#ffffff', 'en'],
  [/total\s*energies/i, '#ed0000', '#ffffff', 'TE']
];

/** Service reconnu d'après le nom, ou null. */
export function brandOf(label = '') {
  const b = BRANDS.find(([re]) => re.test(label));
  return b ? { bg: b[1], fg: b[2], text: b[3], mark: b[4] || '' } : null;
}

/**
 * Pastille ronde : service reconnu (couleurs du service) ou repli (icône de catégorie
 * sur fond teinté de sa couleur). `kind: 'income'` : billet sur fond accent.
 */
export function brandBadge({ label, emoji, color, kind = 'expense', size = 40 }) {
  const style = `--size:${size}px`;
  if (kind === 'income') return `<span class="brand brand--income" style="${style}" aria-hidden="true">€</span>`;
  const b = brandOf(label);
  if (b) {
    const long = b.text.length > 2 ? ' brand--long' : b.text.length > 1 ? ' brand--duo' : '';
    const mark = b.mark ? `<i style="background:${b.mark}"></i>` : '';
    return `<span class="brand${long}" style="${style};--brand-bg:${b.bg};--brand-fg:${b.fg}" aria-hidden="true">${esc(b.text)}${mark}</span>`;
  }
  return `<span class="brand brand--cat" style="${style};--c:${color}" aria-hidden="true">${esc(emoji || '•')}</span>`;
}
