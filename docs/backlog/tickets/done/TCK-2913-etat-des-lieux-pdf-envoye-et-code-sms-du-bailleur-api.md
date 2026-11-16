---
id: TCK-2913
title: "API — état des lieux : à la seconde signature, le PDF figé part aux parties ; et le bailleur peut signer sur place par un code SMS"
status: done
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: [TCK-2914]
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#24-inventory-"
tags: [back, etats-des-lieux, signature, sms, pdf, notifications, audit-ux, app]
---

## Objectif utilisateur

Dès que le locataire et le bailleur (ou l'agence pour lui) ont signé, chacun reçoit le PDF de l'état des lieux ; et quand le bailleur est là, il signe lui-même avec un code reçu par SMS, comme le locataire.

## Contrat de données

Constat (vérifié à l'écriture) :

- À la seconde signature, `InventorySignatureService` (l. 107-125) passe l'état des lieux à `Signed`, fige l'empreinte, garde l'instantané des parties — **il ne génère pas le PDF et n'envoie rien** ; le contrôleur rend la ressource (`InventoryController.php:185-197`). Le PDF ne se rend qu'à la demande (`GET inventories/{inventory}/pdf`).
- Le code SMS sur place (`sendOnsiteCode`, l. 215-250) n'existe que pour le **locataire** ([ADR-0098](../../../adr/0098-le-locataire-signe-l-etat-des-lieux-sur-place-par-code-sms.md)) ; le bailleur signe connecté, ou le personnel signe pour lui (`on_behalf_of`, `LandlordSignatory`).

Audit (`audit-f4-patrimoine.md`, app-etats-des-lieux **e2** : « Terminer et envoyer le PDF » → « Terminer », « Lui envoyer un code par SMS » pour le bailleur absent ; fiche `TCK-2648.json` a-2, aucun ticket).

À servir :

1. À la seconde signature, une tâche en file (`queue`) génère le PDF figé (même rendu que `GET …/pdf`) et l'envoie au locataire et au bailleur (notification + e-mail avec le PDF ou un lien signé ; WhatsApp selon les préférences, canal existant), et l'enregistre dans le journal de l'état des lieux (« PDF envoyé à … le … ») ; la ressource rend `pdf_sent_at` et les destinataires.
2. Signature du bailleur sur place par code : `POST inventories/{inventory}/onsite-code` avec `party=landlord` envoie un code au téléphone du bailleur ; la signature du bailleur accepte ce code, comme celle du locataire.

## Contraintes strictes (métier)

- **Amender ADR-0098 avant le code** : la voie du code SMS s'ouvre au bailleur (qui la lance, à quel numéro, combien d'essais, journal) ; `LandlordSignatory` (la signature pour le compte au titre du mandat) reste possible.
- Mêmes bornes que le code du locataire : durée de vie, essais, délai de renvoi, numéro lu sur le compte (jamais saisi), journalisation.
- L'envoi du PDF ne bloque pas la réponse de la signature (tâche en file) et ne part qu'une fois par état des lieux (idempotent : rejouer la tâche ne renvoie pas).
- Le PDF envoyé est celui dont l'empreinte est figée ; aucune donnée personnelle dans l'URL.

## Delta à produire

- [ ] Amendement d'ADR-0098 (le bailleur et le code SMS).
- [ ] Job `SendSignedInventoryPdf` déclenché à la seconde signature ; notification `SignedInventoryAvailable` (fr/en/wo côté gabarits existants) ; `pdf_sent_at` (migration) et entrée de journal.
- [ ] `sendOnsiteCode` et la vérification de signature acceptent `party=landlord`.
- [ ] Tests : `InventorySignedPdfDispatchTest` (seconde signature → job ; première → rien ; job rejoué → un seul envoi ; destinataires), `InventoryLandlordOnsiteCodeTest` (code envoyé au numéro du compte du bailleur, signature valide, mauvais code, essais épuisés).

## Critères d'acceptation

- [ ] AC1 — Quand la seconde partie signe, un job d'envoi est mis en file ; à son exécution, le locataire et le bailleur reçoivent chacun une notification portant le PDF (ou son lien signé), et la ressource rend `pdf_sent_at` non nul.
- [ ] AC2 — La première signature ne déclenche aucun envoi ; rejouer le job ne produit pas de second envoi.
- [ ] AC3 — `POST …/onsite-code` avec `party=landlord` envoie un SMS au numéro du compte du bailleur ; la signature du bailleur avec ce code est acceptée et enregistrée comme signature du bailleur (pas « pour le compte de »).
- [ ] AC4 — Un code faux est refusé ; au-delà du nombre d'essais, le code est invalidé (mêmes valeurs que pour le locataire).
- [ ] AC5 — Le journal de l'état des lieux porte « PDF envoyé ».

## Hors périmètre

- L'écran (TCK-2914).
- La signature à distance du bailleur par lien (non dessinée).

## Notes d'implémentation

Implémenté le 2026-11-15 (branche `feat/audit-manques-2026-11-15`).

**Prémisse re-mesurée — écarts :**
- La route du code existe déjà sous `POST inventories/{inventory}/sign/onsite-code` (TCK-2646), pas `…/onsite-code` : gardée, avec `party` (`tenant` | `landlord`) dans le corps ; absent = `tenant` (appel inchangé).
- Le service : `InventorySignatureService::sign` l. 63-125, `sendOnsiteCode` l. 215-250 — conformes au constat.

**Décisions (consignées dans l'amendement du 2026-11-15 d'ADR-0098) :**
- Côté bailleur, c'est le **code** qui distingue les deux voies : `role=landlord` sans code = inchangé (lui-même, ou le personnel `leases.sign` pour son compte) ; avec code et personnel habilité (agence du bail + `update`) = signature DU bailleur (`owner_signed_by_user_id` = bailleur, `on_behalf_of` nul), trace en colonnes `owner_signature_method`, `owner_signed_via_user_id`, `owner_otp_channel`, `owner_otp_destination`, `owner_signed_ip` (cachée). `can_sign_as` rend `landlord_onsite`. 422 `inventory_signature.landlord_without_phone` sans numéro vérifié. Même `SignatureOtpService`, clé `…:{bailleur}:landlord`.
- L'envoi : tâche `App\Jobs\Inventory\SendSignedInventoryPdf`, mise en file après la transaction de la seconde signature ; réclamation `UPDATE … WHERE pdf_sent_at IS NULL` (une fois) ; avis par code `inventory.signed_pdf_available` (cloche + e-mail) au compte du locataire et au bailleur, cible `inventory` → `/app/inventories/{id}` ; **un lien, pas une pièce jointe** (patron `document.archive_ready` : aucun octet dans la file, lien qui s'ouvre sous la session) ; **sans SMS ni WhatsApp** (acte contractuel sans interrupteur, comme `lease.signature_completed`). Journal : `activity()` événement `inventory_pdf_sent` (ids des destinataires). Ressource : `pdf_sent_at`, `pdf_sent_to` (id + nom, `show`), `owner_signed_via`.
- Un locataire sans compte n'est pas destinataire (ni cloche ni page) ; `pdf_sent_to` ne liste que les avisés.

**Tests :** `InventoryLandlordOnsiteCodeTest` (9), `InventorySignedPdfDispatchTest` (6) ; mis à jour : `InventorySignatureTest` et `InventoryOnsiteSignatureTest` (`can_sign_as` gagne `landlord_onsite`), `DateInventoryByValueTest` (deux clés `when()`). Front : types `src/types/inventory.ts`, clés `notifications.codes.inventory.signed_pdf_available.*` et `admin.audit.events.inventory_pdf_sent`.

