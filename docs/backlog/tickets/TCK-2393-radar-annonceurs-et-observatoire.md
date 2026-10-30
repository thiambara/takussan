---
id: TCK-2393
title: "Radar lot 3 : annonceurs classés et observatoire du marché (prix au m², temps de mise sur le marché, quartiers en manque)"
status: review
phase: P2
family: full
estimate: XL
wave: 80
created: 2026-10-26
updated: 2026-10-30
depends_on: [TCK-2392]
blocks: [TCK-2431, TCK-2432]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, observatoire, commercial, adr-0077, adr-0083]
---

## Objectif utilisateur

Le porteur voit quels annonceurs pèsent sur le marché (les agences qui ne nous connaissent pas
encore), ce que vaut le mètre carré par quartier, combien de temps un bien reste en ligne, et où
Takussan manque d'annonces.

## Contexte

Lot 3 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md#les-lots). Il mesure aussi **la part
réelle d'intermédiaires** que le porteur estime à plus de 90 % : l'argument d'une éventuelle offre
« pro solo » (ADR-0077 § 7), qui reste une décision à part. Décision structurelle :
[ADR-0083](../../adr/0083-l-observatoire-du-marche.md).

## Re-mesure (2026-10-30, sur `origin/feat/radar-collecte-automatique` `c3c3d638b`)

- Les instantanés existent en schéma (`radar_listing_snapshots`, migration `2026_10_30_392100`) ; leur
  écrivain (`App\Services\Radar\Crawl\RadarSnapshots`, TCK-2392) n'est pas encore sur la base. Une annonce
  saisie à la main n'a aucun instantané.
- `radar_crawl_runs.reached_end` existe ; `RadarCrawlStatus::Finished` dit un arrêt normal.
- La purge (`RadarPurger`) ne supprime **aucune** ligne d'annonce : elle vide `raw_text`, `source_url`,
  `photo_urls`, `extracted` et passe l'étape à `purged`. Les instantanés (clé `cascadeOnDelete`) survivent
  donc. Elle **supprime** un annonceur sans refus ni message, et remet `nature` à `unknown` sur celui qu'elle
  garde.
- Le système d'alertes : `AuditActivity::created` → `DispatchAlerts` → `AlertRuleService::dispatchForActivity`,
  qui ne part que pour un événement de `AlertableEvents::keys()` et une règle active.
- Le bien relie son quartier par son adresse polymorphe (`addresses.geo_neighborhood_id`).

## Delta à produire

- [x] **Disparition d'une annonce source** : `radar_listings.source_gone_at` et `source_gone_run_id`.
      `radar:observe-sources` (toutes les 15 min) prend, par site, le DERNIER passage `finished` dont
      `reached_end` est vrai ; une annonce de ce site, avec instantanés, jamais revue depuis le début de ce
      passage (`max(last_seen_at) < started_at`) est disparue. Une annonce revue ensuite redevient présente.
- [x] **Alerte** : une annonce disparue rattachée à un bien (son `property_id`, ou celui de l'annonce dont
      elle est le doublon) écrit l'activité `radar_source_listing_gone` sur le bien — alertable, donc livrée
      par les règles d'alerte existantes.
- [x] **Observatoire** `GET /api/admin/radar/observatory` (`platform.radar.operate`) : prix au m² par
      quartier, type, contrat et période ; temps de mise sur le marché des annonces disparues ; écart d'offre
      Radar / catalogue par quartier ; annonceurs par nature ; sources disparues de biens publiés. Filtres
      serveur `filter[since]`, `filter[contract]`, `filter[property_type]`, `filter[source_site]` ;
      `fields[radar_observatory]` choisit les sections.
- [x] **Classement des annonceurs** `GET /api/admin/radar/observatory/advertisers` : par volume
      d'annonces (tri `-listings_count` par défaut), avec quartiers principaux, gamme de prix par contrat,
      sites, nature présumée et piste commerciale (`prospect`, `contacted`, `account`, `upgrade_pending`,
      `agency`, `do_not_contact`). `fields[radar_advertisers]`, `filter[nature]`, `filter[search]`.
- [x] **Écran super-admin** `/super-admin/radar/observatory` : deux onglets (Annonceurs, Marché), dans le
      design system, lien depuis la console du Radar.

## Critères d'acceptation

- [x] AC1 — Les agrégats survivent à la purge : les sections du marché (`summary`, `price_per_m2`,
      `time_on_market`, `supply_gap`, `gone_sources`) calculées avant `RadarPurger::run()` (90 jours échus,
      annonceur STOP vidé) sont identiques après. Aucune requête de l'observatoire ne lit
      `raw_text`, `extracted`, `source_url`, `phone`, `display_name` ni `similarity_text`.
