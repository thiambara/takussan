---
id: TCK-097
title: "Historique versions documents"
status: done
phase: P2
family: applicatif
estimate: S
wave: 11
created: 2026-04-24
updated: 2026-04-26
depends_on: [TCK-021, TCK-062]
blocks: []
spec_refs:
  features:
    - docs/features.md#110-documents--contrats
  models:
    - docs/models-spec.md#22-document-
tags: [back, front, documents, medialibrary]
---

## Objectif utilisateur

Permettre à un Agent / Bailleur d'uploader une nouvelle version
d'un même Document (avenant signé, devis corrigé, bail révisé)
sans perdre l'historique des versions précédentes — chaque version
reste téléchargeable, datée et attribuée à son uploader, avec la
plus récente en "version active" par défaut.

## Contrat de données

L'entité `Document` (spec §22) garde une seule ligne logique. Le
versioning passe par la collection medialibrary `versions` (au lieu
de la collection `original` actuelle), où chaque media item =
1 version, ordonnée par `order_column` (= numéro de version).

**Endpoints** :

- `POST /api/documents/{id}/versions` body `{ file, comment? }` —
  upload une nouvelle version. Le media précédemment "active" est
  archivé (collection metadata `is_active = false`), le nouveau
  devient `is_active = true`.
- `GET /api/documents/{id}?include=versions&fields[documents]=id,title,type,active_version,versions`
  — retourne le document avec la liste des versions (`versions[].id`,
  `versions[].file_name`, `versions[].size`, `versions[].uploaded_by_id`,
  `versions[].created_at`, `versions[].comment`, `versions[].is_active`).
- `GET /api/documents/{id}/versions/{versionId}/download` — URL
  temporaire signée vers le fichier (réutilise le DocumentShareLink
  flow existant TCK-021 si pertinent, sinon signed URL spatie).
- `POST /api/documents/{id}/versions/{versionId}/restore` — rebascule
  une version archivée en "active" (utile en cas d'erreur upload).

**Frontend** : page détail document affiche un panneau "Versions"
(accordéon ou tab) listant l'historique. Action "Uploader une
nouvelle version" en bouton primaire à côté du document courant.

## Direction UX / Artistique

**Card document principale** : preview de la version active +
métadonnées (titre, type, taille, date, uploader). Bouton "Uploader
une nouvelle version" en outline secondary à côté de "Télécharger".

**Panneau Versions** : liste verticale, version courante en haut
avec badge "Version active". Chaque ligne : numéro de version
(v3, v2, v1...), nom de fichier, uploader avec avatar, date relative,
commentaire (si présent), actions (télécharger / restaurer).
Diff visuel léger (taille avant/après) en gris discret.

**Upload nouvelle version** : drop-zone modale avec champ comment
optionnel. Une fois uploadée, animation de slide qui pousse les
versions précédentes vers le bas, la nouvelle prenant la position 1.
Toast "Version v4 active — précédentes archivées".

**Restauration** : confirmation modale "Restaurer la version vN ?
La version active actuelle deviendra archivée." (pas de perte de
données, juste réordonnancement).

## Contraintes strictes (métier)

- **Single source of truth = `Document` row** — pas de table
  `document_versions` séparée ; on s'appuie sur la collection
  medialibrary `versions`.
- **Une seule version active à la fois** — invariant garanti par le
  service `DocumentVersionService` (transaction qui flip les
  `is_active` en custom_properties).
- **Permissions** — uploader une version requiert le même accès
  que `Document::update` (policy existante TCK-021) ; restaurer
  une version idem.
- **Limite versions** — soft-cap à 20 versions par document
  (au-delà, la version la plus ancienne est purgée du storage
  mais sa metadata reste auditable via ActivityLog jusqu'à 90j).
- **Audit obligatoire** — chaque upload/restore est tracé via
  ActivityLog (`document.version.uploaded`, `document.version.restored`)
  avec `version_number`, `file_name`, `comment`, `actor_id`.
- **Validation fichier** — mêmes contraintes que l'upload initial
  (formats autorisés, taille max — réutiliser FormRequest existant
  TCK-021).
- **Comment** — optionnel, max 500 chars.
- **Pas de modification de version archivée** — une fois archivée,
  une version est immuable (lecture seule jusqu'à purge).

## Delta à produire

- [ ] Service `App\Services\Document\DocumentVersionService` (uploadVersion, restoreVersion, listVersions)
- [ ] Controller `DocumentVersionController` (store, restore, download)
- [ ] Routes nested `documents.versions.*` dans `routes/api/documents.php`
- [ ] FormRequest `UploadDocumentVersionRequest` (file + comment validation)
- [ ] Resource `DocumentVersionResource` (JSON shape attendu)
- [ ] Migration éventuelle si la collection existante doit être renommée (`original` → `versions`) — sinon adapter le model
- [ ] Méthode `Document::registerMediaCollections()` ajoute la collection `versions` (multiple files, ordered)
- [ ] Méthode `Document::activeVersion()` (accessor qui retourne le media `is_active=true`)
- [ ] Trait LogsActivity étendu sur upload/restore versions
- [ ] Job/listener purge des versions > 20 (soft-cap)
- [ ] Tests `DocumentVersionTest` (upload, list, restore, soft-cap, single-active invariant, permissions, audit)
- [ ] Page UI détail document — panneau "Versions" + bouton upload
- [ ] Composant `DocumentVersionsList` (accordéon / tab)
- [ ] Composant `UploadVersionModal` (drop-zone + comment)
- [ ] Composant `RestoreVersionConfirm` (modale)
- [ ] i18n fr/en/wo (`documents.versions.*`)
- [ ] Tests Vitest sur les composants versioning

## Critères d'acceptation

- [ ] AC1 — `POST /documents/{id}/versions` avec un fichier crée un media dans la collection `versions` et le marque `is_active=true`
- [ ] AC2 — la version précédemment active devient `is_active=false` dans la même transaction (jamais 2 actives simultanément)
- [ ] AC3 — `GET /documents/{id}?include=versions` retourne la liste ordonnée par `order_column` desc avec une seule version active
- [ ] AC4 — `POST /documents/{id}/versions/{versionId}/restore` rebascule l'active sans perdre l'historique
- [ ] AC5 — chaque upload/restore apparaît dans ActivityLog avec actor + version_number + comment
- [ ] AC6 — au-delà de 20 versions, la plus ancienne est purgée du disk mais traçable via ActivityLog
- [ ] AC7 — la page UI affiche la version active en évidence + l'historique listé sous elle
- [ ] AC8 — un user sans `documents.update` reçoit 403 sur upload-version et restore

## Hors périmètre

- Diff visuel inline (PDF compare) — hors V2.
- Signature électronique sur une version spécifique — déjà géré par TCK-076 / signature flow existant.
- Versionning automatique sur édition métadonnées (titre, type) — versionning fichier uniquement.
- Notifications aux signataires sur nouvelle version — éventuel ticket suivi.
- Branches / forks de versions — strictement linéaire ici.

## Notes d'implémentation

_(à remplir par implementing-specs)_
