# Mon budget

Application personnelle de suivi de quelques budgets choisis, des charges fixes et de l'évolution du salaire, installable sur l'écran d'accueil de l'iPhone.
HTML / CSS / JavaScript purs (modules ES), sans étape de build ni dépendance payante. Synchronisation multi-appareils via **Firebase Realtime Database** (offre gratuite), avec le **même compte** que Mon Garage, Ma Maison, Carnet et Allure.

## Fonctionnalités

Deux pages seulement, peu de chiffres : on ne note pas tout, on suit ce qui compte.

- **Noter** : Dépense ou Rentrée, montant, puis « Dans quel budget ? » (liste à cocher : les budgets suivis avec ce qu'il reste, puis « Hors budget » avec les autres catégories) ; en Rentrée : Salaire, Prime… Date (aujourd'hui), note facultative, option **« Chaque mois »** (charge fixe ou salaire saisis automatiquement). Dernières saisies en dessous ; un appui ouvre l'édition. Catégories triées par **nombre d'utilisations sur 90 jours**.
- **Suivre** (mois par mois) :
  - **Budgets suivis** : seulement les catégories qui ont un plafond. Case ✓ (ça tient), ! ambre (la projection dépasse), ! rouge (dépassé) ; courbe des dépenses cumulées, pointillé jusqu'à la **projection de fin de mois** (charges fixes de la catégorie comptées une fois, le reste extrapolé au rythme actuel), trait du plafond.
  - **Charges fixes** : liste à cocher des charges récurrentes du mois (prélevée le X / à venir), total par mois et par an ; **évolution** sur 12 mois (comparaison avec un an avant) ou **par année** (moyenne mensuelle, mois en cours incomplet non compté).
  - **Rentrées** : rentrées du mois et revenus réguliers à venir ; **salaire sur 12 mois** (catégorie « Salaire »), dernier salaire, moyenne sur 12 mois, évolution sur un an.
  - **Moyennes par catégorie** : dépense moyenne par mois sur les 6 derniers mois complets (hors charges fixes), avec le plafond actuel et le mois le plus haut ; un appui ouvre la catégorie pour **ajuster le plafond**.
