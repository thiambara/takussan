---
id: TCK-2425
title: "Radar : un service de collecte séparé (navigateur sans tête), si la lecture depuis l'API échoue face aux protections des sites"
status: todo
phase: P3
family: back
estimate: L
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2392]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, infra, radar, collecte, adr-0077]
---

## Décision du porteur (2026-10-30)

**Pas de navigateur sans tête tant qu'aucun site retenu n'exige JavaScript** (recommandation conservée par le porteur).
Facebook, cité comme site suivant (TCK-2424), l'exigerait (connexion, rendu côté client), et ses conditions
d'utilisation interdisent la collecte automatisée : **à trancher par le porteur avant tout travail** sur ce ticket
pour Facebook.

## Objectif utilisateur

La collecte continue de fonctionner sur un site qui ne sert plus ses pages à un simple client HTTP.

## Contexte

Le [plan](../../plans/2026-10-26-radar-et-socle-ia.md#les-lots) n'envisage un service séparé
(Playwright) que si la lecture depuis l'API échoue. TCK-2392 lit les pages par `UrlFetcher`. Le
journal `radar_crawl_runs` dira, passage après passage, si un site refuse (`stop_reason`
`radar.fetch.http_error`, page sans carte).

## Delta à produire

- [ ] Décider sur la mesure de `radar_crawl_runs` en préproduction, ADR à l'appui (un conteneur de
      plus, sa mémoire, ses mises à jour).
- [ ] Le service, et le pilote de lecture qui le remplace derrière `UrlFetcher` pour les sites qui le
      demandent, sans perdre la protection SSRF ni le respect du `robots.txt`.

## Critères d'acceptation

- [ ] AC1 — Un site marqué « navigateur » est lu par le service ; les autres restent lus par l'API.

## Hors périmètre

- Contourner une protection explicite (CAPTCHA, connexion) : le Radar ne lit que le public.

## Notes d'implémentation

_(à remplir par implementing-specs)_
