---
id: TCK-2393
title: "Radar lot 3 : annonceurs classés et observatoire du marché (prix au m², temps de mise sur le marché, quartiers en manque)"
status: doing
phase: P2
family: full
estimate: XL
wave: 80
created: 2026-10-26
updated: 2026-10-30
depends_on: [TCK-2392]
blocks: []
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

- [ ] **Disparition d'une annonce source** : `radar_listings.source_gone_at` et `source_gone_run_id`.
      `radar:observe-sources` (toutes les 15 min) prend, par site, le DERNIER passage `finished` dont
      `reached_end` est vrai ; une annonce de ce site, avec instantanés, jamais revue depuis le début de ce
      passage (`max(last_seen_at) < started_at`) est disparue. Une annonce revue ensuite redevient présente.
- [ ] **Alerte** : une annonce disparue rattachée à un bien (son `property_id`, ou celui de l'annonce dont
      elle est le doublon) écrit l'activité `radar_source_listing_gone` sur le bien — alertable, donc livrée
      par les règles d'alerte existantes.
- [ ] **Observatoire** `GET /api/admin/radar/observatory` (`platform.radar.operate`) : prix au m² par
      quartier, type, contrat et période ; temps de mise sur le marché des annonces disparues ; écart d'offre
      Radar / catalogue par quartier ; annonceurs par nature ; sources disparues de biens publiés. Filtres
      serveur `filter[since]`, `filter[contract]`, `filter[property_type]`, `filter[source_site]` ;
      `fields[radar_observatory]` choisit les sections.
- [ ] **Classement des annonceurs** `GET /api/admin/radar/observatory/advertisers` : par volume
      d'annonces (tri `-listings_count` par défaut), avec quartiers principaux, gamme de prix par contrat,
      sites, nature présumée et piste commerciale (`prospect`, `contacted`, `account`, `upgrade_pending`,
      `agency`, `do_not_contact`). `fields[radar_advertisers]`, `filter[nature]`, `filter[search]`.
- [ ] **Écran super-admin** `/super-admin/radar/observatory` : deux onglets (Annonceurs, Marché), dans le
      design system, lien depuis la console du Radar.

## Critères d'acceptation

- [ ] AC1 — Les agrégats survivent à la purge : l'observatoire calculé avant `RadarPurger::run()` (90 jours
      échus, annonceur STOP supprimé ou vidé) est identique après. Aucune requête de l'observatoire ne lit
      `raw_text`, `extracted`, `source_url`, `phone`, `display_name` ni `similarity_text`.
- [ ] AC2 — Une annonce source disparue lève une alerte sur le bien publié correspondant : une règle active
      sur `radar_source_listing_gone` met en file `SendAdminAlert` avec le bien pour sujet ; une seule fois
      par disparition (un second passage de la commande n'alerte pas).
- [ ] AC3 — « Disparue » ne se conclut que d'un passage `finished` dont `reached_end` est vrai : un passage
      arrêté au plafond de pages, ou échoué, ne marque rien.
- [ ] AC4 — Une annonce revue par un passage postérieur redevient présente (`source_gone_at` à null) et
      pourra de nouveau alerter.
- [ ] AC5 — Le classement trie par volume, ne compte pas les doublons, et rend la piste commerciale
      (compte créé, demande de passage en agence en attente) ; il respecte `fields[radar_advertisers]`.
- [ ] AC6 — Le prix au m² est la médiane du dernier instantané de chaque annonce (prix et surface > 0,
      doublons exclus) ; l'écart d'offre compte les annonces en ligne hors catalogue contre les biens publics
      du même quartier.
- [ ] AC7 — L'écran rend les deux onglets, demande ses colonnes par `fields[]` et filtre par l'API.

## Découpé en suites

- **TCK-2431** — figer chaque jour des compteurs anonymes par nature d'annonceur : la purge remet la nature
  à `unknown`, la part d'intermédiaires ne se mesure donc que sur les annonceurs encore porteurs d'annonces.
- **TCK-2432** — bien publié dont la source a disparu : demander au titulaire si le bien est toujours
  disponible (aujourd'hui, l'alerte prévient seulement l'équipe).

## Hors périmètre

- Une offre « pro solo » et tout retour du courtier dans le code (ADR-0030) : le vocabulaire reste celui
  d'ADR-0077 § 7 (« intermédiaire probable »).
- Une carte géographique des manques : l'écart se lit en tableau.

## Notes d'implémentation

_(à remplir par implementing-specs)_
