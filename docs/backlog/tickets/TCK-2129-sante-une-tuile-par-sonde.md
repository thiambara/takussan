---
id: TCK-2129
title: "La page de santé de la console rend une tuile pour chacune des quatorze sondes de l'API"
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-219--clés-next-intl-bâties-sur-une-valeur-venue-de-lapi"
tags: [front, api, super-admin, sante, garde, pistes]
---

## Contexte

Réf : **P219.01** du fichier de pistes, `validé (délégué)` (V7 accordé). `HealthcheckService::probe()`
émet quatorze sondes et un `status` global qui est le pire de toutes ; la page de santé
(`system-health.tsx`) n'en rendait que dix. Avec `scheduler` seul en `failed`, elle disait
« État général : En panne » au-dessus de dix « OK ».

## Décision du porteur (déléguée)

quatre tuiles neuves, `whatsapp`, `scheduler`, `proxies` et `lemon_squeezy_webhook`, ajoutées à `CHECKS` dans la même grille et par le même `HealthTile` que les dix autres (patron de TCK-600), avec leurs quatre clés `superAdmin.systemHealth.checks.*` en `fr` et `en` (le `wo` au texte français) et les quatre sondes ajoutées à `PlatformHealth` comme `HealthcheckStatus` ; pas de ligne « autres sondes » ; garde : un test PHP qui compare les clés de sonde de `HealthcheckService::snapshot()` (hors `status` et `generated_at`) à la liste `CHECKS` lue dans `system-health.tsx`, comme `BookingQuoteConcordanceTest` lit le front, et un test vitest qui monte la page avec `scheduler` seul en `failed` et exige son libellé à l'écran ; reste : les motifs `wildcard_trusts_nobody` et `signing_secret_missing`, traités par P219.02

## Objectif utilisateur

L'opérateur de la plateforme voit sur la page de santé quelle sonde met l'état général en panne
ou en dégradé.

## Contrat de données

Aucun changement d'API : `GET` de la santé plateforme émet déjà les quatre sondes
(`whatsapp`, `scheduler`, `proxies`, `lemon_squeezy_webhook`). Le type `PlatformHealth` du front
les déclare désormais comme `HealthcheckStatus`.

## Delta à produire

- [x] `CHECKS` de `system-health.tsx` : quatre tuiles neuves, dans l'ordre de `probe()`, par le
  même `HealthTile`.
- [x] `superAdmin.systemHealth.checks.{whatsapp,scheduler,proxies,lemon_squeezy_webhook}` en `fr`
  et `en`, le `wo` au texte français (wolof en pause).
- [x] `PlatformHealth` : `whatsapp`, `scheduler` (avec `last_run_at`), `proxies`,
  `lemon_squeezy_webhook` comme `HealthcheckStatus`.
- [x] Fixture partagée `takussan-api/tests/fixtures/healthcheck-sondes.json` (les quatorze sondes),
  sur le patron de `booking-quote.json` (TCK-530).
- [x] Test PHP `HealthcheckTuilesConcordanceTest` : clés de sonde de `HealthcheckService::snapshot()`
  (hors `status`, `generated_at`) = sondes de la fixture.
- [x] Test vitest `system-health.concordance.test.ts` : clés de `CHECKS` lues dans `system-health.tsx`
  = sondes de la fixture.
- [x] Test vitest `system-health.sondes.test.tsx` : `scheduler` seul en `failed` → « Planificateur »
  à l'écran, et deux « En panne ».

## Critères d'acceptation

- [x] AC1 — Une sonde ajoutée à `probe()` sans tuile, ou une tuile sans sonde, rougit le test PHP ou le
  test vitest de concordance.
- [x] AC2 — Le planificateur seul en panne est nommé à l'écran, sous `fr`.
- [x] AC3 — Les quatorze tuiles se rendent, chacune datée.

## Reste à faire

- les motifs `wildcard_trusts_nobody` et `signing_secret_missing`, traités par P219.02

## Hors périmètre

- Les compteurs de WhatsApp (`attempts_1h`, `failure_rate_1h`) et `last_run_at` du planificateur
  ne sont pas affichés sur la tuile : la décision ne le demande pas.

## Notes d'implémentation

- Le test PHP appelle `snapshot()` : sous `CACHE_STORE=array`, le cache est neuf à chaque test, et l'instantané est donc celui de `probe()`.
- **Écart de forme avec la décision, imposé par une garde** : la décision veut un test PHP qui lit
  `CHECKS` dans `system-health.tsx`. Écrit ainsi (premier commit de test), il rougit
  `scripts/check-ci-attestation.mjs` : un test de l'API qui lit un fichier hors de
  `PERIMETRES.api` laisserait passer une attestation périmée (ADR-0063), et l'y ajouter modifie une
  garde existante (V9, fermé). La concordance passe donc par une fixture lue par les deux suites,
  exactement le patron de `BookingQuoteConcordanceTest` que cite la décision ; `CHECKS` reste lue
  dans `system-health.tsx`, par le test vitest.
- Ablation : retirer les quatre entrées de `CHECKS` fait rougir les deux cas de
  `system-health.sondes` (« Unable to find … Planificateur », « … WhatsApp ») ; retirer `scheduler`
  de `CHECKS` rougit `system-health.concordance`, et le retirer de la fixture rougit le test PHP.
- Les deux fixtures existantes (`system-health.etats`, `system-health.i18n`) passent `scheduler`
  à `{ status: 'ok', last_run_at }` : le type exige un statut ; sans `checked_at`, leurs comptes de
  « Sondé à » ne bougent pas.
