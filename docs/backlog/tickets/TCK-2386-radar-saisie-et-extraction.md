---
id: TCK-2386
title: "Radar : tables, saisie d'une annonce (URL, texte, captures) et extraction IA avec confiance et passage cité"
status: doing
phase: P1
family: full
estimate: L
wave: 80
created: 2026-10-26
updated: 2026-10-27
depends_on: [TCK-2383, TCK-2384, TCK-2398]
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

- [x] Migrations `create_radar_advertisers_table`, `create_radar_listings_table` · modèles
      `RadarAdvertiser`, `RadarListing` · enums `RadarListingStage`, `RadarSourceKind`,
      `RadarSourceSite`, `RadarAdvertiserNature`.
- [x] `App\Services\Radar\UrlFetcher` (SSRF, `robots.txt`, fréquence par domaine) et
      `App\Services\Radar\HtmlCleaner`.
- [x] Agent `App\Ai\Agents\RadarExtraction` et son usage déclaré ; prompt
      `resources/ai/prompts/radar.extraction/v1.md`.
- [x] `App\Services\Radar\ExtractionNormalizer` (bornes, confiance, quartier par
      `GeoNeighborhood`, montants « 1M5 » ou « 450.000f »).
- [x] Job `ExtractRadarListing` (réessais espacés, états « en attente » et « échouée »).
- [x] `PlatformAbility::RadarOperate`. Contrôleurs `App\Http\Controllers\Api\Admin\RadarListingController`,
      `RadarDashboardController` · FormRequest `StoreRadarListingRequest` · routes
      `routes/api/admin-radar.php`.
- [ ] Premier jeu d'évaluation `resources/ai/evals/radar.extraction/` : 30 annonces anonymisées
      (textes et captures) avec leurs sorties attendues, et la référence du cliquet.
- [x] Front : tableau de bord et saisie rapide sous `/super-admin/radar`.
- [x] `NamespaceAccessGuardTest`, sections `docs/models-spec.md` des deux modèles.
- [x] Tests : `RadarUrlFetcherTest` (SSRF : IP privée, `localhost`, métadonnées, redirection vers
      une IP privée, DNS qui résout en privé ; `robots.txt` ; Airbnb), `RadarListingStoreTest`,
      `ExtractionNormalizerTest`, `ExtractRadarListingTest` (faux modèle : champs, confiance
      forcée sans passage, budget épuisé ⇒ en attente).

## Critères d'acceptation

- [x] AC1 — Une URL qui redirige vers `169.254.169.254` ou vers une adresse privée est refusée sans
      que la cible soit jamais contactée.
- [x] AC2 — Coller deux fois le même texte rend la même fiche, sans second appel IA.
- [x] AC3 — Un champ rendu par le modèle sans passage cité est enregistré avec la confiance la plus
      basse.
- [x] AC4 — « 1M5 » devient 1 500 000 XOF, « 450.000f/mois » 450 000 XOF par mois ; un loyer de
      5 000 XOF est signalé hors bornes.
- [x] AC5 — « Liberté 6 » est rattaché au `GeoNeighborhood` correspondant ; un nom ambigu rend des
      suggestions, pas un choix.
- [x] AC6 — Une annonce saisie pour un numéro qui a dit STOP est marquée `do_not_contact` dès la
      saisie, sans appel IA.
- [x] AC7 — Un `viewer` reçoit 403 ; un `support` saisit.
- [ ] AC8 — `ai:eval radar.extraction` passe sur le jeu livré et en fixe la référence.

## Hors périmètre

- Relecture et rapprochements (TCK-2387) ; démarchage (TCK-2388).
- Collecte automatique et planifiée (TCK-2392).
- Le calcul d'empreinte des photos source (TCK-2387).

## Notes d'implémentation

Plan : [`docs/plans/2026-10-27-radar-tck-2386.md`](../../plans/2026-10-27-radar-tck-2386.md), huit tâches, chacune revue (conformité et qualité) puis corrigée jusqu'à une revue propre.

**Ce que prouve chaque critère** :

