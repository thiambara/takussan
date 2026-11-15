---
id: TCK-2935
title: "Le bien public porte le délai de réponse médian de son agence"
status: todo
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2936]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#2-agency"
tags: [back, public, agence, delai-de-reponse, connexion, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le visiteur qui demande une visite sait, en se connectant, en combien de temps l'agence répond d'ordinaire.

## Contrat de données

Relevé du 2026-11-15 : `agencies.median_response_minutes` existe (calculé par `RefreshDirectoryResponseTimes`) et est servi par la fiche publique d'agence (`PublicAgencyController`), mais pas par la lecture publique d'un bien que la connexion lit pour le « bien quitté » (`lib/queries/bien-quitte.ts` → `getProperty`). Écart TCK-2604 (`a-0`, « réponse en 2 h environ » : « jamais mesuré ») — il l'est.

- La lecture publique d'un bien (`GET /api/public/properties/{slug}`) rend `agency.median_response_minutes` (entier ou `null`).

## Contraintes strictes (métier)

- Même valeur et même règle d'affichage que la fiche publique d'agence (aucune seconde définition) ; `null` sous le seuil de mesures de la tâche.
- Pas d'autre champ d'agence ajouté.

## Delta à produire

- [ ] Sélection et ressource du bien public.
- [ ] Test : `PublicPropertyAgencyResponseTimeTest`.

## Critères d'acceptation

- [ ] AC1 — Pour un bien d'une agence à `median_response_minutes = 120`, la lecture publique rend `agency.median_response_minutes: 120` ; pour une agence sans mesure, `null`.
- [ ] AC2 — La valeur est identique à celle de `GET` fiche publique de la même agence (test qui compare les deux).

## Hors périmètre

- L'écran (TCK-2936).

## Notes d'implémentation

_(à remplir par implementing-specs)_
