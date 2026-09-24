---
id: TCK-569
title: "Panneaux mobiles : le panneau des favoris débordait à gauche de l'écran ; notifications et menu utilisateur superposables au clavier (au doigt : build de préproduction antérieur, déjà corrigé)"
status: done
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-24
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

- *Au doigt, non reproduit sur HEAD* (mesure du 2026-09-23, AVANT le voile — le comportement a
  changé depuis, voir AC5). Sur `/app/messages` à 320 px, compte propriétaire : cloche
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
      notifications. *(Re-mesuré le 2026-09-24 APRÈS le voile (D3/R1 ci-dessous), navigateur à 320
      sur `/app/messages` : cloche → notifications seules ; puis avatar → **tout fermé** ; avatar
      encore → menu seul ; puis cloche → tout fermé ; cloche encore → notifications seules ; appui
      sous le panneau (160, 600 — le panneau chargé couvre 60..505) → fermé, URL inchangée. La
      mesure d'avant le voile, « cloche → avatar = menu seul », n'est plus le comportement : un
      appui à côté d'un panneau ne fait que le fermer, dans les deux sens.)*
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

- ~~Menu utilisateur ouvert, un appui sur la cloche ferme le menu sans ouvrir les notifications~~ :
  tranché le 2026-09-24 (voir « Solde de la vérification ») — la règle est désormais la même dans
  les deux sens.
- Le déploiement : la préproduction portera le correctif à la prochaine promotion.
- La recherche et l'espace sous la barre publique mobile (TCK-563).

## Solde de la vérification (2026-09-24)

Défauts et risques résiduels laissés par la vérification du 2026-09-23, chacun reproduit (Chrome
headless, CDP, émulation mobile + tactile, pile locale) puis soldé :

- **D1 — le `max-w` du panneau des favoris n'était gardé par aucun test** (la géométrie simulée
  donnait 320 px quoi qu'il arrive). *Test ajouté* : la simulation plafonne la largeur par la classe
  `max-w-[calc(100vw-2rem)]` résolue à la main, et un test exige 16 px à DROITE aussi à 320 px (sans
  le plafond : 16..336, débordement). Ablation : `max-w` retiré → 1 rouge ; restauré, md5 identique.
- **D2 — AC2 donnait 711..1095 quand la vérification mesurait 686..1070** : *re-mesuré, le chiffre
  du ticket est juste* — 711..1095 à 1366, cœur 1059..1095 (bord droit du panneau sur celui du cœur).
  Le 686..1070 venait de `Navbar.tsx` modifié en parallèle pendant la vérification.
- **D3 — un appui à côté du panneau des favoris activait ce qui est dessous** : *reproduit* (320 px,
  appui en (160, 560) : panneau fermé ET `/fr` → `/fr/properties/parking-couvert-a-pikine-UjterU`).
  Décision (déléguée par le porteur) : un appui à côté d'un panneau de barre le FERME et ne fait rien
  d'autre — la règle que TCK-551 a posée pour le menu mobile. *Correctif* : `PopoverContent` reçoit
  une option `voile` (voile transparent `fixed inset-0 z-[1099]`, sous le panneau `z-[1100]`),
  prise par les favoris et les notifications. ⚠ Le voile interne de base-ui (`modal`) avait été
  essayé : sans `z-index`, il passe SOUS le lien étiré des cartes (`absolute inset-0 z-[1]`) —
  mesuré par `elementFromPoint`, l'appui naviguait encore. Après : panneau fermé, URL `/fr`
  inchangée ; un appui sur le bouton favori d'une carte sous le voile ne le bascule pas. Tests :
  `FavoritesPopover.panneau.test.tsx` (voile présent, au-dessus du contenu et sous le panneau ; un
  appui dessus ferme sans rien activer). Ablations : `voile` retiré des favoris → 1 rouge ; rendu du
  voile retiré de `ui/popover.tsx` → 2 rouges (favoris, notifications).
- **R1 — asymétrie menu / cloche** (menu ouvert, un appui sur la cloche ne faisait que fermer ;
  cloche ouverte, un appui sur l'avatar fermait ET ouvrait le menu) : *tranché* avec D3 — le voile
  des notifications rend la règle identique dans les deux sens. Mesuré à 320 px sur
  `/app/messages` : cloche → notifications ; avatar → tout fermé ; avatar → menu ; cloche → tout
  fermé. Test : `NotificationBell.fermeture.test.tsx` (« un appui sur l'avatar referme le panneau
  sans ouvrir le menu »). Ablation : `voile` retiré de la cloche → 1 rouge.
- **R2 — la préproduction montre un build ancien** : *sans objet pour le code* — état de
  déploiement ; M14 au doigt y est depuis la promotion #296, le reste arrivera à la suivante.
- **R3 — mesuré sous Chrome en émulation tactile, pas sur un iPhone** : *accepté*, aucun appareil
  iOS n'est pilotable d'ici.
- **R4 — le positionneur n'avait pas été mesuré page défilée** : *mesuré* — `/fr`, `scrollY` 600
  puis 900 panneau ouvert : cœur 216..252 × 16..52 et panneau 16..304 × 60..224 à 320 (16..336 à
  390), inchangés ; `scrollWidth` = largeur de l'écran.

### Seconde vérification (2026-09-24) — ce qu'elle a relevé, et ce qui en a été fait

- **AC5 coché avec une mesure devenue fausse** (« cloche → avatar = menu seul » : c'était le
  comportement d'avant le voile) : *reproduit* — après la cloche, un appui sur l'avatar ferme tout ;
  un second ouvre le menu. *Ticket corrigé* : AC5 porte la mesure re-prise après le voile, et la
  note du Contexte est datée comme antérieure. ⚠ Premier essai de la re-mesure faussé par la
  mesure elle-même : un appui en (160, 500) « ne fermait pas » — `elementFromPoint` et la trace des
  événements montrent un `LI` DU panneau, qui s'étend à 505 une fois ses dix notifications
  chargées. L'appui sous le panneau (160, 600) ferme. Aucun défaut de comportement.