- **Charges et revenus récurrents** : ajoutés automatiquement au jour prévu (Réglages › Charges & revenus récurrents).
- **Dépenses reliées** : les entretiens et autres dépenses de Mon Garage, et les entretiens de Ma Maison, à partir du 1er octobre 2026, apparaissent automatiquement (catégories Transport et Logement, icône lien) — lecture seule, un appui ouvre l'app d'origine. Publiées par ces apps, avec le même compte, sous `users/<uid>/budget/linked/garage` et `…/linked/maison` ; Mon budget les lit dans son propre nœud et ne les réécrit jamais. Ne pas les ressaisir à la main.
- **Catégories** préremplies et modifiables (icône, nom, plafond : seules celles qui en ont un sont suivies).
- **Épargne** : l'ancien onglet Objectifs a été retiré ; les objectifs et versements déjà saisis restent dans les données (et dans l'export JSON).
- **Code PIN** facultatif à 4 chiffres par appareil (Réglages › Sécurité), reverrouillage après 1 minute en arrière-plan. Rien n'est demandé au premier lancement ; un code déjà créé continue de verrouiller l'app.
- **Compte** (Réglages › Compte) : « Connecté : e-mail », « Se connecter » / « Se déconnecter ».
- **Sauvegarde** : export / import JSON.
- **Thème Auto** (par défaut : suit le réglage clair / sombre de l'iPhone, y compris ses changements automatiques), Sombre ou Clair (Réglages › Apparence ; choix synchronisé entre appareils). Au passage à cette version, un thème « sombre » enregistré (ancien défaut) devient « Auto », une seule fois (`budget_theme_auto_v1`) ; « clair » est conservé.
- 100 % responsive (iPhone et ordinateur), fonctionne hors ligne pour l'interface (la synchronisation Firebase demande du réseau).

## Structure

```
index.html                  Squelette HTML
manifest.webmanifest        Manifeste PWA (icônes icon-*.png, apple-touch-icon.png)
database.rules.json         Règles fermées à publier sur l'ANCIENNE base publique (voir « Sécurité »)
css/                        tokens, theme (ambiance Sauge), base, composants, mise en page, views/budget.css
js/
  main.js                   Point d'entrée
  config/firebase-config.js Configuration Firebase (projet commun test-e27e9) + adresse de l'ancienne base
  core/                     store (synchro fine), schema, money (centimes), selectors, validation, dates
  services/                 firebase (compte + synchro), storage
  features/                 auth (connexion, Réglages › Compte), pin (verrou facultatif), recurring (génération automatique)
  ui/                       icônes, modales, toasts, thème, graphiques
  views/                    note (Noter), track (Suivre), quickadd (édition d'une opération), settings
```

Les montants sont stockés en **centimes entiers** (aucune erreur d'arrondi).

## Hors ligne (PWA)

`sw.js` pré-met en cache l'app-shell à l'installation : l'app s'ouvre même sans réseau, y compris dès le tout premier lancement hors ligne. Il vérifie aussi à chaque ouverture si les fichiers ont changé sur le serveur, pour afficher la dernière version publiée. La synchronisation Firebase reste en ligne (les écritures hors ligne sont conservées et renvoyées au retour du réseau, voir « Robustesse de la synchronisation »).

## Compte et synchronisation

- **Un seul compte pour les 5 apps** : Mon budget utilise le projet Firebase de Mon Garage et Ma Maison (`test-e27e9`, même `firebase-config.js`). Les données sont sous `users/<uid>/budget` : `theme`, `categories/<id>`, `transactions/<id>`, `recurring/<id>`, `goals/<id>`. Le même nœud reçoit `linked/garage` (écrit par Mon Garage), `linked/maison` (Ma Maison) et `migrated` (marque du transfert) : Mon budget les lit et ne les réécrit jamais.
- **Pas d'écran bloquant au démarrage** : l'app s'affiche tout de suite avec les données de l'appareil. Si Firebase répond « pas de compte », une feuille de connexion s'ouvre par-dessus (e-mail, mot de passe, « Mot de passe oublié ? », « Créer un compte »), avec **« Continuer sans compte »** : données sur l'appareil seulement, pas de synchronisation, pastille « Local » (choix gardé jusqu'à la fermeture de l'app ; la feuille revient au lancement suivant, et l'on peut se connecter depuis Réglages › Compte). Tant que la feuille attend une réponse, les opérations récurrentes ne sont pas générées : après la connexion, elles le sont sur les données du compte (pas sur une copie peut-être ancienne de l'appareil). Firebase injoignable : pas de feuille, mode local.
- **Code PIN et connexion** ne se superposent jamais : si un code existe, il est demandé d'abord ; la feuille de connexion (si nécessaire) s'ouvre après le déverrouillage.
- **Session partagée** : les apps sont sur la même origine (`benjbepoix-stack.github.io`) ; dans un même navigateur, être connecté dans Mon Garage suffit. Sur iPhone, chaque app installée sur l'écran d'accueil a son propre stockage : une connexion par app, une seule fois.
- **Changement de compte** sur l'appareil (autre compte que le dernier mémorisé, clé `budget_last_uid`) : les données locales sont vidées avant la synchro (le thème est conservé). À la première connexion après la mise à jour, rien n'est vidé.
- **Sans compte**, les opérations saisies restent « non confirmées » (`budget_unsynced`) : à la connexion, elles sont ajoutées au compte élément par élément (rien d'autre n'est écrasé ; les données non modifiées de l'appareil sont remplacées par celles du compte). Connexion à un autre compte que le dernier connecté : elles sont vidées avec le reste.
- **Se déconnecter** (Réglages › Compte) : les écritures en cours sont envoyées d'abord ; s'il en reste (connexion lente ou absente), la confirmation l'indique : elles restent sur l'appareil et partent à la prochaine connexion à ce compte. Les données restent dans le compte et sur l'appareil.
- **Accès refusé** (ex. mot de passe changé sur un autre appareil) : pastille « Local » ; après déconnexion puis reconnexion, la synchronisation reprend sans recharger l'app. Une écriture d'une session précédente refusée après coup (déconnexion, changement de compte) est sans effet sur la session en cours.

Configuration : `js/config/firebase-config.js` (valeurs identiques à celles de Mon Garage). Si `FIREBASE_CONFIG` vaut `null`, l'app fonctionne uniquement sur l'appareil. La connexion e-mail / mot de passe doit être activée dans le projet (Authentication → Sign-in method), ce qui est déjà le cas pour Mon Garage.

## Transfert depuis l'ancienne base (automatique, une seule fois)

Au premier instantané de `users/<uid>/budget` après connexion, si `migrated` est absent, Mon budget lit l'ancienne base publique en REST (`mon-budget-ade0b…/budget.json`, 8 s max) :
- données trouvées → `theme`, `categories`, `transactions`, `recurring`, `goals` et `linked` sont écrits dans le nouveau nœud (sans écraser une collection ou un `linked/<app>` déjà présent, publié entre-temps par Mon Garage ou Ma Maison), avec `migrated: { from: '<hôte>', at, by: 'budget' }`, puis affichés ; un thème « sombre » transféré devient « Auto » ;
- ancienne base vide ou injoignable → les données de l'appareil deviennent la référence, `migrated: { from: 'local', … }`, en une seule écriture élément par élément (deux appareils qui démarrent en même temps fusionnent leurs opérations) ;
- transfert terminé par un autre appareil pendant la lecture de l'ancienne base → sa marque `migrated` et ses données priment, rien n'est réécrit.

Un nœud sans aucune collection (seulement `linked`, `migrated` et / ou `theme`) est considéré comme vide : les données de l'appareil n'en sont jamais effacées (un thème déjà enregistré dans le compte est gardé). Les opérations récurrentes du mois sont générées après ce premier chargement.

## Sécurité — à lire

- Le **code PIN** protège l'ouverture de l'application sur l'appareil. Il ne chiffre pas les données.
- La `apiKey` et le reste de `firebase-config.js` **ne sont pas des secrets** : Firebase les destine au navigateur. Les données sont protégées par le compte : les règles du projet `test-e27e9` (gérées dans le dépôt Mon Garage) n'autorisent `users/<uid>` qu'au compte connecté. **Aucune règle à publier** pour les nouveaux chemins.
- ⚠️ **Verrouiller l'ancienne base** `mon-budget-ade0b` (lisible et modifiable par n'importe qui jusque-là) **une fois les données transférées** : ouvrez Mon budget connecté sur un appareil à jour, vérifiez que vos opérations s'affichent (et, dans la console Firebase du projet `test-e27e9`, que `users/<uid>/budget/migrated` existe), puis console Firebase du projet **mon-budget-ade0b** → Realtime Database → *Règles* → coller le contenu de `database.rules.json` (`".read": false, ".write": false`) → *Publier*. Après cela, l'ancienne base n'est plus lisible ni modifiable : un appareil resté sur l'ancienne version passe en « Local » (ses saisies restent sur l'appareil, puis partent dans le compte après sa mise à jour et sa connexion).

## Robustesse de la synchronisation

- Chaque opération est écrite **individuellement** (`users/<uid>/budget/transactions/<id>`) : deux appareils qui ajoutent chacun une dépense hors ligne ne s'écrasent pas.
- Les écritures non confirmées par le serveur (ou faites sans compte) sont **conservées sur l'appareil** (`budget_unsynced`) et renvoyées au lancement suivant ou à la connexion.
- Les opérations récurrentes ont un identifiant déterministe par mois : pas de doublon même si deux appareils les génèrent.

## Lancer en local

```bash
python3 -m http.server 8080   # puis http://localhost:8080
```

## Déploiement

GitHub Pages : **Settings → Pages → Deploy from a branch → `main` / root**.

## Style
Style minimaliste commun aux apps (anthracite, cartes pleines), couleur **Sauge**. Logo : pile de pièces et euro avec la ligne d'horizon commune aux logos des apps.
