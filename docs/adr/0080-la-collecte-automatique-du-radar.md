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

4. **La purge supprime les instantanés d'un refus, et détache les autres** (décision du 2026-10-30,
   après la contre-vérification B1-bis) :
   - **STOP, révocation ou `do_not_contact`** : les instantanés de l'annonce sont **supprimés**. La
     promesse de `privacy.ts` § 6 est « une empreinte, et rien d'autre » : une observation détachée
     reste celle de cet annonceur pour qui sait quand il a dit STOP — la purge d'un annonceur traite
     toutes ses annonces au même instant.
   - **Échéance des 90 jours, sans refus** : ils sont **détachés**. `radar_listing_id`, `crawl_run_id`,
     l'empreinte du titre et le lieu écrit passent à nul ; `first_seen_at`, `last_seen_at` et
     `created_at` sont ramenés au jour, et `updated_at` prend le jour de `last_seen_at`, jamais
     l'instant de la purge. La fiche purgée oublie `discovered_by_run_id`. Restent le prix, la période,
     le contrat, le type, la surface, les chambres, le quartier du référentiel, la ville, les
     observations et la plage de présence au jour : une **observation de marché anonyme**.
   - Mesuré par la contre-vérification : sans ces deux mesures, deux jointures
     (`updated_at` = instant de la purge ; passage + seconde de création) rendaient l'empreinte du
     numéro de l'annonceur STOP. Écarté : tout supprimer, y compris à l'échéance (l'observatoire,
     TCK-2393, perdrait des séries que rien ne rattache plus à une personne) ; garder le passage
     (il dit le site, mais rejoint la fiche découverte). L'observation détachée ne dit plus son site.

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
- **Les instantanés détachés survivent à la purge des 90 jours**, jamais à celle d'un refus. Ils ne
  portent ni texte, ni numéro, ni URL, ni passage, ni instant plus fin que le jour ; la politique de
  confidentialité n'a rien à en dire de plus que « des compteurs anonymes » (ADR-0077 § 9). Reste un
  indice faible : l'ordre des `id`, que rien ne relie à une fiche purgée sans autre colonne.
- **L'observatoire ne sait plus le site d'une observation détachée**, ni son heure : il lit les
  séries détachées au jour, tous sites confondus.
- **Prérequis du porteur après déploiement** : lancer une fois `php artisan radar:backfill-similarity`
  (texte comparé des annonces antérieures), puis allumer les sources voulues.

## Application

- Collecte : `RadarCrawler`, `RadarCrawlScheduler`, `CrawlRadarSource` (`RunsOnLongQueue`),
  `radar:crawl` toutes les 15 minutes — `tests/Feature/Radar/RadarCrawlTest.php` (rien ne part sans
  geste, un passage par site, robots, boucle de pagination, passage perdu).
- Silence, suppression et détachement : `RadarCrawler::silenced()`,
  `RadarPurger::silencedByItsAdvertiser()`, `RadarPurger::detachSnapshots()` —
  `tests/Feature/Radar/RadarSnapshotPrivacyTest.php` (les deux jointures de B1-bis rendent `[]`, pour un
  STOP comme à l'échéance) ; le `down()` de la migration `392300` —
  `tests/Feature/Radar/RadarSnapshotDetachMigrationTest.php`.
- Texte : `TrigramTextSimilarity`, `RadarSimilarityText`, `radar:backfill-similarity` —
  `RadarMatcherTest`, `RadarBackfillSimilarityTest`.
- Fusion : `RadarAutoMerge` (`designatesTheProperty()`) — `tests/Feature/Radar/RadarAutoMergeTest.php`
  (éteinte par défaut, deux biens du même annonceur ne fusionnent pas, séparation).
- Droits : `platform.radar.operate` lit, `platform.radar.publish` règle —
  `PlatformRoutesDefaultDenyTest`.
