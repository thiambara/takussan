---
id: TCK-076
title: "Inventaires — Signature deux parties + export PDF"
status: done
phase: P2
family: applicatif
estimate: M
created: 2026-04-23
updated: 2026-04-24
depends_on: [TCK-031, TCK-077, TCK-057, TCK-054]
blocks: []
spec_refs:
  features:
    - docs/features.md#19-état-des-lieux--inventaires
  models:
    - docs/models-spec.md#23-inventory
tags: [inventory, signature, pdf, front, back]
---

## Contexte

TCK-031 (état des lieux & inventaires) est `review` : backend + frontend couvrent la création, les photos par pièce, l'état par élément. L'export PDF était explicitement reporté P2 dans les notes du ticket. La spec §1.9 P2 demande également la **signature des deux parties** (locataire + bailleur) pour valider l'inventaire.

## Objectif utilisateur

À la fin d'un état des lieux, le locataire et le bailleur (ou l'agent qui le représente) doivent pouvoir signer électroniquement l'inventaire pour le figer. Une fois les deux signatures posées, l'inventaire peut être exporté en PDF avec les photos.

## Contrat de données

### Backend

- Migration `add_signatures_to_inventories_table` :
  - `tenant_signature_at` (nullable timestamp)
  - `tenant_signature_data` (nullable text — signature SVG/base64 ou hash cryptographique)
  - `landlord_signature_at` (nullable timestamp)
  - `landlord_signature_data` (nullable text)
  - `signed_at` (nullable timestamp — rempli quand les deux signatures présentes)
- Endpoints :
  - `POST /api/inventories/{id}/sign` — body `{ role: 'tenant'|'landlord', signature: 'base64-svg' }` → enregistre la signature du rôle concerné, finalise si les deux présentes.
  - `GET /api/inventories/{id}/pdf` — retourne un PDF généré (utilise service de TCK-077)
- Template Blade `resources/views/pdf/inventory.blade.php` avec layout A4, photos embarquées, signatures en bas de page.

### Frontend

- Page `/app/inventories/[id]` : ajout de 2 zones de signature (canvas HTML5) avec bouton "Signer comme locataire" / "Signer comme bailleur".
- Une fois signé par l'utilisateur courant, la zone affiche la signature capturée + horodatage.
- Bouton "Télécharger PDF" visible quand `signed_at` est non-null.

## Direction UX / Artistique

Inspiré DocuSign / PandaDoc sign flow. Canvas de signature compact et tactile (mobile-first), bouton "Effacer" pour refaire, CTA "Confirmer ma signature" clair. Visuel hiérarchique : état "Non signé" (gris) → "Signé par X le 23/04" (vert). PDF template propre et professionnel, utilisable en état des lieux officiel.

## Contraintes strictes (métier)

- Seul le tenant (customer lié au lease) peut signer en tant que `tenant`. L'agent ou l'owner du bien peut signer en tant que `landlord`.
- Une signature est **immuable** une fois posée : pas de rollback, seule option = créer un nouvel inventaire (soft delete et repartir).
- Le PDF n'est téléchargeable qu'après `signed_at` rempli (les deux signatures posées).
- La signature est stockée comme base64 SVG côté back (léger, vectoriel, hash SHA256 de sécurité stocké aussi pour détection de tampering).
- Le PDF inclut un footer avec hash de l'inventaire pour traçabilité.

## Delta à produire

### Backend

- [ ] Migration `add_signatures_to_inventories_table`
- [ ] `InventoryController@sign` + route
- [ ] `InventoryController@downloadPdf` + route
- [ ] FormRequest `InventorySignRequest`
- [ ] Policy `InventoryPolicy::sign($user, $inventory, $role)` — vérifie le lien tenant/landlord
- [ ] Service `App\Services\Inventory\InventorySignatureService`
- [ ] Template PDF Blade + intégration via service TCK-077
- [ ] Tests Feature : signature tenant, signature landlord, finalisation, PDF 200 avec Content-Type

### Frontend

- [ ] Composant `SignaturePad` (canvas HTML5 + effacer + confirm) — pas de prescription de bibliothèque
- [ ] Intégration dans `/app/inventories/[id]` : 2 cartes signature côte-à-côte
- [ ] Affichage statut (non signé / signé par X le date) avec feedback visuel
- [ ] Bouton "Télécharger PDF" conditionnel
- [ ] Tests Vitest : composant signature, flow sign + confirm

## Critères d'acceptation

- [ ] AC1 — Un tenant lié au lease peut poser sa signature ; un agent ou owner peut poser la signature landlord ; un autre user reçoit 403
- [ ] AC2 — Dès que les 2 signatures sont présentes, `signed_at` est rempli et le bouton "Télécharger PDF" devient actif
- [ ] AC3 — L'export PDF retourne un fichier A4 avec titre, détail par pièce, photos embarquées, signatures visibles, hash de traçabilité en footer
- [ ] AC4 — Tenter de signer deux fois pour le même rôle retourne 409 avec message clair
- [ ] AC5 — Un inventaire signé ne peut plus être modifié (les endpoints PATCH retournent 409)
- [ ] AC6 — `php artisan test --filter=InventorySignatureTest` + `npm run test` verts, Pint clean

