---
id: TCK-2609
title: "Aperçu public d'une invitation par son jeton : l'agence, qui invite, le rôle, ce qui attend — et demander un nouveau lien"
status: todo
phase: P1
family: back
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2611]
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
    - "docs/models-spec.md#2-agency"
tags: [back, invitation, onboarding, security, audit-ux, app]
---

## Objectif utilisateur

L'invité qui ouvre le lien reçu par SMS ou par e-mail voit, avant de donner quoi que ce soit, quelle agence l'invite, qui, pour quel rôle et ce qui l'attend ; si le lien a expiré, il le sait tout de suite et peut demander un nouveau lien en un geste.

## Contrat de données

Re-mesure sur `dev` (1bce3798a) : la page `/invitations/accept` existe (TCK-626) mais ne sait rien de l'invitation avant l'acceptation. Seuls existent `POST /api/invitations/{token}/accept` (public ; 404 `invitation.token_not_found`, 410 `token_accepted` / `token_revoked` / `token_expired`, 401 `requires_login`) et `GET /api/invitations/{token}/prefill` (**sous session**, nom saisi par l'agence, TCK-2281). L'état discriminé du jeton est donc déjà observable par le POST.

**À créer** (décisions 3 de l'audit ; [ADR-0094](../../../adr/0094-l-invitation-se-lit-avant-d-entrer-et-s-accepte-par-code.md)) :

- `GET /api/public/invitations/{token}` → `PublicInvitationPreviewController`, ressource `PublicInvitationPreviewResource` :
  - jeton actionnable, 200 : `role` (`owner` | `agent` | `agency_admin` | `service_provider`), `agency` {`name`, `logo_url`, `city`, `public_properties_count`, `verified`, `public_phone` s'il est public}, `inviter` {`first_name`} seul, `recipient` {`channel`: `email` | `phone`, `masked`: `m•••@gmail.com` / `77 •• •• 45 67`}, `recipient_has_account` (booléen), `expires_at`, `invited_at`, `prefill` {`first_name`, `last_name`} saisis par l'agence, `awaiting` : bailleur → `properties_count` (biens liés par `pending_owner_profile_id`, TCK-1000) ; prestataire → `maintenance_request` {`title`, `property_label`, `reported_at`} de `metadata.from_maintenance_request_id` ; sinon vide.
  - jeton inconnu → 404 `invitation.token_not_found`, corps sans donnée.
  - jeton expiré, révoqué ou accepté → 410 avec son code **et** `agency` {`name`, `logo_url`, `public_phone`}, `invited_at` — de quoi dire « Dakar Immo vous avait invité le 3 nov. » et donner l'issue.
- `POST /api/public/invitations/{token}/renewal-request` → `InvitationRenewalRequestController` : seulement pour un jeton **expiré** (410 sinon, avec son code) ; prévient l'invitant (`InvitationRenewalRequestedNotification`, cloche + e-mail selon ses préférences) avec un lien vers le renvoi existant (`POST /api/invitations/{invitation}/resend`) ; une demande par invitation et par 24 h (la suivante rend 202 sans notifier).

## Direction UX / Artistique

Sans objet : ticket back. L'écran qui consomme ce contrat est dit dans « Hors périmètre ».

## Contraintes strictes (métier)

- Le jeton est le secret porteur : l'aperçu n'en révèle pas plus que le message reçu (le destinataire est **masqué**, l'invitant réduit à son prénom, aucun identifiant interne, aucune adresse d'agence au-delà de la ville).
- Lecture seule : `GET` n'écrit rien (ni `last_viewed`, ni statut) ; la page ne déclenche aucune acceptation au rendu.
- Limiteurs nommés par IP : `throttle:public-invitation-preview` (30/min), `throttle:public-invitation-renewal` (5/h).
- Une agence supprimée rend 410 `token_revoked` comme l'acceptation (TCK-1339).
- Les en-têtes de la page restent du ressort du front (`Referrer-Policy: no-referrer`, jeton exclu de la mesure d'audience : TCK-610, contrainte 1).
- `public_properties_count` et `verified` suivent les mêmes règles que la fiche publique d'agence (aucune seconde définition).

## Delta à produire

- [ ] Routes dans `routes/api/invitations.php`, hors `auth:sanctum`, préfixe `public/invitations`.
- [ ] `PublicInvitationPreviewController`, `PublicInvitationPreviewResource`, réutilisation de `InvitationService::lookupActiveInvitation` (rendue accessible) et des règles de la fiche publique d'agence.
- [ ] `InvitationRenewalRequestController`, `InvitationRenewalRequestedNotification` (libellés `fr`/`en`/`wo` dans `lang/`), garde de 24 h.
- [ ] Limiteurs déclarés dans `AppServiceProvider`.
- [ ] Tests : `PublicInvitationPreviewTest` (forme exacte par rôle, destinataire masqué, prénom seul de l'invitant, 404 sans donnée, 410 avec agence et date, agence supprimée, aucune écriture) ; `InvitationRenewalRequestTest` (expiré → notification à l'invitant ; deuxième demande dans les 24 h → pas de notification ; révoqué / accepté → 410).

## Critères d'acceptation

- [ ] AC1 — Pour une invitation de bailleur avec 3 biens liés : 200, `role = owner`, `awaiting.properties_count = 3`, `recipient.masked` ne contient pas l'adresse en clair, `inviter` n'a que `first_name`.
- [ ] AC2 — Jeton inconnu : 404 dont le corps ne contient que `message` et le code.
- [ ] AC3 — Jeton expiré : 410 `invitation.token_expired` avec `agency.name` et `invited_at` ; `renewal-request` notifie l'invitant une fois, la seconde demande du jour ne notifie pas.
- [ ] AC4 — Après 30 aperçus, le 31ᵉ de la même IP dans la minute rend 429.

## Hors périmètre

- La page (TCK-2611) ; l'acceptation par code (TCK-2610).
- Les dialogues d'envoi d'invitation (TCK-448).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
