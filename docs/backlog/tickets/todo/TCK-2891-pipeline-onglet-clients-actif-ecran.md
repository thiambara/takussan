---
id: TCK-2891
title: "Pipeline : l'onglet « Clients » (téléphone) et l'entrée « Clients » (barre latérale) restent actifs sur /app/crm/pipeline"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, crm, pipeline, navigation, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Sur le pipeline, l'agent sait où il est : « Clients » est allumé dans la barre du bas comme dans la barre latérale.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-pipeline e0 ; « Écarts couverts par les fiches », TCK-2592 hors périmètre renvoyé « à navigation » sans ticket). L'entrée « Clients » du catalogue ne couvre que `/app/customers` (`lib/navigation/catalogue.ts:310`) ; aucune entrée ne couvre `/app/crm`.

## Contrat de données

- Aucun appel : catalogue de navigation de la console.

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-pipeline` — fichiers `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-pipeline-telephone.tsx` et `app-pipeline-ecrans.tsx` ; écrans **e0 Liste**, **e1 Kanban**, **e2 Motif de perte** ; téléphone (onglet « Clients » de la barre du bas actif) et bureau (entrée « Clients » de la barre latérale active).

## Contraintes strictes (métier)

- L'entrée « Clients » est active pour `/app/customers/*` **et** `/app/crm/*` ; aucune autre entrée ne s'allume en même temps.
- Pas de régression sur l'onglet actif des autres routes (garde de la coque existante).

## Delta à produire

- [ ] Catalogue de navigation : correspondance de « Clients » étendue à `/app/crm`.
- [ ] Test de la coque : onglet et entrée actifs sur `/app/crm/pipeline`, une seule entrée active.

## Critères d'acceptation

- [ ] AC1 — À 390, sur `/app/crm/pipeline`, l'onglet « Clients » de la barre du bas porte `aria-current="page"`.
- [ ] AC2 — À 1440, l'entrée « Clients » de la barre latérale porte `aria-current="page"` et aucune autre.
- [ ] AC3 — Vérifier au navigateur, avec un client qui a des critères et un contact récent, la ligne « Cherche » et le canal du dernier contact (« appel il y a 9 j ») sur les cartes et lignes du pipeline (e0, e1) ; corriger si absents.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — La fiche existante de TCK-2592 est mise à jour : l'écart « onglet Clients non actif » est retiré de ses `hors_perimetre`.

## Hors périmètre

- Le contenu du pipeline (conforme, TCK-2592).

## Notes d'implémentation

_(à remplir par implementing-specs)_
