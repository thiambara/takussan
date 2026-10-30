---
id: TCK-2438
title: "Radar : les URL de départ de la collecte se règlent dans la console, plusieurs par site"
status: done
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

- [x] Une colonne `start_urls` (jsonb, nullable) sur `radar_crawl_sources`, sans modèle neuf. Migration avec un
      `down()` juste.
- [x] `PATCH /api/admin/radar/crawl/sources/{site}` accepte `start_urls` : une liste, vide ou nulle pour revenir à
      l'URL de la configuration. Même route et même capacité que les autres réglages (`platform.radar.publish`).
- [x] Garde-fous côté serveur, au réglage ET au passage :
  - `https` seulement ;
  - l'hôte appartient aux hôtes que déclare l'adaptateur du site ;
  - ni identifiants ni port ;
  - un nombre d'URL et une longueur bornés en configuration ;
  - pas de doublon.
- [x] `RadarCrawler` lit chaque URL de départ à la suite, avec sa pagination. Le budget de pages et de temps reste
      celui du passage entier. Le passage ne part jamais d'une autre URL que celles-là, ou à défaut de celle de la
      configuration.
- [x] L'observatoire (TCK-2393) ne conclut à aucune disparition sur la foi d'un changement des URL de départ.
- [x] L'onglet Collecte (`/super-admin/radar/collecte`) montre les URL de départ de chaque site et permet à qui règle
      la source de les modifier.
- [x] Amendement daté d'ADR-0080.

## Critères d'acceptation

- [x] AC1 — Un `super_admin` enregistre plusieurs URL de départ pour un site. Un passage lit chacune, et la pagination
      de chacune, dans la limite des pages du passage entier.
- [x] AC2 — Une liste vide ou nulle rend l'URL de la configuration au passage suivant.
- [x] AC3 — Le réglage est refusé (422) pour une URL `http`, d'un autre hôte, avec identifiants ou port, trop longue,
      en double, ou au-delà du nombre permis. Rien n'est enregistré.
- [x] AC4 — Une URL invalide écrite en base hors de la console n'est jamais lue par un passage.
- [x] AC5 — Le `support` lit les URL de départ, mais ne les modifie pas (403).
- [x] AC6 — Une annonce qui sort du périmètre des URL de départ n'est pas déclarée disparue. Un passage n'atteint la
      fin (`reached_end`) que si chaque liste a été lue jusqu'au bout.
- [x] AC7 — L'écran affiche et enregistre les URL de départ, et montre le refus de l'API.

## Hors périmètre

- Un site de plus (TCK-2424), et un collecteur navigateur (TCK-2425).
- Régler les hôtes permis depuis la console : ils restent déclarés par le code de l'adaptateur.
- Une fréquence ou un plafond de pages par URL de départ.

## Notes d'implémentation

- **Garde-fous, un seul endroit** : `RadarStartUrls`. L'hôte se lit avec l'analyseur de Guzzle, le même que celui
  d'`UrlFetcher`. Les hôtes permis sont déclarés par l'adaptateur (`startHosts()`), dans le code. `forRun()` rejuge au
  passage ce que la requête a jugé à l'enregistrement.
- **Une seconde colonne, `radar_crawl_runs.start_urls`, en plus de celle du brief.** La veille de TCK-2393 conclut à la
  disparition d'une annonce après deux passages complets sans elle. Restreindre les URL aurait donc déclaré disparue chaque
  annonce sortie du périmètre, avec une alerte et la question au titulaire (TCK-2432). Le passage note son périmètre
  EFFECTIF (l'URL de la configuration résolue comprise), trié et sans doublon. Un passage ne compte contre une annonce
  que si son périmètre CONTIENT celui du passage qui l'a vue en dernier (jsonb `@>`). Un passage antérieur à la colonne
  (nulle) se lit comme l'URL actuelle de la configuration du site (`RadarStartUrls::legacyPerimeterJson()`).
- **Les arrêts** :
  - Le plafond de pages, le budget de temps et le créneau pris arrêtent le PASSAGE.
  - Une boucle, une page sans carte ou une lecture refusée n'arrêtent que la LISTE : la suivante est lue, mais
    `reached_end` reste faux. L'arrêt du passage est alors celui de la première liste qui n'a pas atteint sa fin.
  - Avec une seule liste, le comportement de TCK-2392 est inchangé : ses tests passent tels quels.
- **Codes de refus** (422) : `radar.crawl.start_urls_too_many`, `start_url_too_long`, `start_url_invalid`,
  `start_url_host` (avec `params.hosts`), `start_url_duplicate`. Chacun porte `params.field` (`start_urls.N`).
  Arrêt de passage neuf : `radar.crawl.no_start_url`.

### Décisions prises en autonomie, à revoir

1. **Hôtes permis : une liste exacte par adaptateur**, `www.expat-dakar.com` + `expat-dakar.com`, et
   `sn.coinafrique.com` seul. Écarté : tout sous-domaine du site. Raison : un sous-domaine inconnu
   (`admin.`, un autre pays de CoinAfrique) n'est pas une page de liste du Radar ; on élargit la liste dans le code si
   besoin.
2. **Plafonds : 10 URL par site, 500 caractères chacune** (`radar.crawl.max_start_urls`, `start_url_max_length`, en
   configuration sans variable d'environnement). Écarté : une URL par site. Raison : moins restrictif (une page par ville
   ou par catégorie), alors que le budget de pages reste global.
3. **Une source dont aucune URL réglée ne passe ne lit rien** (`radar.crawl.no_start_url`). Écarté : retomber sur
   l'URL de la configuration. Raison : un repli silencieux lirait une page que le porteur a choisi de ne plus lire.
4. **Une liste refusée laisse lire les suivantes.** Écarté : arrêter le passage à la première liste en échec. Raison :
   une faute de frappe dans une URL ne doit pas éteindre les autres listes du site.
5. **Seconde colonne `radar_crawl_runs.start_urls`, au-delà du brief** (« une seule colonne neuve sur
   `radar_crawl_sources` », qui est respecté). Écarté : couper la détection de disparition pour les sources réglées.
   Raison : cela retirait l'observatoire dès qu'on se sert du réglage. La session en a été avertie.
6. **Règle d'inclusion (consigne de la session, à revoir)** : un passage compte si son périmètre contient celui du
   passage qui a vu l'annonce en dernier. Élargir ne coupe donc pas la détection. Restreindre suspend le jugement d'une
   annonce jusqu'à ce qu'elle soit revue ; une annonce retirée du site au moment même de la restriction n'est plus
   jugée. Écarté : l'égalité stricte, qui coupait aussi la détection à l'élargissement (l'inclusion ne coûte qu'un
   opérateur `@>`).
7. **Périmètre effectif, jamais nul (consigne de la session, à revoir)** : le passage note l'URL de la configuration
   résolue, triée et sans doublon. Un changement de l'URL dans `config/radar.php` change ainsi le périmètre. Les passages
   antérieurs à la colonne se lisent comme l'URL ACTUELLE de la configuration. C'est une supposition : si cette URL a
   changé depuis, un ancien passage est jugé sur la nouvelle. Écarté : nul pour « la configuration », car « nul = nul »
   aurait caché un changement de l'URL dans le code.
