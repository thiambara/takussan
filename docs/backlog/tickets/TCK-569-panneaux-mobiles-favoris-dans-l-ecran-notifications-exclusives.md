---
id: TCK-569
title: "Panneaux mobiles : le panneau des favoris débordait à gauche de l'écran ; notifications et menu utilisateur superposables au clavier (au doigt : build de préproduction antérieur, déjà corrigé)"
status: doing
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-23
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#23-notifications
  models: []
tags: [front, mobile, navbar, favoris, notifications, a11y, ux, retour-testeur]
---

## Objectif utilisateur

Sur téléphone, un visiteur ouvre ses favoris depuis la barre publique et lit le panneau en entier,
dans l'écran. Dans l'espace connecté, un seul panneau de la barre haute est ouvert à la fois, et
un appui à côté le referme — au doigt comme au clavier.

## Contexte

Retour testeur du 2026-09-23 (web + mobile, préproduction), deux points :

- **M4** — barre publique mobile, « Liste décalée. » La capture montre le panneau des favoris
  débordant à gauche de l'écran : « …rites » pour « Favorites », « my favorites » pour « View all
  my favorites ».
- **M14** — espace connecté mobile, « Les modales se superposent et celle des notifs ne se ferme
  pas quand tu appuies dans le vide. » La capture montre le panneau des notifications (débordant
  lui aussi à gauche : « tifications ») et le menu utilisateur ouverts l'un sur l'autre.

Mesures (Chrome headless par CDP, émulation `mobile: true` et tactile, pile locale, 2026-09-23) :

**M4 — confirmé.** Sur HEAD, le panneau est un `absolute right-0 w-80` accroché au cœur. Or le
cœur n'est pas au bord de l'écran : le bouton menu (44 px), l'écart et la gouttière le suivent.
Bord gauche du panneau : **−68 à 320 px** (titre x = −51, lien « Voir tous mes favoris » −51..69),
**−28 à 360**, +2 à 390 ; 711..1095 en bureau (1366). La capture est prise à ~320 px CSS.

**M14 — partiel.**

- *Au doigt, non reproduit sur HEAD.* Sur `/app/messages` à 320 px, compte propriétaire : cloche
  puis avatar → notifications fermées, menu seul ouvert ; avatar puis cloche → les deux fermés ;
  appui dans le vide → fermé. Le panneau à 8..312 (dans l'écran).
- *La capture est celle d'un build antérieur au 2026-09-16.* Avant `f21ccd17` (TCK-529, revue
  design), `NotificationBell` n'avait **aucune** fermeture extérieure et s'ancrait à droite de la
  cloche en `min(24rem, 100vw − 2rem)` : départ ≈ −38 px à 320, exactement le « tifications » coupé
  de la capture. Le correctif est arrivé sur `preview` par la promotion #296 (2026-09-16 23:04 Z,
  `gh run list --workflow=images.yml`). Preuve par le code : `git show c62dc702:…/NotificationBell.tsx`
  contre `f21ccd17`.
- *Au clavier, confirmé sur HEAD, à 320 comme à 1366 px.* L'écouteur de HEAD n'écoute que le
  pointeur : Entrée sur la cloche, Tab jusqu'à l'avatar, Entrée → notifications (8..312) **et**
  menu (113..305) ouverts ensemble ; en bureau 864..1248 et 1158..1350.

## Direction UX / Artistique

- Les deux panneaux passent sur la primitive `Popover` du dépôt (base-ui, pas de Radix) : même
  système d'ouverture et de fermeture que le menu utilisateur voisin (`Menu`, base-ui).
- Le panneau des favoris s'aligne sur le cœur puis se recale dans l'écran à **16 px** des bords,
  la gouttière des pages ; celui des notifications à **8 px**, comme avant (`inset-x-2`).
- Rien ne change en bureau.

## Delta produit

