---
id: TCK-645
title: Messagerie repensée pour le mobile, « Nouveau groupe » masqué en agence individuelle
status: done
phase: P1
family: front
estimate: M
wave: 77
created: 2026-10-14
updated: 2026-10-14
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#112-agence--équipe
  models: []
tags: [front, messagerie, mobile, design]
---

## Objectif utilisateur

Sur son téléphone, l'utilisateur lit et ouvre ses conversations comme dans une application de
messagerie, sans se voir proposer une action qui ne concerne pas son espace.

## Contrat de données

- Inchangé : mêmes conversations, même profil actif (`agency.kind`).

## Direction UX / Artistique

- Relevé du porteur du 2026-10-14 (capture à 390 px) : titre, carte encadrée et en-tête de liste
  empilés ; l'état vide flotte au milieu d'un grand cadre.
- Intention : liste pleine largeur, en-tête compact, état vide soigné qui dit quoi faire,
  transition liste → conversation naturelle au pouce. Ordinateur inchangé.

## Contraintes strictes (métier)

- « Nouveau groupe » n'est **pas proposé** quand l'agence du profil actif est `individual`
  (agence individuelle) ; il reste proposé en agence `standard`.
- Décision du porteur du 2026-10-14 : masquage **côté front seulement** — l'API garde sa règle
  actuelle (périmètre de messagerie, TCK-565).
- Les groupes existants dont l'utilisateur est membre restent lisibles.

## Delta à produire

- [x] Mise en page mobile de la liste et de l'état vide
- [x] Bouton « Nouveau groupe » conditionné au type d'agence du profil actif
- [x] Tests : bouton absent en `individual`, présent en `standard`

## Critères d'acceptation

- [x] AC1 — Profil actif en agence `individual` : aucun bouton « Nouveau groupe »
- [x] AC2 — Profil actif en agence `standard` : le bouton est présent et ouvre la création
- [x] AC3 — À 390 px, la liste occupe la largeur de l'écran, sans carte encadrée imbriquée
- [x] AC4 — Aucune barre de défilement horizontale à 360 px ; ordinateur inchangé

## Hors périmètre

- Un refus côté API de la création de groupe en agence individuelle (écarté le 2026-10-14)
- L'écran d'une conversation ouverte

## Notes d'implémentation

- Le `kind` vient de `useMyProfiles()` (profil ACTIF), pas du layout `/app`, qui ne le résout que pour un `agency_admin` et ne suit pas la bascule de profil.
- Fermé tant que le type est inconnu (chargement, erreur, profil actif absent de la liste) : un bouton montré puis retiré disparaîtrait sous le pouce en agence individuelle. Un client sans agence voit toujours le bouton, comme avant.
- Le bouton existe deux fois dans le DOM (en-tête compact / barre d'ordinateur), l'un masqué par CSS : placer par `compact` (JS) ferait sauter la mise en page à l'hydratation.
- Vérifié au navigateur : agence individuelle → aucun bouton (390 px) ; agence standard → présent (1366 px) ; liste pleine largeur, `scrollWidth = innerWidth` à 360.
