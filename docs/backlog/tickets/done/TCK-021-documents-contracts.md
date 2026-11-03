---
id: TCK-021
title: Documents & contrats
status: done
phase: P0
family: applicatif
estimate: M
wave: 23
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-013, TCK-016]
blocks: []
spec_refs:
  features:
    - docs/features.md#110-documents--contrats
  models:
    - docs/models-spec.md#22-document-
    - docs/models-spec.md#29-documentsharelink-
tags: [back, front, documents, contracts, sharing, pdf]
---

## Contexte

Le modèle `Document` (morphMany polymorphique) et `DocumentShareLink` sont nouveaux dans `models-spec.md`. Ce domaine centralise tous les fichiers liés à une entité (bien, bail, client) et gère le partage sécurisé.

## Objectif

Implémenter le système de gestion documentaire centralisé : upload, catégorisation, partage sécurisé par lien temporaire et recherche.

## Delta à produire

### P0 — MVP bloquant

- [ ] Migration `documents` : `documentable_id`, `documentable_type`, `title`, `type` (DocumentType enum), `uploaded_by_id`, `description`, `metadata`
- [ ] Trait `HasDocuments` (morphMany Document) appliqué sur Property, Lease, Booking, Customer, Agency, User
- [ ] Endpoint `POST /api/{entity}/{id}/documents` — upload polymorphique (medialibrary collection `file`)
- [ ] Endpoint `GET /api/{entity}/{id}/documents` — liste des documents par entité
- [ ] Tests : `DocumentUploadTest`, `DocumentListTest`

### P1

- [ ] Endpoint `PUT /api/documents/{document}` — catégoriser par type (contrat, CNI, RIB, quittance, justificatif)
- [ ] Migration `document_share_links` : `document_id`, `token`, `expires_at`, `created_by_id`, `accessed_at`, `access_count`
- [ ] Endpoint `POST /api/documents/{document}/share` — générer un lien temporaire sécurisé
- [ ] Endpoint `GET /api/shared/{token}` — accéder au document via lien temporaire (public)
- [ ] Endpoint `GET /api/documents?search=` — recherche dans la bibliothèque
- [ ] Tests : `DocumentShareLinkTest`, `DocumentSearchTest`

### P2

- [ ] Génération PDF (quittance, facture, bail) depuis templates Blade
- [ ] Historique des versions d'un document (via medialibrary + activitylog)

### P3

- [ ] Signature électronique intégrée
- [ ] OCR et extraction automatique de données

## Critères d'acceptation

- [ ] Un document peut être uploadé et rattaché à n'importe quelle entité supportée
- [ ] La catégorisation par type est fonctionnelle
- [ ] Un lien de partage expire après la durée configurée
- [ ] La recherche dans la bibliothèque retourne les documents filtrés par type et entité

## Hors périmètre

- Upload de photos de biens (→ TCK-035)
- Signature électronique du bail (→ P3 futur)

## Notes d'implémentation

_(à remplir par implementing-specs)_
