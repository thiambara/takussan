---
id: TCK-2831
title: "L'onglet d'une fiche absente de /app dit « Page introuvable » après l'hydratation, pas le titre de la fiche"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
  tickets:
    - docs/backlog/tickets/todo/TCK-2740-la-404-de-app-sort-sans-html-serveur.md
    - docs/backlog/tickets/done/TCK-2619-coque-sans-flottant-introuvable.md
tags: [front, introuvable, metadata, titre, suivi-lot-2]
---

## Objectif utilisateur

Quand une fiche de `/app` n'existe pas (ou est hors de l'agence), l'onglet du navigateur dit « Page introuvable »
du début à la fin, et pas « Fiche bien » une fois la page chargée.

## Contexte

Suite de [TCK-2740](../todo/TCK-2740-la-404-de-app-sort-sans-html-serveur.md), décision 1 (a) de la session.
TCK-2740 a ajouté `generateMetadata` à `(dashboard)/app/not-found.tsx`. Mesuré le 2026-11-14 (build et serveur de
dev, persona agent) :

- `/app/properties/99999999` : `<title>` du HTML « Page introuvable — Takussan », parce que le document d'erreur
  de Next résout ses métadonnées avec `errorConvention: 'not-found'` ;
- **après l'hydratation, l'onglet devient « Fiche bien — Takussan »** : Next réécrit le titre depuis la charge
  RSC, avec les métadonnées de la PAGE demandée, dont `generateMetadata` ignore que la ressource manque ;
- `/app/zzz` n'a pas ce défaut (l'attrape-tout porte le titre de l'introuvable).

Les neuf pages de détail décident leur introuvable dans leur `layout.tsx` par `exigerRessource`
(`@/lib/detail/ressource-de-detail`, mémoïsé par `cache()`, TCK-442) : `bookings`, `customers`, `documents`,
`inventories`, `leases`, `maintenance`, `owners`, `properties`, `visits` (`[id]`).

## Hypothèse — à vérifier avant d'écrire le correctif

`generateMetadata` de chaque page (ou de son layout) appelle `await exigerRessource(<segment>, id)` avant de rendre
son titre. Un `notFound()` levé dans `generateMetadata` fait résoudre les métadonnées avec la convention
`not-found`, donc le titre de `(dashboard)/app/not-found.tsx`. `cache()` devrait partager la promesse avec le
layout (aucun aller-retour de plus) : **le mesurer** (compte des requêtes à l'API par chargement, avant/après), ainsi
que l'effet des métadonnées diffusées (`serveStreamingMetadata`) sur le statut 404.

## Contraintes strictes

- Le statut **404** des neuf fiches absentes ne régresse pas (TCK-426, TCK-442).
- Aucune lecture de plus vers l'API pour une fiche présente.
- Le titre d'une fiche présente ne change pas (`titres-onglets.test.ts` reste vert).

## Critères d'acceptation

- [x] AC1 — Sur les neuf pages de détail, une fiche absente garde « Page introuvable — Takussan » dans
      `document.title` après l'hydratation (relevé au navigateur, au moins `properties` et `leases`, persona agent).
- [x] AC2 — Ces mêmes URL répondent toujours **404**.
- [x] AC3 — Une fiche présente : même titre qu'avant, et même nombre de requêtes à l'API par chargement.
- [x] AC4 — Une garde (à la manière de `etats-de-route.test.ts`) rougit si une page de détail qui décide son
      introuvable par `exigerRessource` a un `generateMetadata` qui ne l'appelle pas ; ablation consignée.

## Hors périmètre

- Le HTML du 404 (TCK-2740, décision 2 (a) : fermé, Next 16 ne le rend pas au serveur).
- Les 404 du site public.

## Notes d'implémentation (2026-11-14)

- **Hypothèse vérifiée.** Le `generateMetadata` de chaque page de détail appelle `exigerRessource('<s>', id)` avant
  son titre ; son `notFound()` fait résoudre les métadonnées par la convention `not-found`.
- **Écartée, mesurée** : poser ce `generateMetadata` dans le `layout.tsx` (où l'introuvable se décide déjà). Sur
  `properties`, le `<title>` du 404 disparaît (vide avant comme après l'hydratation) et la sonde part deux fois.
- **Preuves.** AC1/AC2 : relevé CDP, persona agent, les neuf segments à 390 et 1280, `/app/<s>/99999999` → 404,
  `<title>` « Page introuvable — Takussan » avant et après l'hydratation (au HEAD : « Fiche bien », « Bail #99999999 »…).
  AC3 : titres des fiches présentes inchangés ; le journal de l'API compte une lecture du `show` par chargement,
  avant comme après (`cache()` partage la sonde du layout). AC4 : `titre-de-la-fiche-absente.tck-2831.test.ts`
  (source + montage, dérivé de l'arbre) ; ablation : appel retiré de `bookings` → 2 rouges.
- **Garde adaptée.** `etats-de-route.test.ts` refusait tout `exigerRessource(` dans une page sous repli. Il exempte
  désormais ce seul miroir : dans `generateMetadata`, du segment du dossier, et seulement si le layout fait le même
  appel. Ablations : l'appel dans le rendu de la page → rouge ; l'appel retiré du layout → rouge.
- **Bail.** L'identifiant illisible garde son titre « Bail introuvable » (branche testée par TCK-382, avant la sonde).
- **Hors périmètre, constaté.** Un refus de RÔLE dans un layout (`owners/[id]` pour un agent : 404 par
  `assertCanReachOwnerAccount`) a le même défaut d'onglet (« Fiche du bailleur » après l'hydratation).
