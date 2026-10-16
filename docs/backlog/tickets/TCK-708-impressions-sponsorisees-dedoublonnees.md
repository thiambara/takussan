---
id: TCK-708
title: "Une impression sponsorisée se compte une fois par visiteur et par bien sur 30 min, et jamais sur un 304"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#94-propertyboostdailystat-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-1--recherche-dun-bien
tags: [api, boost, search, pistes]
---

## Contexte

Réf : **P01.04** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`BoostStatsRecorder::impressions()` ajoute une impression à chaque bien sponsorisé servi, à chaque
appel, sans dédoublonnage. Or un changement de filtre sur la liste publique déclenche deux
recherches (le rendu serveur, puis le client), et une revalidation ETag qui finit en 304 rejoue
toute la recherche (`SetCacheHeaders` appelle le contrôleur avant de comparer l'ETag). Les
impressions, métrique montrée aux agences (ADR-0061 §10), sont donc gonflées.

## Décision du porteur

impression dédoublonnée par visiteur et par bien sur 30 min, aucune sur un 304

## Objectif

Sur les routes publiques qui servent des emplacements sponsorisés (recherche et accueil), une
impression ne se compte qu'une fois par visiteur et par bien sur 30 minutes, et aucune quand la
réponse est un 304.

## Delta à produire

- [x] `BoostStatsRecorder` : mode différé (`deferImpressions`, `commitImpressions(?visiteur)`,
      `discardImpressions`) ; le dédoublonnage par `Cache::add` sur une clé visiteur × bien de 30 min.
      Hors mode différé (appel direct, console), le comportement est inchangé.
- [x] Middleware `CountBoostImpressions` (alias `boost.impressions`) : diffère, laisse passer la
      requête, valide les impressions avec l'empreinte du visiteur (`VisitorFingerprint`), sauf sur
      un 304, une réponse d'erreur ou une exception.
- [x] Le middleware sur `public/properties/search` (à l'extérieur de `cache.headers:etag`, pour
      voir le 304) et `public/properties/discovery`.
- [x] Tests `tests/Feature/Boost/SponsoredImpressionsTest.php`.

## Critères d'acceptation

- [x] AC1 — Deux recherches du même visiteur à moins de 30 min comptent une impression.
- [x] AC2 — Une recherche d'un autre visiteur en compte une de plus.
- [x] AC3 — Après 30 min, le même visiteur en compte une de plus.
- [x] AC4 — Une revalidation qui rend 304 ne compte rien, même au-delà de 30 min.
- [x] AC5 — L'accueil (`discovery`) dédoublonne de même.

## Hypothèses (mode sans humain)

- « Visiteur » = l'empreinte `VisitorFingerprint` (HMAC de l'IP, le /64 en IPv6), celle des
  signalements et des limiteurs publics. Le rendu serveur du front transmet l'IP du visiteur
  (`X-Forwarded-For`, `takussan-web/src/lib/api.ts`) : ses deux recherches tombent sur la même clé.
  Sans IP, l'impression se compte sans dédoublonnage.
- Un même bien servi deux fois dans une réponse compte une impression.

## Hors périmètre

- La double recherche par changement de filtre côté front (rendu serveur puis client), qui reste un
  coût : la décision du porteur ne porte que sur la définition de l'impression.

## Notes d'implémentation

- Ablation : `app/`, `bootstrap/` et `routes/` remis à leur version de `pre-dev` (middleware
  retiré) → 3 rouges, « 2 is identical to 1 » sur chacun ; correctif remis → 3 verts.
- Piège : l'ordre des middlewares. `['cache.headers:etag', 'boost.impressions']` (le compteur
  à l'intérieur) → AC4 seul rouge : `SetCacheHeaders` joue le contrôleur avant de comparer l'ETag,
  et seul un middleware qui l'enveloppe voit le 304.
- `BoostStatsRecorder` est désormais `scoped` : le middleware et le service partagent l'instance
  de la requête. Hors du middleware (`impressions()` appelé directement, console), le comptage
  reste immédiat et sans dédoublonnage : `BoostStatsTest` est inchangé.
- `php bin/impacted-tests.php --run` bascule en suite entière (`bootstrap/app.php` est global) :
  arrêté, remplacé par les classes qui citent la recherche, l'accueil, le compteur ou l'ETag.
