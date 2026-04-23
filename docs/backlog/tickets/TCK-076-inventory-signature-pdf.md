---
id: TCK-076
title: "Inventaires — Signature deux parties + export PDF"
status: todo
phase: P2
family: applicatif
estimate: M
created: 2026-04-23
updated: 2026-04-23
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

_(Rempli à l'implémentation)_
