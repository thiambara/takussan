---
id: TCK-2740
title: "La 404 de /app sort sans HTML serveur : un document d'erreur de Next au corps vide, l'écran n'arrive qu'à l'hydratation"
status: todo
phase: P2
family: front
estimate: S
wave: null
created: 2026-11-11
updated: 2026-11-11
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
  tickets:
    - docs/backlog/tickets/done/TCK-2619-coque-sans-flottant-introuvable.md
tags: [front, coque, introuvable, rendu-serveur, suivi-lot-2]
---

## Objectif utilisateur

Une adresse fausse dans `/app` montre son explication et son chemin de retour dès la première peinture, avant
que le JavaScript ait fini de charger, et pas seulement après l'hydratation. Sur un téléphone lent, c'est la
différence entre une page qui dit tout de suite « Page introuvable » et une page blanche.

## Contexte

Relevé par terrain-5 pendant [TCK-2619](../done/TCK-2619-coque-sans-flottant-introuvable.md), dont l'AC5 exigeait le
`h1` « Page introuvable » et le champ « Aller à… » dans le HTML du serveur. L'AC5 a été amendé le 2026-11-11
(option (a) de la session) : la page répond 404 et l'écran se rend dans la coque **après hydratation**. Ce ticket
porte la moitié retirée.

**Constat, mesuré le 2026-11-11 sur `next build` + `next start`** (worktree propre, `npm ci`, port 3100) :

- `/app/zzz`, `/app/leases/abc-zzz` et `/app/properties/99999999`, vus par l'agent et par l'admin, répondent
  **404** ;
- le document est le **document d'erreur de Next** : `<html id="__next_error__">`, corps de 58 octets hors
  scripts, titre « Tableau de bord — Takussan » ;
- le `h1`, le champ et les retours ne sont que dans la **charge RSC** ; l'écran entier, coque comprise, est rendu
  au client ;
- au navigateur, l'écran est conforme à 390 et 1440, sans erreur de console ;
- en `next dev`, même chose : `<body>` vide hors scripts, gabarit de repli
  `<template data-next-error-message="NEXT_HTTP_ERROR_FALLBACK;404">`.

