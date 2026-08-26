---
id: TCK-373
title: "Console agence — adopter les primitives partagées (en-tête, badge, états, pagination, table)"
status: review
phase: P2
family: front
estimate: M
wave: 47
created: 2026-08-26
updated: 2026-08-26
depends_on: [TCK-357, TCK-372]
blocks: [TCK-375, TCK-376]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, design-system, admin, primitives]
---

## Objectif utilisateur

L'admin d'agence retrouve le même en-tête, le même badge de statut, le même état de chargement et la même pagination d'un écran à l'autre — au lieu de réapprendre la mise en page à chaque menu.

## Contexte

Les guidelines s'ouvrent sur *« Cohérence avant tout : un seul style de bouton principal, **une
seule façon d'afficher un état vide**, une seule famille d'icônes »*. Relevé le 2026-08-26 sur
la console `/admin` :

| Élément | Ce qui existe déjà | Ce que la console fait |
|---|---|---|
| En-tête de page | `layout/PageHeader` (titre, sous-titre, eyebrow, **`actions`**) | **3 pages sur 12** le montent ; 9 recopient son balisage (12 occurrences), 2 dans un `<div>` au lieu d'un `<header>`, et **aucune** n'utilise `actions` |
| Badge de statut | `ui/badge.tsx` | 4 recettes distinctes pour « succès » : `bg-emerald-100`, `bg-emerald-50 …border`, `bg-emerald-500/10 …border`, `bg-emerald-600`. Idem pour « en attente » et « erreur » |
| État d'erreur | `ErrorState` | 3 rendus : le composant (5 fichiers), une `Card` + `text-destructive`, une `div destructive/5` |
| État de chargement | `ui/skeleton.tsx` | 3 rendus : `<Skeleton>` (6 fichiers), `animate-pulse` artisanal (4), `Loader2` (19) |
| Pagination | `search/Pagination.tsx`, `super-admin/Pagination.tsx`, `property-dashboard/PropertyPagination.tsx` | **3 implémentations existantes**, et `AuditTrail` comme `TeamConsole` en réécrivent chacun une → **5 au total** |
| Table | `console/DataTable` + `ui/table`, produits par TCK-357 | 5 tables écrites à la main |

**Le « succès » mérite d'être nommé à part :** les guidelines posent *« Succès / location :
`var(--accent)` (sage `#5d6e4f`) »*. Les quatre recettes ci-dessus sont des verts Tailwind
bruts. **Aucune n'est sage.**

**Ce ticket ne crée rien.** [TCK-357](TCK-357-console-super-admin-primitives-partagees.md), en
`review` au 2026-08-26, livre `src/components/console/` — `DataTable`, `PageHeader`, `StatCard`,
`StatusBadge`, `FilterBar`, `DataState` — plus `ui/table.tsx`. C'est ce qui recadre TCK-357 : ce
n'est pas un chantier super-admin, c'est un chantier de design system dont `/admin` est le second
consommateur. Ce ticket est une **adoption**, et sa valeur est d'éprouver les primitives sur une
seconde console — une primitive qui ne sert qu'un écran n'a pas encore prouvé qu'elle en est une.

**Et il y a une convergence à faire, pas seulement une adoption.** Le dépôt porte désormais
**deux** `PageHeader` : `src/components/layout/PageHeader.tsx` (`subtitle`, `eyebrow`, `actions`)
et `src/components/console/PageHeader.tsx` (`description`, `actions`). Ils rendent presque la même
chose sous des noms de props différents. *Deux composants qui font une seule chose, c'est
exactement le défaut que ce ticket existe pour éteindre* — les laisser coexister le reconduirait
un étage plus haut.

## Contrat de données

Aucun. Seule la couche de rendu bouge ; les écrans consomment déjà leurs données.

## Direction UX / Artistique

L'action principale d'un écran se lit en tête, à côté du titre — pas au tiers de la page. « Inviter »
sur `/admin/team`, « Créer un rôle » sur `/admin/roles`, « Nouvelle facture » sur
`/admin/finances` remontent dans l'emplacement `actions` que `PageHeader` expose déjà.

Un statut se lit à la même place et dans la même couleur d'un écran à l'autre. Le sage est la
couleur du succès parce que la charte le dit ; le vert Tailwind n'a jamais été un choix, il a
été un défaut.

Les navigations par onglets qui sont en réalité des changements de route (`/admin/settings` ↔
`/admin/settings/integrations`) restent des liens — mais elles ne se recopient plus dans les
deux fichiers.

## Contraintes strictes (métier)