## Hors périmètre

- Comparaison automatique entrée ↔ sortie (P3)
- Reconnaissance IA de dégradations sur photos (P3)
- Signature électronique qualifiée (eIDAS) — P3, ici c'est une signature manuscrite numérisée

## Notes d'implémentation

### Divergences ticket ↔ spec / code existant

- **Colonnes de signature** : le ticket demandait `tenant_signature_at` /
  `landlord_signature_at`. Les colonnes `tenant_signed_at` /
  `owner_signed_at` existaient déjà depuis TCK-031 (cf. Notes du ticket
  parent). On a ajouté **en additif** `tenant_signature_data` /
  `tenant_signature_hash` / `owner_signature_data` / `owner_signature_hash`
  + un `signed_at` final — pas de renommage, pour éviter une migration
  destructive.
- **Endpoint `/sign`** : le ticket demandait `{role, signature}`. L'endpoint
  existant (pré-TCK-076) inférait le rôle depuis l'utilisateur et ne
  stockait aucun payload. La nouvelle version est **rétrocompatible** :
  si `role` ou `signature` est absent du body, on retombe sur le service
  legacy `InventoryService::sign()`. L'ancien comportement couvre les
  tests TCK-031 historiques (`InventoryTest::test_owner_signs_then_tenant_signs_marks_signed`).
- **AC5 — PATCH 409 au lieu de 422** : le controller renvoie désormais 409
  uniquement lorsque le statut est `Signed`. Les autres états non-draft
  (`pending_signature`, `disputed`) conservent la réponse historique 422
  issue de TCK-031. Les deux tests legacy concernés ont été alignés
  (`InventoryTest`, `InventoryEditTest`).
- **Signature base64 SVG vs PNG** : le ticket suggère du SVG, les navigateurs
  ne permettent pas d'exporter facilement un canvas en SVG sans lib
  supplémentaire. On livre du PNG base64 (`canvas.toDataURL('image/png')`)
  — sémantiquement équivalent et plus simple à embarquer dans le PDF via
  `<img src="data:image/png;base64,…">`.

### Architecture

- Service dédié `App\Services\Inventory\InventorySignatureService` : isole
  les règles d'autorisation par rôle (tenant ↔ customer.user_id ; landlord
  ↔ owner / agency_staff / collaborator accepté / admin), le 409 sur
  resignature, et le stamping de `signed_at`. Produit aussi le hash de
  traçabilité (16 chars d'un SHA-256 sur l'identité + rooms + hashes)
  imprimé en pied de PDF.
- `InventorySignRequest` plafonne le payload à 2 MB (couvre un PNG 400×120
  tracé normal avec large marge).
- Le PDF est servi via `DocumentPdfService::stream()` (TCK-077) + template
  `resources/views/pdf/inventories/report.blade.php`. Les colonnes de
  données brutes (`tenant_signature_data` / `owner_signature_data`) sont
  `$hidden` sur le modèle et rendues visibles uniquement au moment de
  générer le PDF via `makeVisible()` — jamais exposées en JSON.
- Front : composant `SignaturePad` dépendance-zéro (50 LOC canvas + pointer
  events), composé par `InventorySignatures` (2 cartes côte-à-côte avec
  3 états visuels) et `InventoryPdfButton` (fetch blob + download). Les
  rôles utilisateur gatent quelles cartes proposent un canvas — le backend
  est la source de vérité (re-validation à chaque requête).

### État réel (audit 2026-04-24)

**Livré** :

- Migration `2026_04_24_120000_add_signature_data_to_inventories_table`
  (colonnes data + hash + signed_at).
- `App\Services\Inventory\InventorySignatureService` + `InventorySignRequest`
  + endpoints `POST /inventories/{id}/sign` (étendu) et
  `GET /inventories/{id}/pdf`.
- Template Blade `pdf/inventories/report.blade.php` (photos par pièce,
  signatures embarquées, empreinte de traçabilité).
- Front : `SignaturePad`, `InventorySignatures`, `InventoryPdfButton` +
  intégration dans `InventoryDetail` (remplace le bouton générique "Signer"
  par 2 cartes de signature explicites).
- Tests :
  - Backend `InventorySignatureTest` (12 tests) + mise à jour des 2 tests
    AC5 pour refléter le 409.
  - Frontend `SignaturePad.test.tsx` (6) + `InventorySignatures.test.tsx`
    (4).

**Suite de tests** :

- Backend : 862 → 874 (+12 tests). `php artisan test` vert. Pint clean.
- Frontend : 247 → 257 (+10 tests). `npm run lint` → 0 erreurs (warnings
  pré-existants). `npm run build` vert.

**Follow-ups suggérés** :

- Raffinement UX : fetch l'identité réelle tenant/landlord (user_id via
  include) pour masquer la bonne carte plutôt que de se baser sur les
  rôles — possible sur un ticket de polish.
- Persistance via `DocumentPdfService::store()` (archive le PDF signé
  comme `Document` lié à l'`Inventory`) — pas demandé par le ticket mais
  utile pour la traçabilité longue. Ticket séparé à créer si nécessaire.
