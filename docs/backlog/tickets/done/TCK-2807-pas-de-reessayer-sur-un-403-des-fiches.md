---
id: TCK-2807
title: "Les fiches du bail et du document ne proposent plus « Réessayer » sur un 403 : elles disent le refus, comme QueryBoundary"
status: done
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

- [x] `LeaseDetail` : branche 403 sans « Réessayer ».
- [x] `DocumentDetailClient` : branches 403 et 404 sans « Réessayer », panne avec.
- [x] Tests vitest des deux fiches.

## Critères d'acceptation

- [x] AC1 — Fiche du bail, lecture à 403 (`ApiError` statut 403) : le message de refus est présent, et aucun bouton
  « Réessayer » n'est rendu. Le test cherche le bouton par son rôle et son nom.
- [x] AC2 — Fiche du bail, lecture à 500 puis en erreur réseau : « Réessayer » est présent, et un clic relance la
  lecture (compté sur le double réseau).
- [x] AC3 — Fiche du document : 403 rend le refus sans « Réessayer » et sans le mot « introuvable » ; 404 rend
  « introuvable » sans « Réessayer » ; 500 rend « Réessayer ».
- [x] AC4 — Vérifié par ablation, une à la fois : la branche 403 retirée de chaque fiche rend son AC1 ou AC3 rouge ; un
  « Réessayer » masqué sur toute erreur rend AC2 rouge.

Preuves :

- AC1 et AC2 : `LeaseDetail.refus.tck-2807.test.tsx`. La lecture est la vraie (`useLease` → `useApiQuery` → `apiRequest`) sur un `fetch` doublé. Le
  403 naît de la réponse, et la relance se compte en requêtes vers `/api/leases/5`, une puis deux, à 500 comme en
  erreur réseau (`TypeError`).
- AC3 : `DocumentDetailClient.refus.tck-2807.test.tsx`, même montage. Il couvre 403, 404 et 500 avec sa relance comptée.
- AC4, cinq ablations, une à la fois. Chaque fichier a été restauré, md5 vérifié :
  - 403 retiré du bail : AC1 rouge ;
  - 403 retiré du document : AC3 (403) rouge ;
  - « Réessayer » masqué partout, sur le bail : les deux AC2 rouges ;
  - « Réessayer » masqué partout, sur le document : AC3 (500) rouge ;
  - 404 retiré du document : AC3 (404) rouge.

## Hors périmètre

- Les onglets internes des fiches (`OngletsDuBail`, `OngletLocation`, `OngletDocuments`) et les sous-blocs qui ont leur
  propre `ErrorState`. À inventorier dans les notes s'ils rendent un 403, sans les corriger ici.
- La page du bien et la demande désignée (prémisses tombées, voir plus haut).
- Toute bascule d'espace automatique depuis la fiche refusée.

## Notes d'implémentation

- **Texte du refus.** Le refus utilise une clé fixe et neutre, calquée sur la fiche du bien (TCK-442,
  `dashboard.pages.propertyDetail.forbidden_message`) :
  - `lease.detail.forbidden` : « Votre profil actif ne permet pas d'ouvrir ce bail. » ;
  - `documents.detail.forbidden` : même phrase, pour « ce document ».

  Pourquoi pas les autres textes :
  - Les clés « relève d'une autre agence » de la réservation et de la visite ne valent pas ici. Un 403 sur un bail ou
    un document ne vient pas toujours d'une autre agence : locataire qui n'est pas partie au bail, bailleur bloqué.
  - La prose de l'API (`messageErreur`), que `QueryBoundary` affiche, ne dirait rien de l'objet.
- **Panne du document.** Le message est `messageErreur(erreur, common.status.error)`, comme dans `QueryBoundary`, avec
  « Réessayer ». Un document absent sans erreur (`data` vide) se dit « introuvable », sans « Réessayer ».
- **Écart laissé.** Le bail dit encore « Bail introuvable. » (`lease.detail.error`) sur une panne et sur un 404, avec
  « Réessayer ». C'est hors du delta : seul le 403 était demandé.
- **Inventaire des blocs d'erreur maison** (hors périmètre, à ne pas corriger ici). Il vient d'un grep heuristique :
  fichiers avec `onRetry=` et sans `status === 403`, `forbidden` ni `refuse`. Il trouve 77 fichiers, surtout des
  listes. Les vues d'un objet unique, ou leurs sous-blocs, qui proposent « Réessayer » sans regarder le statut :
  - `leases/fiche/OngletsDuBail.tsx` ;
  - `leases/fiche/FeuilleDesGarants.tsx` ;
  - `leases/LeaseSchedule.tsx` ;
  - `property-dashboard/fiche/OngletLocation.tsx` ;
  - `property-dashboard/fiche/OngletDocuments.tsx` ;
  - `documents/fiche/VersionsDuDocument.tsx` ;
  - `customer-dashboard/fiche/FilDuClient.tsx` ;
  - `admin/PropertyModerationDetail.tsx` ;
  - `admin/super/user-detail.tsx` ;
  - `boost/admin/AdminCreditWalletDetail.tsx`.


  Les trois onglets nommés par le ticket, lus à leurs lignes `onRetry=`. Tous proposent « Réessayer » sur toute
  erreur, sans lire le statut ; aucun 403 n'y a été provoqué ni mesuré :
  - `OngletsDuBail` : `ErrorState` avec reprise sur `documents.enEchec` (onglet Documents, l. 63) et sur
    `requete.isError` (onglet Historique, l. 158) ;
  - `OngletLocation` : même chose sur `location.echeances.isError` (l. 246) et `location.bail.isError` (l. 317) ;
  - `OngletDocuments` : même chose sur `documents.enEchec` (l. 86).

  `console/DataState.tsx` est un enrobage partagé, utilisé par 29 fichiers. Il reçoit l'erreur déjà mise en texte
  (`error: ReactNode`) et `onRetry` : il ne peut donc pas lire le statut. C'est chaque appelant qui décide. Une suite
  qui voudrait le traiter d'un coup devrait lui passer l'erreur brute, comme `QueryBoundary`.
