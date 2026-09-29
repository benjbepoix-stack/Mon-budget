/*
 * Configuration Firebase (application Web) — projet dédié au budget.
 *
 * Source : console Firebase → Paramètres du projet → Vos applications →
 * Application Web → « Configuration du SDK ». Si `apiKey` est vide,
 * l'application fonctionne en mode local (données sur l'appareil uniquement).
 *
 * Ces valeurs ne sont pas des secrets (elles sont publiques par conception) ;
 * la base est protégée par les règles de database.rules.json.
 */
export const FIREBASE_SDK_VERSION = '12.19.0';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD2MM3R5Fw7dtodLMMCvwGRr_mKJ3GfLq0',
  authDomain: 'mon-budget-ade0b.firebaseapp.com',
  projectId: 'mon-budget-ade0b',
  storageBucket: 'mon-budget-ade0b.firebasestorage.app',
  messagingSenderId: '363646806020',
  appId: '1:363646806020:web:6d89f04f262e7efe796d51',
  // Adresse de la Realtime Database (emplacement europe-west1 / Belgique).
  // À vérifier dans la console : Realtime Database → onglet Données (adresse en haut).
  databaseURL: 'https://mon-budget-ade0b-default-rtdb.europe-west1.firebasedatabase.app'
};

/** Nœud racine des données de l'application dans la base. */
export const DB_ROOT = 'budget';
