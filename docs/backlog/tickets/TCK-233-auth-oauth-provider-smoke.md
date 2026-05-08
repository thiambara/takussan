---
id: TCK-233
title: "Auth — fiabiliser OAuth en smoke local"
status: review
phase: P1
family: bug
estimate: M
created: 2026-05-08
updated: 2026-05-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [back, front, auth, oauth, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un utilisateur doit pouvoir démarrer un parcours OAuth sans erreur provider immédiate causée par une configuration invalide.

## Contrat de données

Findings smoke `docs/smoke-tests/utilisateurs-authentifies-2026-05-08.md` : `TC-AUTH-16` atteint Google, mais `TC-AUTH-17` et `TC-AUTH-18` échouent côté provider avec configuration Facebook/Apple invalide.

## Direction UX / Artistique

Si un provider n'est pas configuré dans un environnement donné, le bouton doit être masqué ou désactivé avec une explication courte au lieu d'envoyer vers une erreur externe.

## Contraintes strictes (métier)

- Un provider sans credentials valides ne doit pas apparaître comme utilisable.
- Les callbacks doivent conserver la gestion d'erreur localisée pour provider inconnu, state invalide ou refus utilisateur.
- Les secrets OAuth restent hors dépôt.

## Delta à produire

- [ ] Ajouter une détection de configuration provider côté API et frontend.
- [ ] Masquer ou désactiver Facebook/Apple quand les credentials requis sont absents ou placeholder.
- [ ] Vérifier les callback URLs générées pour Google/Facebook/Apple en local.
- [ ] Ajouter des tests backend ou front pour provider non configuré et provider inconnu.
- [ ] Mettre à jour la doc d'exécution locale si nécessaire.

## Critères d'acceptation

- [ ] En environnement local sans credentials réels, Facebook/Apple ne redirigent pas vers une page provider invalide.
- [ ] Google garde le comportement existant quand configuré.
- [ ] `/auth/oauth/github/callback` continue d'afficher une erreur localisée de provider inconnu.
- [ ] Les boutons affichés correspondent aux providers réellement disponibles.

## Hors périmètre

- Obtention de credentials réels Facebook/Apple.
- Ajout de nouveaux providers OAuth.
- Modification du provisioning utilisateur OAuth hors gestion d'erreur.

## Notes d'implémentation

La disponibilité OAuth est exposée via `/api/auth/oauth/providers` ; les routes directes refusent aussi les providers non configurés pour éviter les redirections externes invalides.
