---
id: TCK-2167
title: "« Urgences prioritaires » du prestataire ne se rend que quand sa liste tient sur une page"
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
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-199--listes-chargées-par-morceaux-puis-comptées-groupées-ou-triées-sur-la-seule-page-chargée"
tags: [front, maintenance, prestataire, pagination, pistes]
---

## Objectif utilisateur

Le prestataire ne lit pas sous « Urgences prioritaires » les seules urgences de la page affichée,
comme si c'étaient toutes les siennes.

## Contexte

Réf : **P199.04** du fichier de pistes, `validé`.

Décision du porteur : validation du porteur (2026-10-24) : la section « Urgences prioritaires » du prestataire n'est rendue que lorsque la liste tient sur une page (`last_page = 1`) ; sinon les urgentes restent à leur place avec leur badge, et le filtre de priorité reste disponible

Avant (lu) : `MaintenanceList` demande `sort: 'scheduled_at'` pour le prestataire (TCK-592) et
sépare `priority === 'urgent'` dans la seule page reçue, titrée « Urgences prioritaires ».

## Hypothèses (mode sans humain)

- Sans la section, le titre « Autres demandes » n'a plus de raison d'être : il ne se rend, comme
  avant, que lorsque la section des urgences est rendue.
- Les autres rôles reçoivent la liste triée par priorité côté serveur : leur section est inchangée.

## Delta à produire

- [x] `MaintenanceList` : pour le prestataire, urgences séparées seulement si `last_page <= 1`.
- [x] Tests : deux cas de `MaintenanceList.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Prestataire, une page : la section « Urgences prioritaires » est rendue.
- [x] AC2 — Prestataire, plusieurs pages : ni « Urgences prioritaires » ni « Autres demandes » ;
  l'urgence reste à sa place dans l'ordre reçu, avec son badge « Urgente ».
- [x] AC3 — Le filtre de priorité reste disponible (inchangé).

## Hors périmètre

- Le tri de la liste du prestataire (par créneau, TCK-592).

## Notes d'implémentation

- **Ablation** : la séparation remise sans condition → 1 rouge sur 5 (la section rendue sur une
  liste à deux pages) ; correctif remis → 5 verts.
