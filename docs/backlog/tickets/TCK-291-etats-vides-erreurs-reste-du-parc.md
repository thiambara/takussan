---
id: TCK-291
title: "États vides / erreurs — le reste du parc (super-admin, admin, tables)"
status: todo
phase: P2
family: front
estimate: M
wave: 27
created: 2026-08-15
updated: 2026-08-15
depends_on: [TCK-246]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, design-system, empty-state, error-state, dette]
---

## Objectif utilisateur

Que les écrans d'administration et de super-administration rendent le même état vide et le même
bloc d'erreur que le reste du produit — et non la trentaine de variantes qui y subsistent.

## Contrat de données

Aucun changement d'API. Les composants partagés existent déjà depuis TCK-246 :
`EmptyState` et `ErrorState` dans `src/components/feedback/`.

## Direction UX / Artistique

Aucune direction neuve. TCK-246 a tranché la forme ; ce ticket l'applique au reste.
Les libellés passent par next-intl dans les trois locales, comme sur les 17 premiers écrans.

## Contraintes strictes (métier)

- **Ne pas créer de variante.** Si un cas ne rentre pas dans `{icon, title, description, action}`,
  c'est un composant d'un AUTRE genre : il prend un nom qui dit ce qu'il fait, et sort du champ
  des états vides.
- **Le cliquet ne remonte jamais.** `scripts/check-feedback-states.mjs` porte deux plafonds
  (`etatsVides: 34`, `erreursPaletteBrute: 22`). Chaque écran migré les fait descendre, et la
  garde EXIGE qu'on les resserre — un plafond qu'on ne resserre pas laisse remonter en silence.
- **`role="alert"` une seule fois.** `ErrorState` le pose via `DestructiveBanner` : le retirer des
  appelants en migrant, sinon l'annonce est doublée.

## Delta à produire

### Blocs d'erreur ad-hoc — les 12 occurrences restantes du motif dominant

Toutes identiques au caractère près (`rounded-xl bg-app-surface-1 p-6 text-sm text-red-600`), et
toutes alimentées par `useApiQuery` — donc toutes compatibles avec `onRetry` sans changement d'API :

- [ ] `components/payments/InvoicesTable.tsx`, `PayoutsTable.tsx`, `PaymentsHistoryTable.tsx`
- [ ] `components/bookings/BookingsList.tsx`, `BookingDetail.tsx`
- [ ] `components/visits/VisitsList.tsx`, `VisitDetail.tsx`
- [ ] `components/leases/LeaseDetail.tsx`, `TenantOnboardingPendingList.tsx`
- [ ] `components/maintenance/MaintenanceNewLauncher.tsx`
- [ ] `components/admin/finances/OverduePaymentsTable.tsx`
- [ ] `app/(dashboard)/app/leases/[id]/page.tsx` — server component, donc **sans** `onRetry`

> Les faire converger vers `QueryBoundary` + `ErrorState` plutôt que fichier par fichier :
> `QueryBoundary` fournit déjà loading + erreur + retry i18n et n'a que 5 consommateurs.

### États vides ad-hoc — les ~24 restants

- [ ] Super-admin : `agencies`, `enums`, `moderation`, `properties`, `templates`, `users`
- [ ] `admin/super/` : `CrossTenantAuditTable`, `announcements`, `integrations`, `scheduler`,
      `system-health`
- [ ] `admin-settings/`, `admin-tags/`, `AuditTrail`
- [ ] `calendar/DayView`, `calendar/ListView`
- [ ] `customer-dashboard/CustomerDetailTabs`, `CustomerDocumentsPanel`, `CustomerNotesTimeline`
- [ ] `inventory/InventoryDetail`, `inventory/RoomEditor`, `leases/LeaseSchedule`,
      `maintenance/MaintenanceHistoryByProperty`, `documents/DocumentVersionsList`,
      `profile/ProfileReviewsList`
- [ ] `shared/NoAgencyState` — le seul état vide déjà partagé (8 consommateurs) : le réécrire
      **au-dessus** d'`EmptyState` plutôt qu'à côté, et lui brancher next-intl.
- [ ] `app/(public)/bookings/page.tsx` — porte aussi 2 liens primaires faits main
      (`inline-flex … rounded-lg bg-primary`) à passer sur `buttonVariants()`.

### Écarts nommés

- [ ] `DocumentsLibrary.OwnerEmptyState` — écart assumé dans `ECARTS_ASSUMES` de la garde. Ce n'est
      pas un état vide mais un mode d'emploi (grille d'exemples + cibles de rattachement) qui
      s'affiche quand c'est vide. Le renommer pour ce qu'il fait, puis **retirer l'entrée de
      l'allowlist** — c'est ce geste-là qui ferme cette ligne, pas un `--` sur la garde.
- [ ] `app/(dashboard)/app/customers/[id]/page.tsx` — `CustomerDetailError` local + 1 lien primaire
      fait main.

### Après chaque lot

- [ ] Resserrer les deux plafonds de `scripts/check-feedback-states.mjs` sur le compte mesuré.

## Critères d'acceptation

- [ ] AC1 — `rg 'rounded-xl bg-app-surface-1 p-6 text-sm text-red-600' takussan-web/src` ne renvoie
      aucun résultat. (Le grep porte sur `src` ENTIER : celui de TCK-246 était borné à `src/app`
      alors que les 16 occurrences vivaient dans `src/components` — il renvoyait 0 sans qu'aucun
      travail n'ait été fait.)
- [ ] AC2 — `node scripts/check-feedback-states.mjs` est vert, avec `PLAFONDS.etatsVides ≤ 5` et
      `PLAFONDS.erreursPaletteBrute ≤ 5`. Un plafond non resserré fait rougir la garde : l'AC est
      donc automatiquement vérifiée, pas déclarative.
- [ ] AC3 — `ECARTS_ASSUMES` de la garde est vide, ou chaque entrée restante cite un ticket ouvert.
- [ ] AC4 — les libellés des écrans migrés existent dans `fr`, `en` ET `wo` — le wolof traduit, pas
      recopié du français.
- [ ] AC5 — `npx tsc --noEmit`, `npm run lint` et `npm run test` passent.

## Hors périmètre

- Les 17 écrans déjà migrés par TCK-246 (composant partagé, garde, i18n).
- La résorption i18n générale du frontend — c'est TCK-286, et ce ticket ne fait descendre son
  compteur que sur les écrans qu'il touche.
- Toute nouvelle variante visuelle : la forme est fixée par TCK-246 et `docs/design-guidelines.md`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
