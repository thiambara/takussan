---
id: TCK-503
title: "Coque du tableau de bord — `h-screen` sur un téléphone, une unité que TCK-501 a dû abandonner un cran plus bas"
status: review
phase: P2
family: bug
estimate: S
wave: 58
created: 2026-08-31
updated: 2026-08-31
depends_on: [TCK-501]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, bug, dashboard, responsive]
---

## Objectif utilisateur

Un utilisateur qui ouvre n'importe quelle page de `/app/*` depuis un téléphone doit atteindre le
bas de ce qu'elle affiche.

## Contrat de données

Aucun changement d'API. Le défaut, s'il est confirmé, est entièrement de mise en page.

## Direction UX / Artistique

Rien de neuf à dessiner. La coque doit occuper le **viewport réellement visible**, pas la hauteur
que le navigateur annonce barre d'adresse rétractée.

## Contraintes strictes (métier)

1. **RELEVER AVANT DE CORRIGER.** Ce ticket naît d'un fait de CODE, pas d'une mesure : la coque
   (`takussan-web/src/components/layout/AppShell.tsx`) est en `h-screen`, c'est-à-dire `100vh` —
   l'unité exacte que TCK-501 a dû remplacer par `dvh` un niveau plus bas, pour la raison écrite
   dans sa contrainte 2. **On ne sait pas encore ce que ça coupe à l'écran, ni de combien.**
   Le `main` intérieur porte `overflow-y-auto`, ce qui peut absorber tout ou partie de l'écart, et
   le document lui-même défile, ce qui rétracte la barre et corrige peut-être le cas en pratique.
   *Une correction posée sans relevé se juge sur sa plausibilité, pas sur son effet.*
2. Si le relevé montre que rien n'est coupé, **le ticket se ferme en `obsolete` avec le relevé
   dans ses notes**. C'est un résultat, pas un échec.
3. La coque sert **toutes** les pages `/app/*` et `/admin/*` : une modification de sa hauteur se
   juge sur plusieurs pages, pas sur celle qui a déclenché le ticket.

## Delta à produire

- [x] Relevé au navigateur, à 390 px de large et à hauteur de viewport réduite (barre d'adresse
      déployée) : quelle bande, en pixels, est hors de portée sur au moins trois pages de `/app/*`
      dont une longue et une courte.
- [x] Si la bande est réelle : coque en unité dynamique, avec le repli qu'exige la barre latérale
      en `md:h-full`.
- [x] Tests : la classe de hauteur de la coque est gardée par une assertion qui rougit si l'on
      rétablit `h-screen`.

## Critères d'acceptation

- [x] AC1 — le relevé est écrit dans les notes du ticket, avec la commande ou la manipulation qui
      le reproduit et sa date.
- [x] AC2 — à 390 px de large et barre d'adresse déployée, le dernier élément interactif d'une
      page longue de `/app/*` est atteignable.
- [x] AC3 — à 1440 px, la coque est **inchangée** : barre latérale pleine hauteur, `main` seul à
      défiler.
- [x] AC4 — le test rougit si l'on rétablit `h-screen` (ablation).

## Hors périmètre

- La messagerie pleine page, corrigée par TCK-501 — c'est elle qui a rendu ce cas visible, elle
  n'en dépend plus.
- Toute refonte de la barre latérale ou de la barre supérieure.

## Notes d'implémentation

### Le relevé (AC1) — 2026-08-31, Chrome 152 headless piloté en CDP direct

