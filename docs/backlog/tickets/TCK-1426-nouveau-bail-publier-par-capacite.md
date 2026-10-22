---
id: TCK-1426
title: "« Nouveau bail » et « Publier un bien » se jugent par `leases.create` et `properties.create`"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-152--gestes-hors-de-appagency-montrés-par-le-rôle-jugés-par-la-capacité"
tags: [front, permissions, properties, leases, pistes]
---

## Objectif utilisateur

Un membre de l'agence ne se voit offrir « Nouveau bail » et « Publier un bien » que si l'API les
lui accorde ; le bailleur de l'agence sans `properties.create` se voit offrir « Proposer un bien »,
ce que l'API fera de sa saisie.

## Contexte

Réf : **P152.03** du fichier de pistes, `validé (délégué)` (critère V7 cité par le classement,
accordé).

Mesuré avant correctif (tests ci-dessous, rouges sur `e2959c84c`) : agent `[crm.view_all]` →
« Nouveau bail » affiché ; agent sans `properties.create` → « Publier un bien » au menu et formulaire
de publication ; agent aussi bailleur sans `properties.create` → « Publier ».

## Décision du porteur (déléguée)

> juger par capacité dans l'agence du profil actif, comme l'API : « Nouveau bail » sous `leases.create` ou un profil de bailleur ; l'entrée de menu et le titre de `properties/new` en « Publier un bien » sous `properties.create`, en « Proposer un bien » (libellés existants `proposeProperty` et `proposalTitle`, quota non lu) pour qui n'a que le profil de bailleur dans l'agence, comme `createsProposal`, et absents sans l'un ni l'autre ; aucun texte neuf, aucune règle de l'API ne change ; tests de `AppSidebar`, de `properties/new` et de la page des baux avec un agent sans ces capacités, et un agent aussi bailleur sans `properties.create`

## Hypothèses (mode sans humain)

- Les capacités se lisent par `capacitesDuProfilActif()` côté serveur et `useMyCapabilities()`
  dans la barre latérale (cache amorcé par le layout pour l'admin d'agence).
- « Profil de bailleur » se lit par le rôle `owner` (toutes agences : angle 176, écarté).
- Tant que les capacités ne sont pas lues, le personnel n'a aucune entrée de création au menu
  (ni « Publier » qu'il n'aurait peut-être pas, ni « Proposer » qui basculerait).
- « Absents sans l'un ni l'autre » sur `properties/new` : un layout neuf du segment renvoie vers
  `/app/properties` (307, TCK-426), et vers `/verification-indisponible` quand les capacités d'un
  membre du personnel non bailleur sont illisibles, comme `garderPageAdmin`.

## Delta à produire

- [x] `lib/access/creation-de-bien.ts` (`modeDeCreationDeBien`) ; `properties/new/layout.tsx` ;
  `properties/new/page.tsx` en tire `proposition`.
- [x] `AppSidebar` : `buildNavItems(user, capacites)`.
- [x] `leases/(liste)/page.tsx` : « Nouveau bail » sous bailleur ou `leases.create`.
- [x] Tests : `AppSidebar.proposition.test.ts` (cinq cas neufs), `creation-par-capacite.test.tsx`,
  `nouveau-bail-par-capacite.test.tsx` ; les tests qui modélisent un rôle système reçoivent
  `properties.create`.

## Critères d'acceptation

- [x] AC1 — Agent sans `leases.create` : pas de « Nouveau bail » ; avec, ou bailleur : affiché.
- [x] AC2 — Menu : « Publier » sous `properties.create`, « Proposer » pour l'agent bailleur sans
  elle, rien sans l'un ni l'autre.
- [x] AC3 — `properties/new` : publication, proposition, ou renvoi vers la liste des biens.

## Reste à faire

> le bouton de l'état vide de la liste des biens (`PropertyList.tsx`, `PortfolioEmpty`) mène à `/app/properties/new` sans juger `properties.create` ni le profil de bailleur

## Notes d'implémentation

- Ablation : `AppSidebar.tsx`, les deux pages rendues et le layout vidé → 1 + 3 + 3 rouges ;
  remis → 4 + 4 + 10 verts.
- `buildNavItems` sans capacités rend `null` (inconnu) : les tests de menu qui modélisent un rôle
  système passent `['properties.create']`, et les rendus montés simulent `useMyCapabilities`.
