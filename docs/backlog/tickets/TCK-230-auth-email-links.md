---
id: TCK-230
title: "Auth — corriger les liens email transactionnels"
status: todo
phase: P0
family: bug
estimate: M
created: 2026-05-08
updated: 2026-05-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#1-user
tags: [back, front, auth, email, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un utilisateur doit pouvoir vérifier son email et réinitialiser son mot de passe depuis les liens reçus par email.

## Contrat de données

Findings smoke `docs/smoke-tests/utilisateurs-authentifies-2026-05-08.md` : `TC-AUTH-06`, `TC-AUTH-08` et `TC-AUTH-23` exposent des liens ou relances email qui ne terminent pas le parcours navigateur.

## Direction UX / Artistique

Les pages frontend de succès, erreur et relance doivent rester simples, explicites et entièrement localisées.

## Contraintes strictes (métier)

- Les liens email doivent ouvrir une route frontend quand une interaction navigateur est attendue.
- La vérification email doit rester signée et non forgeable.
- Le reset password doit conserver l'anti-énumération côté demande de lien.
- Les messages ne doivent pas exposer si un email existe ou non.

## Delta à produire

- [ ] Corriger la génération du lien de vérification email pour aboutir au parcours frontend.
- [ ] Corriger le renvoi de lien de vérification depuis `/auth/verify-email`.
- [ ] Corriger la génération du lien de reset password vers la route frontend existante.
- [ ] Afficher le message de succès attendu après reset password.
- [ ] Ajouter des tests backend pour les URLs générées et des tests front de consommation des liens.

## Critères d'acceptation

- [ ] Un lien de vérification email ouvert depuis les logs valide l'email puis affiche la page frontend attendue.
- [ ] Le bouton de renvoi d'email affiche un succès et génère un nouvel email exploitable.
- [ ] Un lien reset password ouvre `/auth/reset-password` et permet de terminer le reset.
- [ ] Après reset, `/auth/login?reset=1` affiche le message de succès.

## Hors périmètre

- Refonte complète des emails transactionnels.
- Changement de provider mail.
- Magic link de connexion.

## Notes d'implémentation

_(à remplir par implementing-specs)_
