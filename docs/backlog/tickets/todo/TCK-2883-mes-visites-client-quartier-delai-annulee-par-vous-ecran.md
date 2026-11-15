---
id: TCK-2883
title: "Visites, côté client et confirmation : le quartier dès la demande, « L'agence vous répond d'ordinaire en N h », « Annulée par vous », et « prévenu par SMS et par e-mail » à la confirmation"
status: todo
phase: P1
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2871]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [front, visits, client, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Le client sait où il ira (le quartier) dès qu'il demande une visite, combien de temps l'agence met d'ordinaire à répondre, et distingue ce qu'il a annulé lui-même ; l'agent qui planifie lit par quels canaux le client a été prévenu.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-visites e6 et e7). Trois éléments de e7 avaient été « acceptés » faute de donnée (quartier, délai de réponse, « Annulée par vous ») ; e6 dit « par SMS et par e-mail » là où le produit dit « Un SMS a prévenu ». Les données arrivent par TCK-2871.

## Contrat de données

- `GET /api/property-visits` (client) : `neighborhood`, `cancelled_by` (TCK-2871).
- `GET /api/agencies/{agency}/response-time` (TCK-2871) — 204 sous le seuil.
- `POST /api/property-visits` : `notification.channels` (TCK-2871).

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-visites`, approche **a** — fichiers `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-visites-a.tsx` et `app-visites-a-mobile.tsx`, `app-visites-blocs.tsx` ; écrans **e6 Planifier — confirmée** et **e7 Côté client** ; téléphone et bureau.

- **Les deux formats** — manque : e7, le quartier après le titre du bien d'une visite en attente ; « L'agence vous répond d'ordinaire en 2 h » sous « En attente de confirmation » ; « Annulée par vous » dans les Passées ; e6, « Un SMS et un e-mail ont prévenu {prénom} » quand les deux canaux sont partis (le texte suit `notification.channels`, il ne promet pas un canal qui n'est pas parti).

## Contraintes strictes (métier)

- Le délai n'est pas affiché quand l'API rend 204 (pas de chiffre inventé).
- i18n `fr`/`en`/`wo`, vouvoiement.

## Delta à produire

- [ ] e7 : quartier, délai de réponse, « Annulée par vous ».
- [ ] e6 : texte selon les canaux.
- [ ] Tests de composant : délai absent sur 204 ; « Annulée par vous » seulement pour `cancelled_by = visitor` ; texte e6 selon `channels` (sms seul, sms+mail).

## Critères d'acceptation

- [ ] AC1 — À 390, une visite `requested` du client montre « Studio meublé · Ouakam » (quartier) ; l'adresse n'apparaît pas.
- [ ] AC2 — L'agence rend `median_hours = 2` : « L'agence vous répond d'ordinaire en 2 h » ; 204 : la ligne n'existe pas.
- [ ] AC3 — Une visite annulée par le client porte « Annulée par vous » ; annulée par l'agence, « Annulée par l'agence » avec son motif.
- [ ] AC4 — Après planification avec `channels = [sms, mail]`, la confirmation dit « Un SMS et un e-mail ont prévenu Mouhamed ».
- [ ] AC5 — Vérifier au navigateur, compte client, dans les 24 h après une visite terminée : l'avis « encore N h » s'affiche (e7) ; corriger si non.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2883.json` : écrans e6 et e7 de `app-visites` (a), téléphone et bureau.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué.

## Hors périmètre

- Le côté personnel de la liste et du détail (TCK-2882).

## Notes d'implémentation

_(à remplir par implementing-specs)_
