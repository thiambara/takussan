---
id: TCK-853
title: "Mandataires : en-têtes de confiance restreints, liste d'IP des webhooks par plage, joker signalé"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-20"
tags: [back, securite, proxies, webhooks, sante, pistes]
---

## Contexte

Réf : **P37.06** du fichier de pistes, `validé` par le porteur (critère accordé : V5, avec le V2
de la liste d'IP des webhooks que cite le même classement).

Trois écarts relevés : `trustProxies(at: …)` est appelé sans `headers:`, si bien que Laravel croit
aussi `X-Forwarded-Host` et `-Prefix` d'un mandataire de confiance (les URL rendues par l'API en
dépendent) ; `RestrictIpMiddleware` compare l'IP par égalité de chaîne (ni plage CIDR, ni forme
canonique d'une IPv6) ; `TRUSTED_PROXIES=*` devient le tableau `['*']`, que `TrustProxies` ne
reconnaît pas : posé par erreur, il ne croit personne, sans erreur.

## Décision du porteur

`headers:` restreint à `FOR | PROTO | PORT`, `IpUtils::checkIp` dans `RestrictIpMiddleware` ; un `TRUSTED_PROXIES` qui contient `*` donne un `Log::critical` et une sonde de santé `degraded`, sans refus au démarrage ; reste : la phrase du plan, hors agents

## Reste à faire

la phrase du plan, hors agents

## Objectif utilisateur

L'équipe plateforme voit une configuration de mandataires fautive sur la page Santé, les URL
rendues par l'API ne prennent pas leur hôte d'un en-tête, et un opérateur de SMS dont l'IP est
annoncée par plage ou en IPv6 n'est plus refusé en 403.

## Contrat de données

- `App\Support\TrustedProxyList` : `fromEnvironment()` (la liste que reçoit `trustProxies`) et
  `hasWildcard()`.
- `HealthcheckService` : une sonde `proxies`, `degraded` (`reason: wildcard_trusts_nobody`) quand
  la liste contient `*` ou `**`, et un `Log::critical` à chaque sonde qui le constate.

## Contraintes strictes (métier)

- Aucun refus au démarrage : la liste reste passée telle quelle à `TrustProxies`.
- Aucune valeur d'environnement changée.

## Delta à produire

- [x] `bootstrap/app.php` : `trustProxies(at: TrustedProxyList::fromEnvironment(), headers: FOR | PROTO | PORT)`.
- [x] `RestrictIpMiddleware` : `IpUtils::checkIp`.
- [x] `HealthcheckService::proxies()`.
- [x] Test : `tests/Feature/Http/Proxies/TrustedProxiesTest.php`.

## Critères d'acceptation

- [x] AC1 — D'un mandataire de confiance, `X-Forwarded-For`, `-Proto` et `-Port` sont crus ;
      `X-Forwarded-Host` et `-Prefix` ne changent ni l'hôte de la requête ni `url()`.
- [x] AC2 — Liste `203.0.113.0/24, 2001:db8::1` : `203.0.113.50` et `2001:0db8:0000::0001`
      passent, `198.51.100.1` et `2001:db8::2` reçoivent 403.
- [x] AC3 — `TRUSTED_PROXIES=10.0.1.0/24,*` : la sonde `proxies` est `degraded` et un
      `Log::critical` nomme `TRUSTED_PROXIES` ; une liste explicite laisse la sonde `ok`, sans
      journal.

## Hors périmètre

- La phrase du plan (reste du porteur, hors agents).
- L'affichage de la sonde `proxies` dans la console super-admin : elle compte dans le statut
  global et dans les alertes d'exploitation (`ops_health_degraded` liste les sondes en défaut),
  mais `system-health.tsx` n'énumère que ses dix sondes.
- Le relais réel de `X-Forwarded-Host` par Cloudflare et Traefik (non mesuré).

## Notes d'implémentation

- Reproduit avant correctif (`TrustedProxiesTest`, 4 rouges) : d'un mandataire `127.0.0.1`,
  `X-Forwarded-Host: piege.example` devenait l'hôte de la requête ; `2001:0db8:0000::0001` et
  `203.0.113.50` refusés pour une liste `2001:db8::1, 203.0.113.0/24` ; aucune sonde `proxies`.
- Ablation, un correctif à la fois : `headers:` retiré → AC1 seul rougit ; égalité de chaîne
  remise → AC2 seul ; sonde retirée → les deux cas d'AC3.
- Hypothèse : le `Log::critical` part de la sonde (`health:probe`, chaque minute), pas du
  démarrage, qui le répéterait à chaque requête. La transition d'alerte `ops_health_degraded` le
  porte déjà par Telegram, sans répétition.
- Le test pose `$_SERVER['TRUSTED_PROXIES']` (lu par `env()`) et le rend en `tearDown`.
