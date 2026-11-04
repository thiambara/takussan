---
id: TCK-2472
title: "Recherche : le journal anonyme et agrégé des recherches, et ce que la politique de confidentialité en dit"
status: done
phase: P2
family: full
estimate: M
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: []
blocks: [TCK-2470, TCK-2474, TCK-2476]
spec_refs:
  features:
    - "docs/features.md"
  models: []
tags: [api, front, search, privacy, adr-0088]
---

## Objectif utilisateur

Takussan apprend ce que les visiteurs cherchent — ce qui est populaire et ce qui ne trouve rien — sans garder aucune
donnée sur eux.

## Contrat de données

**Migrations**

- `create_search_query_stats_table` : `id`, `day` (date), `query_key` (string 64 — empreinte de `normalized_query` + de
  la signature des critères), `normalized_query` (string 80 null), `criteria` (jsonb — critères structurés de la
  recherche, clés = paramètres d'URL publics : `contract_type, type, city, location, price_min, price_max, bedrooms,
  furnished…`), `searches_count`, `distinct_visitors`, `zero_results_count`, `last_results_count` (int), timestamps ;
  unique (`day`, `query_key`).
- `create_search_query_visitors_table` : `day`, `query_key`, `visitor_hash` (string 64) ; unique sur les trois ;
  `created_at`.

**Service** `App\Services\Search\SearchJournal`

- `record(Request $request, ?string $q, array $criteria, int $total): void` — appelé par la recherche publique de biens
  (la route que sert `PropertySearchService` pour `/properties`), **page 1 seulement**, après la réponse
  (`dispatch(...)->afterResponse()` ou `defer`), jamais sur `/api/search/suggest`.
- `popular(string $prefix, int $limit): list<array{text:string, criteria:array, count:int}>` — saisies vues par au moins
  `search.journal.min_visitors` (5) visiteurs distincts un même jour sur les 30 derniers jours, dont `last_results_count
  > 0`, commençant par le préfixe normalisé (vide = les plus fréquentes).
- `zeroResultDemand(int $days): list<array{criteria:array, normalized_query:?string, distinct_visitors:int}>` — pour
  TCK-2470 et la console.

**Commande** `search:purge-journal` (quotidienne) : visiteurs > 48 h, stats > 13 mois.

## Contraintes strictes (métier)

- **Jamais journalisé** : `q` de plus de 80 caractères, portant six chiffres ou plus, ou un `@` (ADR-0088 §3) — ni le
  texte, ni la ligne.
- `visitor_hash = HMAC-SHA256(IP du visiteur — /64 en IPv6 comme `VisitorFingerprint` —, APP_KEY + jour)`. Aucun
  identifiant de compte, aucune IP en clair, nulle part.
- Écriture concurrente sûre sur PostgreSQL : `upsert`/`insertOrIgnore` + incréments atomiques, jamais
  `try { create } catch` (piège n°1 du `CLAUDE.md` de l'API). `distinct_visitors` n'augmente que si l'insertion du visiteur
  a créé une ligne.
- La journalisation n'ajoute aucune latence perceptible à la recherche et n'échoue jamais la requête (erreur avalée et
  rapportée).
- **`privacy.ts`** (`takussan-web/src/content/legal/`) décrit le traitement (finalité : améliorer la recherche et
  l'offre ; données : texte de recherche normalisé et compteurs par jour ; empreinte du jour effacée sous 48 h ; 13 mois)
  et `VERSION_DOCUMENTS` avance — même PR. Rédigé d'après la loi sénégalaise, sans marqueur « à relire ».

## Delta à produire

- [x] Migrations, modèles `SearchQueryStat` (+ `models-spec`, signalé dans les Notes — un seul écrivain), service,
      commande planifiée (`routes/console.php`, commentaire `TCK-2472` d'idempotence), `config/search.php` (ou le fichier
      de configuration de la recherche existant) : `journal.min_visitors`, `journal.retention_months`.
- [x] Branchement dans la recherche publique.
- [x] Tests : `SearchJournalTest` (agrégation, distinct au jour, exclusions, seuil des 5 visiteurs, popularité filtrée
      par résultats, purge), test d'intégration « une recherche publique page 1 écrit une ligne, page 2 non ».
- [x] Front : `privacy.ts` + `VERSION_DOCUMENTS` + tests des textes juridiques existants.

## Critères d'acceptation

- [x] AC1 — Une recherche `q=appart 77 123 45 67` n'écrit aucune ligne.
- [x] AC2 — 4 visiteurs distincts le même jour : `popular('')` ne rend pas la saisie ; 5 : il la rend.
- [x] AC3 — Une empreinte de visiteur de plus de 48 h est effacée par la purge.
- [x] AC4 — Ablation : retirer le filtre des chiffres fait rougir AC1.

## Hors périmètre

- Une console de lecture du journal (la demande se lit par TCK-2470).

## Notes d'implémentation

**Re-mesuré le 2026-11-04, ce qui différait du ticket :**

- **La route n'est pas `/api/properties`** : la liste publique `/properties` appelle `GET /api/public/properties/search`
  (`PublicPropertyController::search` → `PropertySearchService::search`), côté serveur (RSC, `rechercherBiensPublics`)
  puis côté client (`useSearch.ts`). Le point d'appel est dans le contrôleur — une ligne, `recordPublicSearch()` — pas
  dans `PropertySearchService` (que les alertes et `SuggestService` lisent aussi).
- **L'IP vue par l'API est bien celle du visiteur** sur le rendu serveur : `apiFetch` transmet `X-Forwarded-For` et
  `User-Agent` du visiteur (TCK-792, `api.ts:172-180`), et l'API les croit (`trustProxies`). Sans cela, tous les
  visiteurs du rendu serveur auraient été UN visiteur, et aucune recherche n'aurait franchi le seuil de cinq.
- **D'autres appelants que la liste frappent la même route** : la rangée « À vendre » de l'accueil
  (`contract_type=sale&per_page=6&placements=false`, à chaque visite de l'accueil), l'invitation du tableau de bord
  locataire (`city`, `contract_type`, `per_page=4`), le `playground`. Journalisés, « À vendre » serait devenue la
  recherche la plus populaire sans qu'aucun visiteur ne l'ait tapée. **Décision de l'agent** : `placements=false` n'est
  pas journalisé (c'est le seul appelant qui le pose, et le paramètre dit déjà « je ne suis pas la liste ») ; les deux
  autres le sont (critères réels d'une personne, faible volume). Un marqueur explicite posé par la liste serait plus
  propre, mais demande de toucher le front de la liste (`recherche-publique.ts`), hors périmètre.
- **`VisitorFingerprint::ofIp()` n'est pas l'empreinte du ticket** : c'est `HMAC(IP, APP_KEY)` — DURABLE, celle des
  signalements. Le journal emploie `VisitorFingerprint::network()` (le /64) et une empreinte du jour.
- **L'empreinte du jour passe par `AppKeyHmac::of('<jour>|<IP ou /64>')`** (ADR-0084, gardé par
  `AppKeyHmacPointUniqueTest`, qui refusait le `hash_hmac(…, config('app.key').'|'.jour)` de la première version) : le
  jour est dans la DONNÉE, pas dans la clé — même propriété (une autre empreinte chaque jour, sans lien d'un jour à
  l'autre), donc rien ne change dans `privacy.ts`. Écriture sous la clé courante seule (`of()`, jamais `all()`) : elle ne
  décide d'aucun droit ; une rotation d'`APP_KEY` en cours de journée recompte au plus une fois un visiteur ce jour-là.
- **Robots** : une recherche sous un agent reconnu par `RobotUserAgent` (TCK-792) n'est pas journalisée, comme une
  impression sponsorisée — les moteurs parcourent les pages de facettes.
- **Recherche vide** : ni saisie ni critère retenu → rien (ce n'est pas une recherche).
- **Critères retenus** : `SearchJournal::CRITERIA_KEYS`. Exclus délibérément : les coordonnées (`lat`, `lng`,
  `radius_km`, le rectangle de la carte — la position d'un « autour de moi » est celle du visiteur), `available_from`
  (une date qui change chaque jour défait l'agrégation, et `SearchPublicPropertyRequest` l'écrête au jour même),
  `sort`/`page`/`per_page`/`placements`/`seed_hour`. Les critères multi-valués sont écrits dans la forme de l'URL
  (`type=house,villa`), valeurs triées.
- **Les critères libres** (`location`, `city`, `cities`, `region`, `tags`) passent par la même règle que `q` (80
  caractères, six chiffres, `@`) : un numéro tapé dans le champ du lieu est une saisie comme une autre. Un seul
  échec → rien n'est écrit.
- **« Six chiffres ou plus »** se compte sur toute la saisie (`77 123 45 67` = 9 chiffres épars), toutes écritures
  (`\p{Nd}`) ; `@` aussi en pleine chasse (`＠`, `﹫`).
- **Recherche élargie** (ADR-0024, `search.strategy = widened`) : comptée sans résultat (`total = 0`) — telle quelle,
  elle n'a rien trouvé ; elle ne doit être ni proposée, ni absente de la demande sans résultat.
- **Purge horaire, pas quotidienne** : quotidienne à 48 h, une empreinte pouvait vivre jusqu'à 71 h, quand la politique
  promet 48 h. Horaire, elle efface dès 47 h : aucune n'atteint 48 h. Même commande, `search:purge-journal`.
- **`popular()`** : `count` = somme des visiteurs distincts de chaque jour de la fenêtre (visiteurs-jours) ; seuil jugé
  un même jour (`max(distinct_visitors) >= min_visitors`) ; « dernier nombre de résultats » = celui du jour le plus
  récent de la fenêtre. Une recherche par critères seuls a `text = ''`, et ne sort qu'à préfixe vide.
- **`zeroResultDemand(int $days, int $minVisitors = 1, int $limit = 200)`** : deux paramètres optionnels de plus que le
  ticket, pour TCK-2470 (« au moins 2 visiteurs ») et TCK-2476 (« au plus 200 »). Rend une recherche qui a rendu zéro
  dans la fenêtre ET dont le dernier nombre de résultats est encore zéro ; `distinct_visitors` = somme des jours où elle
  a rendu zéro.
- **Après la réponse** : `defer()` (`Illuminate\Support\defer`), premier usage dans le dépôt ; prouvé par
  `test_la_ligne_s_ecrit_apres_la_reponse` (rien après `handle()`, la ligne après `terminate()`).
- **`VERSION_DOCUMENTS` est lié à `PublishReadiness::TERMS_VERSION`** par `scripts/check-terms-version.mjs` : avancer
  l'un sans l'autre rougit Repo CI. Les deux avancent au 2026-11-04 (fichier API hors du périmètre annoncé, imposé par
  la garde). Conséquence à connaître : la version des CGU inscrite à la première publication devient `2026-11-04`.

**À reporter dans les specs** (un seul écrivain, la session) :

- `docs/models-spec.md` : `SearchQueryStat` (`search_query_stats`, cf. la migration `2026_11_04_247200`), et la table
  de travail `search_query_visitors` (sans modèle : écrite par `DB::table`).
- `docs/features.md` : le journal anonyme des recherches (page 1 de la liste publique, exclusions, seuil de cinq,
  purge horaire 48 h / 13 mois) et la ligne correspondante de la politique de confidentialité.

### Revue adverse du 2026-11-04 — correctifs (n° 1, 7, 8)

- 2026-11-04 — **n° 1** : `SearchJournal::isJournalisable()` exclut aussi un courriel écrit sans `@` (un domaine
  « x.com » / « point com » / « dot sn », un fournisseur de messagerie nommé, « arobase », « (at) ») ; un numéro ponctué
  (« 77.123.45.67 ») comptait déjà ses chiffres. **n° 7** : `visitor_hash = HMAC(jour | recherche | IP)` — deux
  recherches d'un même visiteur ne se relient plus. **n° 8** : le seuil de `popular()` compte `distinct_networks`
  (/24, /48 ; colonne de la migration `2026_11_04_247220`, seconde empreinte `reseau|…` dans `search_query_visitors`),
  le `count` reste `distinct_visitors`. ADR-0088 §2/§3 amendés. Tests : `SearchJournalTest`.
