---
id: TCK-2109
title: "Les gestes d'un état des lieux jugent le statut sur la ligne verrouillée"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
  models:
    - "docs/models-spec.md#24-inventory-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-211--gestes-décriture-qui-jugent-le-statut-sur-le-modèle-lié-hors-verrou"
tags: [api, inventory, concurrence, pistes]
---

## Objectif

`InventoryService::update`, `submit`, `dispute`, l'ajout et le retrait d'une photo de pièce relisent
l'état des lieux sous `lockForUpdate` dans une transaction et y jugent leur garde, comme
`InventorySignatureService::sign` : un état signé entre-temps ne change plus de contenu.

## Contexte

Réf : **P211.05** du fichier de pistes, `retenu · autonome` (A1).

- Ces gestes jugeaient `draft` (ou `pending_signature` / `signed` pour `dispute`) sur le modèle lié,
  puis écrivaient sans verrou. Une modification partie d'un brouillon resté en mémoire remplaçait
  les pièces d'un état des lieux que le locataire venait de signer.

## Hypothèses (mode sans humain)

- L'ajout et le retrait de photo passent du contrôleur à `InventoryService` (`addRoomPhotos`,
  `removeRoomPhoto`) pour porter le verrou ; le contrôleur garde sa garde d'avant toute écriture.
- Sur la ligne relue, `update` rend la même garde que le contrôleur : 409 `inventory.signed_locked`
  pour un état signé, 422 `inventory.not_draft` sinon (TCK-076 AC5).

## Delta à produire

- [x] `update`, `submit`, `dispute` : garde jugée et écriture faite sur la ligne relue sous verrou.
- [x] `addRoomPhotos`, `removeRoomPhoto` dans le service, sous le même verrou.

## Critères d'acceptation

- [x] AC1 — Brouillon resté en mémoire, ligne passée à `pending_signature` et signée par le
  locataire : `update` rend 422 `inventory.not_draft`, pièces et signature intactes.
- [x] AC2 — Même cas avec une ligne `signed` : 409 `inventory.signed_locked`.
- [x] AC3 — `submit` sur un brouillon resté en mémoire d'un état signé : 422
  `inventory.not_draft_submit`, statut `signed`.
- [x] AC4 — Seconde contestation sur un modèle périmé : 422 `inventory.cannot_dispute`, la note de
  la première conservée.
- [x] AC5 — Ajout et retrait de photo sur un brouillon périmé : 422 `inventory.not_draft`, photos
  inchangées.
- [x] AC6 — Témoin : un brouillon se modifie et reçoit ses photos.

## Hors périmètre

- Les autres gestes de l'angle 211 (tickets à part).

## Notes d'implémentation

- Test : `takussan-api/tests/Feature/Api/InventoryGestesSousVerrouTest.php`. Les deux gestes photo
  ont d'abord été déplacés dans le service à comportement égal, pour que le rouge porte sur la garde
  et non sur une méthode absente : 6 rouges sur 7 (« Le geste aurait dû être refusé »).
- Ablation : `InventoryService.php` ramené à l'état déplacé sans verrou → 6 rouges ; correctif remis
  → 7 verts.
- Piège : `rooms` est en `jsonb`, qui réordonne les clés ; la comparaison des pièces se fait par
  `assertEquals`.