- [x] AC2 — Une annonce source disparue lève une alerte sur le bien publié correspondant : une règle active
      sur `radar_source_listing_gone` met en file `SendAdminAlert` avec le bien pour sujet ; une seule fois
      par disparition (un second passage de la commande n'alerte pas).
- [x] AC3 — « Disparue » ne se conclut que d'un passage `finished` dont `reached_end` est vrai : un passage
      arrêté au plafond de pages, ou échoué, ne marque rien.
- [x] AC4 — Une annonce revue par un passage postérieur redevient présente (`source_gone_at` à null) et
      pourra de nouveau alerter.
- [x] AC5 — Le classement trie par volume, ne compte pas les doublons, et rend la piste commerciale
      (compte créé, demande de passage en agence en attente) ; il respecte `fields[radar_advertisers]`.
- [x] AC6 — Le prix au m² est la médiane du dernier instantané de chaque annonce (prix et surface > 0,
      doublons exclus) ; l'écart d'offre compte les annonces en ligne hors catalogue contre les biens publics
      du même quartier.
- [x] AC7 — L'écran rend les deux onglets, demande ses colonnes par `fields[]` et filtre par l'API.

## Découpé en suites

- **TCK-2431** — figer chaque jour des compteurs anonymes par nature d'annonceur : la purge remet la nature
  à `unknown`, la part d'intermédiaires ne se mesure donc que sur les annonceurs encore porteurs d'annonces.
- **TCK-2432** — bien publié dont la source a disparu : demander au titulaire si le bien est toujours
  disponible (aujourd'hui, l'alerte prévient seulement l'équipe).

## Hors périmètre

- Une offre « pro solo » et tout retour du courtier dans le code (ADR-0030) : le vocabulaire reste celui
  d'ADR-0077 § 7 (« intermédiaire probable »).
- Une carte géographique des manques : l'écart se lit en tableau.

## Reste sur dev

Rien côté code : chaque AC est prouvé par un test exécuté (`tests/Feature/Radar/Observatory/`, ablations faites).
Le ticket reste `review` pour la seule règle n° 2 du backlog : sa dépendance TCK-2392 (collecte automatique) est
encore `doing` sur sa branche. **TCK-2393 passe à `done` dès la fusion de TCK-2392** : la session qui fusionne
la PR de TCK-2392 puis celle-ci le bascule, dans le même geste que TCK-2392.

## Notes d'implémentation

- **Le vrai passage de collecte est éprouvé** (`RadarSourceWatchCrawlTest`, sur les pages écrites à la main de
  TCK-2392) : `started_at` est posé au début du passage, chaque carte revue écrit `last_seen_at = now()`, et
  `reached_end` n'est vrai que sans page suivante. La règle « `max(last_seen_at) < started_at` du dernier passage
  complet » repose sur ces trois faits.
- **Confirmé par n2392 (TCK-2392)** : `started_at` est posé au passage `queued` → `running`, `last_seen_at = now()`
  ensuite (colonnes à la seconde, inégalité tenue) ; `reached_end` n'est écrit qu'avant `STOP_END`. Deux conséquences,
  dites à l'écran : avec `max_pages` à 5 (défaut), une liste plus longue n'atteint jamais `reached_end` et rien n'est
  constaté sur ce site tant que le plafond n'est pas monté (20 au plus) ; « disparue » veut dire absente de la liste de
  départ de l'adaptateur, pas forcément supprimée du site. Une annonce purgée revue par la collecte reçoit des
  instantanés : elle peut être marquée disparue (donnée anonyme, aucune alerte sans bien).
- **`natures` n'est pas anonyme** et ne survit pas à la purge (elle remet la nature à `unknown`) : c'est pourquoi
  AC1 porte sur les sections du marché, et pourquoi TCK-2431 existe. Le garde de colonnes (`raw_text`,
  `extracted`, `source_url`, `phone`, `display_name`, `similarity_text`, `nature_signals`) couvre toutes les
  sections, `natures` comprise.
- **`fields[radar_observatory]`** n'est pas un sparse fieldset de table : il choisit les sections calculées. Le garde
  du front TCK-1184 le range parmi les `fields` sans `$queryFields` (`HORS_BUILD_QUERY`).
- **Le classement ajoute toujours `id`, `user_id` et `do_not_contact_at` au sparse fieldset** : la piste commerciale
  les lit. `user_id` est donc rendu même non demandé (le numéro, lui, ne l'est pas).
- `sort=listings_count` est une sous-requête corrélée (`RadarAdvertiserListingsSort`) : sûre aussi sur la route des
  files, qui ne pose aucun `withCount` de ce nom.

### Décisions prises en autonomie, à revoir

1. **Fenêtre d'observation** : aucune par défaut, toute l'histoire ; `filter[since]` la borne. Écarté : 90 jours
   imposés, qui cacheraient l'historique au porteur.
2. **Seuil d'échantillon** : aucun ; chaque ligne rend son compte. Écarté : masquer les groupes de moins de N
   annonces, qui déciderait à la place du lecteur.
3. **Lien qui alerte** : le bien publié par l'annonce, celui de l'annonce dont elle est le doublon, ET le bien du
   catalogue dont elle est le doublon (`link` dans l'activité). Écarté : la seule annonce publiée, qui tairait la
   disparition d'une copie sur un autre site.
4. **Alerte même si le bien n'est plus public** (`property_public` dans l'activité). Écarté : filtrer, la règle peut
   être coupée.
5. **Fréquence** de `radar:observe-sources` : toutes les 15 minutes, comme `radar:crawl`. Écarté : un appel en fin de
   passage depuis le job de TCK-2392, qui couplerait les deux lots.
6. **Droits** : `platform.radar.operate` (support et au-dessus), comme la liste de travail. Écarté : `super_admin`
   seul, plus restrictif sans raison (lecture seule).
7. **Classement** : tout annonceur qui porte au moins une annonce vivante (ni purgée, ni doublon), STOP compris
   (piste `do_not_contact`). Écarté : cacher les STOP, qui fausserait le poids des annonceurs.
8. **Ce que l'écran montre** : 30 lignes par tableau du marché (les plus fournies, triées par l'API), 50 sources
   disparues au plus. Écarté : pagination par tableau, plus lourde pour un premier écran.
9. **Durées** : médiane et moyenne en jours décimaux, censure à gauche assumée et dite à l'écran. Écarté : exclure
   les annonces vues au premier passage d'un site, qui viderait l'indicateur les premières semaines.
