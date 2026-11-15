---
id: TCK-2939
title: "Invitation : ce qui se montre avant le code (biens du bailleur avec leur quartier, adresse de l'agence, chiffres de l'étape du numéro), le numéro d'une invitation SMS modifiable, et les essais restants d'un code faux"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2941, TCK-2949]
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [back, entree, invitation, securite, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'invité reconnaît, avant d'entrer, l'agence et les biens qui l'attendent ; il corrige le numéro que l'agence a mal saisi ; et sait combien d'essais il lui reste quand il se trompe de code.

## Contrat de données

Écarts de TCK-2611 (`#2`, `#3`, `#4`, `ignorer` « essais restants ») et de TCK-2613 (`#8`, « rien avant le code »). Relevé du 2026-11-15 : l'aperçu public (`PublicInvitationPreviewResource`) rend la **ville seule** de l'agence et, pour un bailleur, ses biens sans quartier ni photo ; le code d'une invitation SMS part au numéro de l'invitation, sans modification possible ; `…/verify` répond `invitation.code_invalid` sans compte d'essais ; l'étape du numéro des assistants ne rend aucun chiffre avant le code.

- Aperçu public : `agency.address` (adresse publique de la fiche d'agence), et pour un bailleur `pending_properties[]` : `title`, `neighborhood`, `cover_url` (vignette).
- `POST /api/public/invitations/{token}/code` accepte `phone` même pour une invitation SMS (numéro corrigé), avec les règles du § 5 réécrites par l'ADR.
- `…/verify` (422) rend `attempts_left`.
- Lien expiré (410, ADR-0094 § 2) : `inviter_first_name` (prénom seul, comme l'aperçu du § 1) — écart de l'audit, invitation e2 (« nom de l'invitante remplacé par la date »).
- Assistants (étape du numéro, bailleur / agent / prestataire) : `GET /api/me/profiles/{profile}/invite-summary` (`InviteSummaryController`) rend le résumé chiffré du rôle (« N biens suivis par l'agence » + titres, « Ton dernier loyer », « N pièces à envoyer »), au titulaire du profil, **dès que l'invitation est acceptée** et avant la vérification du numéro. Si l'amendement le refuse, AC4 sort du ticket et TCK-2949 est clos `obsolete`.

## Contraintes strictes (métier)

- **Contredit [ADR-0094](../../../adr/0094-l-invitation-se-lit-avant-d-entrer-et-s-accepte-par-code.md)** § 3 (« jamais une adresse d'agence au-delà de la ville ») et § 5 (« pour une invitation par SMS, le code part au numéro de l'invitation ») : le premier item du delta est l'**amendement d'ADR-0094**, validé par le porteur, avant tout code. Il tranche aussi la décision « rien avant le code » de TCK-2613 (`#8`). Ce qui n'est pas accepté par le porteur sort du ticket et reste un écart motivé dans les fiches.
- L'adresse de l'agence est celle que sa fiche publique montre déjà (aucune adresse privée) ; le quartier d'un bien est celui que l'annonce publique montre (jamais l'adresse exacte d'un bien non publié).
- Numéro modifié : l'invitation est alors acceptée sur ce numéro vérifié ; mêmes limiteurs, même verrou (ADR-0033 § 5-6) ; journalisé (« numéro corrigé par l'invité »).
- `attempts_left` est celui du verrou existant, jamais une seconde comptabilité ; aucune énumération (même réponse qu'un compte existe ou non).

## Delta à produire

- [ ] Amendement d'ADR-0094 (§ 3, § 5) et de la décision « rien avant le code » (TCK-2613 #8).
- [ ] `PublicInvitationPreviewResource` : adresse de l'agence, quartier et vignette des biens du bailleur.
- [ ] `InvitationCodeController@send` : numéro corrigé d'une invitation SMS ; `@verify` : `attempts_left`.
- [ ] `invite-summary` ; `inviter_first_name` sur le 410.
- [ ] Tests : `PublicInvitationPreviewTest` (adresse, vignettes, rien de privé), `InvitationCodePhoneChangeTest`, `InvitationCodeAttemptsLeftTest`, `InviteNumberStepSummaryTest`.

## Critères d'acceptation

- [ ] AC1 — L'aperçu d'une invitation de bailleur avec 3 biens en attente rend, pour chacun, titre, quartier et vignette ; l'agence a son adresse publique. Un bien non publié ne rend jamais d'adresse exacte (test).
- [ ] AC2 — Pour une invitation par SMS au numéro A, `POST …/code` avec `phone: B` envoie le code à B ; `…/verify` avec ce code accepte l'invitation pour le compte au numéro B vérifié ; le journal porte le changement.
- [ ] AC3 — Un code faux rend 422 `invitation.code_invalid` avec `attempts_left: 2` après le premier essai, `1` après le second ; au verrou, la réponse actuelle du verrou.
- [ ] AC4 — Un jeton expiré rend 410 avec `inviter_first_name` (prénom seul ; jamais le nom de famille ni le contact de l'invitant).
- [ ] AC5 — `invite-summary` d'un bailleur invité dont l'agence suit 3 biens et a encaissé un loyer de 350 000 le 5 nov. reçoit `{properties_count: 3, titles: […], last_rent: {amount: 350000, paid_at: …}, missing_documents: 2}` (selon l'ADR amendé) ; avant acceptation de l'invitation, rien.

## Hors périmètre

- Les écrans (TCK-2941 invitation, TCK-2949 étape du numéro). La voie par appel (TCK-2940).

## Notes d'implémentation

_(à remplir par implementing-specs)_
