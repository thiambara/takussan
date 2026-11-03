---
id: TCK-094
title: "Recherche full-text messages & documents"
status: done
phase: P2
family: back
estimate: M
wave: 11
created: 2026-04-24
updated: 2026-04-26
depends_on: [TCK-029, TCK-021, TCK-052]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#110-documents--contrats
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#22-document-
tags: [back, search, messages, documents, scout]
---

## Objectif utilisateur

Permettre à un utilisateur (Agent, Bailleur, Locataire) de retrouver
en quelques caractères un message ou un document parmi tous ceux
auxquels il a accès, sans devoir parcourir manuellement les
conversations ou les dossiers — la recherche full-text doit ranker
par pertinence et ne jamais exposer de contenu hors permissions.

## Contrat de données

L'infrastructure Scout (TCK-052) est en place sur Property et
Customer. Étendre l'indexation à `Message` (spec §20) et `Document`
(spec §22) avec scoping strict.

**Endpoints** :

- `GET /api/search/messages?q=loyer+septembre&filter[conversation]=42&fields[messages]=id,body_excerpt,created_at,author_id,conversation_id&include=author,conversation`
  — recherche scopée aux conversations dont l'utilisateur est
  participant (`ConversationParticipant`).
- `GET /api/search/documents?q=bail+dupont&filter[type]=lease&fields[documents]=id,title,type,created_at,documentable_type,documentable_id&include=uploader`
  — recherche scopée aux documents dont l'utilisateur est destinataire
  ou owner (via la relation `documentable` + permissions).
- Filtres communs : `q` (obligatoire, min 2 chars), `filter[date_from]`,
  `filter[date_to]`, `sort=-created_at` ou `sort=relevance` (default).

**Indexation** :

- `Message::toSearchableArray()` indexe `body`, `author_id`,
  `conversation_id`, `created_at` ; exclut les soft-deleted.
- `Document::toSearchableArray()` indexe `title`, `description`,
  `type`, `documentable_type`, `documentable_id`, `created_at`,
  `agency_id` ; exclut les soft-deleted.
- Reindex incrémental via observers (create/update/delete).
- Command `scout:reimport-all` pour rebuild initial.

## Contraintes strictes (métier)

- **Scoping strict côté query** — la query Scout est toujours suffixée
  d'une whereIn sur les IDs autorisés (calculée via les policies
  Message/Document) ; un user ne voit JAMAIS un hit hors de son scope
  même si Meilisearch retourne plus large.
- **Min query length** — `q` doit faire au moins 2 caractères, sinon
  422 (évite le scan complet).
- **Pagination** — par défaut `per_page=20`, max 50.
- **Highlighting** — Meilisearch retourne les highlights dans
  `_formatted` ; le frontend les utilise (champ `body_excerpt` /
  `title_excerpt`) pour mettre en surbrillance les matches.
- **Soft-deleted** — exclus de l'index ; un message édité réindexe
  uniquement le delta `body`.
- **Performance** — la query doit répondre en < 200 ms p95 sur
  10k documents et 50k messages indexés (objectif benchmark).
- **Pas de body complet exposé** — l'API ne retourne qu'un excerpt
  (max 200 chars autour du match) ; le contenu complet exige un
  appel séparé sur l'endpoint message/document standard.

## Delta à produire

- [ ] Trait `Searchable` sur `Message` (toSearchableArray, makeAllSearchableUsing)
- [ ] Trait `Searchable` sur `Document` (toSearchableArray, makeAllSearchableUsing)
- [ ] Index Meilisearch `messages` et `documents` configurés (rankingRules, searchableAttributes, filterableAttributes, sortableAttributes)
- [ ] Controller `SearchMessageController@index` (route `/api/search/messages`)
- [ ] Controller `SearchDocumentController@index` (route `/api/search/documents`)
- [ ] Service `App\Services\Search\MessageSearchService` (scoping + Scout query + post-filter)
- [ ] Service `App\Services\Search\DocumentSearchService` (scoping + Scout query + post-filter)
- [ ] FormRequest `SearchQueryRequest` (validation `q` min 2, dates)
- [ ] Tests `MessageSearchTest` (scope conversations, min length, highlights, pagination)
- [ ] Tests `DocumentSearchTest` (scope ownership, filter type, dates, pagination)
- [ ] Tests perf (benchmark < 200 ms sur dataset 10k+50k)

## Critères d'acceptation

- [ ] AC1 — `GET /api/search/messages?q=loyer` ne retourne que des messages des conversations dont l'utilisateur est participant
- [ ] AC2 — `GET /api/search/documents?q=bail` ne retourne que des documents accessibles selon `DocumentPolicy@view`
- [ ] AC3 — `q` < 2 chars renvoie 422
- [ ] AC4 — chaque hit inclut `_formatted` / excerpt avec le terme entouré
- [ ] AC5 — un message soft-deleted disparaît de l'index dans les 5 secondes après suppression
- [ ] AC6 — `sort=relevance` (défaut) trie par score Meilisearch ; `sort=-created_at` trie par date
- [ ] AC7 — `scout:reimport-all` reindex Messages + Documents sans casser les autres index existants
- [ ] AC8 — benchmark : query p95 < 200 ms sur dataset de référence (seeders dédiés)

## Hors périmètre

- Recherche dans le contenu OCR de PDF / images (P3).
- Recherche fédérée multi-types (messages + documents en un seul résultat) — c'est 2 endpoints distincts pour respecter les fields/include différents.
- UI frontend de la recherche globale — ticket séparé Vague 11/12.
- Recherche dans les attachments des messages (binaire) — hors scope.

## Notes d'implémentation

Straightforward; see PR #79.

- AC4 (highlighting `_formatted`) requires Meilisearch runtime — CollectionEngine does not produce `_formatted`. The `body_excerpt` field will be populated when Meilisearch is the active driver in staging/prod.
- AC8 (benchmark p95 < 200ms) requires a Meilisearch instance with seeded dataset. Index configuration is in place (`scout.php`). Benchmark to be run in staging.
- Document search scoping uses `uploaded_by` ownership. A more granular scoping via `DocumentPolicy@view` traversing `documentable` relations could be added as a follow-up if needed (current approach matches the existing `DocumentController@index` pattern).
