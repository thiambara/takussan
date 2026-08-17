---
id: TCK-291
title: "États vides / erreurs — le reste du parc (super-admin, admin, tables)"
status: review
phase: P2
family: front
estimate: M
wave: 27
created: 2026-08-15
updated: 2026-08-17
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

- [x] `components/payments/InvoicesTable.tsx`, `PayoutsTable.tsx`, `PaymentsHistoryTable.tsx`
- [x] `components/bookings/BookingsList.tsx`, `BookingDetail.tsx`
- [x] `components/visits/VisitsList.tsx`, `VisitDetail.tsx`
- [x] `components/leases/LeaseDetail.tsx`, `TenantOnboardingPendingList.tsx`
- [x] `components/maintenance/MaintenanceNewLauncher.tsx`
- [x] `components/admin/finances/OverduePaymentsTable.tsx`
- [x] `app/(dashboard)/app/leases/[id]/page.tsx` — server component, donc **sans** `onRetry`

> Les faire converger vers `QueryBoundary` + `ErrorState` plutôt que fichier par fichier :
> `QueryBoundary` fournit déjà loading + erreur + retry i18n et n'a que 5 consommateurs.

### États vides ad-hoc — les ~24 restants

- [x] Super-admin : `agencies`, `enums`, `moderation`, `properties`, `templates`, `users`
- [x] `admin/super/` : `CrossTenantAuditTable`, `announcements`, `integrations`, `scheduler`,
      `system-health`
- [x] `admin-settings/`, `admin-tags/`, `AuditTrail`
- [x] `calendar/DayView`, `calendar/ListView`
- [x] `customer-dashboard/CustomerDetailTabs`, `CustomerDocumentsPanel`, `CustomerNotesTimeline`
- [x] `inventory/InventoryDetail`, `inventory/RoomEditor`, `leases/LeaseSchedule`,
      `maintenance/MaintenanceHistoryByProperty`, `documents/DocumentVersionsList`,
      `profile/ProfileReviewsList`
- [x] `shared/NoAgencyState` — le seul état vide déjà partagé (8 consommateurs) : le réécrire
      **au-dessus** d'`EmptyState` plutôt qu'à côté, et lui brancher next-intl.
- [x] `app/(public)/bookings/page.tsx` — porte aussi 2 liens primaires faits main
      (`inline-flex … rounded-lg bg-primary`) à passer sur `buttonVariants()`.

### Écarts nommés

- [x] `DocumentsLibrary.OwnerEmptyState` — écart assumé dans `ECARTS_ASSUMES` de la garde. Ce n'est
      pas un état vide mais un mode d'emploi (grille d'exemples + cibles de rattachement) qui
      s'affiche quand c'est vide. Le renommer pour ce qu'il fait, puis **retirer l'entrée de
      l'allowlist** — c'est ce geste-là qui ferme cette ligne, pas un `--` sur la garde.
- [x] `app/(dashboard)/app/customers/[id]/page.tsx` — `CustomerDetailError` local + 1 lien primaire
      fait main.

### Après chaque lot

- [x] Resserrer les deux plafonds de `scripts/check-feedback-states.mjs` sur le compte mesuré.

## Critères d'acceptation

