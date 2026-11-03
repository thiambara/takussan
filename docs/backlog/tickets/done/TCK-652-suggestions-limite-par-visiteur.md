---
id: TCK-652
title: "Suggestions de recherche : limite de débit par visiteur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-15
updated: 2026-10-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
    - docs/features.md#12-recherche--découverte-publique
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-1--recherche-dun-bien
tags: [back, search, autocomplete, rate-limit, pistes]
---

## Objectif utilisateur

Un visiteur qui tape dans la barre de recherche reçoit ses suggestions, quel que soit le nombre
d'autres visiteurs qui tapent en même temps.

## Contrat de données

Aucun endpoint neuf. `GET /api/search/suggest` (`routes/api/search.php`, `throttle:search-suggest`)
garde son plafond de 60 requêtes par minute ; seule la clé de comptage change.

Réf : **P01.03** du fichier de pistes. La règle attendue est écrite dans TCK-107 (« rate-limit
60 req/min/IP », AC5 « depuis la même IP ») et dans le commentaire du limiteur.

## Contraintes strictes (métier)

- Plafond inchangé : 60 par minute.
- La clé est celle des limiteurs publics voisins (`visitorRateLimitKey()` : l'utilisateur si un
  jeton Sanctum valide est présent, sinon le /64 ou l'IP résolue par la chaîne de confiance).

## Delta à produire

- [x] `AppServiceProvider::bootRateLimiters()` : `search-suggest` porte
      `->by($this->visitorRateLimitKey($request))`, et son commentaire dit ce que fait le code.
- [x] `tests/Feature/Api/Search/SearchSuggestTest.php` : un test à deux IP distinctes ; retrait du
      `RateLimiter::clear()` qui visait une clé inexistante.

## Critères d'acceptation

- [x] AC1 — après 60 appels depuis une IP, le 61ᵉ depuis la même IP rend 429.
- [x] AC2 — après ces 61 appels, un appel depuis une autre IP rend 200.

## Hors périmètre

- Le plafond lui-même (60/min) et l'anti-rebond du front.
- Les autres limiteurs nommés.

## Notes d'implémentation

- Hypothèse (mode sans humain) : la clé `visitorRateLimitKey()` des limiteurs `public-*` est la
  bonne ; elle compte un utilisateur connecté par son compte plutôt que par son IP, ce qui reste
  « par visiteur » au sens de TCK-107.
- Ablation : limiteur ramené à `fn () => Limit::perMinute(60)` →
  `test_rate_limit_is_counted_per_visitor_ip` rouge (« Expected response status code [200] but
  received 429 ») ; correctif remis → vert.
- Le `RateLimiter::clear('search-suggest|'.request()->ip())` de l'ancien test visait une clé que
  Laravel ne produit pas (`md5(nom.clé)`) : il est retiré plutôt que corrigé, le stockage `array`
  repartant vide à chaque test.
