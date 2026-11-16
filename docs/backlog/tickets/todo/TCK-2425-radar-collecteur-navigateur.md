---
id: TCK-2425
title: "Radar : un service de collecte séparé (navigateur sans tête), si la lecture depuis l'API échoue face aux protections des sites"
status: todo
phase: P3
family: back
estimate: L
wave: 80
created: 2026-10-30
updated: 2026-11-16
depends_on: [TCK-2392]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, infra, radar, collecte, adr-0077]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai, bloqué par une condition non remplie** (décision du porteur du 2026-10-30,
« pas de navigateur sans tête tant qu'aucun site retenu n'exige JavaScript », et « plus tard » posé sur
ce ticket). Aucun service Playwright ou navigateur dans `deploy/` ni `docker-compose.yml` : la lecture
passe par `app/Services/Radar/UrlFetcher.php` seul. Aucun relevé de `radar_crawl_runs` n'est consigné
dans `docs/` : le critère de déclenchement n'a jamais été mesuré. Le seul candidat à rendu client est
Facebook (TCK-2424), lui-même suspendu à une vérification de ses CGU.

**Condition exacte qui débloque** : `radar_crawl_runs` en préproduction montre un site retenu en échec
répété — `stop_reason` `radar.fetch.http_error`, ou `cards_skipped` (colonne de la migration
`2026_11_04_246830`) égal à toute la page —, **ou** le porteur retient un site à rendu client.
Alors seulement : ADR (conteneur, mémoire, mises à jour), puis service et pilote derrière `UrlFetcher`.

## Décision du porteur (2026-10-30)

**Pas de navigateur sans tête tant qu'aucun site retenu n'exige JavaScript** : sans réponse du porteur sur ce point,
la recommandation tient.

> **Constat de la session (non vérifié juridiquement)**, à vérifier par le porteur avant tout travail sur ce ticket
> pour Facebook : Facebook, cité comme site suivant (TCK-2424), exigerait un navigateur sans tête (connexion, rendu
> côté client), et ses conditions d'utilisation interdiraient la collecte automatisée.

## Objectif utilisateur

La collecte continue de fonctionner sur un site qui ne sert plus ses pages à un simple client HTTP.

## Contexte

Le [plan](../../../plans/2026-10-26-radar-et-socle-ia.md#les-lots) n'envisage un service séparé
(Playwright) que si la lecture depuis l'API échoue. TCK-2392 lit les pages par `UrlFetcher`. Le
journal `radar_crawl_runs` dira, passage après passage, si un site refuse (`stop_reason`
`radar.fetch.http_error`, page sans carte — *et, depuis le 2026-11-04, la colonne `cards_skipped`*).

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
