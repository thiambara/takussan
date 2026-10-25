---
id: TCK-2300
title: "La version active d'un document est le fichier servi partout, et une nouvelle version vide sa vérification et son échéance"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-097, TCK-1062, TCK-1063]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-231--gestes-qui-clôturent-une-ligne-et-en-ouvrent-une-neuve-face-aux-champs-quils-ne-reportent-pas"
tags: [api, documents, kyc, pistes]
---

## Objectif utilisateur

Une nouvelle version d'un document remplace pour de bon le fichier que voient ceux qui l'ouvrent :
le lien de partage, la page publique d'un bien, le bouton « Ouvrir » de la bibliothèque et la revue
des demandes de passage en agence. Et un fichier remplacé n'est plus présenté comme « vérifié »,
ni avec l'échéance de l'ancien.

## Contexte

Réfs : **P231.02** et **P231.03** du fichier de pistes, `validé`.

### P231.02 — la version active fait foi

Décision du porteur : validation du porteur (2026-10-25) : un accesseur `Document::currentFile()` (la version active, sinon `file`) lu par les six lecteurs, comme TCK-097 ; une nouvelle version d'un document public de bien devient publique aussitôt

**C'est voulu** : la case « public » porte sur le document, pas sur un fichier. Le bailleur qui
téléverse une nouvelle version d'un document public de son bien la publie dans le même geste.

Avant (lu, puis mesuré par `DocumentCurrentFileTest`, 6 rouges) : `uploadVersion` range la version
dans `versions`, et les six lecteurs servaient `getFirstMedia('file')` :
`DocumentShareLinkController` (taille et téléchargement), `PublicPropertyDocumentController`,
`DocumentResource` (`file_url`, `file_name`, `file_size`, `mime_type`), `PropertyResource`
(documents publics du bien) et `Admin/AgencyUpgradeRequestController` (revue).

### P231.03 — la vérification et l'échéance se vident

Décision du porteur : validation du porteur (2026-10-25) : une nouvelle version vide la vérification et l'échéance (voie de TCK-1063), et une version d'une pièce de profil est refusée (TCK-1062)

Avant (lu, puis mesuré par `DocumentVersionVerificationTest`, 3 rouges) : `uploadVersion` n'écrivait
ni `is_verified`, ni `verified_*`, ni `expiry_date`. Le téléverseur remplaçait un fichier vérifié par
le super-admin sans que personne revoie le nouveau, et une version d'une pièce de profil se créait.

## Delta à produire

- [x] `Document::currentFile()` : la version active de `versions`, sinon `file` ; lu par les six lecteurs.
- [x] `Document::logVerificationReset()` : le journal `document_verification_reset` de TCK-1063,
  sorti de `ProfilePieces::upsert`, qui l'appelle désormais.
- [x] `uploadVersion` : sous le verrou du document, journalise la vérification remplacée, vide
  `is_verified`, `verified_by`, `verified_at`, et pose `expiry_date` à la valeur neuve de la requête
  ou à nul.
- [x] `UploadDocumentVersionRequest` : `expiry_date` facultative (`nullable`, `date`).
- [x] `uploadVersion` refuse une pièce de profil (`isProfilePiece()`) : 422
  `document.profile_piece_not_versioned`.
- [x] Spec : `docs/models-spec.md` § 22 et `docs/features.md` § 1.10.

## Critères d'acceptation

- [x] AC1 — Nouvelle version : le lien de partage rend sa taille et son contenu.
- [x] AC2 — `GET /api/documents/{id}` : `file_url` signée vers la version, `file_name` et `file_size` d'elle.
- [x] AC3 — Document public d'un bien : la fiche publique rend la taille de la version, et la route
  publique redirige vers elle.
- [x] AC4 — Revue d'une demande de passage en agence : `media_url` signée vers la version.
- [x] AC5 — Une version restaurée redevient le fichier servi ; sans version, `file` reste servi.
- [x] AC6 — Nouvelle version d'un document vérifié à échéance : non vérifié, `verified_*` et
  `expiry_date` vides, une entrée `document_verification_reset` (vérificateur et date d'avant).
- [x] AC7 — Une `expiry_date` neuve dans la requête est reprise.
- [x] AC8 — Document non vérifié : aucune entrée au journal.
- [x] AC9 — Pièce de profil : 422, aucune version, la pièce reste vérifiée et non supprimable par
  son titulaire.

## Hors périmètre

- **Le trou « vider puis supprimer » existe déjà sur la voie de TCK-1063** (mesuré par un test
  temporaire, retiré) : une pièce de profil vérifiée, renvoyée par l'assistant (`POST
  /api/me/owner-profiles/{id}/kyc/upload`), perd sur-le-champ son fichier vérifié (collection
  `singleFile`), redevient non vérifiée, et son titulaire la supprime ensuite (`DELETE` → 204, contre
  403 avant le renvoi). Hors de la décision : non corrigé ici.
- La restauration d'une version (`restoreVersion`) change aussi le fichier servi, sans vider la
  vérification : la décision ne vise que la nouvelle version.
- Le front n'envoie pas d'`expiry_date` avec une version (`DocumentVersionsList`), et la fiche d'une
  pièce de profil garde son bouton « Nouvelle version », qui rend désormais 422.
- Le badge « Assuré » (`ServiceProviderProfile::liveInsuranceDocuments`) tient une échéance nulle
  pour vivante : une assurance versionnée sans échéance neuve reste « Assuré », sans fin.

## Notes d'implémentation

- `currentFile()` lit la relation `media`, chargée une fois pour les deux collections, comme
  `getFirstMedia` : aucune requête de plus par lecteur (`DocumentIndexQueryBudgetTest`,
  `ProListQueryBudgetTest` verts).
- La vérification s'efface sur la ligne relue sous le verrou, puis les attributs sont recopiés dans
  le modèle de l'appelant : un modèle périmé n'aurait pas vu son `is_verified` changer (`forceFill`
  n'écrit que le sale).
- **Ablation P231.02** : `currentFile()` réduit à `getFirstMedia('file')` → 5 rouges sur 6 (le
  témoin sans version passe) ; chacun des cinq fichiers lecteurs remis à son état d'avant → un rouge,
  celui de son test.
- **Ablation P231.03** : remise à zéro retirée → 2 rouges sur 4 ; journal retiré → 1 ; garde de
  la pièce de profil retirée → 1 ; échéance neuve non transmise par le contrôleur → 1. Remis → 4 verts.