| AC | Tests |
|---|---|
| AC1 | `RadarUrlFetcherTest::test_ac1_*` : redirection vers les métadonnées, vers un nom qui résout en privé ; la cible n'est jamais contactée (résolveur et transport doublés) |
| AC2 | `RadarListingStoreTest::test_ac2_*`, `ExtractRadarListingTest::test_ac2_*` (un seul appel au modèle par l'API) |
| AC3 | `ExtractionNormalizerTest::test_ac3_*`, `ExtractRadarListingTest::test_ac3_*` |
| AC4 | `ExtractionNormalizerTest::test_ac4_*` (« 1M5 », « 450.000f/mois », 5 000 XOF hors bornes) |
| AC5 | `ExtractionNormalizerTest::test_ac5_*` (Liberté 6, nom ambigu, homonyme dans deux villes, quartier fusionné) |
| AC6 | `RadarListingStoreTest::test_ac6_*` (aucun job), `ExtractRadarListingTest::test_ac6_*` et les STOP relus après lecture de l'URL, des captures et sur chaque numéro de la sortie |
| AC7 | `RadarListingStoreTest::test_ac7_*`, `RadarExtractionUsageTest::test_a_viewer_is_refused_without_reaching_the_model` |

**AC8 n'est pas coché, et le ticket fusionne en `doing`** (décision du porteur du 2026-10-27) : `ai:eval radar.extraction --update-baseline` joue le jeu de 30 cas contre le vrai modèle (coût réel, faible). Il attend l'accord du porteur ; tant que `baseline.json` n'existe pas, le cliquet de l'usage ne garde rien. Les 30 cas sont **synthétiques** (aucune annonce réelle collectée à ce jour), ce que dit le `README.md` du jeu.

**Écarts et décisions prises en route** :

- **Lecture d'URL** : résolution DNS contrôlée à chaque saut, `robots.txt` compris ; connexion épinglée sur l'IP contrôlée (`CURLOPT_RESOLVE`), proxy désactivé ; plages bloquées étendues aux préfixes de transition IPv6 ; contrôle du littéral IP repris après conversion IDN. Une lecture est **sa propre passe** du job, suivie d'un `release(0)` : le délai par domaine ne consomme pas le temps de l'appel IA.
- **Délai d'appel IA** calculé sur la longueur de la chaîne jouée : `max(5, min(socle, (75 − 10·L)/L))` sous le `$timeout` de 85 s du job — un fournisseur muet bascule au suivant au lieu de consommer le job entier.
- **Le passage cité doit figurer dans la source** (`evidence_not_in_source`), pas seulement exister.
- **Bombes de décompression** : bornes de pixels (`max_side`, `max_pixels` 24 Mpx) lues dans l'en-tête avant tout décodage.
- **Évaluations par rôle** (socle) : un candidat ne joue que les cas de son rôle ; la référence porte une section par rôle ; une première référence partielle est refusée (`ai.eval.baseline_needs_full_run`). Type `text` du `FieldScorer` (blancs retirés) pour le prix recopié.
- **Captures** : 10 fichiers de 8 Mo au plus, **24 Mo au total**, vérifiés côté client — le `post_max_size` de l'image de l'API est 26M (`docker/php.ini`) ; un test du front relit ces deux fichiers. Un 413 a son libellé Radar.
- **Front** : relais multipart allongé à 90 s (`relayerVersApi`, comme le KYC) ; le rafraîchissement ne tourne que pendant une extraction réellement en cours (pas sur une annonce garée sur le budget ou l'arrêt d'urgence).

**Revue finale de la branche, puis décisions du porteur du 2026-10-27** :

- **L'annonceur ne vient que d'un numéro que la source porte** : pour un texte ou une URL, un
  numéro rendu par le modèle sans figurer dans la source est écarté (`phones_flags:
  [evidence_not_in_source]`, non conservé — son affichage est TCK-2387). Parmi les numéros gardés,
  **l'ordre du modèle** désigne l'annonceur ; ceux du texte ne servent qu'à défaut. Le refus STOP
  se juge sur l'union de tous les numéros, écartés compris. L'annonceur est créé sous le verrou de
  l'annonce (aucun orphelin) et ne s'enrichit que de champs sans drapeau.
- **Recoller une annonce en `extraction_failed` la relance** (`requeued: true`), au nom de
  l'opérateur qui recolle (`captured_by`). Mise à jour conditionnelle : deux renvois simultanés
  ne relancent qu'une fois.
- **Lecture d'URL bornée à 45 s au total** (`radar.fetch.total_timeout_seconds`), sauts et
  `robots.txt` compris, résolution DNS incluse ; le créneau du domaine expire à 65 s au lieu de
  305 s.
- Une URL Airbnb d'un lot est nommée (`params.field = urls.N`) ; le front relit pendant les
  attentes courtes (`radar.fetch.deferred`, réessai unique).
- Hors de ce ticket : la file des appels IA (**TCK-2402**, avant la production), l'affichage des
  numéros écartés (TCK-2387), la purge des passages cités (TCK-2391), l'ordre des verrous du
  gestionnaire de STOP (TCK-2388).

**Non vérifié** : l'écran `/super-admin/radar` au navigateur. En local, le PHP de brew borne
l'envoi à 2 Mo par fichier et 8 Mo au total (l'image : 8 et 26) : une capture de 3 Mo y échoue
sans libellé Radar.
