---
id: TCK-2884
title: "API des demandes : annuler un traitement (« dé-traiter ») et servir le quartier du bien demandé"
status: todo
phase: P1
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2885]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#67-propertycontactlead-"
tags: [back, leads, crm, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent qui a marqué une demande traitée par erreur la remet à traiter d'un geste « Annuler » ; il lit dans la boîte le quartier du bien demandé.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-demandes e0, e2, e3). Le toast « Marquée traitée · Annuler » (e2) et « Demande traitée. · Annuler » (e3) avaient été écartés faute de route API ; le porteur veut tout. La ligne de la boîte ne lit que `property.title` (`LigneDeDemande.tsx:41`) : `PropertyContactLead::$requestLoadable` ne contient que `property` et `recipient`.

## Contrat de données

- `POST /api/contact-leads/{lead}/unhandle` (neuf).
- `include=property.address` (ou `property` qui porte `neighborhood`) sur `GET /api/contact-leads` et `/{lead}`.

## Contraintes strictes (métier)

- [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md) : « répondre ne vaut pas traiter » — dé-traiter n'efface aucun geste de contact ni la première réponse.
- Dé-traiter : même autorisation que `handle` ; seulement une demande traitée ; remet `handled_at` et `handled_by_id` à `null` ; journalisé ; une demande convertie en fiche reste rattachée à sa fiche (le traitement seul est annulé).
- Le quartier seul est servi dans la boîte (pas la rue) ; même lecture que la demande.

## Delta à produire

- [ ] `ContactLeadController::unhandle` + `ContactLeadService::unhandle` + route `contact-leads.unhandle`.
- [ ] `PropertyContactLead::$requestLoadable` : `property.address` ; vérifier que `PropertyContactLeadResource` sert `property.address.neighborhood`.
- [ ] Tests : `ContactLeadUnhandleTest` (remet à traiter, 422 sur une non traitée, 403 pour qui ne peut pas traiter, gestes conservés), `ContactLeadNeighborhoodTest` (une requête pour la page, quartier présent).

## Critères d'acceptation

- [ ] AC1 — Une demande traitée, dé-traitée par son destinataire, revient dans `filter[handled]=0` ; ses gestes de contact restent.
- [ ] AC2 — Dé-traiter une demande non traitée rend 422 ; un agent qui ne la lit pas reçoit 403.
- [ ] AC3 — `GET /api/contact-leads?include=property.address` rend le quartier de chaque bien, sans requête par ligne.

## Hors périmètre

- L'écran (TCK-2885).

## Notes d'implémentation

_(à remplir par implementing-specs)_
