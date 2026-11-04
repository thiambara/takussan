---
id: TCK-2472
title: "Recherche : le journal anonyme et agrégé des recherches, et ce que la politique de confidentialité en dit"
status: todo
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

- [ ] Migrations, modèles `SearchQueryStat` (+ `models-spec`, signalé dans les Notes — un seul écrivain), service,
      commande planifiée (`routes/console.php`, commentaire `TCK-2472` d'idempotence), `config/search.php` (ou le fichier
      de configuration de la recherche existant) : `journal.min_visitors`, `journal.retention_months`.
- [ ] Branchement dans la recherche publique.
- [ ] Tests : `SearchJournalTest` (agrégation, distinct au jour, exclusions, seuil des 5 visiteurs, popularité filtrée
      par résultats, purge), test d'intégration « une recherche publique page 1 écrit une ligne, page 2 non ».
- [ ] Front : `privacy.ts` + `VERSION_DOCUMENTS` + tests des textes juridiques existants.

## Critères d'acceptation

- [ ] AC1 — Une recherche `q=appart 77 123 45 67` n'écrit aucune ligne.
- [ ] AC2 — 4 visiteurs distincts le même jour : `popular('')` ne rend pas la saisie ; 5 : il la rend.
- [ ] AC3 — Une empreinte de visiteur de plus de 48 h est effacée par la purge.
- [ ] AC4 — Ablation : retirer le filtre des chiffres fait rougir AC1.

## Hors périmètre

- Une console de lecture du journal (la demande se lit par TCK-2470).

## Notes d'implémentation

_(à remplir)_