- [x] `components/ui/popover.tsx` : `PopoverContent` transmet `collisionPadding` au positionneur.
      Non transmis, base-ui 1.7 applique son défaut (`collisionPadding = 5` dans
      `useAnchorPositioning`) : les trois autres consommateurs (`date-picker`, `date-time-picker`,
      `PropertyVisitDialog`) sont inchangés — leurs 8 fichiers de tests restent verts (40 tests).
- [x] `FavoritesPopover` : `Popover` + `PopoverTrigger` + `PopoverContent` (`align="end"`,
      `collisionPadding={16}`, `max-w-[calc(100vw-2rem)]`) ; retrait de l'écouteur `mousedown`
      écrit à la main. Apports de la primitive : Échap (qui ne fermait rien), retour du focus au
      cœur, fermeture quand le focus quitte le panneau. Zone tactile de 44 px conservée (TCK-551).
- [x] `NotificationBell` : même passage (`align="end"`, `collisionPadding={8}`, `sideOffset={14}`) ;
      retrait de l'écouteur `pointerdown`/`keydown`. Le panneau n'est plus une `region` mais un
      `dialog` nommé « Centre de notifications » (test existant ajusté).
- [x] Tests : `FavoritesPopover.panneau.test.tsx` (4), `NotificationBell.fermeture.test.tsx` (6).

## Critères d'acceptation

- [x] AC1 — à 320, 360 et 390 px, le panneau des favoris tient dans l'écran, bords à ≥ 16 px, sans
      défilement horizontal. *(Navigateur, arbre de travail : 16..304 à 320 (288 px de large),
      16..336 à 360 et à 390 ; titre et lien à x = 32 ; `scrollWidth` = `innerWidth` partout.)*
- [x] AC2 — en bureau, le panneau des favoris ne bouge pas. *(711..1095 à 1366 px, comme HEAD.)*
- [x] AC3 — un appui à côté ferme le panneau des favoris ; Échap le ferme et rend le focus au cœur.
      *(Navigateur : fermé après un appui dans le vide aux trois largeurs ; test Échap vert.)*
- [x] AC4 — au clavier, ouvrir le menu utilisateur referme les notifications. *(Navigateur à 320 et
      1366 : focus sur l'avatar → notifications déjà fermées, Entrée → menu seul.)*
- [x] AC5 — au doigt, jamais deux panneaux ouverts ensemble, et un appui dans le vide ferme les
      notifications. *(Navigateur à 320 : cloche → avatar = menu seul ; avatar → cloche = tout
      fermé ; cloche → vide = fermé.)*
- [x] AC6 — le panneau des notifications reste à 8 px des bords sous `sm` et à 864..1248 à 1366.
      *(Mesuré ; il s'ouvre désormais 4 px sous la barre au lieu d'en chevaucher le bas de 2 px.)*
- [x] AC7 — chaque correctif porte un test qui rougit sans lui (ablations ci-dessous).

## Vérification

- Ablations (copie, retrait, rouge constaté, restauration par `cp`, md5 identique) :
  - `FavoritesPopover` de HEAD → 4/4 rouges (le test bureau par absence de positionneur : garde).
  - `collisionPadding={16}` retiré → les 2 tests mobiles rouges (recalage à 5 px).
  - transmission de `collisionPadding` retirée de `ui/popover.tsx` → 3 rouges (favoris 360/320,
    notifications 320).
  - `NotificationBell` de HEAD → test clavier rouge ; les deux tests de position rouges par absence
    de positionneur (gardes : la géométrie de HEAD était juste) ; trois gardes vertes.
- `eslint` propre sur les fichiers touchés, `tsc --noEmit` propre, `check-i18n` et
  `check-i18n-namespaces` verts. Aucune clé i18n ajoutée.

## Hors périmètre

- Menu utilisateur ouvert, un appui sur la cloche **ferme le menu sans ouvrir** les notifications :
  c'est le comportement modal par défaut du `Menu` de base-ui (voile interne). Un seul panneau à la
  fois est respecté ; ouvrir d'un seul appui serait une décision produit.
- Le déploiement : la préproduction portera le correctif à la prochaine promotion.
- La recherche et l'espace sous la barre publique mobile (TCK-563).
