/*
 * Configuration Firebase (application Web) — projet dédié au budget.
 *
 * À REMPLIR : console Firebase → Paramètres du projet → Vos applications →
 * Application Web → « Configuration du SDK ». Tant que `apiKey` est vide,
 * l'application fonctionne en mode local (données sur l'appareil uniquement).
 *
 * Ces valeurs ne sont pas des secrets (elles sont publiques par conception) ;
 * la base est protégée par les règles de database.rules.json.
 */
export const FIREBASE_SDK_VERSION = '12.19.0';

export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
  databaseURL: ''
};

/** Nœud racine des données de l'application dans la base. */
export const DB_ROOT = 'budget';
