---
id: TCK-347
title: "Le formatage des nombres et des dates est figé en français, quelle que soit la langue"
status: todo
phase: P3
family: front
estimate: L
wave: null
created: 2026-08-22
updated: 2026-08-22
depends_on: [TCK-292]
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models: []
tags: [front, i18n, formatting, intl, dette]
---

## Objectif utilisateur

Un utilisateur qui choisit l'anglais lit des **dates et des nombres anglais**, pas des libellés
anglais posés sur un formatage français.

Aujourd'hui il lit « Booking confirmed on 3 février 2026 · 1 250 000 F CFA ». Les mots sont
traduits ; la date et le séparateur de milliers ne le sont pas. C'est le résidu exact que TCK-292
a nommé et laissé derrière lui — *« traduire les libellés ne corrige pas ça »*.

## Contrat de données

Aucun endpoint neuf. Aucun libellé neuf. Le travail consiste à faire dépendre le formatage de la
**locale active** au lieu d'une constante écrite dans le code.

### L'inventaire, mesuré le 2026-08-22

```bash
cd takussan-web
grep -rn "toLocaleString('fr-SN')\|toLocaleDateString('fr-SN'" src/ | wc -l   # → 11
grep -rn "'fr-SN'\|'fr-FR'" src/ | grep -v __tests__ | wc -l                  # → 86
grep -rln "'fr-SN'\|'fr-FR'" src/ | grep -v __tests__ | wc -l                 # → 48
```

**86 occurrences dans 48 fichiers.** Les 11 du premier compte sont la forme que TCK-292 citait ;
elle n'était pas la majoritaire — `'fr-FR'` (63 occurrences, 38 fichiers) l'emporte sur `'fr-SN'`
(23 occurrences, 11 fichiers), ce qui est un second écart : **le format sénégalais et le format
métropolitain cohabitent sans règle**, sur des écrans voisins.

Les fichiers les plus chargés :

| n | fichier | ce qu'il formate |
|---:|---|---|
| 6 | `src/lib/format.ts` | **le seul qui fait déjà bien** — cf. ci-dessous |
| 5 | `src/components/calendar/EventDetailSheet.tsx` | dates et heures d'événement |
| 5 | `src/components/calendar/CalendarPage.tsx` | en-têtes de mois, de semaine, de jour |
| 5 | `src/components/billing/PayoutTable.tsx` | montants et périodes de versement |
| 3 | `src/types/search.ts` | les libellés des jetons de filtre (prix min/max, date) |
| 3 | `src/lib/format/currency.ts` | la table `CURRENCY_METADATA` |
| 3 | `src/components/pipeline/CustomerDetailSheet.tsx` | horodatages du CRM |
| 3 | `src/components/admin/super/SuperAdminPropertiesTable.tsx` | prix et dates |

Les 40 autres portent 1 ou 2 occurrences chacun. La liste complète se reprend à la commande
ci-dessus — **elle ne se recopie pas ici**, elle serait fausse au commit suivant.

### Le patron qui existe déjà, et que personne n'applique

