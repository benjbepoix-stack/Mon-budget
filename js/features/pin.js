/*
 * Verrouillage par code PIN (4 chiffres), propre à chaque appareil.
 *
 * Le code n'est jamais stocké en clair : seule une empreinte SHA-256 salée
 * est conservée dans le localStorage de l'appareil. Après 5 erreurs, la saisie
 * est bloquée 30 secondes (puis de plus en plus longtemps).
 *
 * ⚠️ Ce verrou protège l'accès à l'application sur l'appareil ; il ne chiffre
 * pas les données et ne protège pas la base Firebase (voir README).
 */
import { $, $$ } from '../core/utils.js';
import { readJSON, write } from '../services/storage.js';
import { icon } from '../ui/icons.js';
import { confirmDialog } from '../ui/dialog.js';

const KEY = 'budget_pin';
const RELOCK_AFTER_MS = 60 * 1000;
const LENGTH = 4;

let entry = '';
let mode = 'unlock'; // unlock | create | confirm
let firstEntry = '';
let hiddenAt = null;
let onUnlocked = () => {};

const config = () => readJSON(KEY, null);

async function digest(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  if (!crypto?.subtle) return btoa(`${salt}:${pin}`); // repli (contexte non sécurisé, dev local)
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const randomSalt = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

export const hasPin = () => Boolean(config()?.hash);

function render(message = '', isError = false) {
  const titles = { unlock: 'Entrez votre code', create: 'Créez un code à 4 chiffres', confirm: 'Confirmez le code' };
  $('#pinTitle').textContent = titles[mode];
  const msg = $('#pinMessage');
  msg.textContent = message;
  msg.classList.toggle('is-error', isError);
  $$('#pinDots span').forEach((dot, i) => dot.classList.toggle('is-filled', i < entry.length));
  $('#pinForgot').hidden = mode !== 'unlock';
  $('#pinSkip').hidden = mode === 'unlock';
}

function shake() {
  const dots = $('#pinDots');
  dots.classList.remove('is-shaking');
  void dots.offsetWidth;
  dots.classList.add('is-shaking');
  navigator.vibrate?.(80);
}

function lockedFor() {
  const c = config();
  return c?.lockUntil && c.lockUntil > Date.now() ? Math.ceil((c.lockUntil - Date.now()) / 1000) : 0;
}

async function submit() {
  const pin = entry;
  entry = '';
  if (mode === 'create') {
    firstEntry = pin;
    mode = 'confirm';
    return render();
  }
  if (mode === 'confirm') {
    if (pin !== firstEntry) {
      mode = 'create';
      shake();
      return render('Les codes ne correspondent pas. Recommencez.', true);
    }
    const salt = randomSalt();
    write(KEY, JSON.stringify({ salt, hash: await digest(pin, salt), fails: 0 }));
    return unlock();
  }
  const c = config();
  if (!c) return unlock();
  const wait = lockedFor();
  if (wait) return render(`Trop d’essais. Réessayez dans ${wait} s.`, true);
  if ((await digest(pin, c.salt)) === c.hash) {
    write(KEY, JSON.stringify({ ...c, fails: 0, lockUntil: 0 }));
    return unlock();
  }
  const fails = (c.fails || 0) + 1;
  const lockUntil = fails >= 5 ? Date.now() + 30000 * 2 ** Math.min(fails - 5, 4) : 0;
  write(KEY, JSON.stringify({ ...c, fails, lockUntil }));
  shake();
  render(lockUntil ? `Trop d’essais. Réessayez dans ${Math.ceil((lockUntil - Date.now()) / 1000)} s.` : 'Code incorrect.', true);
}

function press(key) {
  if (key === 'back') entry = entry.slice(0, -1);
  else if (entry.length < LENGTH) entry += key;
  render();
  if (entry.length === LENGTH) setTimeout(submit, 120);
}

function unlock() {
  document.documentElement.classList.remove('is-pin-locked');
  $('#pinScreen').hidden = true;
  onUnlocked();
}

export function lock(newMode = hasPin() ? 'unlock' : 'create') {
  mode = newMode;
  entry = '';
  document.documentElement.classList.add('is-pin-locked');
  $('#pinScreen').hidden = false;
  render(lockedFor() ? `Trop d’essais. Réessayez dans ${lockedFor()} s.` : '');
}

/** Lance l'assistant de création/modification du code (depuis les réglages). */
export const changePin = () => lock('create');

/** Désactive le code sur cet appareil (l'app s'ouvre ensuite sans code). */
export function removePin() {
  write(KEY, JSON.stringify({ skipped: true }));
}

export function initPin({ onUnlock } = {}) {
  onUnlocked = onUnlock || onUnlocked;
  const pad = $('#pinPad');
  pad.innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']
    .map(k => (k === '' ? '<span></span>' : `<button type="button" class="pin__key" data-key="${k}" aria-label="${k === 'back' ? 'Effacer' : k}">${k === 'back' ? icon('chevronLeft', 24) : k}</button>`))
    .join('');
  pad.addEventListener('click', e => {
    const key = e.target.closest('[data-key]')?.dataset.key;
    if (key) press(key);
  });
  document.addEventListener('keydown', e => {
    if ($('#pinScreen').hidden) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
  });
  $('#pinSkip').addEventListener('click', () => {
    // Création facultative : on peut utiliser l'app sans code.
    write(KEY, JSON.stringify({ skipped: true }));
    unlock();
  });
  $('#pinForgot').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Réinitialiser le code ?',
      message: 'Vous pourrez en créer un nouveau. Vos données ne sont pas supprimées.',
      confirmLabel: 'Réinitialiser',
      danger: true
    });
    if (!ok) return;
    removePin();
    lock('create');
  });
  // Reverrouillage après 1 minute en arrière-plan.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER_MS && hasPin()) lock('unlock');
  });

  const c = config();
  if (c?.hash) lock('unlock');
  else if (c?.skipped) unlock();
  else lock('create');
}
