---
id: TCK-232
title: "Auth — aligner les formulaires publics"
status: todo
phase: P0
family: bug
estimate: S
created: 2026-05-08
updated: 2026-05-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [front, auth, ux, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un utilisateur doit disposer de formulaires d'authentification cohérents, prévisibles et accessibles.

## Contrat de données

Findings smoke `docs/smoke-tests/utilisateurs-authentifies-2026-05-08.md` : `TC-AUTH-01`, `TC-AUTH-02`, `TC-AUTH-05`, `TC-AUTH-09` et `TC-AUTH-23` relèvent des écarts UX sur inscription, login et reset password.

## Direction UX / Artistique

Conserver le design actuel ; corriger l'ordre des blocs, les libellés, les placeholders et les contrôles de visibilité mot de passe avec un rendu stable mobile/desktop.

## Contraintes strictes (métier)

- Chaque champ mot de passe et confirmation doit avoir son propre état de visibilité.
- Les messages de validation doivent rester localisés.
- Les providers OAuth restent visibles mais ne doivent pas précéder le formulaire principal sur l'inscription.

## Delta à produire

- [ ] Réordonner le formulaire d'inscription selon le parcours attendu.
- [ ] Ajouter des toggles indépendants pour les champs mot de passe et confirmation.
- [ ] Harmoniser placeholders et messages de validation relevés dans le smoke.
- [ ] Répliquer le comportement corrigé sur reset password.
- [ ] Ajouter des tests front couvrant ordre du formulaire et toggles indépendants.

## Critères d'acceptation

- [ ] Sur `/auth/register`, les champs et le submit précèdent le séparateur OAuth.
- [ ] Le champ confirmation mot de passe a un toggle indépendant.
- [ ] Sur `/auth/reset-password`, les deux champs mot de passe restent contrôlables séparément.
- [ ] Les messages de validation attendus sont en français.

## Hors périmètre

- Logique backend de création de compte.
- Fonctionnement externe des providers OAuth.
- Refonte de marque des pages auth.

## Notes d'implémentation

_(à remplir par implementing-specs)_
