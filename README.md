# Mon budget

Application personnelle de suivi des frais fixes, du budget et de l'évolution du salaire, installable sur l'écran d'accueil de l'iPhone.
HTML / CSS / JavaScript purs (modules ES), sans étape de build ni dépendance payante. Synchronisation multi-appareils via **Firebase Realtime Database** (offre gratuite).

## Fonctionnalités

- **Mois en cours** : dépenses du mois face à la somme des budgets (jauge, reste ou dépassement), réparties en **frais fixes** et **dépenses courantes**, revenus du mois, projection au rythme actuel (pas de calcul de « reste à vivre »).
- **Frais fixes** (onglet Mois) : charges récurrentes actives, total par mois et par an.
- **Budgets par catégorie** : plafond mensuel, jauges avec alerte à 80 % et 100 %, remise à zéro chaque mois.
- **Saisie rapide** (bouton **+**) : montant, catégorie en un toucher, date, note ; option « Répéter chaque mois ».
- **Charges et revenus récurrents** : loyer, abonnements, salaire… ajoutés automatiquement au jour prévu ; coût annuel des charges fixes.
- **Objectifs d'épargne** : versements manuels, progression, date estimée d'atteinte, mensualité nécessaire pour une échéance.
- **Analyse** : 12 derniers mois (dépenses, épargne, revenus), moyennes (revenus, dépenses, frais fixes, épargne), top des dépenses, **évolution du salaire** sur 24 mois (catégorie « Salaire ») : dernier salaire, moyenne sur 12 mois, évolution sur un an.
- **Dépenses reliées** : les entretiens et autres dépenses de Mon Garage, et les entretiens de Ma Maison, à partir du 1er octobre 2026, apparaissent automatiquement (catégories Transport et Logement, icône lien) — lecture seule, un appui ouvre l'app d'origine. Publiées par ces apps sous `budget/linked/garage` et `budget/linked/maison`. ⚠️ Republier `database.rules.json` dans la console Firebase pour autoriser ce chemin. Ne pas les ressaisir à la main.
- **Opérations** : filtre par type, puis par catégorie (chips, uniquement les catégories utilisées ce mois-ci) et recherche texte (note ou catégorie).
- **Catégories** préremplies et modifiables (icône, nom, budget).
- **Code PIN** à 4 chiffres par appareil, reverrouillage après 1 minute en arrière-plan.
- **Sauvegarde** : export / import JSON.
- Thème sombre / clair, 100 % responsive (iPhone et ordinateur), fonctionne hors ligne pour l'interface (la synchronisation Firebase demande du réseau).

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

## Hors ligne (PWA)

`sw.js` pré-met en cache l'app-shell à l'installation : l'app s'ouvre même sans réseau, y compris dès le tout premier lancement hors ligne. Il vérifie aussi à chaque ouverture si les fichiers ont changé sur le serveur, pour afficher la dernière version publiée. La synchronisation Firebase reste en ligne (les écritures hors ligne sont conservées et renvoyées au retour du réseau, voir « Robustesse de la synchronisation »).

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

## Style
Style minimaliste commun aux apps (anthracite, cartes pleines), couleur **Sauge**. Logo : pile de pièces et euro avec la ligne d'horizon commune aux logos des apps.
