---
id: TCK-157
title: "Fiche bien (édition) — section Photos dupliquée"
status: todo
phase: P2
family: front
estimate: S
created: 2026-05-04
updated: 2026-05-04
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
tags: [front, bug, p3, smoke-test-2026-05-04, properties, ui]
---

## Objectif utilisateur

Un agent qui édite un bien depuis `/app/properties/{id}` voit une seule section Photos cohérente — pas deux blocs successifs (un avec limite 10 fichiers, un avec limite 20 fichiers, drag-to-reorder uniquement sur le second).

## Contrat de données

Pas de contrat backend modifié. Le composant `(dashboard)/app/properties/[id]/page.tsx` rend deux blocs dropzone successifs :
1. Section `Photos` — limite 10 fichiers, 5 Mo max, sans drag-to-reorder
2. Section `Photos du bien` — limite 20 fichiers, 5 Mo max, drag-to-reorder + couverture

Décision produit à arbitrer : conserver uniquement le bloc 2 (plus complet) et décider de la limite (10 ou 20).

## Direction UX / Artistique

- Une seule zone Photos sur la fiche d'édition.
- Conserver les fonctionnalités du bloc 2 (drag-to-reorder, première photo = couverture).
- Limite de fichiers à aligner sur la spec / le backend (cf. `docs/features.md#11-gestion-des-biens`).

## Contraintes strictes (métier)

- Pas de régression sur la sauvegarde des photos existantes.
- Pas de changement de schéma backend.

## Delta à produire

- [ ] **Frontend** — Sur `(dashboard)/app/properties/[id]/page.tsx`, supprimer le bloc Photos initial (limite 10 fichiers) en gardant uniquement « Photos du bien » (limite 20)
- [ ] **Frontend** — Vérifier la limite côté `/app/properties/new` (création) : si elle est aussi à 10, l'aligner sur la spec produit
- [ ] **Frontend** — Vérifier que la limite côté backend (validation Laravel sur `POST /api/properties/{id}/media`) est cohérente avec la limite UI
- [ ] **Tests frontend** — Test rendu : la fiche d'édition rend une seule section dropzone avec drag-to-reorder

## Critères d'acceptation

- [ ] `/app/properties/{id}` rend exactement **une** section Photos (pas deux blocs successifs)
- [ ] Le drag-to-reorder fonctionne sur la section conservée
- [ ] La sauvegarde de photos sur la fiche d'édition fonctionne sans régression

## Hors périmètre

- Création de la limite produit (10 vs 20) — décision à valider avec PM si non documentée
- Refonte de la dropzone (UX upload, preview, compression côté client)

## Notes d'implémentation

- Source de reproduction : `docs/smoke-tests/agent-smoke-test-2026-05-04.md`, bug **P3-1**.
- Snapshot a11y `/app/properties/83` montre deux dropzones successifs : `uid 25_122 heading "Photos"` + `uid 25_151 heading "Photos du bien"`.
