# Mon budget

Application personnelle de suivi de budget, installable sur l'écran d'accueil de l'iPhone.
HTML / CSS / JavaScript purs (modules ES), sans étape de build ni dépendance payante. Synchronisation multi-appareils via **Firebase Realtime Database** (offre gratuite).

## Fonctionnalités

- **Mois en cours** : revenus − dépenses − épargne = **reste à vivre**, projection des dépenses au rythme actuel.
- **Budgets par catégorie** : plafond mensuel, jauges avec alerte à 80 % et 100 %, remise à zéro chaque mois.
- **Saisie rapide** (bouton **+**) : montant, catégorie en un toucher, date, note ; option « Répéter chaque mois ».
- **Charges et revenus récurrents** : loyer, abonnements, salaire… ajoutés automatiquement au jour prévu ; coût annuel des charges fixes.
- **Objectifs d'épargne** : versements manuels, progression, date estimée d'atteinte, mensualité nécessaire pour une échéance.
- **Analyse** : 12 derniers mois (dépenses, épargne, revenus), moyennes, taux d'épargne, top des dépenses.
- **Catégories** préremplies et modifiables (icône, nom, budget).
- **Code PIN** à 4 chiffres par appareil, reverrouillage après 1 minute en arrière-plan.
- **Sauvegarde** : export / import JSON.
- Thème sombre / clair, 100 % responsive (iPhone et ordinateur).

## Structure

```
index.html                  Squelette HTML
manifest.webmanifest        Manifeste PWA (icônes icon-*.png, apple-touch-icon.png)
database.rules.json         Règles de la Realtime Database
css/                        tokens, theme (ambiance Sauge), base, composants, mise en page, views/budget.css
js/
  main.js                   Point d'entrée
  config/firebase-config.js Configuration Firebase (à remplir)
  core/                     store (synchro fine), schema, money (centimes), selectors, validation, dates
  services/                 firebase, storage
  features/                 pin (verrou), recurring (génération automatique)
  ui/                       icônes, modales, toasts, thème, graphiques
  views/                    month, transactions, goals, analysis, quickadd, settings
```

Les montants sont stockés en **centimes entiers** (aucune erreur d'arrondi).

## Mise en place de Firebase (≈ 5 minutes)

Tant que la configuration est vide, l'application fonctionne **en local** (pastille « Local ») : les données restent sur l'appareil.

1. https://console.firebase.google.com → **Ajouter un projet** → nom `mon-budget` (Google Analytics inutile).
2. Menu **Créer → Realtime Database → Créer une base de données** → emplacement **europe-west1** → démarrer en **mode verrouillé**.
3. Onglet **Règles** : coller le contenu de `database.rules.json` → **Publier**.
4. **Paramètres du projet** (roue dentée) → **Vos applications** → icône **Web `</>`** → nom `Mon budget` → **Enregistrer**.
5. Copier les valeurs de `firebaseConfig` dans `js/config/firebase-config.js` (dont `databaseURL`), puis publier.

## Sécurité — à lire

- Le **code PIN** protège l'ouverture de l'application sur l'appareil. Il ne chiffre pas les données.
- **La base Firebase n'a pas d'authentification** (choix assumé) : toute personne connaissant son adresse, visible dans le code publié, peut lire ou modifier le nœud `budget`. Les règles limitent la forme des données, pas l'accès.
- Pour une protection complète plus tard : activer *Firebase Authentication* (e-mail / mot de passe, gratuit) et restreindre `budget` à votre identifiant.

## Robustesse de la synchronisation

- Chaque opération est écrite **individuellement** (`budget/transactions/<id>`) : deux appareils qui ajoutent chacun une dépense hors ligne ne s'écrasent pas.
- Les écritures non confirmées par le serveur sont **conservées sur l'appareil** et renvoyées au lancement suivant.
- Les opérations récurrentes ont un identifiant déterministe par mois : pas de doublon même si deux appareils les génèrent.

## Lancer en local

```bash
python3 -m http.server 8080   # puis http://localhost:8080
```

## Déploiement

GitHub Pages : **Settings → Pages → Deploy from a branch → `main` / root**.