**Ce n'est pas une régression du lot 1 ni de TCK-2619.** Le même résultat est mesuré sur deux builds :
be658051c + les fichiers de TCK-2619, et **46c0b49f1** (`dev` juste avant la fusion du lot 1, PR #1666).

**Ce que le dépôt affirmait.** Le docblock de `RetourVersLaListe.tsx` rapporte un relevé du 2026-08-27, sur une
sonde jetable en `next dev` et en `next build` : un `not-found.tsx` serveur aurait son texte dans le HTML de la
404. La mesure d'aujourd'hui le contredit sur `/app`.

## Hypothèses — aucune n'est vérifiée

1. **TCK-426** (c0dc2af43, 2026-08-27) a retiré la frontière de suspension ancêtre de `/app` pour que le statut
   404 survive. Sans elle, le rendu serveur d'une erreur de navigation remonterait jusqu'au document d'erreur de
   Next, et la coque entière tomberait.
2. **Le relevé du 2026-08-27 a lu la réponse entière, charge RSC comprise.** Un `includes` sur la page entière
   est vert sur un corps vide, puisque la charge RSC porte les textes ; la même lecture rend « vrai » ici. Le
   HTML serveur de la 404 n'aurait alors jamais existé sous `/app`.

Les deux peuvent être vraies ensemble, et aucune n'est la cause tant que la mesure ci-dessous n'est pas faite.

## Décision

Aucune décision du porteur n'est requise pour la mesure. Si la cause est la frontière de suspension de `/app`
(hypothèse 1), la correction touche le statut 404 de toutes les pages de `/app` qui appellent `notFound()`. Elle
se décide alors par une ADR (ou un amendement de celle qui porte TCK-426), **avant** d'écrire le correctif.

## Contraintes strictes

- **Le statut 404 ne régresse pas.** C'est la raison de TCK-426 : toute correction garde un vrai `HTTP 404` sur
  `/app/zzz` et sur une fiche absente (`/app/properties/99999999`).
- **La lecture du corps exclut les scripts.** On ne juge le HTML serveur que sur le `<body>` débarrassé de ses
  `<script>` (la charge RSC y porte tous les textes). Outils de la mesure de TCK-2619 : `html404.mjs` (requête
  authentifiée, jeton lu par script, jamais imprimé) et `corps.py` (lecture stricte du corps) — scripts de session, non versionnés : à réécrire s'ils manquent, leur rôle tient en ces deux lignes.
- **Un build de production à la fois**, machine au repos (`uptime` < 16), dans un worktree jetable, sans lien
  symbolique vers `node_modules` ; arrêt du seul PID relevé de `next start`.

## Delta à produire

- [x] **Premier pas — la mesure discriminante, en un build.** Fait le 2026-11-14 (voir « Cause établie »). Dans un worktree jetable :
  - un segment-sonde jetable **hors de `/app`**, avec un `not-found.tsx` serveur et une page qui appelle
    `notFound()` ;
  - comme **témoin**, une page normale de `/app` (200) ;
  - lire les deux corps par `corps.py`.

  Lecture :
  - le texte de la sonde est dans le HTML → le relevé du 2026-08-27 tient hors de `/app`, et la cause est propre
    à `/app` (hypothèse 1 à creuser) ;
  - le texte n'y est pas → Next 16 ne rend pas le `not-found` d'un segment au serveur, et l'hypothèse 2 se
    confirme ;
  - le témoin vide → l'outil de lecture est en cause, et rien n'est conclu.
- [x] Écrire la cause établie dans ce ticket, puis corriger le docblock de `RetourVersLaListe.tsx` et celui de
      `not-found.tsx`, qui citent tous deux la mesure.
- [x] Selon la cause : soit un correctif qui met le `h1` et le champ dans le HTML de la 404 de `/app` en gardant
      le statut 404 (ADR d'abord si la frontière de suspension bouge), soit une note qui ferme le ticket en
      expliquant pourquoi Next ne le permet pas.

## Critères d'acceptation

- [x] AC1 — La cause est **mesurée**, pas déduite : le ticket cite les deux corps (sonde, témoin) et leur
      lecture.
- [x] AC2 — *(sans objet : aucun correctif HTML n'est possible, cf. « Cause établie »)* Si un correctif est livré : sur `next build` + `next start`, `GET /app/zzz` rend **404** et son
      `<body>`, scripts retirés, contient le `h1` « Page introuvable » et le champ « Aller à… ». Même mesure sur
      `/app/properties/99999999`. Une ablation du correctif fait retomber le corps au document d'erreur.
- [x] AC3 — Aucun docblock du dépôt n'affirme plus le contraire de la mesure.
- [x] AC4 *(en partie : `/app/zzz` entier ; fiche absente, titre HTML seulement — cf. « Cause établie »)* — **Toute 404 de `/app` porte aujourd'hui le titre « Tableau de bord — Takussan »** (relevé de la
      vérification de TCK-2619, `next dev` comme `next start`, préexistant) : l'onglet nomme le tableau de bord
      pour une page qui n'existe pas. Si un correctif est livré, `/app/zzz` et `/app/properties/99999999` portent
      un titre qui dit « Page introuvable » (dans la langue de l'utilisateur) ; sinon le ticket consigne pourquoi
      ce titre ne peut pas changer sans le rendu serveur de la 404.

## Cause établie (2026-11-14, `next build` + `next start` de 745e3fa3f, port 3100, persona agent)

Lecture par `lire.py` : `<body>` sans `<script>` ni `<template>`.

| Requête | Statut | Corps hors scripts | Texte du not-found |
|---|---|---|---|
| sonde A hors `/app` (`/maintenance/sonde-2740-a/x`, not-found serveur, page `notFound()`) | **404** | 58 o, `<html id="__next_error__">` | charge RSC seulement |
| sonde B, même chose sous un `<Suspense>` dans le layout du segment | **200** | 2 292 o, le repli de Suspense | charge RSC seulement |
| témoin `/app` | 200 | 65 406 o | — |
| `/app/zzz`, `/app/properties/99999999` | 404 | 58 o, `__next_error__` | charge RSC seulement |

**Hypothèse 2 confirmée, hypothèse 1 réfutée.** Next 16.3.1 ne rend jamais au serveur un `not-found` atteint par
`notFound()`, dans `/app` comme ailleurs : la frontière `not-found` est une frontière d'erreur client, que le rendu
serveur de React n'exécute pas ; l'erreur remonte jusqu'à la coquille et Next sert le document d'erreur de
`getErrorRSCPayload` (`app-render.js`), corps vide. Une frontière de suspension n'y change rien pour le texte et fait
perdre le 404 (sonde B) : TCK-426 n'a rien retiré qui rendait ce HTML. Le relevé du 2026-08-27 est démenti.

**Pourquoi aucun correctif HTML.** Un corps rendu au serveur avec un 404 exige un rendu qui ne lève pas — par exemple
servir l'introuvable comme une page et poser le statut ailleurs. C'est structurel (toutes les pages de détail
décident leur 404 par `notFound()` dans leur layout, TCK-442) : ADR et décision du porteur, hors d'un ticket S.

**Titre (AC4), livré en partie.** Le `<head>` du document d'erreur est résolu avec `errorConvention: 'not-found'`,
donc avec les métadonnées du `not-found.tsx` le plus profond. `generateMetadata` y est ajouté, et l'attrape-tout
`[...introuvable]` porte le même titre, que l'onglet garde après l'hydratation. Mesuré au serveur de dev après le
correctif : `<title>` HTML « Page introuvable — Takussan » sur `/app/zzz` et `/app/properties/99999999` ; onglet après
hydratation « Page introuvable — Takussan » sur `/app/zzz`, mais **« Fiche bien — Takussan »** sur la fiche absente :
Next réécrit l'onglet avec les métadonnées de la PAGE demandée. Le corriger demande que chaque page de détail
(neuf `exigerRessource`) décide aussi son introuvable dans `generateMetadata` : ticket de suite si on le veut.

## Hors périmètre

- Le contenu et la fidélité de l'écran introuvable (TCK-2619).
- Les 404 des autres groupes de routes (site public, `/super-admin`) — sauf si la mesure montre qu'elles partagent
  la cause.
