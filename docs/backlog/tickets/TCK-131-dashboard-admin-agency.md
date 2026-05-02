---
id: TCK-131
title: "Dashboard /admin agence — câblage indicateurs & vue d'ensemble"
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-032]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#3-property
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#28-payout-
tags: [front, dashboard, admin, agency, p1]
---

## Objectif utilisateur

Un agency_admin ouvre `/admin` et voit en un coup d'œil la santé opérationnelle et financière de son agence (biens, vues, revenus, impayés, occupation) sans page « En cours de développement ».

## Contrat de données

Endpoint adaptatif fourni par TCK-032, scopé à l'agence courante (`GET /api/dashboard/me` ou `GET /api/agencies/{id}/dashboard` — selon ce que TCK-032 expose). Le frontend ne déduit pas l'agence côté client, il consomme la réponse.

Conventions Spatie obligatoires : `fields[...]`, `include=`, jamais de filtrage côté client.

## Direction UX / Artistique

- Tonalité **back-office sérieux**, dense en information ; pas de hero.
- Bandeau supérieur : 4-6 KPIs principaux (biens actifs, baux actifs, taux d'occupation, revenus du mois, impayés, vues du mois) — cartes compactes.
- Section secondaire : liste courte des dernières activités (réservations, contrats à signer, signalements en attente) avec lien vers la page détaillée.
- Section finance condensée : revenus 12 derniers mois (placeholder visuel ok, vrai graphique en P2 dédié).
- Cohérent avec la sidebar admin actuelle et le pattern visuel des autres pages admin (`/admin/team`, `/admin/agency`).
- Aucun StubPlaceholder.

## Contraintes strictes (métier)

- Visible uniquement aux rôles `agency_admin` et `super_admin` rattachés à une agence ; `super_admin` sans agence → `NoAgencyState` (TCK-115).
- Ne jamais cumuler les KPIs de plusieurs agences (chaque admin voit la sienne).
- Les valeurs sensibles (revenus, impayés) sont conditionnées par les permissions (`view_agency_reports` ou équivalent).
- Aucun chiffre fictif : afficher `—` puis la vraie donnée.

## Delta à produire

- [ ] Page UI: `src/app/(dashboard)/admin/page.tsx` — retirer `<StubPlaceholder>`
- [ ] Composants `AgencyKpiTile`, `AgencyActivityFeed`, `AgencyRevenueSnapshot`
- [ ] Hook/query React Query consommant l'endpoint dashboard agence
- [ ] Skeletons et états vides
- [ ] Tests UI (rendu agency_admin, super_admin sans agence, permission insuffisante)

## Critères d'acceptation

- [ ] La page n'affiche plus `<StubPlaceholder>`
- [ ] Les 4-6 KPIs agence sont peuplés depuis l'API
- [ ] Un super_admin sans `agency_id` voit `NoAgencyState`
- [ ] Un utilisateur sans permission de lecture rapport voit un état dégradé (KPIs masqués + message)
- [ ] Aucune donnée d'autre agence n'apparaît dans la réponse

## Hors périmètre

- Implémentation de l'endpoint dashboard (TCK-032)
- Graphiques temporels avancés (P2)
- Export CSV/PDF (P2)
- KPIs personnalisables par agence (P3)

## Notes d'implémentation

_(à remplir par implementing-specs)_
