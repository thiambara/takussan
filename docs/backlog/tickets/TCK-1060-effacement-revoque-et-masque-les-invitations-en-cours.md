---
id: TCK-1060
title: "L'effacement révoque les invitations en cours du compte et masque leur adresse"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-57--téléphones-et-e-mails-hors-de-users-face-à-lanonymisation"
tags: [api, rgpd, invitations, pistes]
---

## Contexte

Réf : **P57.04** du fichier de pistes, `validé` (V3). `AccountDeletionService::anonymize()` ne
cite pas `Invitation` : une invitation `sent` à l'adresse du compte, ou dont `invited_user_id` est
le compte, garde après `executeDeletion()` son e-mail, son lien au compte et son statut. La FK
`invited_user_id` est en `nullOnDelete`, que le soft-delete ne déclenche pas. Effacer l'adresse
est refusé par la contrainte `invitations_email_or_phone_check` (mesuré le 2026-10-19).

## Décision du porteur

> (a) à l'anonymisation, révoquer les invitations en cours du compte et masquer leur adresse (`deleted-<id>@takussan.local`, comme `users.email`) au lieu de l'effacer, sans migration ; test : après `executeDeletion()`, aucune invitation en cours ne vise le compte ni son adresse (porteur, 2026-10-20)

## Objectif

Après l'effacement, aucune invitation encore acceptable ne vise le compte ni son adresse
d'origine.

## Delta à produire

- [x] `AccountDeletionService::anonymize()` : les invitations `sent` dont `invited_user_id` est le
      compte ou dont l'e-mail est l'adresse d'origine passent à `revoked` (`revoked_at` posé),
      leur e-mail devient `deleted-<id du compte>@takussan.local` et leur numéro `null`.
- [x] Test : `AccountDeletionExecuteTest::test_execute_revoque_et_masque_les_invitations_en_cours_du_compte`.

## Critères d'acceptation

- [x] AC1 — Après `executeDeletion()`, aucune invitation `sent` ne vise le compte (identifiant) ni
      son adresse d'origine ; celles qui le visaient sont `revoked`, à l'adresse masquée.
- [x] AC2 — Une invitation `accepted` du compte et l'invitation d'une autre adresse restent telles
      quelles.

## Hypothèses (mode sans humain)

- **« En cours »** se lit `status = sent`, échéance passée comprise : une invitation `sent` à
  l'échéance dépassée n'est passée à `expired` que par le cron horaire, et `resend()` peut la
  relancer.
- **`<id>` est celui du compte**, comme `users.email` : toutes les invitations masquées d'un même
  compte portent la même adresse, qui ne désigne personne.
- **Le numéro de l'invitation part aussi** : pour une invitation adressée par numéro, c'est son
  adresse ; l'e-mail masqué suffit à la contrainte. `invited_user_id` reste : une invitation
  révoquée n'est plus « en cours », et le lien au compte effacé ne porte aucune donnée.
- **Par une requête**, sans événement de modèle : `Invitation` ne journalise ni `email` ni `phone`,
  et l'effacement a déjà sa ligne `account.deletion.executed`.

## Hors périmètre

- L'adresse journalisée en clair dans `activity_log.properties.email` à l'envoi d'une invitation
  (`InvitationService`), qui relève de P19.01/P56.05.
- Une invitation adressée au seul numéro du compte, sans `invited_user_id` : elle ne se retrouve
  que par le numéro, et la décision ne la vise pas.

## Notes d'implémentation

- Avant correctif : le test rouge (statut `sent` inchangé). Ablations : requête retirée → rouge ;
  `phone => null` retiré → rouge. Remis → 14 verts sur la classe.