- [x] AC1 — `rg 'rounded-xl bg-app-surface-1 p-6 text-sm text-red-600' takussan-web/src` ne renvoie
      aucun résultat. (Le grep porte sur `src` ENTIER : celui de TCK-246 était borné à `src/app`
      alors que les 16 occurrences vivaient dans `src/components` — il renvoyait 0 sans qu'aucun
      travail n'ait été fait.)
- [x] AC2 — `node scripts/check-feedback-states.mjs` est vert, avec `PLAFONDS.etatsVides ≤ 5` et
      `PLAFONDS.erreursPaletteBrute ≤ 5`. Un plafond non resserré fait rougir la garde : l'AC est
      donc automatiquement vérifiée, pas déclarative.
- [x] AC3 — `ECARTS_ASSUMES` de la garde est vide, ou chaque entrée restante cite un ticket ouvert.
- [x] AC4 — les libellés des écrans migrés existent dans `fr`, `en` ET `wo` — le wolof traduit, pas
      recopié du français.
- [x] AC5 — `npx tsc --noEmit`, `npm run lint` et `npm run test` passent.

## Hors périmètre

- Les 17 écrans déjà migrés par TCK-246 (composant partagé, garde, i18n).
- La résorption i18n générale du frontend — c'est TCK-286, et ce ticket ne fait descendre son
  compteur que sur les écrans qu'il touche.
- Toute nouvelle variante visuelle : la forme est fixée par TCK-246 et `docs/design-guidelines.md`.

## Notes d'implémentation

**Le geste central n'est pas dans la liste du Delta : `QueryBoundary` portait une TREIZIÈME copie
du bloc d'erreur.** Son propre `role="alert"`, son propre bouton de reprise, et `bg-destructive/5`
là où `DestructiveBanner` tient `bg-destructive/10` + `ring`. Le faire rendre `ErrorState` a fait
converger ses appelants d'un seul geste, et l'a fait passer de concurrent du composant partagé à
consommateur.

**Deux voies de convergence, et c'est délibéré.** Les listes passent par `QueryBoundary` (loading
+ erreur + retry i18n d'un bloc) ; les vues de détail, dont le corps suit une garde d'entrée
(`if (isError || !data) return …`), rendent `ErrorState` directement. Les envelopper dans un
render-prop aurait déplacé plusieurs centaines de lignes de JSX pour un gain nul : les deux routes
finissent sur le même composant.

**Les plafonds tombent à 0 tous les deux, mais les deux 0 ne valent PAS la même chose.**
`erreursPaletteBrute` 22 → 0 est entier et vérifiable. `etatsVides` 32 → 0 est en partie de
l'aveuglement de la mesure : les libellés migrés sont passés derrière `t()`, et l'heuristique B ne
voit pas un état vide libellé par une clé i18n. Le commentaire du plafond le dit — un cliquet à 0
tient qu'aucun état vide ad-hoc *visible par cette heuristique* ne peut réapparaître, pas qu'il
n'en reste aucun.

**`ECARTS_ASSUMES` est vidée par un RENOMMAGE, pas par une exemption.** `OwnerEmptyState` rendait
une grille d'exemples et des cibles de rattachement : un mode d'emploi qui s'affiche quand c'est
vide, nommé comme un état vide. Il s'appelle `OwnerDocumentsPrimer`. Même diagnostic un cran plus
loin sur `CustomerDetailError` : ses trois cas (id invalide, 404, 403) ne sont pas des erreurs à
réessayer mais une fiche qu'on ne peut pas ouvrir — il devient `CustomerDetailUnavailable` sur
`EmptyState`, pas sur `ErrorState`.

**Hors Delta, mais imposé par AC1** : `ProfileReviewsList` portait trois occurrences du motif
dominant que la liste du Delta ne citait pas — AC1 grep sur `src` ENTIER, elles ont dû partir.
Idem pour les blocs d'erreur des quatre pages super-admin, en tokens `destructive` (donc invisibles
du cliquet C) mais doublant `role="alert"`.

**Trois tests montaient `messages={{}}` ou aucun provider** — `VisitsList`, `CalendarPage`,
`super-admin/users`. Ils passent sur `withIntl` (vrai `fr.json`). `OverduePaymentsTable` mockait
next-intl sans `useTranslations`.

**Non fait, et à qui** : les libellés hors état vide des écrans touchés (en-têtes de tableau,
`STATUS_LABEL`, le corps de `OwnerDocumentsPrimer`) restent en dur — c'est TCK-286, explicitement
hors périmètre ici. Rien sous `admin/roles/` ni la `TeamConsole` n'a été touché : un autre agent y
travaillait (TCK-279), et aucun état vide de ce lot ne s'y trouvait.
