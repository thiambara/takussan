---
id: TCK-2927
title: "Inviter un membre par WhatsApp : l'invitation se crée sans envoi, et l'admin reçoit le lien à partager"
status: todo
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
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

_(à remplir par implementing-specs)_
