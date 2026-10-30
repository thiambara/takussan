# ADR-0080 — La collecte automatique du Radar part de l'API, éteinte par défaut, et ne fusionne d'office que sur un signal du bien, réversible et éteint par défaut

- **Statut** : Accepté
- **Date** : 2026-10-30
- **Tickets** : [TCK-2392](../backlog/tickets/TCK-2392-radar-collecte-automatique.md) (lot 2 du [plan Radar et socle IA](../plans/2026-10-26-radar-et-socle-ia.md)) ; suites : [TCK-2423](../backlog/tickets/TCK-2423-radar-pilote-d-embeddings.md), [TCK-2424](../backlog/tickets/TCK-2424-radar-adaptateurs-supplementaires.md), [TCK-2425](../backlog/tickets/TCK-2425-radar-collecteur-navigateur.md)
- **Amende** : [ADR-0077](0077-le-radar.md) (§ 9 la purge, § 10 la collecte, et la conséquence « la décision reste humaine » sur les doublons)
- **Dépend de** : [ADR-0076](0076-le-socle-ia.md) (le socle IA), [ADR-0078](0078-une-connexion-de-file-pour-les-jobs-longs.md) (la file longue)

## Contexte

Mesuré le 2026-10-30 sur `origin/feat/radar-revocation-purge` (dev + TCK-2391) :

