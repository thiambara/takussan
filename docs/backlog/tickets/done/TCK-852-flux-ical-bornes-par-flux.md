---
id: TCK-852
title: "Les flux iCal et d'agenda sont bornés par flux (30/min), et par IP à 600/min"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-851]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-flux-ical-lus-par-airbnb-bookingcom-et-google-agenda-sont-bornés-par-ip-de-la-plateforme-pas-par-flux"
tags: [back, calendrier, rate-limiting, pistes]
---

## Contexte

Réf : **P37.02** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`ical-export` (`GET /ical/{token}.ics`) et `calendar-feed` (`GET /api/calendar-feed/{token}.ics`)
valaient 30 par minute **par IP**. Les plateformes tierces (ADR-0041) relisent les flux de tous
leurs utilisateurs depuis des machines communes : au-delà de 30 flux par minute depuis une même
IP, le suivant recevait 429, et le calendrier exporté cessait de se mettre à jour chez elles.

## Décision du porteur

30 par minute et par flux (clé par jeton haché), plus une borne de 600 par minute et par IP

## Objectif utilisateur

Le calendrier d'un bien ou l'agenda d'un utilisateur reste à jour sur Airbnb, Booking.com ou
Google Agenda, quel que soit le nombre de flux que la plateforme relit depuis la même machine.

## Contrat de données

Aucun endpoint changé. Les deux limiteurs rendent deux `Limit` :
- `perMinute(30)->by('flux:'.hash('sha256', <jeton>))` ;
- `perMinute(600)->by('ip:'.<clé IP de TCK-851>)`.

## Contraintes strictes (métier)

- Le jeton n'apparaît jamais en clair dans une clé de cache.
- La clé par IP est celle de tous les limiteurs (le /64 d'une IPv6, TCK-851).

## Delta à produire

- [x] `AppServiceProvider::bootRateLimiters()` : `ical-export` et `calendar-feed`.
- [x] Test : `tests/Feature/RateLimiting/CalendarFeedThrottleTest.php`.

## Critères d'acceptation

- [x] AC1 — 31 flux distincts lus depuis une même IP en une minute : aucun 429 (les deux routes).
- [x] AC2 — 31 lectures d'un même flux : la 31ᵉ reçoit 429.
- [x] AC3 — Les deux bornes valent 30/min par flux et 600/min par IP ; la clé par flux ne contient
      pas le jeton et ne dépend pas de l'IP.

## Hors périmètre

- Les IP et la fréquence réelles des plateformes tierces (non mesurées).
- `calendar-feed-create` (l'enregistrement d'un flux importé, par utilisateur).

## Notes d'implémentation

- Reproduit avant correctif : 31 flux distincts depuis une même IP → le 31ᵉ reçoit 429, sur les
  deux routes.
- Ablation : limiteurs remis à `'ip:'` seul → 4 rouges (AC1 et AC3 sur les deux routes) ; AC2
  reste vert des deux côtés, il garde que la borne par flux tient toujours.
- La borne s'applique aussi à un jeton inconnu (le débit passe avant le contrôleur) : un essai de
  jetons ouvre un seau par jeton essayé, et c'est la borne de 600 par IP qui le freine.
