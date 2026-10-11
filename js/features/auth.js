/*
 * Compte commun à Mon Garage, Ma Maison, Carnet et Allure : feuille de connexion
 * et section Réglages › Compte.
 *
 * La feuille n'est jamais affichée au démarrage : seulement quand Firebase répond
 * « pas de compte », par-dessus l'app déjà affichée avec les données de l'appareil.
 * Si un code PIN verrouille l'app, elle attend le déverrouillage (le code d'abord,
 * puis la connexion : jamais les deux écrans en même temps).
 * « Continuer sans compte » (ou fermer la feuille) : données sur l'appareil, sans
 * synchronisation, jusqu'à la fermeture de l'app (choix gardé pour la session : un
 * rechargement ne redemande pas ; au prochain lancement, la feuille revient — on peut
 * aussi se connecter depuis les Réglages).
 */
import { $ } from '../core/utils.js';
import { rules, validate } from '../core/validation.js';
import { signIn, signUp, resetPassword, signOutUser, describeAuthError, currentUser, canSignIn, cloudError, waitForSync } from '../services/firebase.js';
import { unsyncedCount } from '../core/store.js';
import { openSheet, closeSheet, isOpen, confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { isLocked } from './pin.js';

const NO_ACCOUNT_KEY = 'budget_no_account';
const session = {
  get: () => {
    try {
      return sessionStorage.getItem(NO_ACCOUNT_KEY) === '1';
    } catch {
      return false;
    }
  },
  set: on => {
    try {
      if (on) sessionStorage.setItem(NO_ACCOUNT_KEY, '1');
      else sessionStorage.removeItem(NO_ACCOUNT_KEY);
    } catch {
      /* navigation privée : sans importance */
    }
  }
};
const TEXTS = {
  login: ['Connexion', 'Même compte que Mon Garage et Ma Maison.', 'Se connecter', 'Créer un compte'],
  signup: ['Créer mon compte', 'Un seul compte pour Mon budget, Carnet, Allure, Ma Maison et Mon Garage.', 'Créer le compte', 'J’ai déjà un compte'],
  reset: ['Mot de passe oublié', 'Indiquez votre e-mail : vous recevrez un lien pour choisir un nouveau mot de passe.', 'Envoyer le lien', 'Retour à la connexion']
};

let mode = 'login';
/** Réponse de Firebase reçue (compte ou « pas de compte »). */
let known = false;
/** Connexion demandée pendant que le code PIN est affiché : ouverte au déverrouillage. */
let deferred = false;
/** Fermeture après une connexion réussie : pas de passage en mode sans compte. */
let signedIn = false;
let onChange = () => {};

function renderMode() {
  [$('#authTitle').textContent, $('#authSub').textContent, $('#authSubmit').textContent, $('#authSwitch').textContent] = TEXTS[mode];
  $('#authPasswordField').hidden = mode === 'reset';
  $('#authForgot').hidden = mode !== 'login';
  $('#authPassword').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('#authError').textContent = '';
  $('#authError').classList.remove('is-success');
}

export function openAuth() {
  if (isOpen('authSheet') || currentUser() || !canSignIn()) return;
  if (isLocked()) {
    deferred = true;
    return;
  }
  deferred = false;
  mode = 'login';
  signedIn = false;
  renderMode();
  openSheet('authSheet', {
    onClose: () => {
      if (signedIn) return;
      // « Continuer sans compte » : plus redemandé pendant cette session de l'app.
      session.set(true);
      onChange();
    }
  });
}

/** Feuille de connexion affichée (ou en attente du code PIN) : l'utilisateur n'a pas encore répondu. */
export const authPending = () => deferred || isOpen('authSheet');

/** Code PIN déverrouillé : la connexion demandée entre-temps s'affiche. */
export function resumeAuth() {
  if (deferred) openAuth();
}

/** Compte connecté : la feuille se ferme sans passer en mode sans compte. */
function closeAuth() {
  deferred = false;
  if (!isOpen('authSheet')) return;
  signedIn = true;
  closeSheet('authSheet');
}

/** Réponse de Firebase : compte connecté (feuille fermée) ou « pas de compte » (feuille proposée). */
export function authChanged(user) {
  known = true;
  if (user) {
    session.set(false);
    closeAuth();
  } else if (!session.get()) openAuth();
  renderAccount();
}

/** Réglages › Compte : e-mail connecté, « Se connecter » ou « Se déconnecter ». */
export function renderAccount() {
  const user = currentUser();
  const line = $('#accountLine');
  if (!line) return;
  if (user) line.textContent = `Connecté : ${user.email || 'compte sans e-mail'}`;
  else if (cloudError()) line.textContent = 'Synchronisation indisponible : données enregistrées sur cet appareil.';
  else if (!known) line.textContent = 'Connexion…';
  else line.textContent = 'Sans compte : données enregistrées sur cet appareil uniquement.';
  $('#loginRow').hidden = Boolean(user) || !known || !canSignIn();
  $('#logoutRow').hidden = !user;
}

async function signOutFlow() {
  if (!currentUser()) return;
  await waitForSync(1000); // écritures en route : confirmées en général en quelques millisecondes
  const n = unsyncedCount();
  const ok = await confirmDialog({
    title: 'Se déconnecter ?',
    // Écritures pas encore confirmées (connexion lente ou absente) : gardées sur l'appareil pour ce compte.
    message: n
      ? `${n > 1 ? `${n} modifications ne sont pas encore envoyées : elles restent` : 'Une modification n’est pas encore envoyée : elle reste'} sur cet appareil et ${n > 1 ? 'seront envoyées' : 'sera envoyée'} à votre prochaine connexion à ce compte (pas à un autre compte).`
      : 'Vos données restent enregistrées dans votre compte et sur cet appareil.',
    confirmLabel: 'Se déconnecter'
  });
  if (!ok) return;
  try {
    // La feuille de connexion sera proposée de nouveau.
    session.set(false);
    await signOutUser();
    toast('Déconnecté', { type: 'info' });
  } catch (error) {
    console.warn('[auth]', error);
    toastError('Déconnexion impossible. Réessayez.');
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  const err = $('#authError');
  const { valid, errors } = validate(
    { email, password },
    {
      email: [rules.required('L’e-mail'), v => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Adresse e-mail invalide.')],
      password: mode === 'reset' ? [] : [rules.required('Le mot de passe'), v => (v.length >= 6 ? null : '6 caractères minimum.')]
    }
  );
  err.classList.remove('is-success');
  if (!valid) {
    err.textContent = Object.values(errors)[0];
    return;
  }
  const btn = $('#authSubmit');
  btn.classList.add('is-loading');
  btn.disabled = true;
  err.textContent = '';
  try {
    if (mode === 'login') await signIn(email, password);
    else if (mode === 'signup') await signUp(email, password);
    else {
      await resetPassword(email);
      err.classList.add('is-success');
      err.textContent = 'E-mail envoyé. Pensez à vérifier vos courriers indésirables.';
    }
    // Connexion réussie : la feuille se ferme à la réponse de Firebase (authChanged).
  } catch (error) {
    console.warn('[auth]', error);
    err.textContent = describeAuthError(error);
  } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

/** @param {{ onChange?: () => void }} options — appelé quand le mode sans compte est choisi. */
export function initAuth({ onChange: cb } = {}) {
  onChange = cb || onChange;
  $('#authForm').addEventListener('submit', onSubmit);
  $('#authSwitch').addEventListener('click', () => {
    mode = mode === 'login' ? 'signup' : 'login';
    renderMode();
  });
  $('#authForgot').addEventListener('click', () => {
    mode = 'reset';
    renderMode();
  });
  $('#authLocal').addEventListener('click', () => closeSheet('authSheet'));
  $('#loginRow').addEventListener('click', () => {
    session.set(false);
    openAuth();
  });
  $('#logoutRow').addEventListener('click', signOutFlow);
  renderAccount();
}
