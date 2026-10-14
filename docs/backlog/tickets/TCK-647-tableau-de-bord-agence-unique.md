---
id: TCK-647
title: Un seul tableau de bord d'agence — /app/overview/agency absorbe celui de /admin
status: todo
phase: P1
family: front
estimate: M
wave: 78
created: 2026-10-14
updated: 2026-10-14
depends_on: []
blocks: [TCK-649]
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#112-agence--équipe
  models: []
tags: [front, dashboard, agence, adr-0064]
---

## Objectif utilisateur

L'admin d'une agence `standard` lit l'état de son agence sur un seul tableau de bord, dans son
espace de travail, au lieu de deux qui se recoupent.

## Contrat de données

- Consommé, inchangé : `GET /api/dashboard/agency` — la même lecture que les deux tableaux de
  bord actuels (`fetchDashboardAgency` sous `/admin`, `fetchAgencyDashboard` sous
  `/app/overview/agency`). Le tableau de bord unique la lit **une fois** par affichage, avec les
  séries temporelles dont ses graphiques ont besoin.
- Consommé, inchangé : ce que lit déjà la carte « Mise en service » (TCK-589).
- Décision : [ADR-0064](../../adr/0064-l-administration-d-agence-vit-dans-app.md) §3.

## Direction UX / Artistique

- Le tableau de bord de `/admin` est le plus riche : il donne la structure (mise en service en
  tête tant qu'elle n'est pas complète, puis files d'attente, indicateurs, activité, revenus).
- Ce que `/app/overview/agency` montre et que l'autre ne montre pas (courbe d'occupation, tuiles
  sans équivalent) s'y intègre — sans doublon : un même chiffre n'apparaît qu'une fois.
- Charte `docs/design-guidelines.md` ; règle des coques à barre latérale (`lg`, pas `md`) de
  `takussan-web/CLAUDE.md`.

## Contraintes strictes (métier)

- Accès inchangé : la garde du layout de `/app/overview/agency` (admin d'agence `standard`,
  `reports.view_agency` côté API — §2.5) et l'aiguillage de `/app/overview` ne bougent pas.
- La branche « agence `individual` » des files d'attente n'est atteinte que par un super-admin
  rattaché à une telle agence (commentaire de `admin/page.tsx`) : elle reste servie si la page la
  rend atteignable, ou disparaît avec une preuve qu'elle n'est plus atteignable.
- Un super-admin sans agence voit l'état « aucune agence », comme aujourd'hui sur les deux pages.

## Delta à produire

- [ ] `/app/overview/agency` rend le tableau de bord fusionné.
- [ ] La page `/admin` (tableau de bord) est supprimée, et sa ligne retirée de la table
      `PAGES_ADMIN` ; le premier lien « Administration » devient la première page restante.
- [ ] Les composants de `components/dashboard/admin/` qui ne servent plus sont supprimés.
- [ ] Tests : la page fusionnée (sections présentes, une seule lecture de l'endpoint), la garde
      inchangée.

## Critères d'acceptation

- [ ] AC1 — `/app/overview/agency` montre, pour un admin d'agence `standard` : la mise en service
      (tant qu'incomplète), les files d'attente, les indicateurs, l'activité, les revenus et la
      courbe d'occupation.
- [ ] AC2 — aucun chiffre n'y figure deux fois.
- [ ] AC3 — un affichage déclenche **un** appel à `GET /api/dashboard/agency`, pas deux.
- [ ] AC4 — `/admin` (la racine) rend 404 ; aucun lien du front n'y mène encore.
- [ ] AC5 — un agent, un bailleur, l'admin d'une agence `individual` sont toujours aiguillés comme
      avant par `/app/overview`.

## Hors périmètre

- Le déplacement des autres pages de `/admin` (TCK-649) et les pages super-admin (TCK-648).
- Tout changement de l'endpoint `GET /api/dashboard/agency`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