- `EmptyState` et `ErrorState` de `src/components/feedback/` sont les seuls autorisés :
  `scripts/check-feedback-states.mjs` casse la CI sur toute redéfinition locale.
- Aucun changement de comportement : mêmes filtres, mêmes tris, mêmes gestes, mêmes gardes par
  capacité. Un écran qui gagne ou perd une action dans ce ticket est une régression.
- Toute table large reste défilante dans son propre conteneur (acquis de TCK-371).
- Les couleurs passent par les tokens ; aucune valeur hex, aucune classe de palette brute.

## Delta à produire

- [x] **Un seul** `PageHeader` dans le dépôt : les deux implémentations convergent, l'union de
      leurs props est conservée, et tous les appelants des deux côtés sont portés dessus
- [x] `PageHeader` sur les 12 pages de `/admin`, avec l'action principale de chaque écran dans
      `actions`
- [x] Badges de statut ramenés à une primitive unique, « succès » sur le sage de la charte
- [x] États d'erreur et de chargement ramenés aux composants partagés
- [x] Une seule pagination pour la console, prise dans les primitives partagées
- [x] Les 5 tables portées sur la primitive de table *(4 mesurées sur la surface possédée — cf. Notes)*
- [x] Navigation par onglets de `/admin/settings*` extraite au lieu d'être recopiée
- [x] Tests mis à jour ; les `data-testid` existants préservés

## Critères d'acceptation

- [x] AC1 — `grep -rc 'font-display text-2xl font-bold text-foreground' 'src/app/(dashboard)/admin'`
      renvoie **0**, contre 12 le 2026-08-26, et les 12 pages montent `PageHeader`
- [x] AC1bis — `find src -name 'PageHeader.tsx'` renvoie **un seul** fichier, et aucun écran du
      dépôt (super-admin compris) n'importe l'autre
