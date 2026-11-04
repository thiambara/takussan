---
id: TCK-947
title: "Le poids du JS de chaque route publique se lit après le build de web-ci, et zod ne revient pas dans le layout racine"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#aucune-garde-ne-voit-le-poids-du-js-dune-route"
tags: [front, performance, ci, pistes]
---

## Contexte

Piste P33.05. Next 16 n'imprime plus la colonne « First Load JS » à la fin de `next build` : aucune
garde ne voit le poids d'une route. Deux défauts de poids (P33.01, les polices ; P33.02, zod dans
le layout racine, TCK-743) n'ont rien cassé et n'ont laissé de trace dans aucun journal. La mesure
tient sur des fichiers que `next build` produit déjà, sans dépendance. L'implémenteur avait laissé
la piste au porteur : le script ne sert que branché dans `.github/workflows/web-ci.yml`, chemin
fermé aux agents.

Décision du porteur, recopiée de la ligne Statut : « porteur (2026-10-18) : traité hors agents, en
session : `poids-des-routes.mjs` branché après le build de `web-ci`, en rapport sans seuil, qui
refuse `zod` dans le layout racine ».

## Objectif utilisateur

Le visiteur d'une page publique ne paie pas en silence un JS qui grossit : le poids de chaque route
s'imprime à chaque CI du front, et le retour de zod dans le JS que toutes les pages chargent casse
la CI.

## Delta

- `takussan-web/scripts/poids-des-routes.mjs` : lit `build-manifest.json` (`rootMainFiles`),
  `app-path-routes-manifest.json`, le manifeste client de chaque route de `[locale]/(public)`
  (`entryJSFiles`) et `server/next-font-manifest.json` ; imprime par route le JS initial gzip
  (union des morceaux, chacun compté une fois, gzip `zlib` niveau par défaut) et les polices
  préchargées. Sorties : 0 rapport ; **1 seulement si zod est dans le JS du layout racine**
  (chaînes `"$ZodType"`/`"$ZodError"`… que zod 4 passe à `$constructor`, intactes après
  minification) ; 2 si la sortie du build est absente, illisible (JSON ou manifeste client
  tronqué, police nommée mais absente) ou ne porte aucune route publique.
- `.github/workflows/web-ci.yml` : étape « Poids des routes publiques (TCK-947) » juste après
  « Build », dans le job `quality`.
- `takussan-web/src/test/__tests__/poids-des-routes.test.ts` : le script lancé par `node` sur une
  sortie de build factice de la même forme — rapport, refus, zod dans une page toléré, build absent,
  trois sorties illisibles. L'entrée du layout racine y porte deux morceaux, zod dans le second.

## Critères d'acceptation

- [x] **AC1** — Le script imprime, pour chaque route publique et elles seules, le JS initial gzip et
      les polices préchargées, sans seuil, et sort en 0. *Mesuré : test « rapporte chaque route
      publique » vert ; sur la sortie de compilation réelle du 2026-10-18 (copiée hors de l'arbre,
      `app-path-routes-manifest.json` dérivé des manifestes clients faute de build complet, cf.
      Reste) → 18 routes, sortie 0 ; la page légale à 321,6 Kio, à 1 Kio des 322,7 relevés par
      TCK-850 avec une autre méthode.*
- [x] **AC2** — zod dans le JS du layout racine → sortie 1, le morceau nommé ; zod dans une page →
      sortie 0. *Mesuré : tests factices verts ; sur la sortie réelle, le morceau zod réel
      (`1f6glm94c8plh.js`) ajouté à l'entrée `[project]/src/app/layout` d'un seul manifeste → sortie
      1 qui le nomme, manifeste restauré par `cp` (`md5` `b30e9d04…` identique) → 0 ; sur l'ancien
      build local du 2026-09-26, antérieur à TCK-743, le script rendait déjà 1 en nommant ce même
      morceau.*
- [x] **AC3** — Une sortie de build absente sort en 2, jamais en 0. *Mesuré : test « sans sortie
      de build » vert ; sur le build réel interrompu du 2026-10-18 (sans
      `app-path-routes-manifest.json`) → sortie 2 et le fichier manquant nommé.*
- [x] **AC4** — Ablation : la sortie 1 retirée du script fait rougir le test du refus. *Mesuré :
      `if (false && zod.length > 0)` → 1 rouge sur 4 ; restauré par `cp`, `md5` `c053a142…`
      identique, 4 verts. Revue adverse : un script qui ne lirait que le premier morceau de
      l'entrée du layout racine (`.slice(0, 1)`) → le test du refus rouge (zod dans le second
      morceau) ; restauré, `md5` `6bc41011…`, 7 verts.*
- [x] **AC4bis** — Une sortie de build illisible sort en 2 par `echec()`, sans pile, jamais en 1.
      *Mesuré : JSON tronqué, manifeste client tronqué, police nommée mais absente → 3 tests verts ;
      le script d'avant ces lectures encadrées (`md5` `c053a142…`) remis en place → les 3 rouges
      (« expected 1 to be 2 ») ; restauré, `md5` `6bc41011…` ; sur le build complet de 21:51,
      toujours 18 routes et sortie 0.*
- [x] **AC5** — L'étape est branchée dans `web-ci.yml`, après « Build », dans le job `quality`.
      *Lu : `.github/workflows/web-ci.yml`, étape « Poids des routes publiques (TCK-947) ».*
- [x] **AC6** — Sur un `npm run build` complet, le script sort en 0 et imprime le rapport, en local
      ou dans le journal de `web-ci`. *Mesuré par la session le 2026-10-18 à 21:51, l'arbre du lot
      stable : `npm run build` sorti en 0 (TypeScript compris), puis `node scripts/poids-des-routes.mjs`
      → 18 routes (de 259,7 Kio pour `/[locale]/playground` à 549,3 Kio pour `/[locale]/properties`),
      « ✓ zod absent du JS du layout racine », sortie 0.*

## Hors périmètre

- Un seuil de poids par route : à décider à part, sur les chiffres que ce rapport accumulera.
- Les routes de la console (`/app`, `/super-admin`) : le rapport ne lit que `[locale]/(public)`.
- Le poids du CSS initial (P33.06).
- **Le refus ne voit que l'entrée `[project]/src/app/layout`**, comme le dit la décision.
  `src/app/error`, `src/app/not-found` et `global-error` sont aussi dans les `entryJSFiles` de
  chaque route, et le rapport les compte dans le JS initial : zod importé par `src/app/error.tsx`
  pèserait sur toutes les pages sans rien faire échouer (revue adverse : morceau zod injecté dans
  l'entrée `error` → la page légale passe de 321,6 à 385,8 Kio, sortie 0). L'étendre se décide à
  part. Le trou est aussi écrit dans l'en-tête du script.

## Notes d'implémentation

- Remesure du 2026-10-18 : `ls takussan-web/scripts | grep -i poids` → vide ; aucun script ni
  workflow ne lit `gzip` ou un budget de poids ; Next 16.3.1 n'imprime pas de « First Load JS ». Le
  constat tient.
- « JS initial » = `rootMainFiles` ∪ tous les `entryJSFiles` du manifeste de la route (layouts,
  page, `error`, `loading`, `not-found`) : la méthode de TCK-850, à ceci près qu'elle compte chaque
  morceau une fois. Un chiffre se compare à un autre chiffre de ce script, pas à un relevé du
  navigateur (brotli, cache).
- La marque de zod ignore `@hookform/resolvers`, qui n'écrit que `x.$ZodError` sans guillemets :
  vérifié sur les 212 morceaux de l'ancien build, un seul la porte, le morceau de zod.
