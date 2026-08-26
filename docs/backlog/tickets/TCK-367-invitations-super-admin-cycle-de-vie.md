---
id: TCK-367
title: "Invitations super-admin — relance, annulation et expiration visibles"
status: todo
phase: P2
family: full
estimate: M
wave: 46
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#onboarding-parcours
    - docs/features.md#21-authentification--comptes
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, front, super-admin, invitations, cooptation]
---

## Objectif utilisateur

Un super-admin qui a coopté un pair peut relancer l'invitation restée sans réponse, l'annuler si elle a été envoyée par erreur, et voir quand elle expire — sans intervention en base.

## Contrat de données

- Existant : `GET /api/admin/super-admins` (actifs + invitations en attente), `POST /api/admin/super-admins/invite`.
- **Manquant, à créer** : relance et annulation d'une invitation de cooptation. Le modèle `Invitation` et son patron unifié (token signé, expiration, rappel) sont déjà en place pour les autres parcours d'invitation — ce ticket raccorde la cooptation super-admin au même mécanisme plutôt que d'en écrire un second.
- La réponse de la liste doit exposer la date d'expiration de l'invitation et la dernière connexion des super-admins actifs, aujourd'hui absentes de l'écran.

## Direction UX / Artistique

L'écran `/super-admin/super-admins` liste des actifs et des invitations en attente, et n'offre qu'une seule action : inviter. Une invitation partie à la mauvaise adresse y reste indéfiniment, sans expiration affichée, sans moyen de la relancer ni de l'annuler.

- Chaque invitation en attente porte sa date d'envoi **et** sa date d'expiration, avec relance et annulation à portée de ligne.
- Une invitation expirée se distingue d'une invitation en attente : ce sont deux états, pas deux nuances du même.
- Chaque super-admin actif affiche sa dernière connexion et l'état de son enrôlement 2FA — l'écran porte déjà le second, pas le premier.

## Contraintes strictes (métier)

- La 2FA TOTP reste **bloquante** avant qu'un coopté devienne actif : ce ticket ne touche pas cette règle.
- Toute relance et toute annulation sont **journalisées** : la cooptation d'un super-admin est déjà auditée, son cycle de vie doit l'être au même titre.
- Une relance ne crée pas une seconde invitation valable : elle réémet le lien de l'invitation existante et repousse son expiration.
- Un super-admin ne peut ni relancer ni annuler une invitation qu'il n'a pas le droit de voir ; l'autorisation passe par la capacité, jamais par un contrôle d'écran.
- Aucune action ne doit permettre de rester sans aucun super-admin actif.

## Delta à produire

- [ ] Endpoints de relance et d'annulation d'une invitation de cooptation, raccordés au patron `Invitation` existant
- [ ] Exposition de la date d'expiration de l'invitation et de la dernière connexion des actifs dans `GET /api/admin/super-admins`
- [ ] Journalisation des deux nouvelles actions
- [ ] Tests backend : relance, annulation, autorisation refusée, invitation expirée, non-régression du caractère bloquant de la 2FA
- [ ] UI : actions par ligne, état « expirée » distinct, dates d'expiration et de dernière connexion
- [ ] Tests frontend : relance, annulation, rendu d'une invitation expirée

## Critères d'acceptation

- [ ] AC1 — une invitation en attente peut être relancée et annulée depuis `/super-admin/super-admins`
- [ ] AC2 — une relance réémet l'invitation **existante** : le test vérifie qu'aucune seconde invitation n'est créée en base et que l'expiration a bien été repoussée
- [ ] AC3 — une invitation expirée est affichée comme expirée, distinctement d'une invitation encore valable
- [ ] AC4 — un utilisateur sans la capacité requise reçoit un refus côté API, indépendamment de ce que l'UI affiche (test API direct, pas seulement test d'écran)
- [ ] AC5 — la relance et l'annulation apparaissent dans le journal d'audit
- [ ] AC6 — `php artisan test --filter=SuperAdminInvitation` vert, `npm run lint` / `npx tsc --noEmit` / `npm run test` passent

## Hors périmètre

- **La révocation d'un super-admin actif.** Elle n'est décrite dans aucune spec et n'existe côté API : elle demande d'abord une décision produit (qui peut révoquer qui, que devient l'audit, comment on évite le verrouillage complet), donc une PR sur `docs/features.md` avant tout ticket.
- Le bootstrap par commande artisan, inchangé.
- Le mécanisme d'enrôlement 2FA lui-même.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
