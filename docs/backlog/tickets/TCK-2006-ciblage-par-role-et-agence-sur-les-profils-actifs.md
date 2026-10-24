---
id: TCK-2006
title: "Annonces et drapeaux : ciblage par rôle sur les profils actifs, par agence sur toutes les agences actives du compte"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#46-announcement-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-176--rôles-lus-toutes-agences-confondues-par-profiletypes"
  adr:
    - "docs/adr/0005-contrat-http-conserve-roles.md"
tags: [api, profils, annonces, drapeaux, pistes]
---

## Objectif utilisateur

Une annonce ou un drapeau ciblé sur les admins n'atteint plus un admin suspendu ; ciblé sur une
agence, il atteint chaque membre actif de cette agence, quel que soit l'espace que la requête a
choisi.

## Contexte

Réf : **P176.05** du fichier de pistes.

Décision du porteur : validé — validation du porteur (2026-10-23) : ADR-0005, amendement du 2026-10-23 : la recommandation du délégué, profils actifs seulement ; `agency_ids` se juge sur les agences où le compte a un profil actif

Mesuré avant correctif sur `5fcadf598` (`CiblageParRoleEtAgenceTest`, 4 rouges sur 6) : drapeau et
annonce `{"roles":["agency_admin"]}` → vrai pour un compte au seul profil d'admin `suspended` ;
`{"agency_ids":[A]}` → faux pour un agent de A et de B sans profil résolu, et faux sous profil
actif dans B.

## Hypothèses (mode sans humain)

- La recommandation du délégué distinguait annonces et drapeaux pour `agency_ids` ; la précision du
  porteur et ADR-0005 (point 2) jugent les deux sur toutes les agences actives du compte : c'est ce
  qui est fait, pour les deux services.
- « Actif » suit `ActiveProfileResolver::isActiveProfile()`, comme TCK-2002.

## Delta à produire

- [x] `HasProfiles::activeProfileTypes()` (toutes agences) et `activeAgencyIds()`.
- [x] `FeatureFlagEvaluator::evaluate` et `AnnouncementResolver::matches` les lisent pour `roles` et
  `agency_ids`.
- [x] Garde : `tests/Feature/Features/CiblageParRoleEtAgenceTest.php`.

## Critères d'acceptation

- [x] AC1 — ciblé `agency_admin` : faux pour un admin suspendu, vrai pour un admin actif, pour les
  deux services.
- [x] AC2 — ciblé sur A ou sur B : vrai pour un agent actif de A et de B sans profil résolu.
- [x] AC3 — ciblé sur A : vrai sous profil actif dans B.
- [x] AC4 — ciblé sur A : faux pour un agent suspendu de A.

## Hors périmètre

- Le déploiement progressif (`rollout_percentage`) ne change pas.
- La console qui compose les segments n'est pas touchée.

## Notes d'implémentation

- Ablation : les deux services remis sur `profileTypes()` et `$user->agency_id` → 4 rouges sur 6
  (les deux cas restés verts sont le témoin « admin actif » et l'agent suspendu, que l'ancien code
  refusait déjà par `agency_id` nul) ; rétablis → 6 verts.
