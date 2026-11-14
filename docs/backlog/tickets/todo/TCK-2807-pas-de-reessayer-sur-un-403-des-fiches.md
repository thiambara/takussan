---
id: TCK-2807
title: "Les fiches du bail et du document ne proposent plus « Réessayer » sur un 403 : elles disent le refus, comme QueryBoundary"
status: todo
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#23-notifications"
tags: [front, erreurs, 403, baux, documents, suite-de-tck-2751, audit-ux, app]
---

## Objectif utilisateur

Celui qui ouvre un bail ou un document qu'il ne peut pas lire, par exemple depuis un avis d'un autre espace, apprend
qu'il n'y a pas accès. On ne lui propose plus « Réessayer », un geste qui ne changera rien.

## Contrat de données

**Origine.** Écart consigné par TCK-2751 (« Reste hors périmètre, relevé ») : `QueryBoundary` ne propose plus
« Réessayer » sur un 403, mais les vues de détail qui ont leur propre bloc d'erreur le font encore. Le relevé
nommait « bail, bien, demande ».

**Prémisse re-mesurée sur HEAD (`ebc494478`) le 2026-11-14 : elle ne tient que pour le bail, et vaut aussi pour le
document.**

- **Bail, confirmé.** `src/components/leases/LeaseDetail.tsx` (l. 149-156) : `if (isError || !lease)` rend
  `ErrorState` avec `onRetry`, quel que soit le statut, donc aussi sur 403. `/app/leases/{id}` est la cible `lease`
  des avis.
- **Document, confirmé (hors du relevé d'origine).** `src/components/documents/DocumentDetailClient.tsx` (l. 73-78) :
  toute erreur rend « introuvable » (`t('not_found')`) avec « Réessayer ». Un 403 se dit donc « introuvable »,
  puis propose de réessayer.
- **Bien, tombé.** `src/app/(dashboard)/app/properties/[id]/page.tsx` traite déjà 401 et 403 côté serveur et rend
  `PropertyDetailUnavailable` (TCK-442), sans « Réessayer ».
- **Demande, tombé.** `ContactLeadsInbox` (`?lead=`) rend `null` pour la demande désignée en erreur, sans bloc ni
  « Réessayer ».
- Les autres cibles d'objet le font déjà : `BookingDetail` et `VisitDetail` ont leur branche `forbidden`, et
  `MaintenanceDetail`, `FicheDIntervention` et `InventoryDetail` passent par `QueryBoundary`.

**Référence :** `QueryBoundary` (`src/components/shared/QueryBoundary.tsx`, TCK-2751), et les branches
`forbidden` de `BookingDetail` et `VisitDetail`.

**Endpoints consommés (existants) :** `GET /api/leases/{id}`, et la lecture d'un document de `DocumentDetailClient`.

## Direction UX / Artistique

Le refus se dit comme sur les fiches sœurs (réservation, visite, bien) : une phrase calme qui dit que l'accès n'est pas
possible depuis cet espace, sans bouton « Réessayer ». Elle propose au plus un retour vers la liste. Une vraie panne
(5xx, réseau) garde son « Réessayer ». Un 404 du document se dit « introuvable », sans « Réessayer » non plus.

## Contraintes strictes (métier)

- **Un 403 ne propose jamais « Réessayer ».** Une erreur 5xx ou réseau le propose toujours.
- Le refus ne dit rien de l'objet (ni titre, ni locataire, ni bien), comme les branches `forbidden` existantes.
- Le document distingue 403, 404 et panne. Il ne dit plus « introuvable » pour un refus.
- Les textes passent par next-intl (fr, en ; le wo porte le français tel quel). Les clés existantes des fiches
  sœurs sont réutilisées si elles conviennent.

## Delta à produire

- [ ] `LeaseDetail` : branche 403 sans « Réessayer ».
- [ ] `DocumentDetailClient` : branches 403 et 404 sans « Réessayer », panne avec.
- [ ] Tests vitest des deux fiches.

## Critères d'acceptation

- [ ] AC1 — Fiche du bail, lecture à 403 (`ApiError` statut 403) : le message de refus est présent, et aucun bouton
  « Réessayer » n'est rendu. Le test cherche le bouton par son rôle et son nom.
- [ ] AC2 — Fiche du bail, lecture à 500 puis en erreur réseau : « Réessayer » est présent, et un clic relance la
  lecture (compté sur le double réseau).
- [ ] AC3 — Fiche du document : 403 rend le refus sans « Réessayer » et sans le mot « introuvable » ; 404 rend
  « introuvable » sans « Réessayer » ; 500 rend « Réessayer ».
- [ ] AC4 — Vérifié par ablation, une à la fois : la branche 403 retirée de chaque fiche rend son AC1 ou AC3 rouge ; un
  « Réessayer » masqué sur toute erreur rend AC2 rouge.

## Hors périmètre

- Les onglets internes des fiches (`OngletsDuBail`, `OngletLocation`, `OngletDocuments`) et les sous-blocs qui ont leur
  propre `ErrorState`. À inventorier dans les notes s'ils rendent un 403, sans les corriger ici.
- La page du bien et la demande désignée (prémisses tombées, voir plus haut).
- Toute bascule d'espace automatique depuis la fiche refusée.

## Notes d'implémentation

_(à remplir par implementing-specs)_