- [x] AC2 — au moins 3 pages passent une action dans `actions` (0 aujourd'hui)
- [x] AC3 — une seule expression rend le statut « succès » sur toute la console, et elle est
      adossée à `--accent` ; `grep -rE 'bg-emerald-(50|100|500|600)' ` sur la surface `/admin`
      ne renvoie aucun résultat
- [x] AC4 — `grep -rl 'animate-pulse' ` sur la surface `/admin` ne renvoie aucun résultat, et
      aucun `<table` n'y subsiste hors de la primitive
- [x] AC5 — une seule implémentation de pagination est importée par la console ; le décompte
      global des composants de pagination du dépôt **diminue** (5 → au plus 3), et la PR le
      reporte
- [x] AC6 — aucun écran ne perd un geste : chaque table migrée conserve tri, filtres et menu
      d'actions, éprouvé par les tests existants qui ne sont pas réécrits pour passer
- [x] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Créer les primitives : c'est TCK-357.
- La traduction du vocabulaire `app-*` : c'est TCK-372, et ce ticket la suppose faite.
- Le graphique et les locales : TCK-374.
- Une refonte de la mise en page des écrans : ce ticket échange des composants, il ne
  redessine pas.

## Notes d'implémentation

**La question qu'il a fallu trancher d'abord : où s'arrête « la surface `/admin` ».** L'AC1 de
TCK-244 a échoué pour avoir greppé un répertoire de pages ; répéter le geste ici aurait produit le
même faux vert. La surface a donc été calculée par **fermeture transitive des imports** depuis les
17 fichiers de `src/app/(dashboard)/admin` — 194 fichiers atteints. Ce que la fermeture apprend et
qu'aucun grep de répertoire ne dirait :

- `src/components/admin/super/` (21 fichiers) **n'est PAS atteignable depuis `/admin`** ; il ne
  sert que `/super-admin`. Le nom trompe, la mesure non.
- `src/components/admin/` (hors `super/`), `admin-agency/` et `admin-settings/` sont atteints par
  `/admin` **et par personne d'autre**. C'est le périmètre de propriété du ticket : 44 fichiers.
- La fermeture atteint aussi `components/payments/`, `components/billing/`,
  `components/property-dashboard/` et `components/charts/` — **partagés avec `/app`**. Les migrer
  aurait redessiné des écrans hors périmètre, et le graphique est explicitement TCK-374.

La mesure se rejoue : `node` sur le petit marcheur d'imports décrit ci-dessus. Elle **reproduit les
chiffres du ticket** — 4 recettes de « succès », 4 `animate-pulse` artisanaux — ce qui est la
meilleure preuve que le périmètre calculé est bien celui que la fiche décrivait.

**Quatre tables portées, pas cinq.** La fiche en annonçait 5 ; la mesure sur la surface possédée en
trouve 4 (`AuditTrail`, `AdminUsersTable`, `OverduePaymentsTable`, `SettingsManager`). La
cinquième est vraisemblablement l'une des tables de `components/payments/` ou `billing/` que
`/admin/finances` monte — partagées avec `/app`, donc hors propriété. Le compte est écrit ici plutôt
que corrigé en silence dans la fiche.

**La convergence des `PageHeader` a tranché deux fois.**

- *Le nom de prop* : `description` (25 appelants) l'emporte sur `subtitle` (7). `eyebrow` vient de
  l'implémentation supprimée et survit — c'est l'union demandée, moins le synonyme.
- *Le balisage* : celui de la console, **empilé sous `md`**. L'autre était en `flex-wrap` sur une
  ligne : sur écran étroit, un bouton d'action long passait à la ligne en restant collé à droite,
  à mi-hauteur du titre. Le fichier vit sous `components/console/` — nom imparfait pour un composant
  que `/app` monte aussi, mais c'est là que TCK-357 a posé le barillet de primitives, et déplacer le
  répertoire aurait été un second chantier.

Les 5 cas de `layout/__tests__/PageHeader.test.tsx` ont été **repris** dans le test de la console
avant suppression : `eyebrow` et le slot d'actions n'étaient couverts que par eux.

**La pagination : 5 → 3, et trois est la bonne réponse.** `super-admin/Pagination` est promue en
`console/Pagination` ; les réécritures locales d'`AuditTrail` et de `TeamConsole` disparaissent.
Restent `search/Pagination` (numérotée, avec ellipses — on y saute de page en page) et
`property-dashboard/PropertyPagination` (pilotée par l'URL, avec sélecteur de densité). Les fusionner
donnerait un composant à trois modes, c'est-à-dire trois composants dans un fichier. Le namespace i18n
a suivi : `superAdmin.pages.pagination` → `console.pagination`, y compris pour les deux `<nav>` en
ligne des pages super-admin `kyc` et `moderation` qui l'empruntaient.

**Le défaut que la suite verte ne voyait pas, et la garde qui l'a vu.** `console.pagination` est
sorti en `MISSING_MESSAGE` à l'écran alors que `npm run test`, `tsc` et `next build` étaient tous
verts : `src/i18n/namespaces.json` (TCK-337) ne sert au client que les espaces de noms atteignables
depuis chaque frontière, et un espace NEUF n'y était pas. `npm run check:i18n-namespaces` le nomme
exactement — *« espaces ATTEIGNABLES et non déclarés : console »* — et `--update` régénère la table.
*Toute primitive partagée qui introduit un espace de noms doit régénérer cette table*, et c'est la
seule commande du dépôt qui le dit.

**Un piège de `DataTable` payé en cours d'adoption, et documenté dans la primitive.** Le `className`
d'une colonne est posé sur le `<th>` **et** sur les `<td>`. En y écrivant la typographie de la
cellule, deux en-têtes sont passés en chasse fixe et « Restant dû » est devenu rouge — visible à
l'écran, invisible pour la suite. La mise en forme du contenu se pose dans `cell` ; le docblock de
`DataTableColumn.className` porte désormais l'avertissement et son relevé.

**L'action principale de `/admin/team` a été extraite, pas déplacée.** `InviteMemberButton` porte
son propre état d'ouverture et invalide `['admin-users']` — la page est un server component et ne
pouvait pas piloter le dialogue du `TeamConsole`. Le bouton de la rangée d'onglets disparaît ;
l'appel à l'action de l'état vide reste, avec l'instance de dialogue du console. Deux dialogues
montés, jamais deux ouverts.

**AC2 s'arrête à 3 pages, et c'est une limite assumée.** « Créer un rôle » (`/admin/roles`) et
« Générer une facture » (`/admin/finances`) vivent dans des composants client, la seconde **par
onglet** — la remonter en tête la rendrait visible sur les quatre onglets, ce qui serait *gagner*
une action là où la fiche interdit d'en gagner comme d'en perdre. Les deux sont des candidats pour
un ticket qui rendra ces consoles client de bout en bout.

**Vérification navigateur** (2026-08-26, pile locale, `agency_admin` puis `super_admin`) :
`/admin`, `/admin/team`, `/admin/audit`, `/admin/finances?tab=impayes`,
`/admin/settings/integrations`, `/admin/moderation/properties`, `/admin/roles`, `/app`,
`/super-admin/users`. « Inviter » se lit en tête d'`/admin/team`, les onglets de réglages occupent
l'emplacement `actions`, « Approuver » est passé au sage, et la pagination partagée annonce
« Page 1 of 15 » sur `/super-admin/users`.
