---
id: TCK-2392
title: "Radar lot 2 : collecte automatique planifiée (Expat-Dakar, CoinAfrique), instantanés datés et fusion des doublons entre sources"
status: done
phase: P2
family: full
estimate: XL
wave: 80
created: 2026-10-26
updated: 2026-10-30
depends_on: [TCK-2387]
blocks: [TCK-2393]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, collecte, pgvector, adr-0077, adr-0076, adr-0080]
---

## Objectif utilisateur

La liste à démarcher se remplit pendant la nuit : le Radar trouve lui-même les nouvelles annonces,
suit leurs changements de prix, et ne présente qu'une fiche pour la même maison vue sur trois sites.

## Contexte

Lot 2 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md#les-lots). Ticket de cap : il sera
découpé (un ticket par adaptateur au moins) quand le lot 1 aura éprouvé l'extraction sur de vraies
annonces. Le service de collecte séparé (Playwright) n'est envisagé que si la lecture depuis l'API
échoue face aux protections des sites.

## Re-mesure (2026-10-30, sur `origin/feat/radar-revocation-purge`)

- La chaîne du lot 1 existe : `RadarListingIntake::fromUrls()` (empreinte `url|…` de l'URL canonique,
  unique), `ExtractRadarListing` (file `ai`, `RunsOnAiQueue`, lit la page puis appelle le modèle),
  `UrlFetcher` (SSRF, `robots.txt`, créneau par domaine `radar.fetch.min_delay_seconds`),
  `RadarMatcher` (trois signaux : téléphone, quartier + prix + chambres, photo dHash).
- **L'extraction est jugée au nom de `captured_by`** (`AiAuthority::allows()` refuse un acteur nul) :
  une annonce collectée sans opérateur ne s'extrairait jamais. La collecte a donc un opérateur.
- `TCK-344` n'a pas créé la table `embeddings`, ni l'extension `vector`. `vector` n'est **pas** une
  extension de confiance (`vector.control` sans `trusted = true`) : la créer exige un superutilisateur.
  `pg_trgm` l'est (`trusted = true`). Le rôle `embedding` de `config/ai.php` n'a aucun maillon.
- Un doublon (`duplicate`) est une étape terminale, sans retour : rien ne défait un « doublon de ».
- La purge (`RadarPurger`) vide `source_url`, mais garde `content_fingerprint` : une URL purgée revue
  par la collecte reste connue et ne renaît pas.

## Delta à produire

