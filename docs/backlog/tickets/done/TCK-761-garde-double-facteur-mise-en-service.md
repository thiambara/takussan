---
id: TCK-761
title: "Mise en service : la garde de second facteur sur les trois formulaires, et la 2FA en tête de la carte"
status: done
phase: P2
family: front
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-15--parcours-dune-agence-neuve"
tags: [front, 2fa, onboarding, pistes]
---

## Contexte

Réf : **P15.04** du fichier de pistes, `validé` (critère accordé : V2, avec le réordonnancement
de la carte en V7). Trois gestes de la mise en service exigent la 2FA de l'admin d'agence
(`ProtectedActions::AGENCY_TWO_FACTOR` : `AgencyController@update` et `@confirmPayoutThreshold`,
`IntegrationController@store|update|test|destroy`, `AgentInvitationController@__invoke`). Leurs
formulaires ne passent pas par `useApiMutation` : la boîte `GardeDoubleFacteur`, pourtant montée
par la coque `/app`, ne s'ouvre pas, et le refus s'affiche en erreur de champ ou de ligne.

## Décision du porteur

avecGardeDoubleFacteur branché sur les trois formulaires ; la 2FA en tête de la carte Mise en service

## Objectif utilisateur

Un admin d'agence sans second facteur qui règle sa commission, ajoute une intégration de paiement
ou invite un agent voit s'ouvrir la boîte qui le lui fait configurer, puis son geste est rejoué ;
et la carte « Mise en service » lui montre la 2FA d'abord.

## Contrat de données

Aucun endpoint neuf. `admin-agency.ts` rend désormais le `code` de second facteur
(`two_factor_required`, `two_factor_step_up_required`), comme `admin-settings.ts` depuis TCK-293.

## Contraintes strictes

- Aucun texte neuf : la boîte et ses libellés existent.
- L'ordre des autres étapes reste celui de l'API.

## Delta à produire

- [x] `actions/admin-agency.ts` : `mapError` rend le `code` de second facteur.
- [x] `AgencyConfigForm` : enregistrement et confirmation du seuil par `avecGardeDoubleFacteurAction`.
- [x] `IntegrationsManager` : création, modification, activation, test et suppression par
  `avecGardeDoubleFacteurAction`.
- [x] `InviteAgentDialog` : l'invitation par `avecGardeDoubleFacteur`.
- [x] `MiseEnService` : `admin_two_factor` en tête de la liste.

## Critères d'acceptation

- [x] AC1 — Sur chacun des trois formulaires, un refus `two_factor_*` ouvre la garde avec ce code,
  et le geste est rejoué une fois la garde levée.
- [x] AC2 — Hors de la coque (aucune garde), le refus s'affiche comme avant.
- [x] AC3 — La carte place l'étape `admin_two_factor` en premier, les autres dans l'ordre de l'API.

## Hors périmètre

- La page orpheline `/onboarding/agency-admin` (P13.09, qui attend P15.07).
- Le téléversement du logo (`uploadAgencyLogoAction`) : la piste ne le cite pas.

## Notes d'implémentation

- Avant correctif : 8 rouges sur les tests neufs (garde jamais appelée, geste non rejoué ; carte
  avec « Dossier KYC vérifié » en tête), plus 2 sur `admin-agency.double-facteur.test.ts`.
- Ablations, chacune remise après : `garde = null` dans les trois formulaires → 7 rouges sur 8
  (le cas « garde abandonnée » passe aussi sans garde, il garde l'absence de rejeu) ; le tri de
  `MiseEnService` retiré → 1 rouge ; le `code` retiré de `mapError` d'`admin-agency.ts` → 2 rouges.
- `IntegrationsManager` : la garde entre dans les dépendances des `useCallback` existants (le
  compilateur React abandonne un composant dont la mémoïsation manuelle ne tient pas).
- `sort` sur la copie rendue par `filter`, et non `toSorted` : aucun autre fichier du front
  n'emploie `toSorted`, et `sort` est stable depuis ES2019.
- La suppression d'une intégration est gardée aussi : `IntegrationController@destroy` figure dans
  `AGENCY_TWO_FACTOR` (lu, `ProtectedActions.php:140`).
