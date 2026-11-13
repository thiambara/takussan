---
id: TCK-2781
title: "Recherche de documents : la lecture se dit au moteur par un filtre borné, et non par un `NOT id IN [...]` qui grandit avec les téléversements"
status: todo
phase: P3
family: back
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#24-recherche--filtres"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, documents, recherche, meilisearch, performance, suite-de-tck-2759]
---

## Objectif utilisateur

La recherche de documents d'un membre du personnel reste juste et rapide, quel que soit le nombre de pièces qu'il a
téléversées dans une agence qu'il a quittée.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 25 : ticket de suivi. Relevé ab (TCK-2759 r4).

**Priorité, telle que la décision la pose.** Le défaut n'a aucun effet visible à l'échelle de la démo. Il devient réel
quand un auteur dépasse **quelques milliers de pièces** dans une agence quittée. Le ticket est rangé en P3 pour
cette raison : il ne s'ouvre pas avant ce seuil, sauf décision contraire du porteur. L'implémenteur mesure d'abord
le plus grand écart de la base de préproduction, en lecture seule, et l'écrit dans les notes.

**Constat, relu sur l'arbre du 2026-11-13.**

- `DocumentSearchService::search()` borne le moteur par `uploaded_by` (hors super-admin), puis lui passe
  `whereNotIn('id', $exclus)`.
- `exclus()` calcule en SQL l'écart entre ce périmètre et la lecture :
  - pour le personnel : `DocumentPolicy::restreindreAuTeleverseur` ;
  - pour le super-admin : `restreindreAuxLecteursDInternes`.
- Le docblock le dit lui-même : la liste n'est « pas bornée ». Pour un membre du personnel parti, elle contient
  tous ses téléversements dans l'agence quittée, envoyés en un seul filtre Meilisearch à chaque recherche.
- L'index des documents (`config/scout.php`) a pour attributs filtrables `id`, `type`, `documentable_type`,
  `documentable_id`, `uploaded_by` et `created_at`. Il n'a ni l'agence du porteur, ni `is_internal`, ni le sujet
  d'une fiche client : la règle de lecture ne peut donc pas s'y écrire autrement que par une liste d'identifiants.

**Endpoint touché :** `GET /api/search/documents`.

## Contraintes strictes (métier)

- **La recherche suit la lecture (ADR-0099 § 1)**, exactement comme aujourd'hui. Un document que `view()` refuse
  n'est ni rendu, ni compté dans le total, ni présent dans aucune page. Ce ticket ne change aucun verdict.
- **Le filtre passé au moteur est borné** par le nombre d'agences du lecteur, pas par son nombre de documents.
- **Le total et les pages restent justes.** Pas de filtrage après coup d'une page déjà découpée par le moteur
  (la leçon de TCK-786).
- La règle SQL (`restreindreAuTeleverseur`, `restreindreAuxLecteursDInternes`) reste la référence. Le filtre du moteur
  en est une **traduction**, gardée par un test de parité.
- Un attribut dénormalisé dans l'index est réindexé quand sa source change : un bien qui change d'agence, une fiche
  dont le `user_id` change, un document dont `is_internal` bascule.

## Delta à produire

- [ ] `Document::toSearchableArray()` gagne :
  - `carrier_agency_id`, l'agence du porteur (bien, bail, réservation, fiche, état des lieux par son bien, agence,
    profils), ou `null` ;
  - `is_internal` ;
  - `subject_user_id`, le `user_id` de la fiche client ou le locataire du bail, quand la règle le lit.
- [ ] `config/scout.php` : ces trois attributs deviennent filtrables. `docker/release.sh` les pousse par
  `search:sync-index-settings`. ⚠ Ils entrent dans l'empreinte `.search-shape` : le déploiement suivant réimporte
  les index.
- [ ] `DocumentSearchService` : le `whereNotIn('id', …)` est remplacé par un filtre écrit avec ces attributs et les
  agences gardées du lecteur (`memberAgencyIds` plus les agences de ses profils de bailleur).
- [ ] Observateurs : réindexation des documents d'un porteur dont l'agence ou le sujet change.
- [ ] Test de parité `RechercheDocumentsPariteSqlMoteurTest`, sur Meilisearch réel. Pour une matrice de lecteurs
  (personnel actif, personnel parti, agent suspendu, bailleur, super-admin sujet d'une fiche) × porteurs, l'ensemble
  rendu par le moteur égale l'ensemble que la requête SQL de la liste rend.

## Critères d'acceptation

- [ ] AC1 — Pour un membre du personnel parti avec 3 000 téléversements dans l'agence quittée, la requête envoyée à
  Meilisearch ne contient aucune liste d'identifiants. Le test l'épingle sur le filtre construit.
- [ ] AC2 — Les huit tests de `DocumentInterneFicheEtRechercheTest` restent verts sans modification de leurs attentes.
- [ ] AC3 — Le test de parité est vert pour chaque case de la matrice.
- [ ] AC4 — Un bien qui change d'agence voit ses documents réindexés : la recherche du personnel de l'ancienne agence
  ne les rend plus, celle de la nouvelle les rend.
- [ ] AC5 — Vérifié par ablation. Un filtre qui oublie les profils de bailleur, ou un observateur retiré, rend un test
  rouge.

## Hors périmètre

- La recherche dans le coffre (`filter[search]` de `GET /api/me/document-vault`) : TCK-2769.
- Changer qui lit quoi.

## Notes d'implémentation

_(à remplir par implementing-specs)_
