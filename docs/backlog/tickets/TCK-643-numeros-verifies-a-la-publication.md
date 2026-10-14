---
id: TCK-643
title: La dernière étape de publication affiche aussi les numéros déjà vérifiés
status: doing
phase: P1
family: front
estimate: S
wave: 77
created: 2026-10-14
updated: 2026-10-14
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#21-authentification--comptes
  models: []
tags: [front, publication, contact, telephone]
---

## Objectif utilisateur

Au moment de publier, l'annonceur voit quel(s) numéro(s) les visiteurs appelleront, même quand il
n'a plus rien à vérifier.

## Contrat de données

- Les numéros du compte (principal et second) et leur état de vérification, déjà lus par l'étape
  des coordonnées de publication.

## Direction UX / Artistique

- Relevé du porteur du 2026-10-14 : quand le ou les numéros sont déjà vérifiés, l'étape n'affiche
  rien.
- Chaque numéro est listé, formaté, avec un badge « Vérifié » et l'indication WhatsApp ; un numéro
  non vérifié garde le parcours de vérification actuel.

## Contraintes strictes (métier)

- Le contrat « publier exige un contact joignable » (§1.1) ne change pas : ce ticket n'ajoute
  qu'un affichage.
- Aucun numéro d'un autre compte n'est montré.

## Delta à produire

- [ ] Étape des coordonnées : liste des numéros vérifiés en lecture
- [ ] Libellés `fr`/`en`/`wo`
- [ ] Tests : un numéro vérifié est affiché ; deux numéros vérifiés le sont tous deux ; un non vérifié garde le parcours

## Critères d'acceptation

- [ ] AC1 — Compte au numéro principal vérifié : l'étape l'affiche avec le badge « Vérifié »
- [ ] AC2 — Second numéro vérifié : les deux sont affichés
- [ ] AC3 — Un numéro non vérifié présente toujours la saisie du code
- [ ] AC4 — La publication reste possible exactement dans les mêmes cas qu'avant

## Hors périmètre

- Les contacts sur place (jusqu'à 3 numéros sans vérification)
- La modification d'un numéro depuis cette étape

## Notes d'implémentation

_(à remplir par implementing-specs)_
