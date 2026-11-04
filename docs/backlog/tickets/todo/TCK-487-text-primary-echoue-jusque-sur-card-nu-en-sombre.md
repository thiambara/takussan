---
id: TCK-487
title: "`text-primary` échoue jusque sur `--card` NU en thème sombre : 3,39 à 4,51:1, troisième jeton du même motif"
status: todo
phase: P1
family: front
estimate: M
wave: 54
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-480, TCK-484]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, design-system, accessibilite, contraste, jeton, dette]
---

## Objectif utilisateur

Une visite au calendrier, un état des lieux de sortie, un devis en attente : trois libellés
peints avec la couleur de marque, et qui ne tiennent pas le seuil de lisibilité.

## Le défaut, mesuré par TCK-484 le 2026-08-30

`text-primary` — le terracotta `--primary`, `#a85332` en clair, `#c87a52` sous `.dark` — mesuré
sur les surfaces réelles des trois familles de tons (calendrier, inventaire, maintenance), aplat
composé avant le ratio :

```
text-primary sur bg-primary/ 0   pire = 3,99:1  (sombre, bg-muted)   ✗
             sur bg-primary/10   pire = 3,47:1                        ✗
             sur bg-primary/12   pire = 3,39:1                        ✗
             sur bg-primary/15   pire = 3,24:1                        ✗
```

⚠ **Il échoue jusque sur `bg-card` NU en thème sombre — 4,07:1** — c'est-à-dire là où aucun aplat
ne vient l'assombrir. *Aucun alpha d'aplat ne rattrape une encre trop claire* : c'est mot pour mot
la conclusion de TCK-480 sur `--destructive`, et c'est le même défaut, sur le troisième jeton.

**15 couples restaient sous 4,5:1 à la clôture de TCK-484, et les 15 sont celui-ci** — la visite
du calendrier, `move_out` de l'inventaire, `quote_requested`/`quote_submitted` de la maintenance.

## Pourquoi ce n'est pas un ticket de pastille

`--primary` n'est pas un jeton de signal comme `--destructive` : c'est la **couleur de marque**.
Elle tient `Button` par défaut, les liens, les onglets actifs, l'anneau de focus, la barre latérale.
La corriger est une décision de palette. C'est aussi ce qui rend le ticket urgent plutôt que
l'inverse : *un jeton employé partout échoue partout.*

⚠ **Le périmètre est à établir AVANT de trancher la valeur, et par les littéraux**, jamais par les
importateurs — la leçon de TCK-472, reprise par TCK-480 qui a compté 154 fichiers et 381
occurrences de cette façon. `--primary` en aura davantage.

⚠⚠ **Le sens n'est pas le même que pour `--destructive`.** Là-bas, le clair était le fautif et le
sombre presque bon. Ici, le pire cas relevé est **en sombre**. Un ticket qui ne mesurerait qu'un
thème conclurait l'inverse de la vérité — TCK-480 a fait exactement cette erreur à sa première
version, et c'est une garde au périmètre trop étroit qui l'a laissée passer au vert.

## Contrat de données

Aucun.

## Delta à produire

- [ ] Recenser par littéraux (`text-primary`, `bg-primary`, `border-primary`, `ring-primary`, les
      recettes de variantes de `ui/button.tsx`, `ui/badge.tsx`, `ui/tabs.tsx`) — avec le compte.
- [ ] Trancher : ajuster le jeton, ou dissocier une encre (`--primary-deep` **existe déjà** :
      `#823c20` en clair — vérifier ce qu'il vaut sous `.dark` et pourquoi il n'est pas employé
      ici).
- [ ] Vérifier l'inverse : `bg-primary` plein sous `text-primary-foreground` — les deux directions
      se contredisent, c'est ce qui a coûté à TCK-485.

## Critères d'acceptation

- [ ] **AC1** — tout texte peint avec `--primary` atteint 4,5:1 sur la surface où il est réellement
      posé, dans les **deux** thèmes, mesuré par calcul sur les couleurs RENDUES.
- [ ] **AC2** — le recensement part des littéraux et des recettes, **jamais des importateurs**.
- [ ] **AC3** — une garde refuse le retour sous seuil. `scripts/check-destructive-contrast.mjs`
      porte le patron exact (jeu d'aplats DÉRIVÉ du code et séparé par thème, surfaces
      `--background`/`--card`/`--muted`, cliquet, auto-épreuve) et `scripts/lib/contraste.mjs` la
      formule : **la généraliser plutôt que d'en écrire une troisième**, ou dire pourquoi non.
- [ ] **AC4** — le ratio du bouton primaire au SURVOL est mesuré : `hover:bg-primary/80` tombe à
      3,45:1 sur la surface publique, dette déjà consignée dans
      `src/test/__tests__/surface-publique.contraste.test.ts` (famille 2). Ce ticket la ferme ou
      dit pourquoi il ne la ferme pas.
- [ ] **AC5** — ablation : rétablir les valeurs d'aujourd'hui fait rougir AC1 et AC3, changement
      prouvé par `md5` **avant** lecture du résultat.
- [ ] **AC6** — vérification à l'écran, les deux thèmes, sur un lien, un onglet actif et une
      pastille. *Un ratio seul n'a pas vu le bouton invisible de TCK-471.*

## Hors périmètre

- `--destructive` (TCK-480, livré) et le blanc posé dessus (TCK-485).
- Les quatre teintes distinctes que TCK-381 a posées sur le calendrier : la contrainte tient, et
  un correctif qui y substituerait un autre jeton passerait AC1 en effaçant ce qu'on mesure.

## Notes d'implémentation

Relevé par TCK-484 en mesurant AC2 sur les trois familles de tons conservées, et **écrit plutôt
que contourné** : substituer un autre jeton à la visite du calendrier aurait rendu son AC verte en
supprimant la contrainte qu'on mesurait. Troisième occurrence du même motif après `--destructive`
(TCK-480) et le blanc sur aplat plein (TCK-485) — *trois tickets sur trois jetons, trouvés chacun
en cherchant autre chose : c'est la palette qui n'a jamais été mesurée, pas les écrans.*
