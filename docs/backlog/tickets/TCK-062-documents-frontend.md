---
id: TCK-062
title: "Documents — Frontend bibliothèque & partage"
status: done
phase: P1
family: front
estimate: M
wave: 4
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-021, TCK-057, TCK-054, TCK-016]
blocks: []
spec_refs:
  features:
    - docs/features.md#110-documents--contrats
    - docs/features-by-actor.md
  models:
    - docs/models-spec.md#21-document
    - docs/models-spec.md#22-documentsharelink
tags: [documents, front, dashboard, sharing]
---

## Contexte

Le backend Documents (TCK-021) est `done` : `DocumentController`, `DocumentShareLinkController`, upload via medialibrary, liens de partage temporaires. Le frontend expose uniquement `src/app/(dashboard)/app/documents/page.tsx` en stub (`StubPlaceholder`). Aucune UI pour lister, uploader, catégoriser ou partager.

## Objectif utilisateur

Un agent doit pouvoir centraliser et retrouver tous les documents liés à ses biens, baux, clients (contrats, CNI, RIB, quittances, justificatifs) et partager un document sécurisé par lien temporaire avec un locataire ou bailleur.

## Contrat de données

Endpoints à consommer (existants, TCK-021) :

- `GET /api/documents` — liste (filter[documentable_type], filter[documentable_id], filter[category], filter[search])
- `POST /api/documents` — upload + metadata (documentable_type, documentable_id, category, title)
- `PATCH /api/documents/{id}` — renommer, changer catégorie
- `DELETE /api/documents/{id}` — soft delete
- `POST /api/documents/{id}/share-links` — génère lien temporaire (expires_at, max_uses)
- `GET /api/documents/{id}/share-links` — liste les liens actifs
- `DELETE /api/documents/{id}/share-links/{link}` — révoquer

Sparse fieldsets obligatoires : `fields[documents]=id,title,category,mime_type,size,created_at,documentable_type,documentable_id`.

## Direction UX / Artistique

Bibliothèque silencieuse et efficace, à la Google Drive / Notion files. Liste dense dominante, upload via drag-drop sur la zone principale (pas de modal obligatoire). Groupement par catégorie avec compteurs. Modal de partage avec copie du lien et TTL visible. Pas d'effets tape-à-l'œil ; on doit retrouver un doc en moins de 3 clics.

## Contraintes strictes (métier)

- Filtrage par catégorie, type d'entité, recherche plein-texte sur `title`.
- Un document n'est visible qu'aux utilisateurs ayant accès à son entité parente (policies backend déjà en place — le frontend ne doit pas contourner).
- Lien de partage : TTL configurable (1h, 24h, 7j, 30j), usage max optionnel, révocation immédiate.
- L'upload doit supporter les mêmes types MIME que `DocumentRequest` backend (PDF, images, office, txt).

## Delta à produire

- [ ] Page `/app/documents` : liste filtrable, grouping par catégorie, recherche, pagination
- [ ] Formulaire upload (multi-fichier) avec sélection de l'entité liée (bien/bail/client) — peut être inline drag-drop
- [ ] Modal partage : génération de lien, affichage TTL, copie, liste des liens actifs, révocation
- [ ] Composant de détail (panel latéral ou page dédiée `/app/documents/[id]`)
- [ ] Intégration dans les pages existantes (fiche bien, fiche bail, fiche client) — bouton "Ajouter un document" qui pré-remplit `documentable_*`
- [ ] Tests Vitest : rendering liste, upload form validation, share modal

## Critères d'acceptation

- [ ] AC1 — Un agent authentifié voit la liste de ses documents filtrée par catégorie, avec pagination fonctionnelle
- [ ] AC2 — L'upload multi-fichier fonctionne en drag-drop et en sélection classique, avec feedback d'erreur 422 mappé
- [ ] AC3 — La génération de lien de partage produit une URL copiable, avec TTL affiché lisiblement
- [ ] AC4 — La révocation d'un lien le retire de la liste sans rechargement complet
- [ ] AC5 — Les fiches bien/bail/client existantes exposent le bouton "Ajouter un document" qui pré-remplit l'entité
- [ ] AC6 — `npm run build` + `npm run test` verts

## Hors périmètre

- Génération PDF depuis templates (→ TCK-077)
- Signature électronique, OCR (P3)
- Historique des versions (P2, à traiter ultérieurement — possible via medialibrary)
- Catégorisation automatique par IA

## Notes d'implémentation

- **PR** : https://github.com/thiambara/takussan/pull/43 (groupe V4-C — avec TCK-063).
- **Page** `src/app/(dashboard)/app/documents/page.tsx` — wrapper auth + rendu `<DocumentsLibrary>`.
- **Composants** `src/components/documents/` :
  - `DocumentsLibrary` — liste groupée par catégorie, drag-drop zone globale, pagination via `PropertyPagination`.
  - `DocumentsFilters` — recherche + `type` + `documentable_type`, filtres persistés en URL (`useSearchParams` / `router.replace`).
  - `DocumentUploadDialog` — formulaire RHF + Zod, drag-drop inline, pré-remplissage optionnel (`defaultDocumentable`) ; multipart/form-data via `useApiMutation({ formData: true })`.
  - `DocumentShareDialog` — TTL (1h/24h/7j/30j), mot de passe, max downloads, copie lien + révocation ; stockage des liens en local-state (pas d'endpoint `index` côté back).
  - `AddDocumentButton` — bouton réutilisable, monté sur fiche bien/bail/client avec `documentable_type`/`documentable_id` pré-remplis (AC5).
- **Hooks** `src/lib/queries/documents.ts` — `useDocuments`, `useDocument`, `useUploadDocument`, `useDeleteDocument`, `useCreateShareLink`, `useRevokeShareLink`. Sparse fieldsets obligatoires (`fields[documents]=...`), filtre spatie `filter[type]`, `filter[documentable_type]`, `filter[search]`.
- **Types** `src/types/document.ts` — `Document`, `DocumentShareLink`, `DocumentType`, `DocumentableType`.
- **Schémas** `src/lib/schemas/document.ts` — `documentUploadSchema`, `shareLinkSchema`.
- **Intégrations** : `AddDocumentButton` ajouté en en-tête de `/app/properties/[id]`, `/app/customers/[id]` et dans `LeaseDetail`.
- **Tests** : `src/lib/schemas/__tests__/document.test.ts` (upload + share-link) + `src/components/documents/__tests__/constants.test.ts` (resolveDocumentableAlias / Href, dictionnaires). Tous verts.
- **Hors périmètre** (conforme au ticket) : signature électronique, OCR, versions, templates PDF.
