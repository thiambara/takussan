---
id: TCK-182
title: États des lieux — accès customer, libellés humains et téléchargement PDF
status: todo
phase: P2
family: front
estimate: S
created: 2026-05-05
updated: 2026-05-05
depends_on: [TCK-173]
blocks: []
spec_refs:
  features:
    - docs/features.md#19-état-des-lieux--inventaires
  models:
    - docs/models-spec.md#24-inventory
tags: [front, inventories]
---

## Objectif utilisateur

Le locataire doit retrouver ses états des lieux dans son espace, identifier de quel bien il s'agit (et pas d'un id technique), et pouvoir télécharger une copie PDF signée.

## Contrat de données

Smoke test 2026-05-05 (TC-LOC-40 → 42) :

- `/app/inventories` est **accessible** au customer (200) et liste correctement ses 2 EDL (filtres `Type` et `Statut` en FR).
- Mais aucun lien dans la sidebar customer (à ajouter via TCK-173).
- Les libellés des cards listing sont `État des lieux #112 · Bail #103` (ids bruts) et `Réalisé le 21 Jun 2025` (date EN).
- Sur la fiche `/app/inventories/[id]`, l'entête affiche `Bail #103 · Bien #293` + dates EN ; aucun bouton `Télécharger PDF` malgré la spec TC-LOC-41 Q3.
- Workflow signature/contestation déjà implémenté côté UI (`Contester`, signatures locataire/bailleur).

API à étendre / créer :

- GET `/api/inventories/{id}/pdf` : génération PDF d'un EDL signé.
- GET `/api/inventories?customer_id=...` : la jointure doit ramener `lease.property.title` et `lease.property.address.short_label` pour rendre les listing labels.

## Contraintes strictes (métier)

- Un customer ne voit que ses EDL (via `lease.tenant_id = auth.id`).
- Le PDF n'est généré que pour les EDL `Signé` (deux parties signées).
- La contestation reste réservée à l'EDL `Signé` ou `En attente de signature` selon le workflow déjà défini.

## Delta à produire

- [ ] Backend : endpoint `inventories.pdf.show` qui rend un PDF formaté (entête agence/bailleur, locataire, période, photos pièce par pièce, états, signatures, mention légale).
- [ ] Backend : ressource d'API listing/show qui inclut `property.title`, `property.address.short_label`, `lease.reference_number`.
- [ ] Frontend listing `/app/inventories` : remplacer `État des lieux #112 · Bail #103` par `<titre du bien> · Bail <reference_number>`.
- [ ] Frontend fiche `/app/inventories/[id]` : afficher le titre du bien (avec lien vers la fiche bien) + référence du bail (avec lien vers `/app/leases/[id]`) + bouton `Télécharger le PDF`.
- [ ] Tests : feature backend (génération PDF + scope par customer) + e2e Playwright (un customer voit ses EDL avec libellés humains et télécharge le PDF d'un EDL signé).

## Critères d'acceptation

- [ ] La liste `/app/inventories` affiche le titre des biens, pas des ids.
- [ ] La fiche EDL affiche le titre du bien, la référence du bail, et un bouton `Télécharger le PDF` pour les EDL signés.
- [ ] Le PDF téléchargé contient toutes les sections attendues.
- [ ] Un customer ne voit jamais l'EDL d'un autre tenant.

## Hors périmètre

- Création / édition d'un EDL côté agent (déjà existant).
- Lien sidebar (couvert par TCK-173).
- i18n complète des dates dans la liste (couvert par les tickets format dates).

## Notes d'implémentation

_(à remplir par implementing-specs)_
