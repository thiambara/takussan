---
id: TCK-851
title: "Tous les limiteurs et compteurs par IP comptent le /64 d'une IPv6, pas l'adresse"
status: done
phase: P2
family: back
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-limiteurs-dauthentification-et-les-compteurs-de-vues-comptent-une-ipv6-entière-pas-son-64"
tags: [back, securite, rate-limiting, pistes]
---

## Contexte

Réf : **P37.01** du fichier de pistes, `validé` par le porteur (critère accordé : V2).

`visitorRateLimitKey()` ramène une IPv6 à son /64 par `VisitorFingerprint::network` (verif-597
m6) : un abonné IPv6 dispose d'un /64 entier, et une adresse neuve repartait avec un compteur
neuf. Les autres limiteurs nommés (`auth-register`, `auth-password`, `auth-phone-send`,
`ical-export`, `calendar-feed`, les accusés de webhook, et les replis par IP des limiteurs
authentifiés), les débits numériques (`throttle:N,M`, signés par `ThrottleRequests` sur
`$request->ip()`) et les deux compteurs de déduplication (vue d'un bien, clic sponsorisé) se
clés encore par l'adresse brute.

## Décision du porteur

une seule fonction de clé par IP, `VisitorFingerprint::network`, pour tous les limiteurs et compteurs qui lisent `$request->ip()`, débits numériques des routes publiques compris ; un test par limiteur

## Objectif utilisateur

Un client IPv6 ne contourne plus une borne d'authentification, d'envoi de SMS ou de comptage en
changeant d'adresse dans son propre /64.

## Contrat de données

Aucun endpoint neuf, aucune valeur de borne changée. Seule la **clé** change : `ip:<adresse>`
devient `ip:<VisitorFingerprint::network(adresse)>` (une IPv4 reste elle-même ; une IPv4-mappée
est déballée ; une IPv6 devient `<préfixe>::/64`).

## Contraintes strictes (métier)

- Les clés d'un appelant authentifié (`user:<id>`) ne changent pas.
- Les valeurs des bornes ne changent pas.

## Delta à produire

- [x] `AppServiceProvider` : une clé par IP unique (`clientNetwork()`), employée par tous les limiteurs
      nommés qui lisent `$request->ip()`, et par `visitorRateLimitKey()`.
- [x] `App\Http\Middleware\ThrottleRequestsByNetwork` : `ThrottleRequests` dont la signature
      d'un appelant sans compte prend le /64 ; alias `throttle` dans `bootstrap/app.php`.
- [x] `PropertyViewCounter::cle()` et `BoostStatsRecorder::click()` : le /64.
- [x] Tests : `tests/Feature/RateLimiting/IpRateLimitKeyTest.php` (un cas par limiteur nommé, le
      parcours `forgot-password`, le débit numérique de `auth/login`, la vue d'un bien) et
      `BoostStatsTest::test_les_clics_se_comptent_par_64_d_une_ipv6`.

## Critères d'acceptation

- [x] AC1 — Pour chaque limiteur nommé qui se clé par IP, deux adresses du même /64 donnent les
      mêmes clés, et une adresse d'un autre /64 des clés différentes.
- [x] AC2 — Six `POST /api/auth/forgot-password` depuis six adresses d'un même /64 : le sixième
      reçoit 429.
- [x] AC3 — Six `POST /api/auth/login` (`throttle:5,10`) depuis six adresses d'un même /64 : le
      sixième reçoit 429 ; un autre /64 n'est pas refusé.
- [x] AC4 — Cinq vues d'un bien depuis cinq adresses d'un /64, puis une d'un autre /64 : 4 vues
      comptées. Même chose pour les clics sponsorisés.

## Hors périmètre

- La part réelle de clients IPv6 derrière Cloudflare (non mesurable depuis le poste).
- La clé par flux des calendriers (P37.02, ticket à part).
- Les clés `user:` des appelants authentifiés.

## Notes d'implémentation

- Reproduit avant correctif : 15 limiteurs nommés sur 23 donnaient deux clés à deux adresses du
  même /64 (les 8 qui passaient déjà par `visitorRateLimitKey()` étaient verts) ; six
  `forgot-password` et six `login` depuis un même /64 → aucun 429 ; vues et clics → 6 au lieu de 4.
- Ablation : correctif retiré (provider, compteurs, alias) → 19 rouges ; l'alias `throttle` seul
  retiré → seul le débit numérique rougit. Les limiteurs nommés ne passent pas par
  `resolveRequestSignature()` : leur clé est celle du `Limit`.
- Le préfixe des clés ne change pas (`ip:`, `emetteur:`, `user:`…), seule la partie IP.
- `ThrottleRequestsByNetwork` remplace l'alias `throttle` ; la priorité des middlewares suit,
  `SortedMiddleware` lisant les classes parentes.