- [x] **Adaptateurs** (`App\Services\Radar\Crawl\`) : un par site, Expat-Dakar et CoinAfrique. Une
      page de liste → des cartes (URL d'annonce, titre, prix affiché, lieu affiché, et ce que la carte
      montre de plus : chambres, surface, catégorie) + l'URL de la page suivante. Rien d'autre : ils
      fournissent des URL à `RadarListingIntake` et des observations aux instantanés.
- [x] **Sources** `radar_crawl_sources` : une ligne par site, **éteinte par défaut** (`enabled` faux),
      fréquence en minutes, pages lues au plus par passage, l'opérateur qui l'a allumée (au nom duquel
      l'extraction est jugée).
- [x] **Passages** `radar_crawl_runs` : déclencheur (planifié ou manuel), statut, pages lues, cartes
      vues, annonces créées, connues, instantanés écrits, fin de liste atteinte, motif d'arrêt.
      `radar:crawl` (toutes les 15 min) met en file le passage de chaque source allumée et due ; un seul
      passage en cours par source (index unique partiel). Le job du passage est sur la **file longue**
      (`RunsOnLongQueue`) ; il lit les pages par `UrlFetcher` (SSRF, `robots.txt`, créneau par domaine)
      et attend le créneau quand il est pris.
- [x] **Instantanés** `radar_listing_snapshots` : un état observé d'une annonce collectée (prix XOF,
      période, contrat, type, surface, chambres, quartier lu et quartier du référentiel, ville,
      empreinte du titre), avec sa plage de présence (`first_seen_at`, `last_seen_at`, `observations`).
      Un prix ou un titre changé ouvre un nouvel instantané ; sinon le passage prolonge le dernier, et
      comble ses champs vides (valeurs extraites).
- [x] **Quatrième signal** de `RadarMatcher` : similarité de texte. Pilote remplaçable
      (`radar.similarity.driver`), défaut `trigram` : `pg_trgm` sur `radar_listings.similarity_text`
      (description extraite, sinon texte brut, replié, sans chiffres, 1 000 caractères au plus), index GIN.
      Purgé avec l'annonce.
- [x] **Fusion** ([ADR-0080](../../adr/0080-la-collecte-automatique-du-radar.md), **éteinte par défaut**,
      `RADAR_MERGE_AUTO`) : une annonce collectée, extraite, dont un rapprochement `high` désigne une annonce
      plus ancienne d'un **autre site** avec un signal du bien (la photo, ou le lieu au moins `medium` corroboré
      par un autre signal que le téléphone), devient son doublon automatiquement (`merged_at`,
      `stage_reason = radar.merge.auto`). La fiche porte ses provenances
      (elle-même et ses doublons : site, URL, première et dernière présence). Une fusion automatique se
      **défait** (`POST …/unmerge`) et n'est plus retentée.
- [x] **Écran super-admin** : un onglet « Collecte » (sources, interrupteur et fréquence pour
      `super_admin`, lancement manuel, derniers passages) ; la fiche annonce montre ses provenances et
      le bouton « Séparer » d'une fusion automatique.

## Critères d'acceptation

- [x] AC1 — Un passage sur une page de liste semée crée une annonce par URL nouvelle, aucune pour une
      URL déjà connue.
- [x] AC2 — Un prix changé entre deux passages laisse deux instantanés ; un prix inchangé prolonge le
      premier (`last_seen_at`, `observations`).
- [x] AC3 — La même annonce vue sur deux sites devient une fiche à deux provenances.
- [x] AC4 — Sans geste du porteur, aucun passage ne part : `radar:crawl` ne met rien en file tant
      qu'aucune source n'est allumée ; une source allumée n'est relue qu'une fois sa fréquence écoulée.
- [x] AC5 — Une page que le `robots.txt` interdit n'est pas lue ; le passage s'arrête avec le motif
      `radar.fetch.robots`.
- [x] AC6 — Deux annonces au même texte se rapprochent par le signal `text`, sans fournisseur
      d'embeddings ; un texte différent ne rapproche rien.
- [x] AC7 — Une fusion automatique se sépare : l'annonce revient à `extracted`, sans lien, et la
      fusion n'est plus retentée ; une fusion posée à la main ne se sépare pas par cette route.
- [x] AC8 — Le job du passage atterrit sur la file longue, et `scripts/check-queues.mjs` est vert.
- [x] AC9 — Une annonce purgée, `do_not_contact`, ou d'un annonceur qui a dit STOP n'est ni observée ni
      comptée par un passage. Purgée pour un refus, elle perd ses instantanés ; purgée à l'échéance, ils sont
      détachés, sans passage, dates au jour, et aucune jointure ne les relie à la fiche ni à l'annonceur.
- [x] AC10 — Sans `RADAR_MERGE_AUTO`, rien ne fusionne d'office ; allumée, deux biens du même annonceur
      dans le même quartier à prix voisin ne fusionnent pas.

## Découpé en suites

- **TCK-2423** — le pilote d'embeddings et la table `embeddings` d'ADR-0076 § 11 (extension `vector`),
  quand un fournisseur d'embeddings sera retenu.
- **TCK-2424** — les adaptateurs suivants (autres sites d'annonces), sur le même contrat.
- **TCK-2425** — le service de collecte séparé (navigateur sans tête), si la lecture depuis l'API
  échoue face aux protections des sites.

## Hors périmètre

- Airbnb. L'observatoire du marché (TCK-2393), qui lira les instantanés.

## Notes d'implémentation

Livré sur `feat/radar-collecte-automatique` : schéma (`c3c3d638b`), services de collecte (`c96387947`), console API
(`cb3684cd6`), écran (`ec825bd9f`), tests nés des ablations (`e0aa79129`).

- **Les passages comptent les URL connues par leur empreinte** (`RadarListingIntake::urlFingerprint` sur l'URL
  canonique) et ne passent jamais par `fromUrls` pour elles : `fromUrls` remet en file une annonce en échec, ce que la
  saisie d'un opérateur veut et qu'un passage nocturne ne doit pas faire (un site qui refuse serait relu en boucle).
- **Les instantanés naissent des cartes de liste**, enrichis des valeurs extraites quand l'annonce l'est. Le titre n'y
  est qu'une empreinte (`title_fingerprint`) : l'instantané ne garde aucun texte de l'annonceur.
- **Une absence n'est pas une disparition** : `last_seen_at` d'une annonce non revue ne dit rien tant que le passage
  n'a pas atteint la fin de la liste (`reached_end`). `max_pages` borne la couverture — l'observatoire (TCK-2393) doit
  lire `reached_end` avant de conclure qu'une annonce a quitté le marché.
- **CoinAfrique** : la page suivante vient de `ul.pagination`, pas du `link[rel=next]`, qui pointe vers la racine
  (`/?page=2`) que son `robots.txt` interdit.
- **Le texte comparé** (`similarity_text`) est recalculé par le modèle dès que `extracted` ou `raw_text` change : la
  purge, qui les vide, le vide aussi.
- **Corrections de la vérification adverse** (`.superpowers/verif-TCK-2392.md`, 2026-10-30) : routes inscrites à
  `PlatformRoutesDefaultDenyTest` ; la collecte ne relit plus une annonce purgée ou STOP, et la purge détache ses
  instantanés (`radar_listing_id` nullable, migration `392300`) ; fusion d'office éteinte par défaut et règle
  resserrée ; ADR-0080 ; boucle de pagination (`radar.crawl.loop`) ; passage perdu jugé depuis `started_at`, fin
  conditionnelle ; `radar:backfill-similarity` ; avis « allumée sans opérateur ».
  Contre-vérification (B1-bis) : un STOP supprime les instantanés ; l'échéance les détache sans passage et au jour ;
  les deux jointures du banc sont un test.
- **Une séparation ne rend pas les doublons redirigés** : quand une fusion d'office a rattaché à l'annonce B des doublons
  qui pointaient vers A, séparer B ne les rend pas à A. L'opérateur les reprend à la main ; le cas demande deux fusions
  d'office successives sur la même grappe, rare tant que la fusion est éteinte.
- **`scripts/check-models-spec.mjs`** : les trois modèles neufs sont dans `EXCLUS_JUSTIFIES` en attendant la PR de
  spec commune (ce ticket ne touche pas `docs/models-spec.md`). Cette PR retire les trois exclusions dans le même commit.

### Décisions prises en autonomie, à revoir

1. **Interrupteur par site en base** (`radar_crawl_sources.enabled`, faux à la création), plutôt qu'un drapeau de
   configuration ou une variable d'environnement : se règle sans déploiement, porte la fréquence par domaine et
   l'opérateur. Écarté : `RADAR_CRAWL_ENABLED` (un redéploiement par geste, aucune fréquence par site).
2. **Celui qui allume une source en devient l'opérateur** (`operator_id`), au nom duquel l'extraction est jugée :
   `AiAuthority` refuse un acteur absent. Écarté : un compte de service (un compte de plus à gouverner, et aucune
   personne derrière la dépense d'IA).
3. **Le réglage de la collecte réutilise `platform.radar.publish`** (`super_admin` seul) plutôt qu'un geste neuf :
   c'est le geste « porteur » du Radar, et un geste neuf demandait une ligne de plus à la table du front. Écarté :
   `platform.radar.collect` (à créer si le support doit un jour régler la collecte).
4. **Un passage manuel part même d'une source éteinte**, au nom de celui qui le lance : c'est un geste humain
   explicite, d'un `super_admin`. Écarté : l'exiger allumée (deux gestes pour un essai ponctuel).
5. **Pas d'embeddings dans ce lot** : aucun fournisseur d'embeddings n'est configuré (`config/ai.php`), et l'extension
   `vector` n'est pas *trusted* (création réservée au superutilisateur, non vérifiée en préproduction). Pilote
   remplaçable `radar.similarity.driver`, défaut `trigram` (`pg_trgm`, *trusted*, créée par la migration). Écarté :
   la table `embeddings` d'ADR-0076 § 11 dès maintenant — elle va à TCK-2423.
6. **Fusion d'office restreinte** : seulement une annonce trouvée par la collecte, encore `extracted`, vers une annonce
   plus ancienne d'un **autre** site, sur un rapprochement fort dont un signal désigne le **bien** (photo ou lieu). Le
   téléphone et le texte désignent l'annonceur, qui porte plusieurs biens. Réversible (`unmerge`), jamais retentée,
   **éteinte par défaut** (`RADAR_MERGE_AUTO=false`, ADR-0080 amende ADR-0077). Le lieu ne compte que `medium` (prix à
   3 % près) et corroboré par un autre signal que le téléphone : le banc de la vérification adverse fusionnait deux
   lots du même annonceur. Écarté : fusionner aussi les saisies d'opérateur, ou les doublons d'un même site ; et une
   fusion allumée par défaut (le porteur l'allume après l'avoir mesurée sur de vraies annonces).
7. **Seuils du texte** : `pg_trgm` ≥ 0,5 rapproche (`low`), ≥ 0,8 est « presque identique » (`medium`) ; le texte
   n'est jamais `high` seul. Mesuré : 300 paires de paragraphes Faker plafonnent à 0,38.
8. **La purge supprime les instantanés d'un refus, et détache les autres** (décision de la session après la
   contre-vérification B1-bis, à confirmer par le porteur, ADR-0080 § 4) : STOP, révocation ou `do_not_contact` →
   supprimés ; échéance des 90 jours → `radar_listing_id`, `crawl_run_id`, `title_fingerprint` et le lieu écrit à nul,
   dates au jour, `updated_at` sans l'instant de la purge, et la fiche purgée oublie `discovered_by_run_id`. Écarté :
   détacher aussi pour un refus (deux jointures rendaient l'empreinte du numéro de l'annonceur STOP) ; tout supprimer
   (l'observatoire perdrait des séries que plus rien ne rattache à une personne).
9. **Une source allumée sans opérateur est signalée, pas éteinte d'office** : l'écran le dit et dit comment la
   reprendre. Écarté : l'éteindre automatiquement (un geste du porteur défait sans lui).

## Actions du porteur après déploiement

- Lancer une fois `php artisan radar:backfill-similarity` : les annonces saisies avant la colonne `similarity_text`
  n'ont pas de texte comparé, et le quatrième signal ne les voit pas tant que leur lecture ne change pas.
- Allumer les sources voulues depuis l'onglet Collecte (`super_admin`).
- Allumer la fusion d'office (`RADAR_MERGE_AUTO=true`) seulement après l'avoir mesurée sur de vraies annonces.
