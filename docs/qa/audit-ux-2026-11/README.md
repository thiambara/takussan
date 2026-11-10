# Audit UX 2026-11 — page par page, desktop et mobile

**Demande du porteur (2026-11-08)** : analyser toutes les pages du site public et de `/app`, sauf le
super admin. Pour chaque page, trois regards — business, ingénieur, client —, la navigation d'ensemble
en desktop et en mobile, et une conception mobile **propre à chaque page**, pas une règle générale
plaquée partout. Ambitieux : propositions de fond, pas seulement des corrections.

**Décisions de cadrage (porteur, 2026-11-08)** :

1. Audit d'abord, puis tickets, puis implémentation par lots validés.
2. Famille par famille, relue par le porteur entre deux familles.
3. La charte (`docs/design-guidelines.md`) peut être remise en question quand une page le justifie —
   chaque écart proposé est signalé comme tel (**⚑ écart de charte**).

4. **Toute proposition de design passe par une maquette statique avant d'être confirmée**
   (2026-11-08) : une route séparée, sans appel d'API, jusqu'à quatre approches par page, en mobile
   et en bureau, plusieurs pages présentées ensemble, une navigation simple entre les variantes. Le
   porteur choisit sur la maquette ; l'implémentation suit le choix.

## Maquettes

`http://localhost:3000/fr/playground/maquettes` sous `next dev` (404 en production, `noindex`).
Code : `takussan-web/src/app/[locale]/(public)/playground/maquettes/` — une visionneuse, un fichier
par page sous `pages/`, des données fictives (`donnees.ts`) et des photos libres d'Unsplash sous
`takussan-web/public/maquettes/`. La partie connectée (familles 2 à 6) vit sous `pages/app/`, dans
la coque commune `chrome-app.tsx`.

Navigation (refaite le 2026-11-10, quand la partie connectée a porté le compte à ~50 pages) :

- **Vue d'ensemble** (`e`, l'accueil de la visionneuse) : les six familles, chaque page en vignette
  avec son état — retenue par le porteur, recommandée, ou « mon choix ».
- **Sommaire** (`s`) à gauche : familles repliables et leurs pages ; **Aller à…** (`⌘K` ou `/`)
  cherche une page, une approche ou une route.
- `[` `]` page précédente / suivante · `←` `→` ou `1`–`4` approche · `↑` `↓` écran d'un parcours ·
  `t` `b` `c` vues Téléphone / Bureau / Comparer · `n` notes · `?` l'aide.
- **Retenir** (`r`) marque une approche d'une étoile (gardé dans le navigateur) ; la vue d'ensemble
  copie la liste des choix en texte, prête à coller dans la conversation.
- L'URL garde la position (`?p=app-biens&a=b&e=1&v=bureau`). Ouverte sur un téléphone, la
  visionneuse montre la maquette en plein écran, avec page (rangée par famille), approche et écran.

**Une seule flèche de retour au téléphone** (demande du porteur, 2026-11-10 : « les flèches de
navigation back en mobile doivent être les mêmes dans toutes les pages ») : `FlecheRetour` de
`kit.tsx` — `ArrowLeft` en `size-5`, comme `BoutonRetour` du produit, dans une cible de 44 px, avec
une variante ronde pleine sur photo. Les liens texte « ← Retour à … » gardent leur forme avec le
même glyphe ; les chevrons de période, de pagination ou de carrousel ne sont pas des retours. Tout
ticket qui touche un en-tête au téléphone s'y aligne.

⚠ Tailwind n'analyse pas les fichiers exclus de git : `maquettes.css` déclare sa propre source
(`@import "tailwindcss/utilities.css" … source("./")`), sans quoi les classes propres aux maquettes
ne sont pas générées.

**Les maquettes ne sont PAS versionnées, et c'est voulu** (décision du porteur, 2026-11-09). Elles
vivent dans l'arbre de travail principal, sous
`/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/`
et `…/takussan-web/public/maquettes/`, exclues de git par `.git/info/exclude` (local, partagé par
les worktrees) : elles font rougir `check-i18n`, `check-champs-uniformes`, `check-locale-figee`,
`check-feedback-states` et `check-heritage-encre`, et on ne les aligne pas sur des gardes de
production pour un usage de référence.