`src/lib/format.ts` **fait la bonne chose depuis toujours** : `toIntlLocale(locale)` mappe
`fr → 'fr-SN'`, `en → 'en-GB'`, `wo → ['wo', 'fr-SN']` (le tableau force un repli explicite,
`wo` n'étant pas dans CLDR). Le correctif n'est donc pas à inventer : il est à **brancher**.

Même situation côté date-fns depuis TCK-292 (2026-08-22) :
`src/lib/format/dateFnsLocale.ts` porte `localeDateFns(locale)`, et trois sites y sont déjà passés
(`ui/date-picker.tsx`, `ui/date-time-picker.tsx`, `dashboard/admin/AgencyRevenueSnapshot.tsx`).
Il en reste un, mesuré le 2026-08-22 : **`src/components/ui/calendar.tsx:31` passe `locale={fr}`
en dur à `<DayPicker>`** — c'est-à-dire que les noms de jours et de mois de TOUS les sélecteurs de
date du produit sont français, y compris ceux dont le bouton, lui, formate désormais en anglais.

### Un troisième écart, du même acabit

`src/i18n/config.ts:52` — `LOCALE_DISPLAY_LABELS.wo` vaut
`{ fr: 'Français', en: 'Anglais', wo: 'Wolof' }` : **la colonne wolof est écrite en français.** Un
utilisateur wolophone qui ouvre le sélecteur de langue lit trois noms français. Les colonnes `fr`
et `en`, elles, sont correctes. Ce n'est pas du formatage, mais c'est la même faute — une table de
langue remplie pour la langue par défaut et jamais pour les autres — et elle est trop petite pour
mériter son propre ticket.

## Contraintes strictes (métier)

1. **XOF n'a pas de sous-unité.** `CURRENCY_METADATA.XOF` déclare `decimalPlaces: 0` : changer de
   locale ne doit pas faire apparaître de décimales sur un montant en francs CFA.
2. **Le fuseau reste `Africa/Dakar`** (`src/i18n/config.ts`), quelle que soit la langue. C'est une
   décision déjà prise et déjà payée : TCK-292 a mesuré qu'y déroger décalait un journal d'audit
   de deux heures sous `TZ=Europe/Paris`. La locale gouverne la FORME, pas l'instant.
3. **Le wolof retombe sur `fr-SN` pour le formatage**, et ce n'est pas un oubli : ni CLDR ni
   date-fns ne fournissent `wo`. Ce repli doit rester **explicite** dans le code (un tableau
   `['wo', 'fr-SN']`, un `?? fr`), jamais implicite — `Intl` retombe silencieusement sur la locale
   racine, c'est-à-dire un formatage de type anglais, quand on lui passe un seul tag inconnu.
4. **`'fr-FR'` et `'fr-SN'` ne sont pas interchangeables** : trancher lequel est le français du
   produit fait partie du ticket, et le résultat vaut pour les 86 sites.

## Delta à produire

- [ ] Trancher `'fr-FR'` vs `'fr-SN'` pour la locale `fr`, et l'écrire une fois — dans
      `toIntlLocale`, pas dans 38 fichiers.
- [ ] Remplacer les 86 occurrences par les helpers de `src/lib/format.ts` (`formatDate`,
      `formatNumber`, `formatCurrency`) et de `src/lib/format/dateFnsLocale.ts`, en passant la
      locale active (`useLocale()` côté client, `getLocale()` côté serveur).
- [ ] `src/components/ui/calendar.tsx:31` — `locale={fr}` → `locale={localeDateFns(useLocale())}`.
- [ ] `src/i18n/config.ts:52` — écrire la colonne `LOCALE_DISPLAY_LABELS.wo` en wolof.
- [ ] **Une garde**, sans quoi les 86 reviennent : refuser tout littéral BCP-47 (`'fr-FR'`,
      `'fr-SN'`, `'en-GB'`, …) hors de `src/lib/format*`, et refuser `from 'date-fns/locale'` hors
      de `src/lib/format/dateFnsLocale.ts`. Le patron maison est
      `scripts/i18n-exceptions.mjs` : exception par SITE, avec sa raison écrite, et une exception
      périmée qui fait rougir. La prouver par MUTATION, pas par lecture.

## Critères d'acceptation

- [ ] AC1 — la garde ci-dessus existe, sort en **0** sur `dev`, et sort en **1** quand on
      réintroduit un `toLocaleDateString('fr-FR')` dans un composant. Les deux sorties sont
      consignées dans le ticket.
- [ ] AC2 — un test de rendu monte le MÊME composant sous `fr`, `en` et `wo`, et **assère trois
      chaînes différentes** pour la même date et le même montant. ⚠ Ce critère est écrit ainsi
      exprès : « la locale est passée au helper » se coche aussi avec un helper qui ignore son
      argument.
- [ ] AC3 — le rendu **français** est inchangé, caractère pour caractère, sur les surfaces
      touchées. Toute divergence est nommée comme dérogation, à la manière de TCK-292 — jamais
      cochée en silence.
- [ ] AC4 — `npx tsc --noEmit`, `npm run lint`, `npm run test` et `npm run build` verts.

## Hors périmètre

- **Le texte lui-même.** Les libellés sont l'objet de TCK-292, qui est clos sur ce point.
- **La qualité du wolof.** Écrit mais non relu : c'est la réserve permanente de TCK-292, et elle
  demande un locuteur, pas une garde.
- **Le formatage produit par l'API.** `takussan-api` émet des dates ISO et des décimales
  (ADR-0018, ADR-0009) : rien à y formater. Ce ticket est entièrement front.

## Notes d'implémentation

**Pourquoi aucun ticket ne couvrait déjà ça** — vérifié le 2026-08-22 :

- [TCK-153](TCK-153-formats-devise-date-harmonises.md) (« Formats devise & date —
  harmonisation FR site-wide », `done`, 2026-05-05) fait l'**inverse** : il a figé le français
  partout, ce qui était le bon geste avant que `en` et `wo` existent réellement à l'écran. C'est
  précisément son résultat qu'il faut maintenant paramétrer — pas défaire.
- TCK-327 porte la sérialisation des dates **côté backend** (ADR-0018) : la forme sur le fil, pas
  la forme à l'écran.
