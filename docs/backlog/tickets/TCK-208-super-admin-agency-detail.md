---
id: TCK-208
title: "Super-admin — Détail agence cross-tenant `/super-admin/agencies/[id]`"
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#2-agency
tags: [front, super_admin, p1]
---

## Contexte

TCK-145 a livré la liste des agences sous `/super-admin/agencies` avec les actions de modération (verify / suspend / unverify) et la possibilité de filtrer par statut. Aucune route détaillée n'existe — un super-admin ne peut pas auditer une agence individuellement (équipe, biens publiés, transactions, paiements, plaintes) sans quitter la console et passer en impersonation. La modération opère donc à l'aveugle.

## Objectif utilisateur

Un super-admin Takussan ouvre `/super-admin/agencies/[id]` et obtient une vue 360° de l'agence — santé d'activité, équipe, portefeuille de biens, transactions récentes, file de modération propre — depuis laquelle il peut déclencher les actions de modération sans changer de page.

## Contrat de données

Endpoints à consommer / exposer :

- `GET /api/admin/agencies/{id}` — fiche agence détaillée (sparse fieldsets attendus)
- `GET /api/admin/agencies/{id}/health` — KPIs agrégés : nb biens actifs, biens en modération, transactions 30j, revenu 30j, dernier paiement plateforme, nb plaintes ouvertes
- `GET /api/admin/agencies/{id}/team?include=roles&fields[users]=...` — agents et rôles
- `GET /api/admin/agencies/{id}/properties?fields[properties]=...` — portefeuille (réutilise les filtres spatie standard)
- Endpoints existants TCK-144 inchangés : `POST /api/admin/agencies/{id}/{verify|suspend|unverify}`

## Direction UX / Artistique

En-tête identité agence (logo, nom, statut, date d'inscription, lien vers le profil public). Strip de KPIs agrégés en haut (cartes compactes). Onglets ou sections déroulantes : *Équipe*, *Biens*, *Transactions*, *Modération*, *Paiements plateforme*, *Audit*. Actions de modération exposées dans un menu d'action permanent en haut, jamais cachées. Cohérent avec le shell super-admin de TCK-145 — pas d'éléments du layout agence.

## Contraintes strictes (métier)

- Page accessible **uniquement** au rôle `super_admin` (le layout `(super-admin)` filtre déjà — pas de check redondant côté client).
- Toutes les actions de modération demandent une double confirmation (modale dédiée), conforme à TCK-145.
- Toujours utiliser `fields[...]`, `filter[...]`, `include=` (CLAUDE.md).
- Aucun appel ne fan-oute : un seul `health` au lieu d'agréger côté client. Les listes (équipe, biens, transactions) sont paginées et filtrables côté serveur.
- Les actions sensibles (verify / suspend / unverify) loggent automatiquement via `LogsActivity` (déjà câblé sur `Agency`).

## Delta à produire

- [ ] Backend `Admin\AgencyDetailController@show` — sérialise via une `Admin\AgencyDetailResource` dédiée (pas de fuite d'attributs entre couches)
- [ ] Backend `Admin\AgencyDetailController@health` — agrégats SQL en une requête
- [ ] Backend route `GET /api/admin/agencies/{id}` + `GET /api/admin/agencies/{id}/health` + `GET /api/admin/agencies/{id}/team` + `GET /api/admin/agencies/{id}/properties`
- [ ] Frontend page `src/app/(super-admin)/super-admin/agencies/[id]/page.tsx`
- [ ] Composants : `AgencyDetailHeader`, `AgencyHealthStrip`, `AgencyTeamTab`, `AgencyPropertiesTab`, `AgencyTransactionsTab`, `AgencyModerationActionsMenu`
- [ ] Lien depuis la liste `super-admin/agencies` (TCK-145) vers la fiche
- [ ] Tests backend : `Tests\Feature\Api\Admin\AgencyDetailTest` (200 super-admin, 403 agency_admin, payload health correct)
- [ ] Tests UI : redirect non-super_admin, rendu détail, déclenchement modération depuis l'en-tête

## Critères d'acceptation

- [ ] `/super-admin/agencies/[id]` rend la fiche agence avec strip KPI sans dépasser 1 appel par section
- [ ] Un agency_admin reçoit 403 sur tous les endpoints `/api/admin/agencies/{id}/*`
- [ ] Les actions verify / suspend / unverify déclenchent une modale de double confirmation et invalident le cache React Query de la liste et de la fiche
- [ ] Aucun appel ne fetch tous les champs (sparse fieldsets toujours présents)
- [ ] Les KPIs `health` sont calculés côté serveur (pas d'agrégation client sur des listes paginées)
- [ ] Le shell utilisé est bien le `SuperAdminShell` (pas de KPIs agence ni de `ProfileSwitcher`)

## Hors périmètre

- Plans / quotas / facturation plateforme (nécessite extension de spec — voir rapport)
- KYC documentaire (idem — extension de spec)
- Édition des paramètres internes de l'agence depuis la console super-admin (les agency_admin gardent la main via `/admin/`)

## Notes d'implémentation

_(à remplir par implementing-specs)_
