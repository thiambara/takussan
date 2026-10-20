---
id: TCK-1024
title: "Les écrans KYC, documents et maintenance rafraîchissent leurs URL signées avant qu'elles expirent"
status: todo
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-63--url-signées-et-liens-de-téléchargement-rangés-ou-envoyés--durée-lecteurs-liens-morts"
tags: [web, kyc, documents, maintenance, medias, pistes]
---

## Contexte

Réf : **P63.03** du fichier de pistes, `validé (délégué)` (V6 accordé : l'option retenue est
réversible et sans ADR). L'API émet les pièces KYC en URL signées de 15 min
(`KycDossierResource`) et les médias privés pour 30 min
(`PrivateMediaAccess::SIGNED_ROUTE_TTL_MINUTES`). Le client TanStack Query par défaut tient une
donnée fraîche 5 min, puis ne refetche qu'au montage, au retour du focus ou à la reconnexion
(`takussan-web/src/lib/query-client.ts`) : un onglet resté au premier plan garde des liens expirés.
Re-mesuré le 2026-10-20 sur `pre-dev` 2bc0bcb06 par le test de garde ci-dessous : aucune des six
requêtes ne déclarait de `refetchInterval`, et le panneau de la file KYC du super-admin affichait
le lien de l'instantané du clic même après un rafraîchissement de la file.

## Décision du porteur (déléguée)

> rafraîchir la requête avant l'expiration du lien : `refetchInterval` (et `staleTime`) plus courts que la durée du lien pour les requêtes des écrans KYC, documents et maintenance qui portent une URL signée, avec le test vitest de la `Piste`

## Objectif

Un lien signé affiché dans ces écrans est renouvelé avant son échéance, sans action de
l'utilisateur.

## Delta à produire

- [ ] `src/lib/url-signee.ts` : les deux durées de l'API, et `rafraichirAvantExpiration(durée)`
      (`staleTime` et `refetchInterval` à mi-durée).
- [ ] KYC (15 min) : `AgencyKycClient`, l'onglet KYC d'`AgencyDetailPage` (super-admin), la file
      KYC du super-admin (`refetchInterval` seul, son `staleTime` de 15 s étant déjà plus court).
- [ ] Médias privés (30 min) : `useDocuments`, `useDocumentVersions`, `useMaintenanceRequest`.
- [ ] File KYC du super-admin : le panneau lit le dossier sélectionné dans la dernière réponse,
      faute de quoi le rafraîchissement ne changerait pas le lien affiché.
- [ ] `src/lib/__tests__/url-signee.tck-1024.test.tsx`.

## Critères d'acceptation

- [ ] AC1 — Chaque requête citée déclare un `refetchInterval` et un `staleTime` plus courts que la
      durée de ses liens (lus sur les observateurs du cache TanStack).
- [ ] AC2 — Après un rafraîchissement de la file KYC, le lien « Ouvrir » du panneau porte la
      nouvelle URL.

## Reste à faire

les pièces jointes déjà chargées de `ChatView`, et la signature au clic, au porteur

## Hors périmètre

- `useDocumentWithVersions` (page de détail d'un document) : la page n'affiche pas de lien signé
  depuis cette requête ; les versions passent par `useDocumentVersions`, couvert.
- Les autres porteurs d'URL signées (inventaires, biens, demandes de passage en agence) : hors des
  trois écrans de la décision.

## Notes d'implémentation

_(à remplir par implementing-specs)_
