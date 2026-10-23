---
id: TCK-1751
title: "Les versements et les annonces de la console se paginent"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-171--sélecteurs-et-listes-sans-pagination-nourris-par-la-taille-de-page-par-défaut"
tags: [front, console, versements, annonces, pagination, pistes]
---

## Contexte

Réf : **P171.07** du fichier de pistes, `validé (délégué)` (V7 accordé).

`AdminPayoutsClient` et la table des annonces de la console lisaient une page de 30 et
affichaient le total de l'API, sans page suivante : au-delà de 30, les lignes ne s'atteignaient pas.

## Décision du porteur (déléguée)

> `AdminPayoutsClient` et la table des annonces se paginent par le composant `Pagination` de `@/components/console`, comme `payments.tsx` et `failed-jobs.tsx` de la même console : `page` dans l'état, passée à `fetchAdminPlatformPayouts` et `fetchAdminAnnouncements` (qui l'acceptent déjà), `lastPage` = `meta.last_page`, 30 par page gardé, retour à la page 1 quand l'agence ou le statut des versements change ; total affiché inchangé ; test : 31 versements, puis 31 annonces, la 31ᵉ ligne se rend en page 2

## Objectif utilisateur

L'opérateur de la plateforme atteint chaque versement et chaque annonce, page par page.

## Contrat de données

Aucun changement d'API : `GET /api/super-admin/payouts` et `GET /api/super-admin/announcements`
acceptent `page` et rendent `meta.last_page`.

## Delta à produire

- [x] `AdminPayoutsClient` : `page` dans l'état et dans la clé de cache, passée au lecteur, remise à
  1 quand l'agence ou le statut change ; `Pagination` sous la table.
- [x] `AnnouncementsConsole` : `page` dans l'état, la clé `['super-admin', 'announcements', page]`
  (préfixe que les écritures invalident toujours) ; `Pagination` sous la table.
- [x] Tests : 31 versements, puis 31 annonces, la 31ᵉ ligne en page 2 ; changer d'agence ramène en page 1.

## Critères d'acceptation

- [x] AC1 — le 31ᵉ versement se rend en page 2, et un changement d'agence ou de statut ramène en page 1.
- [x] AC2 — la 31ᵉ annonce se rend en page 2.
- [x] AC3 — 30 par page et total affiché inchangés.

## Hors périmètre

- Toute autre table de la console.

## Notes d'implémentation

- Ablation : `AdminPayoutsClient.tsx` et `announcements.tsx` rendus à `HEAD` → 2 rouges sur 2
  (aucun bouton « Suivant ») ; correctif remis → 2/2 verts.
