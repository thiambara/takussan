---
id: TCK-1293
title: "L'onglet de la liste des réservations se lit et s'écrit dans `?status=`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-131--paramètres-de-requête-des-liens-profonds-et-leur-survie-aux-redirections"
tags: [front, bookings, pistes]
---

## Contexte

Réf : **P131.04** du fichier de pistes, `retenu · autonome` (A1).

L'aperçu du bailleur mène à `/app/bookings?status=pending`, mais `BookingsList` tient son onglet
en `useState('pending')` et ne lit aucun paramètre : un lien vers un autre statut retomberait en
silence sur « En attente », et le retour arrière depuis `/app/bookings/{id}` ramène à « En
attente » quel que soit l'onglet quitté.

## Objectif utilisateur

Un lien ou un retour arrière vers la liste des réservations ouvre l'onglet qu'il désigne.

## Contrat de données

Aucun changement d'API.

## Delta à produire

- [x] `BookingsList` lit l'onglet dans `?status=`, borné aux valeurs de `TABS` (`pending` sinon).
- [x] Le choix d'un onglet l'écrit par `router.replace` ; `pending`, l'onglet par défaut, retire le
  paramètre ; les autres paramètres sont gardés.
- [x] Test monté sur `?status=confirmed`, sur une valeur hors des onglets, et sur le changement d'onglet.

## Critères d'acceptation

- [x] AC1 — Sous `?status=confirmed`, « Confirmées » est l'onglet actif et sa liste est lue.
- [x] AC2 — Une valeur hors des onglets (`completed`) ouvre « En attente ».
- [x] AC3 — Choisir « Refusées » écrit `?status=rejected` ; revenir à « En attente » retire le paramètre.

## Hors périmètre

- Le retour arrière au navigateur, non joué : il découle de l'URL, que le test garde.

## Notes d'implémentation

- `router.replace(…, { scroll: false })` : changer d'onglet ne remonte pas la page.
- Ablation : `BookingsList.tsx` rendu à `HEAD` → 2 rouges sur 3 (le repli sur `pending` reste vert,
  c'était déjà le comportement) ; correctif remis → 3/3 verts.
