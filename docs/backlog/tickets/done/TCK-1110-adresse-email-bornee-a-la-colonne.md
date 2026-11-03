---
id: TCK-1110
title: "Adresse e-mail bornée à sa colonne à l'inscription, sur les clients, les garants, les agences et la demande de visite publique : 422 et non 500"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-91--bornes-max-des-formrequests-face-aux-varcharn"
tags: [back, validation, inscription, pistes]
---

## Contexte

Réf : **P91.05** du fichier de pistes, `retenu · autonome` (A1 : la colonne fixe la borne ; aucune
inscription qui aboutit aujourd'hui n'est refusée, seul le 500 devient 422).

La règle `email` de Laravel ne borne pas la longueur. `users.email`, `customers.email`,
`guarantors.email`, `agencies.email` et `property_visits.visitor_email` sont des `varchar(255)` :
une adresse valide de plus de 255 caractères atteint PostgreSQL (22001), soit 500. L'inscription
et la demande de visite publique sont ouvertes sans authentification.

## Objectif utilisateur

Qui envoie une adresse e-mail plus longue que sa colonne reçoit une erreur de validation sur le
champ, et non une panne serveur.

## Delta à produire

- [x] `max:255` sur la règle `email` de `RegisterRequest`, `StoreCustomerRequest`,
      `UpdateCustomerRequest`, `StoreGuarantorRequest`, `UpdateGuarantorRequest`,
      `AttachGuarantorLeaseRequest`, `StoreAgencyRequest`, `AgencyUpdateRequest`, et sur
      `visitor_email` de `VisitRequestPublicPropertyRequest`.
- [x] Test `tests/Feature/Validation/EmailFieldLengthTest.php`, un cas par requête.

## Critères d'acceptation

- [x] AC1 — `POST /api/auth/register` avec une adresse valide de 256 caractères : 422 sur `email`,
      aucun compte créé ; à 255 : 201.
- [x] AC2 — Clients (`POST`, `PUT`), garants (`POST`, `PUT`, `POST /api/leases/{id}/guarantors`),
      agences (`POST`, `PATCH`) : 422 sur `email` à 256, rien d'écrit ; à 255, l'écriture passe.
- [x] AC3 — `POST /api/public/properties/{slug}/visit-request` : 422 sur `visitor_email` à 256,
      aucune visite ; à 255 : 201.

## Hors périmètre

- Les règles `email` des invitations (`CreateInvitationRequest`, `InviteOwnerRequest`,
  `InviteAgentRequest`, `InviteServiceProviderRequest`, `InviteSuperAdminRequest`),
  d'`AddAgentAgencyRequest`, de `StorePropertyVisitRequest` (`visitor_email`) et des
  `recipients.emails.*` des règles d'alerte : leur écriture n'a pas été jouée.
- Les requêtes qui ne font que chercher (`LoginRequest`, mot de passe oublié et réinitialisation).

## Notes d'implémentation

- Avant correctif, les cinq voies rendaient 500 `SQLSTATE[22001]` (relevé sous
  `withoutExceptionHandling`), et non une autre erreur.
- Ablation : les neuf FormRequest rendues à `HEAD` → 5 rouges sur 6 (le sixième test ne vérifie
  que la longueur de l'adresse témoin) ; correctif remis → 6/6.
- L'adresse témoin reste valide pour la règle `email` : domaine en étiquettes de 60 caractères,
  partie locale de 64 au plus.
