---
id: TCK-721
title: "Les dates et les nombres du front suivent la langue de l'application, site public d'abord (P06.05)"
status: done
phase: P2
family: front
estimate: M
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
    - docs/features.md#111-avis--réputation
  models: []
tags: [front, i18n, intl, formatting, site-public, garde, pistes]
---

## Objectif utilisateur

Un visiteur qui lit la fiche publique d'un bien, d'une agence ou d'un agent en anglais y lit des
dates anglaises — « 12 Oct 2026 », pas « 12 oct. 2026 » —, et un utilisateur connecté lit dans sa
langue les montants des baux, les dates de sa liste de biens et l'heure de ses sessions.

## Contrat de données

Aucun endpoint neuf, aucun libellé neuf. Les dates restent celles que l'API sert (ISO) ; seul le
formatage change de source : la **locale active** de next-intl au lieu d'un littéral (`'fr-FR'`,
`'fr-SN'`, `'fr'`) ou de la locale du navigateur (`toLocaleString()` nu).

La forme juste est celle que porte l'en-tête de `scripts/check-locale-figee.mjs` :
`useFormatteurs()` dans un composant client, `useLocale()` + `@/lib/format` dans un composant qui
peut se rendre côté serveur, et une `Locale` reçue en paramètre par une fonction de module.

## Direction UX / Artistique

Aucune. Le rendu français ne change pas de forme, sauf les deux écarts nommés dans les notes.

## Contraintes strictes (métier)

1. Le fuseau reste `Africa/Dakar` (`@/lib/format`) partout où le formatage passe par lui ; le
   calendrier garde l'horloge du navigateur, délibérément (`components/calendar/dates.ts`).
2. `wo` retombe sur `fr-SN` pour `Intl.DateTimeFormat`/`NumberFormat` (décision de
   `lib/format.ts`) et sur `fr` pour `Intl.RelativeTimeFormat` (Chrome ne sert pas `wo`).
3. Le cliquet `PLAFOND_RESTE` de `scripts/check-locale-figee.mjs` descend **dans le même diff**,
   au compte exact : la garde échoue s'il monte ET s'il descend.

## Delta à produire

