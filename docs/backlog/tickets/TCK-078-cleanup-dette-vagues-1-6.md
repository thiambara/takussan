---
id: TCK-078
title: "Cleanup & dette post-Vagues 1-2-3-4-5-6"
status: todo
phase: P2
family: technique
estimate: M
created: 2026-04-24
updated: 2026-04-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#19-état-des-lieux--inventaires
    - docs/features.md#110-documents--contrats
    - docs/features.md#111-avis--réputation
    - docs/features.md#21-authentification--comptes
    - docs/features.md#23-notifications
    - docs/features.md#27-médias--fichiers
    - docs/features.md#28-internationalisation--préférences
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#10-tag
    - docs/models-spec.md#11-review
    - docs/models-spec.md#17-propertyvisit-
    - docs/models-spec.md#22-document-
    - docs/models-spec.md#24-inventory-
tags: [cleanup, tech-debt, spec-divergence, follow-ups]
---

## Objectif utilisateur

Tous acteurs (Locataire, Agent, Bailleur, Admin) : clore la dette accumulée pendant les Vagues 1 → 6 pour que endpoints, schémas, libellés et modules frontend convergent avec les specs — sans dégrader les features déjà livrées.

## Contrat de données

Ce ticket consolide les follow-ups flaggés dans les notes des tickets livrés en V4/V5/V6 et dans l'historique INDEX (2026-04-23 V4, 2026-04-23 V5, 2026-04-24 V6). Les Vagues 1-2-3 sont déjà couvertes par TCK-061 (`review`) — traçabilité rappelée en §G uniquement.

Corrections attendues :

- **Backend** — endpoints / filtres manquants (`DELETE /reviews/{id}/reply`, `author_id=me`, `property_ids[]`, `agency_id` sur `/api/calendar`, `GET /api/documents/{id}/share-links`), alignements migration (`Tag.is_active`, drop des colonnes legacy `tenant_signed_at` / `owner_signed_at`), bugs pré-existants (`IntegrationController` double-encode, `TagController` rôle legacy, 3 tests rouges).
- **Frontend** — retrait de la dépendance externe QR (`api.qrserver.com`), helper `formatCurrency` factorisé, virtualisation calendrier > 200 events, picker entité `DocumentUploadDialog`, arbitrage `@dnd-kit` vs HTML5 natif sur `MediaManager`.
- **Spec ↔ impl** — `PropertyVisit.status` (`requested` spec vs `scheduled` impl), signature Inventory (SVG spec vs PNG impl), `Tag.is_active` (spec vs soft-delete impl). Mise à jour via PR spec séparée + `/sync-specs`.

Les anchors normatifs sont listés dans `spec_refs`.

## Contraintes strictes (métier)

- **Aucune régression fonctionnelle** sur les features V1 → V6 : 850+ tests backend et 464+ tests Vitest doivent rester verts (aux nouveaux tests ajoutés près).
- **Migrations additives d'abord** : le drop des colonnes legacy `tenant_signed_at` / `owner_signed_at` se fait dans une migration séparée *après* confirmation par `git grep` qu'aucun code ne les cible ; procéder en deux PRs si un doute subsiste.
- **Driver SMS stub (TCK-069)** : reste `log` tant qu'aucune décision produit n'arbitre le provider. Documenter l'alternative, ne pas swap silencieusement.
- **Pint clean obligatoire** avant chaque commit backend (`./vendor/bin/pint`).
- **Spec en lecture seule** — toute divergence qui demande modif de `features.md` ou `models-spec.md` ouvre une PR spec dédiée avant le cleanup code.

## Delta à produire

### A. Follow-ups backend — Vague 4

- [ ] `app/Http/Controllers/Api/IntegrationController.php` — credentials double-encodées à l'écriture : auditer le cast `encrypted`, confirmer un seul encrypt par chemin d'écriture, corriger + test `IntegrationSettingsTest::test_credentials_are_stored_encrypted_once`.
- [ ] `app/Http/Controllers/Api/TagController.php` — autorisation vérifie le rôle legacy `admin` au lieu du rôle canonique `agency_admin` (cf. V1 Spatie Permission). Remplacer la chaîne + test de non-régression (user avec `admin` seul → 403 ou mapping explicite tracé).
- [ ] `app/Models/Tag.php` + migration `add_is_active_to_tags_table` — actuellement soft-delete utilisé en remplacement d'un `is_active` absent. Trancher :
  - Variante A : ajouter colonne `is_active bool default true` + scope `active()` + fillable + test.
  - Variante B : entériner le soft-delete comme implé du toggle actif/inactif → PR spec `#10-tag`.
