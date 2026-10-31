# Mon budget

Application personnelle de suivi de quelques budgets choisis, des charges fixes et de l'évolution du salaire, installable sur l'écran d'accueil de l'iPhone.
HTML / CSS / JavaScript purs (modules ES), sans étape de build ni dépendance payante. Synchronisation multi-appareils via **Firebase Realtime Database** (offre gratuite), avec le **même compte** que Mon Garage, Ma Maison, Carnet et Allure.

## Fonctionnalités

Quatre pages, peu de chiffres : on ne note pas tout, on suit ce qui compte.

- **Noter** : un seul gros bouton **« Ajouter »**, puis un fil d'une question par écran : « Dépense ou rentrée ? », « Pour quoi ? » (les budgets suivis avec ce qu'il reste, puis « Autre catégorie… » ; en Rentrée : Salaire avec le montant habituel, Prime avec le total de l'année…), « Combien ? » (pavé numérique, ce qui restera dans le budget, date, note et **« Chaque mois »** en options), puis « C'est noté » avec la jauge du budget. Retour et Échap reviennent d'une question. Dernières saisies sous le bouton ; un appui ouvre l'édition. Catégories triées par **nombre d'utilisations sur 90 jours**.
- **Suivre** (mois par mois) :
  - **Budgets suivis** : seulement les catégories qui ont un plafond. Case ✓ (ça tient), ! ambre (la projection dépasse), ! rouge (dépassé) ; courbe des dépenses cumulées, pointillé jusqu'à la **projection de fin de mois** (charges fixes de la catégorie comptées une fois, le reste extrapolé au rythme actuel), trait du plafond.
  - **Charges fixes** : liste à cocher des charges récurrentes du mois (prélevée le X / à venir) ; **glisser une charge vers la droite** (ou toucher son rond) la note prélevée tout de suite, vers la gauche retire le prélèvement (même identifiant `rec-<id>-<AAAA-MM>` que la génération automatique : pas de doublon) ; total par mois et par an ; **évolution** sur 12 mois (comparaison avec un an avant) ou **par année** (moyenne mensuelle, mois en cours incomplet non compté).
  - Sous chaque budget, deux **tendances** : ce mois face au mois précédent au même jour, et la moyenne mensuelle depuis janvier face à celle de l'an dernier (hausse en ambre, baisse en vert, toujours avec ▲ / ▼).
  - **Salaire** (catégorie « Salaire ») : salaire habituel et liste des **augmentations** ; les petites variations mensuelles sont ignorées (un changement compte s'il dépasse 1,5 % deux mois de suite).
  - **Primes par année** (catégorie « Prime ») : total des 3 dernières années, année en cours hachurée, et ce que l'an dernier avait reçu après ce mois-ci.
  - **Moyennes par catégorie** : dépense moyenne par mois sur les 6 derniers mois complets (hors charges fixes), avec le plafond actuel et le mois le plus haut ; un appui ouvre la catégorie pour **ajuster le plafond**.
- **Prévoir** (troisième onglet) : liste des achats et dépenses à venir (taxe foncière, impôts, nouvelle cafetière, cadeau d'anniversaire…), avec montant estimé, date, périodicité (une fois, chaque mois, trimestre, année) et catégorie, tous facultatifs sauf le nom (une dépense qui revient a une date). Total des échéances des 3 prochains mois, puis « Bientôt » (datées, avec « dans 27 jours » ou « en retard ») et « Envies, sans date ». Un **rappel** apparaît en haut de « Noter » et en pastille sur l'onglet 1 semaine à 2 mois avant la date (1 mois par défaut). Cocher une ligne propose de **noter la dépense** dans le budget (montant payé, date, catégorie) ; une dépense qui revient passe à l'échéance suivante avec le montant payé, une dépense ponctuelle disparaît. Stockées sous `users/<uid>/budget/plans/<id>`, et dans l'export JSON.
- **Abonnements** (quatrième onglet, mois par mois) : bandeau avec le mois précédent, le mois affiché et le suivant (un appui ou un balayage change de mois) ; résumé **Cash** (ce qui restera une fois tout payé : revenu − dépensé − à venir), **À venir** (prélèvements récurrents pas encore passés) et **Revenu** (reçu + rentrées récurrentes attendues), avec une barre cash / à venir (hachuré) / dépensé ; **calendrier** du mois où chaque jour de prélèvement ou de rentrée récurrente montre la pastille du service (Netflix, Spotify, Amazon, Disney+, iCloud, Basic Fit… reconnus au nom, `js/ui/brands.js`, sinon l'icône de la catégorie), un appui sur le jour détaille ses échéances ; puis la liste **Abonnements** (catégorie « Abonnements » ou service reconnu : pastille, nom, date, montant / mois, total par mois et par an) et les **autres échéances** (loyer, assurance, salaire…). Rien de nouveau à saisir : tout vient des charges et revenus récurrents.
- **Charges et revenus récurrents** : ajoutés automatiquement au jour prévu (Réglages › Charges & revenus récurrents).
- **Dépenses reliées** : les entretiens et autres dépenses de Mon Garage, et les entretiens de Ma Maison, à partir du 1er octobre 2026, apparaissent automatiquement (catégories Transport et Logement, icône lien), aussi dans les dernières saisies. Un appui propose d'ouvrir l'app d'origine (où elles se modifient) ou de **retirer la dépense du budget** : elle reste dans l'app d'origine, et son identifiant est noté sous `users/<uid>/budget/hidden` pour ne plus la compter. Publiées par ces apps, avec le même compte, sous `users/<uid>/budget/linked/garage` et `…/linked/maison` ; Mon budget les lit dans son propre nœud et ne les réécrit jamais. Ne pas les ressaisir à la main.
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
css/                        tokens, theme, base, composants, mise en page, views/budget.css, ardoise (couleurs gris bleu et cobalt, chargé en dernier)
js/
  main.js                   Point d'entrée
  config/firebase-config.js Configuration Firebase (projet commun test-e27e9) + adresse de l'ancienne base
  core/                     store (synchro fine), schema, money (centimes), selectors, validation, dates
  services/                 firebase (compte + synchro), storage
  features/                 auth (connexion, Réglages › Compte), pin (verrou facultatif), recurring (génération automatique)
  ui/                       icônes, modales, toasts, thème, graphiques, motion (ressorts, compteur à rouleaux)
  views/                    note (Noter), plan (Prévoir), track (Suivre), subs (Abonnements), quickadd (édition d'une opération), settings
```

Les montants sont stockés en **centimes entiers** (aucune erreur d'arrondi).

## Hors ligne (PWA)

`sw.js` pré-met en cache l'app-shell à l'installation : l'app s'ouvre même sans réseau, y compris dès le tout premier lancement hors ligne. Il vérifie aussi à chaque ouverture si les fichiers ont changé sur le serveur, pour afficher la dernière version publiée. La synchronisation Firebase reste en ligne (les écritures hors ligne sont conservées et renvoyées au retour du réseau, voir « Robustesse de la synchronisation »).

## Compte et synchronisation

- **Un seul compte pour les 5 apps** : Mon budget utilise le projet Firebase de Mon Garage et Ma Maison (`test-e27e9`, même `firebase-config.js`). Les données sont sous `users/<uid>/budget` : `theme`, `categories/<id>`, `transactions/<id>`, `recurring/<id>`, `goals/<id>`, `plans/<id>`. Le même nœud reçoit `linked/garage` (écrit par Mon Garage), `linked/maison` (Ma Maison) et `migrated` (marque du transfert) : Mon budget les lit et ne les réécrit jamais.
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
Style minimaliste commun aux apps (cartes pleines), couleurs **Ardoise** (gris bleu et cobalt, police IBM Plex Sans).

**Mouvement** (`js/ui/motion.js`) : animations à ressort (courbes CSS `linear()` calculées par une petite simulation), interruptibles. Le bouton « Ajouter » s'agrandit en cercle jusqu'à devenir le fil et s'y referme ; les questions glissent comme des cartes ; le montant défile en **rouleaux** et une jauge « il restera » avance pendant la frappe (ambre et petit tremblement au-delà du plafond) ; « C'est noté » s'ouvre depuis « Valider », la coche se dessine et le montant part en pièce dans la jauge du budget ; les nouvelles saisies se glissent en tête de liste. Sur Suivre, les courbes se tracent à l'ouverture (plafond allumé si la projection le dépasse, point du jour qui respire), les barres montent, le mois glisse dans le sens du geste (flèches ou balayage du nom du mois) et les montants roulent vers leur nouvelle valeur. Avec « Réduire les animations » (iPhone), il ne reste que des fondus courts.

Logo : ligne continue, une courbe qui monte d'un seul trait jusqu'à un point d'arrivée, en dégradé indigo → rose sur fond blanc (`icon.svg`, décliné en `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`). Même famille que les logos de Mon Garage et Ma Maison.