**Pour l'agent qui implémente un ticket de cet audit** : la maquette citée par le ticket est la
**référence de fidélité** — mises en page, hiérarchie, libellés, états, téléphone et bureau. La lire
au chemin absolu ci-dessus (un worktree ne la contient pas) et, si possible, l'ouvrir sous
`./dev.sh` depuis l'arbre principal (`?p=<page>&a=<approche>&v=comparer`). Elle est statique et
écrite hors design system : on en reprend le **résultat**, jamais le code (vrais composants,
next-intl, `useFormatteurs()`). Les notes « Pour / Contre » d'une approche ont pu se tromper sur
l'API : le ticket fait foi. Le dossier se supprime avec le dernier ticket qui s'en sert.

## Décisions du porteur sur la partie connectée (2026-11-10)

Toutes les recommandations sont validées (« je valide tes recommandations, go »). Le détail de
chacune est dans la section « Décisions qui reviennent au porteur » de sa famille.

| # | Décision | Retenu |
|---|---|---|
| 1 | Publier sans compte | (a) l'annonce d'abord, le compte au moment de publier — **prénom ET nom** demandés (1a) |
| 2 | Ton | **vouvoiement partout** — site public (connecté ou non), publication sans compte, inscription, entrée et `/app` (révisé le 2026-11-10 : remplace le (c) « tutoiement jusqu'à la création du compte » ; [ADR-0095](../../adr/0095-le-ton-suit-la-session.md)). Les maquettes tutoient souvent : elles ne sont pas une référence de ton |
| 3 | Invitations | (a) connexion par code SMS ; (a) la page montre l'agence, le rôle et qui invite |
| 4 | Tableaux de bord | (b) l'accueil de l'agent est « Aujourd'hui » ; une page « Rapports » remplace les quatre vues |
| 5 | En-tête au téléphone | (a) le titre de la page en haut, sans logo |
| 6 | Sens de « Publié » | (a) réservé à « En ligne », visible du public |
| 7 | Signature d'un état des lieux sur place | (a) sur le téléphone de l'agent, avec un code SMS |
| 8 | Pénalités de retard | (a) comptées dans le total à régler |
| 9 | Offre ou candidature saisie par l'agent | (c) lien envoyé au client d'abord, saisie par l'agent possible |
| 10 | Onglets de l'agent au téléphone | (a) Aujourd'hui · Demandes · Clients · Messages · Menu |
| 11 | Pipeline | (a) Takussan propose l'étape suivante, l'agent confirme ; vocabulaire en français |
| 12 | Onglets de l'admin au téléphone | (a) « Argent » remplace « Demandes » (Accueil · Argent · Biens · Messages · Menu) |
| 13 | Relance des impayés | (a) par WhatsApp, message prérempli |
| 14 | Prix de l'abonnement et des crédits | (a) en F CFA là où l'on décide |

S'y ajoutent les retours sur les maquettes : 1a (prénom et nom), 2a (gestes des Visites), 3a (pas
d'horaires ni de zones d'intervention), « Aujourd'hui = a » (l'accueil de l'agent), et une seule
flèche de retour au téléphone.

### Retours du 2026-11-10 sur les points ouverts

Le porteur a tranché le même jour les points que les ADR et les tickets laissaient ouverts — les
recommandations, sauf là où c'est dit :

| # | Point | Retenu | Où c'est écrit |
|---|---|---|---|
| 1 | Ouvrir « Argent » à l'agent | non : l'agent garde `/app/payments` | TCK-2677, ADR-0100 |
| 2 | Plan et prix au passage en pro | l'approbation pose l'abonnement au plan annoncé, sans prélèvement | ADR-0104 § 6, TCK-2681 |
| 3 | E-mail d'une invitation acceptée par code | posé vérifié | ADR-0094 § 6 |
| 4 | Ton | **vouvoiement partout** (révise la décision 2) | ADR-0095 révisé, TCK-2616, TCK-2683 |
| 5 | Mot du bailleur | « Loyers » (onglet, menu, titre) ; « Mes revenus » en carte de tête seulement | ADR-0100 § 3, TCK-2618, TCK-2651 |
| 6 | Libellé du statut `published` | « Validé » | ADR-0097 § 4, TCK-2638 |
| 7 | Charges du bail | **dans ce lot** (b) : terme imprimé, échéance `charges` à côté du loyer | ADR-0100 § 6, ADR-0042 (amendement), TCK-2679 |
| 8 | Motif d'un bien hors ligne | oui, ticket à part | ADR-0097 § 5, TCK-2678 |
| 9 | Quota de biens | inchangé dans ce lot | ADR-0097 § 6 |
| 10 | Réglages | `visits.report_pending_days` 7 · `crm.follow_up_days` 7 · brouillon anonyme 30 j · demande publique 200 | ADR-0101, 0103, 0093, 0088 |
| 11 | Entrée | nom requis ; photo de Dakar libre de droits fournie par le porteur ; drapeau de connexion par téléphone inchangé ; **« Proposer un créneau » : un ticket API de plus** (b) | TCK-2604, TCK-2680, TCK-2613 |
| 12 | Adresse au visiteur | après la confirmation de la visite (a) ; le personnel l'a toujours | TCK-2585, `features.md` § 1.3 |
| 13 | Agence | **relance d'impayés en lot dans le lot** (b), comme une file guidée ; succursales : la limite seule, sans jauge (a) | ADR-0105 (amendement), TCK-2682 ; TCK-2671 |
| 14 | Impayés de Rapports et d'« Argent » | un seul composant | TCK-2629, TCK-2660 |