**Reproduction.** API et front lancés (`php artisan serve --port=8002`, `npm run dev`) ; Chrome
lancé à part (`--headless=new --remote-debugging-port=9333`) parce que le serveur MCP de ce poste
parle à Chrome par tube et n'expose pas `Emulation.*` ; session authentifiée en posant le cookie
httpOnly depuis la page (`fetch('/api/auth/set-token', …)` avec un jeton Sanctum d'`agent1@dakarimmo.sn`) ;
`Emulation.setDeviceMetricsOverride {width:390, height:844, mobile:true}` ; puis, par page,
`main.scrollTop = main.scrollHeight` suivi de la lecture des rectangles.

**Ce que le poste ne peut PAS mesurer, et il faut le dire avant le reste.** Chrome de bureau
n'émule aucune barre d'adresse rétractable : mesuré sur une page témoin, `100vh == 100svh ==
100lvh == 100dvh == innerHeight`, et **aucun** réglage CDP ne les sépare (`setVisibleSize` inclus,
sans effet). **La bande en pixels ne pouvait donc pas être produite par émulation.** Ce qui a été
mesuré à la place est le *mécanisme*, qui lui est entièrement décidable — et qui suffit à trancher.

**Le fait décisif : le document de `/app/*` ne défile NULLE PART.**
`document.scrollingElement.scrollHeight - clientHeight === 0` sur les 6 pages sondées, et de même
sur `/admin` et `/super-admin`. Or sur un téléphone la barre d'adresse ne se rétracte QUE sur un
défilement du document. Elle reste donc déployée pour toute la vie de la page, pendant que `100vh`
continue de valoir la hauteur *sans* elle : **l'écart ne se referme jamais**, contrairement à
l'hypothèse de la contrainte 1.

**Le `main` n'absorbe pas l'écart non plus** — seconde hypothèse de la contrainte 1, également
fausse. Il défile *à l'intérieur* d'une boîte dont le bas est cloué à `100vh` : arrivé au bout de
son défilement, le dernier pixel de contenu est **à** `100vh`, donc sous le pli.

| Page | classe | `docDefile` | `mainDefile` | marge du dernier élément interactif au bord bas |
|---|---|---|---|---|
| `/app/properties` (longue) | `h-screen` | **0** | 2490 px | **24 px** — la pagination « Précédent » |
| `/app/profile` (longue) | `h-screen` | **0** | 2626 px | **86 px** — « Gérer les préférences » |
| `/app/payments` (courte) | `h-screen` | **0** | 0 | 146 px |
| `/app/visits` (courte) | `h-screen` | **0** | 0 | 524 px |
| `/app/saved-searches` (courte) | `h-screen` | **0** | 0 | 592 px |
| `/app/messages` (courte) | `h-screen` | **0** | 0 | 647 px (contenu à 8 px) |
| `/admin` | `h-screen` | **0** | 0 | 387 px |
| `/super-admin` (longue) | `h-screen` | **0** | 1081 px | contenu à **0 px** du bord |

**Conclusion : la bande hors de portée vaut exactement la hauteur de la barre d'adresse, sur toute
page dont le `main` défile.** Les seuils mesurés (24 px, 86 px, 0 px) sont sous celle de tous les
navigateurs mobiles courants. Sur les pages courtes, rien n'est coupé — la contrainte 2 ne
s'applique donc pas : le défaut est réel, sur les pages longues.

### Trois coques, pas une (écart de périmètre assumé — à valider)

La contrainte 3 écrit « la coque sert toutes les pages `/app/*` et `/admin/*` », au singulier. Il y
en a **trois**, au balisage recopié et au défaut identique : `AppShell` (`/app/*`), `AdminShell`
(`/admin/*`) et `SuperAdminShell` (`/super-admin/*`). Les deux premières sont nommées par le
ticket ; la troisième a été corrigée avec elles, ayant été **mesurée porteuse du même défaut**
(`/super-admin`, contenu à 0 px du bord). Corriger deux copies sur trois aurait laissé un défaut
connu derrière une correction qui prétend le fermer.

### Pourquoi le test garde l'UNITÉ ÉCRITE et non la géométrie

Aucune assertion de géométrie ne peut distinguer la coque juste de la fausse : ni jsdom ni Chrome
de bureau ne rendent `dvh` différent de `vh` (mesuré ci-dessus). Le fait gardé est donc la classe,
comme pour la messagerie un cran plus bas (`MessagesPage.test.tsx`, TCK-501). Le
`not.toContain('h-screen')` n'est pas une redondance de `toHaveClass('h-dvh')` : sans lui,
`h-screen h-dvh` — où c'est la dernière déclarée qui gagne, donc un vert trompeur possible — passerait.

### Vérifications

- **Ablation (AC4)** : `h-screen` rétabli coque par coque → 1 rouge, puis 2, puis 3. Chaque coque
  porte donc bien sa propre assertion.
- **AC3, à 1440×900, avant/après**, mêmes commandes : `coqueH` 900, `docDefile` 0, `mainDefile`
  751 (`/app/properties`) et 2092 (`/app/profile`), barre latérale visible à 844 px de haut donc
  pleine hauteur, bas du dernier bouton à 868 px et 836 px, aucun débord horizontal. **Toutes les
  valeurs sont identiques avant et après** — seul le nom de la classe change.
- **AC2** : vérifié dans sa moitié mesurable (à 390 px après correction, `main` défile toujours,
  dernier bouton dans le viewport, aucun débord horizontal). La moitié « barre d'adresse
  déployée » **n'est pas reproductible sur ce poste** — elle repose sur la définition CSS de `dvh`
  et sur le relevé du mécanisme ci-dessus, pas sur une observation.
- `npm run lint` 0 erreur (37 avertissements préexistants), `npx tsc --noEmit` propre.

⚠ **Prettier n'est pas un outil de ce dépôt** (aucune config, aucune dépendance) : le lancer
reformate tout le fichier en double quotes contre un code en simple quote. Écart introduit puis
annulé pendant ce ticket.