- [ ] `app/Http/Controllers/Api/DocumentController.php` — endpoint `GET /api/documents/{document}/share-links` manquant (lister les liens partagés actifs). Ajouter route + controller + `DocumentPolicy::viewShareLinks` + test `DocumentShareLinksIndexTest`.
- [ ] `app/Http/Controllers/Api/Auth/TwoFactorController.php` — QR code généré via `api.qrserver.com` (dép. externe). Remplacer par lib locale (`bacon/bacon-qr-code` — déjà transitive via `pragmarx/google2fa-qrcode`) + test `TwoFactorQrReturnsLocalSvg`.
- [ ] Tests pré-existants à réparer (non introduits par V4, mis en lumière) :
  - `tests/Feature/NotificationEmailTest.php` — isoler l'échec + corriger factory ou stub mail.
  - `tests/Feature/ExportControllerTest::test_pdf_leases_export_*` — vérifier driver dompdf dispo CI (cf. fix CI PR #49) + seed minimal.
  - `tests/Feature/LeaseExportTest.php` — idem.

### B. Follow-ups frontend — Vague 4

- [ ] `takussan-web/src/components/documents/DocumentUploadDialog.tsx` — picker d'entité (property / booking / lease) absent. Ajouter combobox avec recherche debounce (`include=property,booking,lease` + `filter[search]=` + `fields[...]=id,title`) quand la dialog est ouverte depuis la bibliothèque globale.
- [ ] `takussan-web/src/components/media/MediaManager.tsx` — reorder drag-drop actuellement HTML5 natif alors que spec TCK-071 mentionnait `@dnd-kit`. Trancher :
  - Si spec = source : installer `@dnd-kit/core` + `@dnd-kit/sortable` et remplacer l'implé native.
  - Si impl = source : PR spec TCK-071 pour entériner HTML5 natif (zero-dep, plus léger).

### C. Follow-ups backend — Vague 5

- [ ] `app/Http/Controllers/Api/ReviewController.php` — route `DELETE /api/reviews/{review}/reply` manquante (spec §1.11). Ajouter route + `ReviewPolicy::deleteReply` + test `ReviewReplyDeleteTest`.
- [ ] `app/Http/Controllers/Api/ReviewController.php` — filtre `filter[author_id]=me` absent (page `/app/profile/reviews`). `AllowedFilter::callback('author_id', fn ($q, $v) => $v === 'me' ? $q->where('author_id', auth()->id()) : $q->where('author_id', $v))` + test d'intégration.
- [ ] `app/Models/PropertyVisit.php` + spec `#17-propertyvisit-` : l'enum DB utilise `scheduled`, la spec liste `requested`. Décision V5 = `scheduled` côté DB → ouvrir PR spec pour aligner, puis `/sync-specs`.

### D. Follow-ups frontend — Vague 5

- [ ] `takussan-web/src/lib/format/currency.ts` — créer `formatCurrency(amount, currency='XOF', locale?)` aligné sur spec §2.8. Actuellement formatage inline dans 4 callsites minimum (pages `/app/payments`, templates Blade PDF TCK-077 receipts/invoices/lease). Factoriser + remplacer.

### E. Follow-ups backend — Vague 6

- [ ] `app/Http/Controllers/Api/CalendarController.php` — param multi-select `property_ids[]` absent (seul `property_id` simple est géré). Ajouter `AllowedFilter::exact('property_ids')` arrayable + test `CalendarFilterMultipleProperties`.
- [ ] `app/Http/Controllers/Api/CalendarController.php` — param `agency_id` non implémenté (admin multi-agence). Ajouter filtre + check `User::hasRole('admin')` + test d'autorisation refus pour non-admin.
- [ ] `database/migrations/*_drop_legacy_signature_columns_from_inventories.php` (nouvelle migration) — après confirmation `git grep tenant_signed_at && git grep owner_signed_at` clean, drop les colonnes. Canoniques restent `signed_at`, `signature_data`, `*_signature_hash`.
- [ ] `app/Http/Controllers/Api/InventoryController.php` + `app/Services/Inventory/InventorySignatureService.php` — identification du signataire actuellement inline. Factoriser `resolveSignerRole($inventory, auth()->user())` + `include=tenant.user,property.user` à l'endpoint show.
- [ ] `app/Services/Inventory/InventorySignatureService.php` — archivage long terme via `DocumentPdfService::store()` (actuellement seul `stream()` est branché). Hook snapshot persistant après chaque signature complète (tenant + owner OK) + rétention configurable dans `config/inventories.php`.

### F. Follow-ups frontend — Vague 6

- [ ] `takussan-web/src/components/calendar/{Month,List}View.tsx` — virtualisation au-delà de 200 événements (note TCK-072). Windowing homegrown cohérent avec le parti pris zero-dep du module, ou `react-virtuoso` si le coût est acceptable.
- [ ] `takussan-api/resources/views/pdf/inventories/report.blade.php` + `SignaturePad` frontend — signature stockée en PNG base64, spec `#24-inventory-` attend SVG. Deux options :
  - Convertir le canvas en SVG path (refonte `SignaturePad.tsx`).
  - Entériner PNG + PR spec `#24-inventory-` pour documenter `signature_data: text (base64 PNG data-URL)`.

### G. Traçabilité Vagues 1-2-3

- [ ] **Pas d'action code** — les follow-ups V1/V2 (tests frontend V1 reportés, pages Next.js TCK-030/031 V2) ont tous été absorbés par V3. La dette V3 spécifique est couverte par **[TCK-061](TCK-061-cleanup-dette-vague3.md)** (statut `review`). Confirmer AC TCK-061 avec le responsable produit puis basculer `review → done` ; **ce ticket ne remplace pas TCK-061 et ne refait pas son travail**.

## Critères d'acceptation

- [ ] AC1 — Les 5 endpoints / filtres backend manquants (A, C, E) sont implémentés et testés ; `php artisan test` reste vert (850+ → 850+N tests).
- [ ] AC2 — Les 3 tests pré-existants rouges (`NotificationEmailTest`, `ExportControllerTest PDF leases`, `LeaseExportTest`) repassent verts en CI.
- [ ] AC3 — `IntegrationController` ne double-encode plus les credentials ; test de régression en place.
- [ ] AC4 — `TagController` vérifie `agency_admin` (ou mapping explicite du legacy `admin` tracé dans les notes).
- [ ] AC5 — `api.qrserver.com` n'est plus appelé ; QR 2FA généré localement (SVG ou PNG base64).
- [ ] AC6 — `formatCurrency` factorisé + consommé par ≥ 4 callsites (`/app/payments`, PDF receipts, PDF invoices, PDF lease contract).
- [ ] AC7 — `DocumentUploadDialog` expose un picker d'entité fonctionnel (test Vitest d'intégration).
- [ ] AC8 — `/api/calendar` accepte `property_ids[]` et `agency_id` (admin-only) avec tests.
- [ ] AC9 — Colonnes legacy `tenant_signed_at` / `owner_signed_at` droppées après confirmation `git grep` clean.
- [ ] AC10 — Specs `#17-propertyvisit-` et `#24-inventory-` alignées sur l'implé via PRs spec séparées ; `/sync-specs` sans ⚠️ résiduel sur ces deux sections.
- [ ] AC11 — `Tag.is_active` tranché (variante A ou B documentée dans les notes + test).
- [ ] AC12 — `npm run build` + `npm run test -- --run` + `./vendor/bin/pint` verts sur la branche finale.

## Hors périmètre

- **Travaux V1-V3 code** : couverts par TCK-061 (en `review`). Ce ticket n'y touche pas.
- **Passerelle paiement Wave / Orange** : P2 complexe, ticket dédié à venir.
- **Suppression RGPD** / OAuth Facebook / OAuth Apple / multi-devises / conversations groupe / comparateur biens / pipeline prospects : P2 reportés (cf. historique 2026-04-23).
- **Révision loyer** : à intégrer en fermant TCK-027.
- **Swap driver SMS prod** (TCK-069) : décision produit requise — documenter les options uniquement.
- **Refactor global des services Inventory / Booking** : si des simplifications pointent, ouvrir un ticket dédié plutôt que d'étendre celui-ci.

## Notes d'implémentation

_(à remplir par implementing-specs)_
