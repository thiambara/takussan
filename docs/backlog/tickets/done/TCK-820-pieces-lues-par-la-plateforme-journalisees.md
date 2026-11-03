---
id: TCK-820
title: "Documents : la liste ne rend plus au super-admin les pièces de toute la plateforme, et la lecture d'une pièce par un profil plateforme est journalisée"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#26-audit--traçabilité"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-23--lectures-de-données-personnelles-sans-step-up-face-à-refused_reads"
tags: [back, documents, privacy, audit, pistes]
---

## Contexte

Réf : **P23.04** du fichier de pistes, `validé` (V3 accordé).

`DocumentController::index` ne filtrait par téléverseur que hors super-admin : `GET
/api/documents?filter[type]=id_card` rendait au super-admin les pièces de tous les comptes, avec
leur `file_url` signée, hors de la console (`/api/admin/*`) et sans trace. `DocumentPolicy::view`
lui ouvre aussi tout document, et ni `show` ni le téléchargement d'une version n'appelaient
`PersonalDataAccessLogger`, quand les dossiers KYC de la console sont journalisés à chaque lecture.

## Décision du porteur

validé — index filtré par uploaded_by pour tous, super-admin compris, si aucun écran de la console ne l'appelle ; lecture d'une pièce par un profil plateforme journalisée par PersonalDataAccessLogger

## Objectif utilisateur

Une pièce d'identité, un RIB ou un NINEA ouvert par la plateforme laisse une trace de
consultation, et la plateforme ne les liste plus en bloc.

## Contraintes strictes

- La condition de la décision est vérifiée : aucun écran de la console n'appelle
  `GET /api/documents` (`grep` sous `takussan-web/src` : seule `DocumentsLibrary`, sous
  `/app/documents`, l'appelle, par `useDocuments`).
- `DocumentPolicy::view` ne change pas : le super-admin ouvre toujours un document par son
  identifiant.

## Delta à produire

- [x] `DocumentController::index` : `where('uploaded_by', $user->id)` pour tous.
- [x] `Document::isPiece()` (`PIECE_TYPES`, quel que soit le porteur), relu par `isProfilePiece()`.
- [x] `PersonalDataAccessLogger::recordPlatformPieceRead()` et la surface `document_piece`.
- [x] Appelée après l'autorisation par `DocumentController::show` et
      `DocumentVersionController::download`.
- [x] `tests/Feature/Privacy/DocumentPieceAccessTest.php`.

## Critères d'acceptation

- [x] AC1 — `GET /api/documents?filter[type]=id_card` par un super-admin rend ses propres
      téléversements, et pas la pièce d'un autre compte.
- [x] AC2 — `GET /api/documents/{id}` d'une pièce d'un autre compte par un super-admin laisse une
      ligne `PersonalDataAccess` (surface `document_piece`), une seule sur la fenêtre de 15 min.
- [x] AC3 — Le téléchargement d'une version de cette pièce laisse la même trace.
- [x] AC4 — Aucune trace pour un document qui n'est pas une pièce, une pièce que le profil
      plateforme a téléversée, ou un lecteur sans profil plateforme.

## Hypothèses

- « Pièce » = `Document::PIECE_TYPES` (`id_card`, `rib`, `ninea`), la définition déjà employée
  par TCK-697. `passport` n'y est pas : hors périmètre, relevé dans le rapport.
- « Profil plateforme » = `hasActivePlatformProfile()` (super-admin, support, lecteur), la
  condition d'entrée dans la console (ADR-0047).
- « Lecture » = les deux routes qui rendent le fichier : `show` (sa `file_url` signée) et le
  téléchargement d'une version. La liste des versions ne rend aucun fichier.

## Hors périmètre

- Le type `passport`, absent de `Document::PIECE_TYPES`.
- `GET /api/search/documents` : `DocumentSearchService.php:22` porte la même exemption du
  super-admin (relu). La décision ne vise que la liste ; laissé en reste de l'entrée P23.04.

## Notes d'implémentation

- **Ablation** : les deux contrôleurs d'origine remis, AC1, AC2 et AC3 rougissent (AC4 reste vert,
  attendu : il garde l'absence de trace) ; correctif remis, 4 verts.