- **La chaîne du lot 1 existe** : `RadarListingIntake::fromUrls()` saisit une URL (empreinte unique
  de l'URL canonique), `ExtractRadarListing` la lit puis appelle le modèle sur la file `ai`,
  `UrlFetcher` contrôle la SSRF, respecte le `robots.txt` et tient un créneau par domaine.
  `RadarMatcher` rapproche par trois signaux : téléphone, lieu (quartier + prix + chambres), photo.
- **L'extraction est jugée au nom d'un acteur** (`AiAuthority::allows()` refuse un acteur nul) : une
  annonce collectée sans personne derrière ne s'extrairait jamais.
- **`vector` n'est pas une extension de confiance** (`vector.control` sans `trusted = true`) : la
  créer exige un superutilisateur, non vérifié en préproduction. `pg_trgm` l'est. Aucun fournisseur
  d'embeddings n'est configuré (`config/ai.php`, rôle `embedding` sans maillon).
- **Un doublon (`duplicate`) est terminal** : rien ne défait un « doublon de ».
- ADR-0077 § 10 bornait la collecte à « polie et protégée », sans dire d'où elle part ni qui
  l'allume ; ses conséquences disaient du doublon entre courtiers : « la décision reste humaine ».
- **La vérification adverse du lot** (2026-10-30) a montré, par des bancs exécutés :
  - qu'une annonce purgée après un STOP restait **observée** par chaque passage, ses instantanés
    gardant un lien vers elle — contraire à la promesse de `privacy.ts` § 6 ;
  - que deux biens différents du même annonceur, dans le même quartier à ±10 %, **fusionnaient
    d'office** (téléphone `medium` + lieu `low` = `high`).

## Décision

**La collecte part de l'API, par site, éteinte tant que le porteur ne l'allume pas, au nom de celui
qui l'allume. Le texte rapproche par `pg_trgm`, derrière un pilote. La fusion d'office est étroite,
réversible et éteinte par défaut. La purge détache les instantanés au lieu de les garder liés.**

1. **La collecte part de l'API, pas d'un service à part.** Un adaptateur par site
   (`App\Services\Radar\Crawl\`) lit une page de liste par `UrlFetcher` — les mêmes contrôles qu'une
   URL saisie — et rend des cartes et la page suivante. Le job du passage est sur la file longue
   (ADR-0078). Un service de collecte séparé (navigateur sans tête) n'est envisagé que si cette
   lecture échoue face aux protections des sites (TCK-2425).

2. **Les sources sont en base, éteintes par défaut, et ont un opérateur.** `radar_crawl_sources` :
   une ligne par site, `enabled` faux à la création, fréquence et plafond de pages. Celui qui
   l'allume (`super_admin`) en devient l'opérateur, au nom duquel l'extraction est jugée. **Rien ne
   part sans ce geste**, ni d'une source sans opérateur. Une source allumée dont l'opérateur a
   disparu ne part plus, et l'écran le signale ; rien ne l'éteint d'office. Un seul passage actif par
   site (index unique partiel) ; un passage perdu est clos depuis son démarrage.

3. **La collecte ne relit pas ce que la purge a fait taire.** Une annonce purgée, `do_not_contact`,
   ou d'un annonceur qui a dit STOP n'est ni observée ni comptée par un passage (ADR-0077 § 9).

4. **La purge détache les instantanés.** `radar_listing_snapshots.radar_listing_id` devient nul, avec
   l'empreinte du titre et le lieu écrit par l'annonceur. Restent le prix, la période, le contrat, le
   type, la surface, les chambres, le quartier du référentiel, la ville, les dates et le passage : une
   **observation de marché anonyme**, qui ne relie plus à l'annonce ni à l'annonceur. Écarté : les
   supprimer, ce qui ôtait à l'observatoire (TCK-2393) des séries que rien ne rattache plus à une
   personne.

5. **Le texte rapproche par `pg_trgm`, derrière un pilote.** Quatrième signal de `RadarMatcher` :
   `radar.similarity.driver`, défaut `trigram`, sur `radar_listings.similarity_text` (description
   extraite, sinon texte brut, replié, sans chiffres, 1 000 caractères au plus), index GIN. Le texte
   n'est jamais `high` seul. **Les embeddings sont reportés à TCK-2423** : ils demandent un
   fournisseur retenu et l'extension `vector`, que seul un superutilisateur peut créer.

6. **La fusion d'office est étroite, réversible et éteinte par défaut. Cela amende ADR-0077**, qui
   disait du doublon entre courtiers que « la décision reste humaine » : elle le reste par défaut.
   - **Éteinte** tant que le porteur ne l'a pas allumée (`radar.merge.auto`, `RADAR_MERGE_AUTO`,
     faux), après l'avoir mesurée sur de vraies annonces. Éteinte, les rapprochements restent
     montrés et rien n'est fusionné sans l'opérateur.
   - **Étroite** : seulement une annonce trouvée par la collecte, encore `extracted`, vers une annonce
     plus ancienne d'un **autre** site, sur un rapprochement `high` dont un signal désigne le
     **bien** : la photo, ou le lieu au moins `medium` (prix à 3 % près) **et** corroboré par un autre
     signal que le téléphone. Le téléphone et le texte désignent l'annonceur, qui porte plusieurs
     biens.
   - **Réversible** : `POST …/unmerge` rend l'annonce à `extracted`, sans lien, et la fusion n'est
     plus retentée. Une fusion posée à la main ne se sépare pas par cette route.

## Conséquences

- **La liste se remplit pendant la nuit**, mais seulement après deux gestes du porteur : allumer une
  source, puis (s'il le veut) allumer la fusion d'office.
- **Un passage coûte des appels au modèle** au nom d'une personne, l'opérateur : la dépense d'IA a
  toujours quelqu'un derrière elle.
- **Le texte par trigrammes rapproche les copies**, pas les reformulations : deux descriptions écrites
  différemment de la même maison ne se rapprochent que par la photo ou le lieu, jusqu'à TCK-2423.
- **La fusion éteinte laisse les doublons entre sites à l'opérateur**, comme au lot 1. Allumée, elle
  peut se tromper sur deux lots du même immeuble à photos communes ; la séparation le répare.
- **Une séparation ne rend pas les doublons qu'une fusion avait redirigés vers l'annonce séparée** :
  l'opérateur les reprend à la main.
- **Les instantanés détachés survivent à la purge.** Ils ne portent ni texte, ni numéro, ni URL, ni
  lien ; la politique de confidentialité n'a rien à en dire de plus que « des compteurs anonymes »
  (ADR-0077 § 9).
- **Prérequis du porteur après déploiement** : lancer une fois `php artisan radar:backfill-similarity`
  (texte comparé des annonces antérieures), puis allumer les sources voulues.

## Application

- Collecte : `RadarCrawler`, `RadarCrawlScheduler`, `CrawlRadarSource` (`RunsOnLongQueue`),
  `radar:crawl` toutes les 15 minutes — `tests/Feature/Radar/RadarCrawlTest.php` (rien ne part sans
  geste, un passage par site, robots, boucle de pagination, passage perdu).
- Silence et détachement : `RadarCrawler::silenced()`, `RadarPurger::detachSnapshots()` —
  `tests/Feature/Radar/RadarSnapshotPrivacyTest.php`.
- Texte : `TrigramTextSimilarity`, `RadarSimilarityText`, `radar:backfill-similarity` —
  `RadarMatcherTest`, `RadarBackfillSimilarityTest`.
- Fusion : `RadarAutoMerge` (`designatesTheProperty()`) — `tests/Feature/Radar/RadarAutoMergeTest.php`
  (éteinte par défaut, deux biens du même annonceur ne fusionnent pas, séparation).
- Droits : `platform.radar.operate` lit, `platform.radar.publish` règle —
  `PlatformRoutesDefaultDenyTest`.
