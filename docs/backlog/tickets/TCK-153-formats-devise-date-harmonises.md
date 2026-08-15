---
id: TCK-153
title: "Formats devise & date — harmonisation FR site-wide"
status: done
phase: P1
family: front
estimate: M
wave: 17
created: 2026-05-04
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#13-réservations--paiements
    - docs/features.md#14-baux
tags: [front, bug, p2, smoke-test-2026-05-04, i18n, formatting, intl]
---

## Objectif utilisateur

Un utilisateur qui consulte les listings et fiches détail (biens, réservations, baux, états des lieux, recherches sauvegardées, messagerie) voit toujours les montants au même format (FR, devise XOF en suffixe, espace insécable comme séparateur de milliers) et les dates en français (mois en toutes lettres FR, ou format numérique FR `DD/MM/YYYY`).

## Contrat de données

Pas de contrat backend modifié. Les formats sont gérés côté frontend via `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' })` et `Intl.DateTimeFormat('fr-FR', …)`.

## Direction UX / Artistique

- **Devise XOF** — format unique : `1 970 000 F CFA` (FR, espace insécable, suffixe `F CFA`). Référence existante : `/app/properties` rend déjà ce format ; `/app/favorites` aussi.
- **Date** — format long : `13 mai 2026, 16:15` ; format court : `13/05/2026`. Pas de mélange dans une même ligne.
- Helpers exposés via un module `format` partagé (un `formatXOF`, un `formatDateFR` court, un `formatDateTimeFR` long).

## Contraintes strictes (métier)

- Pas de fallback `toLocaleString()` sans paramètre — toujours expliciter `'fr-FR'`.
- Le helper `formatCurrency` existant (cf. TCK-130 Notes — `@/lib/format`) doit être étendu/utilisé, pas réinventé.
- Backward-compat : si un montant arrive en `string`, le helper doit le coercer proprement (et logguer un warning dev si NaN).

## Delta à produire

- [x] **Frontend** — Vérifier l'existence et l'API de `@/lib/format` (`formatCurrency`, `formatNumber`) et étendre si besoin pour `formatDateFR` / `formatDateTimeFR`
- [x] **Frontend** — Remplacer toutes les occurrences listées dans le rapport :
  - `/app/bookings` + `[id]` — actuellement `F CFA 966,689` (US, préfixe, virgule) → `966 689 F CFA`
  - `/app/leases` — actuellement `F CFA 500,000 / mois` → `500 000 F CFA / mois`
  - `/app/saved-searches` — actuellement `1142038` raw → `1 142 038 F CFA` (à conjuguer avec TCK-154)
  - Toutes pages avec dates `13 May 2026` / `27 Apr 2026` / `2 Jun 2026` → format FR
  - `/app/maintenance` (cards) — supprimer le mix `27 Apr 2026 · Prévu 27/04/2026` ; choisir un seul format (recommandé : `27/04/2026 · Prévu 27/04/2026` ou `27 avr. 2026 · Prévu 27 avr. 2026`)
- [x] **Tests frontend** — Tests unitaires sur les helpers (`formatXOF` avec `1142038 → "1 142 038 F CFA"`, `formatDateFR` avec un Date → format FR connu)

## Critères d'acceptation

- [ ] Aucun montant XOF rendu avec virgule comme séparateur de milliers ou avec préfixe `F CFA `
- [ ] Aucune date rendue avec un mois en anglais (`May`, `Jun`, `Apr`, `Mar`, `Feb`, `Jan`, `Dec`, `Nov`, `Oct`, `Sep`, `Aug`, `Jul`)
- [ ] Sur `/app/maintenance`, une carte affiche un seul format de date (pas le mix EN + FR)
- [ ] `/app/saved-searches` rend des prix formatés (plus de `1142038` raw)
- [ ] Tests unitaires des helpers passent

## Hors périmètre

- Localisation des formats en Wolof / autres locales
- Format de monnaie alternative (EUR, USD) — le projet est mono-devise XOF
- Refonte du module `lib/format` au-delà de l'ajout des helpers manquants

## Notes d'implémentation

- Source de reproduction : `docs/smoke-tests/agent-smoke-test-2026-05-04.md`, bugs **P2-2** (devise) et **P2-3** (date).
- Helper existant `@/lib/format.formatCurrency` (vu dans TCK-130 Notes) — ne pas en créer un autre.
- Astuce Intl : pour XOF, `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', currencyDisplay: 'code' })` rend `1 970 000 XOF` (et non `F CFA`). Si on veut le suffixe `F CFA`, post-processer ou hard-coder via `formatNumber` + suffixe (alignement avec `/app/properties` actuel).
- Lien fort avec TCK-154 (le prix raw sur `saved-searches` est à la fois un bug i18n et un bug formatage).

**Implémentation 2026-05-05 :**
- **Root cause devise** : `format.ts::formatCurrency` utilisait `Intl.NumberFormat('fr-SN', {style:'currency', currency:'XOF'})` qui rend "XOF" au lieu de "F CFA". Fix : délégation à `currency.ts::formatCurrency` qui construit le format manuellement ("150 000 F CFA") via métadata par devise.
- **Impact** : tous les appelants de `formatCurrency` depuis `@/lib/format` bénéficient automatiquement du fix — bookings, leases, maintenance, overview, etc.
- **Root cause date** : `CustomerDetailSheet.tsx` utilisait `new Date().toLocaleString()` sans locale explicite → dates en anglais selon la locale système. Fix : remplacement par `toLocaleDateString('fr-FR', {...})` avec mois en français (3 occurrences).