- [x] Site public : `PropertyReviews.tsx` (date de l'avis et de la réponse),
      `PropertyPriceHistory.tsx` (date du changement), `public/profile/ReviewsSection.tsx` (mois
      de l'avis, fiches d'agence et d'agent).
- [x] Baux : `DepositRefundModal` (3 montants), `LeaseRenewalDialog` (2),
      `EarlyTerminationBanner` (1), `EarlyTerminationDialog` (1) — `toLocaleString()` nus →
      `fmt.nombre()`.
- [x] « Mes biens » : `PropertyList.tsx` (date absolue `'fr-SN'` et date relative `'fr'`),
      `PropertyKpiStrip.tsx` (compteurs).
- [x] `PropertyModerationBanner.tsx` (date d'approbation), `ActiveSessionsSection.tsx`
      (dernière activité).
- [x] Recherche : `FilterSidebar.tsx` (rappel de budget) ; `types/search.ts` (puce
      `available_from`) reçoit la locale par `TraducteursDeFiltre.locale`, champ obligatoire,
      fourni par `SearchToolbar` et `SavedSearchesList`.
- [x] `components/calendar/dates.ts` : la lecture du fuseau passe la locale de l'app.
- [x] `scripts/check-locale-figee.mjs` : `PLAFOND_RESTE` 20 → 1, avec sa ligne d'historique.
- [x] Tests : `fiche-publique.dates.tck-721.test.tsx` (avis et historique de prix, `en` et `fr`),
      `ReviewsSection.dates.tck-721.test.tsx` (`en` et `fr`).

## Critères d'acceptation

- [x] AC1 — sous `en`, `PropertyReviews`, `PropertyPriceHistory` et `ReviewsSection` ne rendent
      aucune forme française (`oct.`, `octobre`) et rendent la date anglaise attendue ; sous `fr`,
      la date française. Vérifié par ablation (cf. notes).
- [x] AC2 — `node scripts/check-locale-figee.mjs` sort en 0 avec `RESTE DU DÉPÔT : 1 (cliquet 1)`.
- [x] AC3 — `npm run lint` (0 erreur), `npx tsc --noEmit`, les `npm run check:*` et les tests des
      fichiers touchés sont verts.

## Hors périmètre

- Les appels à `@/lib/format` qui passent une `Locale` **littérale** (`formatCurrency(x, 'fr')`) :
  la garde ne les voit pas, et ils restent à TCK-347 (inventaire dans les notes).
- Les montants formatés par `lib/format/currency.ts` sans locale (paramètre par défaut `fr-SN`,
  trou T3 de la garde), y compris les prix de `PropertyPriceHistory`.
- `lib/utils.ts` (`formatRelativeDate`, cliquet n°2 de la garde) : appelé par les cartes de bien.
- `lib/visites/heure-de-dakar.ts` : cf. notes.

## Notes d'implémentation

**Comptes de la garde** (`node scripts/check-locale-figee.mjs --report`) :

| | avant (2026-10-16) | après |
|---|---:|---:|
| périmètre des consoles | 0 | 0 |
| console hors périmètre (cliquet 2) | 1 (`lib/utils.ts`) | 1 (inchangé) |
| reste du dépôt (cliquet 3) | 20 sur 15 fichiers | **1** sur 1 fichier |

**Le cas laissé, et pourquoi** — `lib/visites/heure-de-dakar.ts:27`,
`new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', … }).formatToParts(…)`. Ce
formateur n'affiche rien : il **lit** l'heure murale de Dakar, partie par partie, et chaque partie
est relue par `Number(...)`. La locale fixe garantit des chiffres latins et un cycle 0-23 ; la
remplacer par la locale de l'app ne corrigerait rien et fragiliserait le calcul. La garde n'a
aucune forme d'exemption par site (seul `EXEMPTS`, réservé aux fichiers « dont la raison d'être EST
de manipuler des locales », et dont l'élargissement est une des trois façons de la désarmer que
son en-tête nomme) : l'occurrence reste donc **comptée**, et le cliquet vaut 1, pas 0.

**Le cas tranché autrement que prévu** — `components/calendar/dates.ts` ne formatait rien non plus
en dur : `Intl.DateTimeFormat().resolvedOptions().timeZone` lit le fuseau du NAVIGATEUR, ce que le
module veut (son en-tête l'explique). La garde le comptait comme « formateur sans locale ». Le
correctif passe la locale de l'app au constructeur : le fuseau rendu est identique (il ne dépend
pas de la locale), et plus aucun formateur du module ne suit la langue du navigateur. Ce n'est pas
un littéral déguisé ; si la revue juge que c'est flatter la garde, la remise en l'état coûte une
ligne et `PLAFOND_RESTE = 2`.

**Écarts de rendu français, assumés** :

- `FilterSidebar` : « ≥ 150 000 FCFA » devient « ≥ 150 000 F CFA » (`fmt.montant`), la forme des
  puces de la barre depuis TCK-552.
- `ActiveSessionsSection` : `toLocaleString('fr-FR')` (« 16/10/2026 14:03:00 ») devient
  `fmt.dateTime` (« 16 oct. 2026, 14:03 »), à Dakar.
- `PropertyList`, `PropertyReviews`, `PropertyPriceHistory`, `ReviewsSection`, `types/search.ts` :
  les dates se lisent désormais à `Africa/Dakar` au lieu du fuseau de la machine — même chaîne au
  rendu serveur et client, et la date `available_from` (`AAAA-MM-JJ`, minuit UTC) ne recule plus
  d'un jour sur un navigateur à l'ouest de Greenwich.

**Composants serveur.** `ReviewsSection` est rendu par les pages serveur d'agence et d'agent, et
`PropertyKpiStrip` par la page serveur de « Mes biens » : `useFormatteurs.ts` étant un module
`'use client'`, ils passent par `useLocale()` + `@/lib/format` (le patron de
`PropertyCharacteristics`). Les deux tests de `PropertyKpiStrip` montaient le composant sans
provider : ils passent désormais par `withIntl`.

**Ablation** — sur l'arbre, sans stash : les trois fichiers publics remis à une locale française
fixe (`toLocaleDateString('fr-FR', …)` pour `PropertyReviews`, `'fr'` passé à `formatDate` pour
les deux autres), puis les deux fichiers de test lancés : **3 rouges sur 6** — exactement les
trois cas `en` (`expected [ '12 oct. 2026' ] to deeply equal [ '12 Oct 2026' ]`,
`expected 'Awa D. · octobre 2026' to contain 'October 2026'`), les cas `fr` restant verts. Fichiers
restaurés, 6 verts.

**Ce qui reste de TCK-347 après ce ticket** (mesuré le 2026-10-16) :

1. Les appels à `@/lib/format` avec une `Locale` littérale, invisibles à la garde : au moins 11
   sites sur une ligne, dans `dashboard/DashboardMeKpis.tsx` (5), `leases/CreateLeaseForm.tsx` (2),
   `property-dashboard/PropertyList.tsx` (2, les prix), `property-dashboard/PropertyPriceHistoryList.tsx`
   (2) — plus les formes sur plusieurs lignes, à recompter.
2. Le paramètre par défaut `fr-SN` de `lib/format/currency.ts` (`formatPrice`, `formatCurrency`
   sans locale), trou T3 de la garde : les prix des cartes, des puces et de l'historique de prix.
3. `lib/utils.ts` `formatRelativeDate` (`'fr'`), le cliquet n°2.
4. `components/ui/calendar.tsx` : `locale={fr}` de date-fns toujours en dur.
5. `i18n/config.ts` : la colonne `LOCALE_DISPLAY_LABELS.wo` toujours écrite en français.
6. Le volet « garde » de TCK-347 est couvert par `check-locale-figee.mjs` pour `Intl` et
   `toLocale*`, pas pour `from 'date-fns/locale'`.
7. Son AC2 (trois chaînes différentes en `fr`, `en`, `wo`) est inatteignable tel qu'écrit depuis
   que `lib/format.ts` a tranché `wo → fr-SN` : à réécrire.

TCK-347 n'est donc **pas** couvert ; ses comptes (86 sites, 48 fichiers) sont périmés.
