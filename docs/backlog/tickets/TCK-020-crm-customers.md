---
id: TCK-020
title: CRM & relation client
status: done
phase: P0
family: applicatif
estimate: L
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-013, TCK-014, TCK-048, TCK-051]
blocks: [TCK-026, TCK-027]
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#9-usercustomerrelationship
    - docs/models-spec.md#33-customernote-
    - docs/models-spec.md#32-task-
tags: [back, front, crm, customer, relationship, notes]
---

## Contexte

Le CRM est le socle de la relation client. Le modèle `Customer` existe mais les fonctionnalités de gestion des relations agent↔client, notes, pipeline et pièces jointes ne sont pas implémentées. Les modèles `CustomerNote` et `Task` sont nouveaux.

## Objectif

Implémenter la gestion complète des contacts client (Customer), relations agent↔client, notes horodatées, et le pipeline CRM.

## Delta à produire

### P0 — MVP bloquant

- [ ] Migration : ajout colonnes Customer (`pipeline_stage`, `id_number`, `occupation`, `emergency_contact_name`, `emergency_contact_phone`)
- [ ] Endpoints CRUD : `GET/POST /api/customers`, `GET/PUT/DELETE /api/customers/{customer}`
- [ ] Endpoint recherche : `GET /api/customers?search=` (plein-texte sur nom, email, phone)
- [ ] Pages Next.js : liste clients, création, fiche client
- [ ] Tests : `CustomerCrudTest`, `CustomerSearchTest`

### P1

- [ ] Endpoint `PUT /api/customers/{customer}/link-user` — lier un Customer à un User existant
- [ ] Endpoints `UserCustomerRelationship` : `POST /api/customers/{customer}/relationships` (type, période, is_primary)
- [ ] Endpoint `POST /api/customers/{customer}/documents` — joindre pièces d'identité (medialibrary collections `photo`, `id_documents`)
- [ ] Endpoint historique interactions : `GET /api/customers/{customer}/activity` (via spatie/activitylog)
- [ ] Endpoint contact principal : `PUT /api/customers/{customer}/relationships/{rel}/primary`
- [ ] Migration + CRUD `CustomerNote` : `POST /api/customers/{customer}/notes` (notes horodatées signées par agent)
- [ ] Page Next.js : fiche client détaillée (relations, notes, documents, historique)
- [ ] Tests : `CustomerLinkUserTest`, `CustomerRelationshipTest`, `CustomerDocumentsTest`, `CustomerNoteTest`

### P2

- [ ] Pipeline de prospects : `PUT /api/customers/{customer}/pipeline-stage` (lead → prospect → qualified → negotiating → converted → lost)
- [ ] Migration + CRUD `Task` : `POST /api/customers/{customer}/tasks` (tâches et rappels attachés à un client)
- [ ] Tags clients : `POST /api/customers/{customer}/tags` (segmentation CRM via morphToMany Tag)

### P3

- [ ] Campagnes email / SMS ciblées (→ P3 futur)

## Critères d'acceptation

- [ ] Un agent peut créer un Customer avec ou sans compte User
- [ ] La recherche plein-texte fonctionne sur nom, email et téléphone
- [ ] Un Customer peut être lié à un User existant
- [ ] Les notes sont horodatées et associées à l'agent qui les a écrites
- [ ] Le pipeline_stage reflète l'avancement commercial du client
- [ ] Les pièces d'identité sont uploadées via medialibrary

## Hors périmètre

- Campagnes email / SMS (→ P3 futur)
- Facturation client (→ TCK-028)

## Notes d'implémentation

_(à remplir par implementing-specs)_
