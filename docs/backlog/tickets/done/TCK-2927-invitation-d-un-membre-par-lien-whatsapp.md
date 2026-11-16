---
id: TCK-2927
title: "Inviter un membre par WhatsApp : l'invitation se crée sans envoi, et l'admin reçoit le lien à partager"
status: done
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: [TCK-2928]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [back, equipe, invitation, whatsapp, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'admin invite un membre en lui envoyant lui-même le lien sur WhatsApp, depuis son téléphone.

## Contrat de données

Écart de TCK-2668 (« Lien par WhatsApp / Par WhatsApp : hors périmètre »), sans ticket depuis. Relevé du 2026-11-15 : `POST /api/agencies/{agency}/agents/invite` envoie toujours un e-mail ou un SMS ; `InvitationResource` ne rend jamais le jeton (`Invitation::$hidden`) — le lien n'est donc jamais entre les mains de l'admin.

- `POST /api/agencies/{agency}/agents/invite` accepte `delivery: "share"` : l'invitation est créée **sans** envoi, et la réponse de **cette seule création** porte `share_url` (le lien d'acceptation complet). Aucune autre lecture ne le rend.
- `POST /api/invitations/{id}/share-link` : pour une invitation en cours de l'agence, rend un `share_url` **neuf** (le jeton est renouvelé, l'ancien lien cesse de marcher), pour repartager.

## Contraintes strictes (métier)

- **Règle de sécurité changée** (le jeton porteur d'[ADR-0094](../../../adr/0094-l-invitation-se-lit-avant-d-entrer-et-s-accepte-par-code.md) sort vers l'invitant) : l'ADR s'écrit AVANT (numéro suivant libre). À y trancher : l'invitation partagée n'a pas d'adresse vérifiée, donc l'acceptation exige le code SMS au numéro saisi par l'admin (ADR-0094 § 5), jamais l'e-mail posé vérifié (§ 6).
- `share_url` sous la même capacité et le même step-up 2FA que l'invitation par e-mail ; journalisé (`activity`) sans le jeton.
- Le jeton n'apparaît dans aucun journal, aucune mesure d'audience (contrainte 1 de TCK-610, conservée par ADR-0094 § 3).
- Même limiteur `throttle:invitations-send`.

## Delta à produire

- [ ] ADR « l'invitant reçoit le lien d'une invitation partagée ».
- [ ] `delivery: share` sur l'invitation d'agent (et d'admin si la même route les porte), réponse avec `share_url`.
- [ ] Route `share-link` (renouvellement du jeton).
- [ ] Tests : `AgentInvitationShareTest` (aucun e-mail ni SMS envoyé, `share_url` rendu une fois, absent de `GET /api/invitations`, ancien lien 404 après renouvellement, acceptation par code au numéro saisi).

## Critères d'acceptation

- [ ] AC1 — `POST …/agents/invite` avec `delivery: "share"` crée l'invitation, n'envoie ni e-mail ni SMS (fakes vides) et rend `share_url` ; `GET /api/invitations` puis `GET /api/invitations/{id}` ne contiennent pas le jeton.
- [ ] AC2 — `POST /api/invitations/{id}/share-link` rend un lien neuf ; l'ancien lien rend 404 sur l'aperçu public.
- [ ] AC3 — Un agent sans capacité d'inviter reçoit 403 ; l'admin d'une autre agence aussi.
- [ ] AC4 — L'invité qui ouvre `share_url` accepte par le code SMS envoyé au numéro saisi par l'admin ; son e-mail n'est pas posé vérifié.

## Hors périmètre

- L'écran (TCK-2928). L'envoi par l'API WhatsApp de la plateforme.

## Notes d'implémentation

2026-11-15 — implémenté (agent délégué, arbre `takussan-manques`). ADR écrit avant : [ADR-0123](../../../adr/0123-l-invitant-recoit-le-lien-d-une-invitation-partagee.md).

**Re-mesure** : prémisse exacte (`agents/invite` envoie toujours, `InvitationResource` sans jeton). Trouvé en plus : l'acceptation
publique SANS session (`POST /api/invitations/{token}/accept` → `acceptAsNewUser`) pose le numéro d'une invitation par SMS
**vérifié** (« le lien est arrivé par SMS ») — fausse pour un lien partagé : qui le détient (l'admin compris) aurait créé un
compte au numéro d'autrui vérifié. Fermé : 403 `invitation.code_required` pour une invitation partagée. Et le rappel J+2
(`remindPending`) aurait envoyé le lien par SMS : il ignore désormais les invitations partagées.

**Décisions tranchées (« valide tes choix »)** :
- `delivery: share` exige le numéro et **refuse l'e-mail** (422) : l'invitation est adressée au seul numéro, aucun e-mail ne
  peut être posé vérifié (ADR-0094 § 6 hors jeu). Drapeau `auth.phone_login.enabled` éteint → `delivery` refusé (422).
- Marqueur `metadata.delivery = "share"` (`Invitation::estPartagee()`, `Invitation::DELIVERY_SHARE`) ; aucun envoi, plafond SMS
  non consommé.
- `share-link` : invitation d'équipe (`AgentProfile`), numéro sans e-mail, `sent` ou `expired` (résurrection gardée comme
  `resend`) ; sinon 422 `invitations.errors.cannot_share`. Accès `InvitationPolicy::resend`, + `changeMemberRole` pour un
  rôle `agency_admin` ; step-up (`ProtectedActions::AGENCY_TWO_FACTOR`) et `throttle:invitations-send`. Une invitation par SMS
  renouvelée ainsi devient partagée.
- La relance classique (`resend`) d'une invitation partagée **envoie** le SMS et retire le marqueur.
- `share_url` ajouté par les deux contrôleurs seuls (jamais `InvitationResource`), `Cache-Control: no-store, private`.
  Sous impersonation : POST refusés (`impersonation.read_only`, testé). Marqueur « lien d'invitation » ajouté à
  `ImpersonationReadSweepTest` (+ une invitation partagée dans la cible garnie).
- Journal : `invitation_sent`/`agent_invited` portent `delivery: share` ; événement neuf `invitation_share_link_issued`
  (libellé `admin.audit.events.invitation_share_link_issued` posé). Le modèle ne journalise pas `token` (`logOnly`).

- `share-link` juge en plus la règle de l'émission (`AgentProfilePolicy@invite` sur l'agence) : le lien est un secret rendu
  à l'appelant, pas seulement une relance.
- Page de l'invité : l'aperçu public rend `code_only` (vrai pour une invitation partagée) ; `EntreeDInvitation` n'offre alors
  pas « Utiliser un mot de passe » (la voie que l'API refuse). Aucun middleware d'idempotence sur ces deux routes (le corps
  avec `share_url` n'est rangé nulle part) ; `ShareRequestLogContext` ne journalise aucune donnée de requête.

**Preuves** : `AgentInvitationShareTest` 12/12 ; ablations une à une (refus sans code, rappel, envoi à la création,
`prohibited_if` e-mail, retrait du marqueur à la relance, masquage du lien mot de passe côté front) toutes rouges, restaurées
par `cp` (md5 vérifié). Voisins verts : InviteAgent, InvitationBySms, InvitationRappelSms, InvitationLifecycle,
InvitationAcceptByCode, InvitationSmsContent, InvitationSmsLimits, PublicInvitationPreview, ImpersonationReadSweep,
ProtectedActionsCoverage, LangGroupParity, ValeursEnListe, DateInventoryByValue, trois gardes d'architecture,
`scripts/check-*.mjs` ; front : vitest des 4 fichiers d'aperçu/entrée, `tsc --noEmit`, eslint, `check:i18n`.