## Familles

| # | Famille | Fichier | État |
|---|---|---|---|
| 1 | Site public (découverte, fiche, profils, outils, pages par lien) | [01-site-public.md](01-site-public.md) | maquettes choisies le 2026-11-08 ; premier lot : TCK-2493 → TCK-2506 (vague 84) ; second lot : TCK-2507 → TCK-2524 (vague 85) — toutes les pages de la famille ont leur approche retenue |
| 2 | Entrée : connexion, inscription, onboarding, publication | [02-entree.md](02-entree.md) | audit du 2026-11-10 ; maquettes choisies le 2026-11-10 (les recommandations, retouchées) ; tickets à écrire |
| 3 | Coque de `/app`, accueil, tableaux de bord, messages, notifications, profil | [03-coque-et-accueil.md](03-coque-et-accueil.md) | audit du 2026-11-10 ; maquettes choisies le 2026-11-10 (les recommandations, retouchées) ; tickets à écrire |
| 4 | Patrimoine et location : biens, baux, états des lieux, paiements, documents, maintenance | [04-patrimoine-et-location.md](04-patrimoine-et-location.md) | audit du 2026-11-10 ; maquettes choisies le 2026-11-10 (les recommandations, retouchées) ; tickets à écrire |
| 5 | Commercial : CRM, pipeline, prospects, clients, visites, réservations, tâches, agenda | [05-commercial.md](05-commercial.md) | audit du 2026-11-10 ; maquettes choisies le 2026-11-10 (les recommandations, retouchées) ; tickets à écrire |
| 6 | Agence : équipe, rôles, finances, rapprochement, KYC, modération, intégrations, crédits | [06-agence.md](06-agence.md) | audit du 2026-11-10 ; maquettes choisies le 2026-11-10 (les recommandations, retouchées) ; tickets à écrire |

## Méthode

- **Au navigateur, jamais à la seule lecture du code** : chaque page à 1440 × 900 (bureau) et à
  390 × 844 en émulation tactile (téléphone), sur la base de démo (`migrate:fresh --seed`).
- **Le code en second regard** : états (chargement, vide, erreur), requêtes, SEO, cibles tactiles.
- **Sévérités** : P0 bloque la tâche · P1 gêne fortement ou coûte du business · P2 friction avec
  contournement · P3 finition.
- **Ce que l'audit ne juge pas** : le contenu de la base de démo (titres incohérents, « Villa Luxe
  5000m² » à 500 000 F, épingle de carte dans l'océan). Il est signalé une fois, pas compté comme
  défaut produit.

### Limite de l'environnement — les photos

La base de démo enregistre 3 451 médias de biens, mais `SEED_DOWNLOAD_MEDIA=false` (le défaut) ne
pose **aucun fichier** : au premier passage, toutes les cartes affichaient le texte de repli du
navigateur. Pour juger les mises en page avec des images, chaque média manquant a été relié
**localement** (liens symboliques sous `takussan-api/storage/app/public/`, ignoré par git) à l'une
des 53 images picsum présentes. Les images sont donc génériques (paysages, animaux) : leur
**présence** est réaliste, leur **contenu** ne l'est pas.

La revue précédente, [revue-design-2026-09-16](../revue-design-2026-09-16/), portait sur la finition
(jetons, débordements, cibles, i18n) et a corrigé ce qu'elle a trouvé. Cet audit ne la refait pas :
il porte sur les parcours, la valeur business et la conception mobile.
