---
id: TCK-2438
title: "Radar : les URL de départ de la collecte se règlent dans la console, plusieurs par site"
status: todo
phase: P2
family: full
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2392]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, collecte, adr-0080]
---

## Objectif utilisateur

Le porteur choisit, depuis la console, les pages de liste que la collecte lit sur chaque site. Par exemple une page
par ville ou par catégorie. Il n'a plus besoin d'un déploiement pour cela.

## Contexte

Décision du porteur A7 (2026-10-30, `.superpowers/sdd/decisions-autonomes.md`) : « on commence par les sites déjà
adaptés (Expat-Dakar et CoinAfrique), mais ça doit être configurable dans les paramètres ». TCK-2392 (ADR-0080) règle
déjà par site, dans la console : l'allumage, la fréquence, les pages au plus et l'opérateur. Mais
`config('radar.crawl.sites.<site>.start_url')` reste figé dans le code, avec une seule URL par site.

Le serveur lit lui-même ces URL : les régler depuis la console ouvre une requête vers une cible choisie par
quelqu'un. ADR-0080 est amendé.

## Delta à produire

- [ ] Une colonne `start_urls` (jsonb, nullable) sur `radar_crawl_sources`, sans modèle neuf. Migration avec un
      `down()` juste.
- [ ] `PATCH /api/admin/radar/crawl/sources/{site}` accepte `start_urls` : une liste, vide ou nulle pour revenir à
      l'URL de la configuration. Même route et même capacité que les autres réglages (`platform.radar.publish`).
- [ ] Garde-fous côté serveur, au réglage ET au passage :
  - `https` seulement ;
  - l'hôte appartient aux hôtes que déclare l'adaptateur du site ;
  - ni identifiants ni port ;
  - un nombre d'URL et une longueur bornés en configuration ;
  - pas de doublon.
- [ ] `RadarCrawler` lit chaque URL de départ à la suite, avec sa pagination. Le budget de pages et de temps reste
      celui du passage entier. Le passage ne part jamais d'une autre URL que celles-là, ou à défaut de celle de la
      configuration.
- [ ] L'observatoire (TCK-2393) ne conclut à aucune disparition sur la foi d'un changement des URL de départ.
- [ ] L'onglet Collecte (`/super-admin/radar/collecte`) montre les URL de départ de chaque site et permet à qui règle
      la source de les modifier.
- [ ] Amendement daté d'ADR-0080.

## Critères d'acceptation

- [ ] AC1 — Un `super_admin` enregistre plusieurs URL de départ pour un site. Un passage lit chacune, et la pagination
      de chacune, dans la limite des pages du passage entier.
- [ ] AC2 — Une liste vide ou nulle rend l'URL de la configuration au passage suivant.
- [ ] AC3 — Le réglage est refusé (422) pour une URL `http`, d'un autre hôte, avec identifiants ou port, trop longue,
      en double, ou au-delà du nombre permis. Rien n'est enregistré.
- [ ] AC4 — Une URL invalide écrite en base hors de la console n'est jamais lue par un passage.
- [ ] AC5 — Le `support` lit les URL de départ, mais ne les modifie pas (403).
- [ ] AC6 — Une annonce qui sort du périmètre des URL de départ n'est pas déclarée disparue. Un passage n'atteint la
      fin (`reached_end`) que si chaque liste a été lue jusqu'au bout.
- [ ] AC7 — L'écran affiche et enregistre les URL de départ, et montre le refus de l'API.

## Hors périmètre

- Un site de plus (TCK-2424), et un collecteur navigateur (TCK-2425).
- Régler les hôtes permis depuis la console : ils restent déclarés par le code de l'adaptateur.
- Une fréquence ou un plafond de pages par URL de départ.

## Notes d'implémentation

_(à remplir par implementing-specs)_
