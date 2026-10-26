---
id: TCK-2386
title: "Radar : tables, saisie d'une annonce (URL, texte, captures) et extraction IA avec confiance et passage cité"
status: todo
phase: P1
family: full
estimate: L
wave: 80
created: 2026-10-26
updated: 2026-10-26
depends_on: [TCK-2383, TCK-2384]
blocks: [TCK-2387, TCK-2388]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, ia, super-admin, adr-0077]
---

## Objectif utilisateur

Un opérateur colle une URL, un message WhatsApp ou des captures d'écran, et retrouve quelques
secondes plus tard une fiche de bien pré-remplie dont chaque champ dit d'où il vient et à quel
point il est sûr.

## Contexte

Premier ticket du lot 1 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md#lot-1--la-chaîne-complète-du-radar),
[ADR-0077](../../adr/0077-le-radar.md) §1, §10, §11. Premier usager du socle IA (TCK-2383,
TCK-2384) : l'usage `radar.extraction`.

## Contrat de données

- Tables `radar_advertisers` et `radar_listings` (colonnes : plan, § « Les données »). Les tables
  du démarchage et de l'accord sont TCK-2388.
- Routes sous `/api/admin/radar` : `POST listings` (une ou plusieurs URL, ou un texte, ou des
  captures — multipart), `GET listings` (filtres `filter[stage]`, `filter[source_site]`,
  `filter[advertiser_id]`, sparse fieldsets), `GET listings/{listing}`, `GET dashboard` (compteurs
  par étape, coût IA du jour et plafond).
- Usage IA `radar.extraction` : rôle `extraction` (+ `vision` pour les captures), classe de
  données `personnelle`, sortie structurée : pour chaque champ du bien (type, contrat, période de
  loyer, prix XOF, quartier en texte, chambres, salles d'eau, surface, meublé, équipements, titre,
  description) `{value, confidence, evidence}` ; plus téléphones, nom affiché, indices de nature
  de l'annonceur.

## Direction UX / Artistique

La saisie doit être plus rapide que de copier une annonce à la main : un panneau qu'on ouvre de
n'importe où dans le Radar, trois onglets (URL · texte · captures), on colle, on valide, on passe à
la suivante sans attendre. Le tableau de bord est une liste de travail, pas une vitrine : les
compteurs disent quoi faire maintenant. Une extraction en cours, en attente (budget, panne) ou
échouée se voit et dit pourquoi. Charte du dépôt, textes next-intl (`fr`, `en` ; `wo` = `fr`).

## Contraintes strictes (métier)

- **Lecture d'URL** : refuser les adresses privées, de boucle locale, de lien local et de
  métadonnées, **après résolution DNS et à chaque redirection** (SSRF) ; respecter le `robots.txt` ;
  une requête à la fois par domaine et un délai minimal entre deux ; délai d'expiration court ;
  taille de réponse bornée. Un refus ou un échec est un état de l'annonce, avec son motif, jamais
  une erreur muette.
- **Airbnb** (et ses domaines) est refusé à la saisie.
- **Captures** : types image seulement, taille et nombre bornés, EXIF retiré, empreinte SHA-256
  conservée.
- **Le contenu collecté est une donnée** : délimité dans le prompt, l'usage n'a aucun outil
  (ADR-0076 §10).
- **Un champ sans passage cité** voit sa confiance forcée au plus bas ; **bornes de vraisemblance
  en code** (loyer, prix, surface, pièces) signalent une valeur hors bornes.
- **Le quartier est rapproché du référentiel par du code** (ADR-0062), jamais par l'IA ; un nom
  ambigu rend des suggestions.
- **L'empreinte du contenu est unique** : coller deux fois la même annonce rend la fiche existante.
- L'annonceur est créé ou retrouvé par son téléphone au format international ; **un numéro dont
  l'empreinte figure parmi les refus (STOP) marque l'annonce `do_not_contact` dès la saisie**.
- Droits : nouveau geste `platform.radar.operate` (`support` et au-dessus).
- Aucune photo n'est téléchargée ni conservée : seules leurs URL source sont gardées.

## Delta à produire

- [ ] Migrations `create_radar_advertisers_table`, `create_radar_listings_table` · modèles
      `RadarAdvertiser`, `RadarListing` · enums `RadarListingStage`, `RadarSourceKind`,
      `RadarSourceSite`, `RadarAdvertiserNature`.
- [ ] `App\Services\Radar\UrlFetcher` (SSRF, `robots.txt`, fréquence par domaine) et
      `App\Services\Radar\HtmlCleaner`.
- [ ] Agent `App\Ai\Agents\RadarExtraction` et son usage déclaré ; prompt
      `resources/ai/prompts/radar.extraction/v1.md`.
- [ ] `App\Services\Radar\ExtractionNormalizer` (bornes, confiance, quartier par
      `GeoNeighborhood`, montants « 1M5 » ou « 450.000f »).
- [ ] Job `ExtractRadarListing` (réessais espacés, états « en attente » et « échouée »).
- [ ] `PlatformAbility::RadarOperate`. Contrôleurs `App\Http\Controllers\Api\Admin\RadarListingController`,
      `RadarDashboardController` · FormRequest `StoreRadarListingRequest` · routes
      `routes/api/admin-radar.php`.
- [ ] Premier jeu d'évaluation `tests/AiEvals/radar.extraction/` : 30 annonces anonymisées
      (textes et captures) avec leurs sorties attendues, et la référence du cliquet.
- [ ] Front : tableau de bord et saisie rapide sous `/super-admin/radar`.
- [ ] `NamespaceAccessGuardTest`, sections `docs/models-spec.md` des deux modèles.
- [ ] Tests : `RadarUrlFetcherTest` (SSRF : IP privée, `localhost`, métadonnées, redirection vers
      une IP privée, DNS qui résout en privé ; `robots.txt` ; Airbnb), `RadarListingStoreTest`,
      `ExtractionNormalizerTest`, `ExtractRadarListingTest` (faux modèle : champs, confiance
      forcée sans passage, budget épuisé ⇒ en attente).

## Critères d'acceptation

- [ ] AC1 — Une URL qui redirige vers `169.254.169.254` ou vers une adresse privée est refusée sans
      que la cible soit jamais contactée.
- [ ] AC2 — Coller deux fois le même texte rend la même fiche, sans second appel IA.
- [ ] AC3 — Un champ rendu par le modèle sans passage cité est enregistré avec la confiance la plus
      basse.
- [ ] AC4 — « 1M5 » devient 1 500 000 XOF, « 450.000f/mois » 450 000 XOF par mois ; un loyer de
      5 000 XOF est signalé hors bornes.
- [ ] AC5 — « Liberté 6 » est rattaché au `GeoNeighborhood` correspondant ; un nom ambigu rend des
      suggestions, pas un choix.
- [ ] AC6 — Une annonce saisie pour un numéro qui a dit STOP est marquée `do_not_contact` dès la
      saisie, sans appel IA.
- [ ] AC7 — Un `viewer` reçoit 403 ; un `support` saisit.
- [ ] AC8 — `ai:eval radar.extraction` passe sur le jeu livré et en fixe la référence.

## Hors périmètre

- Relecture et rapprochements (TCK-2387) ; démarchage (TCK-2388).
- Collecte automatique et planifiée (TCK-2392).
- Le calcul d'empreinte des photos source (TCK-2387).

## Notes d'implémentation

_(à remplir par implementing-specs)_
