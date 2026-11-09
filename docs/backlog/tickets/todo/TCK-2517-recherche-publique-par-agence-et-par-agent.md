---
id: TCK-2517
title: Recherche publique filtrée par agence et par agent, avec les comptes par option
status: todo
phase: P1
family: back
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: [TCK-2522, TCK-2523]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#24-recherche--filtres"
  models: []
tags: [back, recherche, directory, audit-ux]
---

## Objectif utilisateur

Sur la fiche d'une agence de 67 biens, trouver « à louer, deux chambres, moins d'un million » en trois touchers, avec le nombre de biens que chaque option laisserait.

## Contrat de données

Relevé le 2026-11-09 : `GET /api/public/agencies/{slug}/properties` et `/agents/{slug}/properties` ne filtrent que par `contract_type` et trient au plus récent ; `GET /api/public/properties` n'a pas de filtre par agence ni par agent, alors que l'index Meilisearch déclare déjà `agency_id` et `user_id` filtrables (`config/scout.php`).

1. La liste publique (`SearchPublicPropertyRequest` → `PropertySearchService`) accepte **`filter[agency]=<slug>`** et **`filter[agent]=<slug>`** (slug public, TCK-2519 ; `username` en repli). Un slug inconnu, inactif ou non public rend une liste vide, jamais un 404 (aucune information sur l'existence d'un compte). Tous les autres filtres, le mot-clé et les tris de la liste s'y combinent.
2. **Même prédicat que le portefeuille** : sous l'un de ces deux filtres, la liste applique `publicPortfolio()` (public ET disponible) et non le seul `public()` — sinon le compte de la fiche et celui de la recherche divergent (doute relevé par la maquette). Un test épingle l'égalité des deux comptes.
3. **Comptes par option**, sur demande (`facets=contract_type,type,bedrooms,neighborhood`) : `meta.facets.<clé>` = liste `{ value, count }`, chaque compte calculé **sous tous les autres filtres posés, hors le sien** (la règle de TCK-2498 pour l'histogramme des prix). Plafonné aux quatre clés ci-dessus.
4. Les endpoints `…/{slug}/properties` existants restent (chargement « Voir plus » des pages actuelles) jusqu'à ce que TCK-2522 et TCK-2523 n'en aient plus besoin ; leur retrait est un ticket à part.

## Direction UX / Artistique

Sans objet (back). Maquettes servies : `/fr/playground/maquettes?p=agence&a=d`, `?p=agent&a=d` (écrans Filtres, Biens filtrés, Aucun bien).

## Contraintes strictes (métier)

- Rien d'un bien non public ne sort, ni dans la liste ni dans un compte.
- Le compte d'une facette sous un filtre incomplet est faux (piège déjà payé, `PropertySearchService` l. 455) : chaque facette se calcule sous le filtre complet moins la sienne.
- Sparse fieldsets inchangés.

## Delta à produire

- [x] Règles `agency`, `agent` (à plat, cf. notes), `facets` dans `SearchPublicPropertyRequest`.
- [x] Application dans `PropertySearchService` (filtre Meilisearch sur `agency_id` / `user_id`, prédicat du portefeuille).
- [x] `meta.facets` (quatre clés).
- [x] Tests (`RecherchePubliqueParProfilTest`).

## Critères d'acceptation

- [x] AC1 — Pour une agence, `meta.total` de `filter[agency]=<slug>` égale le total de `GET /public/agencies/{slug}/properties` (même jeu de biens ; vérifié par ablation en remplaçant le prédicat par `public()` seul, avec un bien loué de l'agence).
- [x] AC2 — `filter[agency]=a&filter[contract_type]=rent&facets=type` : les comptes par type somment au total de l'agence en location.
- [x] AC3 — Le compte de `contract_type=sale` sous `filter[contract_type]=rent` est celui des biens à vendre de l'agence (la facette ignore son propre filtre).
- [x] AC4 — Un slug inexistant rend `data: []`, `meta.total: 0`, statut 200.

## Hors périmètre

- Les fiches elles-mêmes (TCK-2522, TCK-2523).
- Le retrait des endpoints `…/{slug}/properties`.

## Notes d'implémentation

Re-mesuré le 2026-11-09 (vague 1, agent « recherche ») :

- **La liste ne parle pas `filter[…]`** : `GET /api/public/properties/search` prend tous ses filtres à plat
  (`contract_type=rent`). Les paramètres sont donc **`agency=<slug>`**, **`agent=<slug>`** et **`facets=…`** ; AC2 se lit
  `agency=a&contract_type=rent&facets=type`. Le `filter[contract_type]` du ticket est le dialecte des endpoints de
  portefeuille (`PublicPortfolioRequest`), seul endroit où il existe.
- **AC1, « avec un bien loué de l'agence »** : un bien loué est déjà exclu par `public()` (`rented` est dans
  `NON_PUBLIC_STATUSES`) — il ne départage rien. Ce qui sépare `public()` de `publicPortfolio()`, ce sont les statuts
  `published` et `pending` ; le test les porte, et l'ablation (clause `status = 'available'` retirée) rend 5 rouges.
- `users.public_slug` existe (migration `2026_11_09_100010` de TCK-2519, jouée) : `agent` résout comme la fiche — slug au
  nom, puis un ANCIEN slug au nom (`metadata.previous_public_slugs`), puis `username` ; replié en minuscules.
- Prémisse « les biens d'une agence suspendue fuient dans la liste par l'index » mesurée, non réelle (2026-11-09, test
  jetable sous Meilisearch) : la suspension par `POST /api/admin/agencies/{id}/suspend` comme un `save()` du statut
  retirent les biens de la liste, de la carte et de la fiche (`AgencyObserver` réindexe, `shouldBeSearchable()` lit le
  statut de l'agence) ; aucune écriture de `agencies.status` hors modèle dans `app/`.

Décisions non évidentes :

- **`App\Services\Search\ProfilDuFiltre`** résout les slugs avec les prédicats des fiches (agence : active, standard).
  Pour l'agent, la résolution est PARTAGÉE avec la fiche, pas recopiée : **`App\Services\Public\AgentPublic::parSlug()`**
  (trois niveaux de slug, compte actif, fiche publique de TCK-2506, `sansAgenceHorsLigne()` de TCK-600), appelée par
  `PublicAgentController::ficheOu404()` et par `ProfilDuFiltre::agent()`. Une adresse qui sert la fiche filtre la liste ;
  une adresse qui rend 404 la vide. Inconnu → clause `id = 0` (rien), jamais d'erreur. Épinglé par
  `test_un_ancien_slug_rend_le_portefeuille_de_l_agent` (ablation de la délégation : rouge, liste ≠ fiche).
- Revue adverse : `test_un_agent_d_une_agence_hors_ligne_ne_sort_aucun_bien_personnel` — un agent d'une agence suspendue
  garde dans l'index ses biens PERSONNELS (sans agence) ; `agent=` n'en sort aucun (slug ou `username`), la fiche est 404.
  Ablation de `sansAgenceHorsLigne()` dans `AgentPublic::parSlug()` : rouge.
- **Facettes** : `meta.facets.<clé>` = `[{value, count}]`, seulement les clés demandées (sinon la méta reste les quatre
  clés canoniques). Chaque facette sous le filtre complet moins le sien, en un `/multi-search` (régime conjonctif). Le
  filtre propre de `contract_type` inclut `rent_period` (gardé, il mettrait toute vente à 0) ; celui de `neighborhood` est
  `location`. `bedrooms` est **cumulé** (le filtre est un minimum : l'option 3 = « 3+ ») ; `neighborhood` est replié par
  `CleDeQuartier` (« Grand-Yoff » = « Grand Yoff », écriture la plus fréquente) — la clé que compare `location`.
- `facets` n'entre pas dans la graine de rotation des emplacements.
- **Pas de journal** (ADR-0088) sous `agency`/`agent` : un total de portefeuille passerait pour celui du catalogue (zéro
  résultat → Radar, variantes).
- `agency`, `agent`, `facets` sont propres à la liste (`MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE`) ; ⚠ le miroir
  front et `HORS_INTERFACE` de `search-filters.parity.test.ts` doivent suivre.
- Les emplacements sponsorisés suivent le filtre : sur une fiche, la page servirait en « Sponsorisé » des vedettes de
  l'agence elle-même — le front des fiches (TCK-2522/2523) envoie `placements=false`.
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (fiche d'agence) et § 2.4 (`agency`, `agent`, `facets` à plat ; non journalisés).
