---
id: TCK-2476
title: "Recherche : l'IA tient chaque semaine les variantes d'écriture (Wakam → Ouakam, appart, F4) à partir des recherches sans résultat"
status: todo
phase: P2
family: back
estimate: M
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2472, TCK-2474]
blocks: []
spec_refs:
  features:
    - "docs/features.md"
  models: []
tags: [api, search, suggestion, ia, adr-0088]
---

## Objectif utilisateur

La recherche comprend de mieux en mieux la façon dont les gens écrivent, sans que personne n'ait à tenir un dictionnaire.

## Contrat de données

- Migration `create_search_aliases_table` : `id`, `alias` (string 80, replié), `target_kind` (`city` | `neighborhood` |
  `property_type` | `term`), `target_value` (string), `target_city` (string null), `origin` (`ai` | `manual`), `status`
  (`active` | `rejected`), `evidence` (jsonb : visiteurs distincts, période), timestamps ; unique (`alias`, `target_kind`,
  `target_value`).
- Usage IA `search.variantes` (rôle `extraction`, plafond quotidien modeste) : entrée = saisies normalisées sans résultat
  du journal (≥ 2 visiteurs distincts sur 30 jours, au plus 200) + la liste des entités connues (lieux, types, termes) ;
  sortie = `[{alias, target_kind, target_value, target_city?, confidence}]`.
- Commande `search:refresh-aliases` (hebdomadaire, idempotente) ; les alias actifs alimentent `DatabasePlaceLexicon`
  (TCK-2473) et l'index des suggestions (TCK-2474).
- Routes `GET /api/admin/search/aliases` (pagination, `filter[status]`, `filter[origin]`) et `PATCH
  /api/admin/search/aliases/{alias}` (`{status}`) — super-admin (`platform.*` existant le plus proche, à re-mesurer).

## Contraintes strictes (métier)

- **Une variante n'est retenue que si sa cible existe** (lieu du référentiel, type de `PropertyType`, terme du vocabulaire
  de TCK-2473) ; sinon écartée.
- Une variante `rejected` ne revient jamais par l'IA ; une variante `manual` n'est jamais modifiée par l'IA.
- Aucune donnée personnelle dans l'entrée : les saisies retenues ont déjà passé les exclusions d'ADR-0088 §3.

## Delta à produire

- [x] Migration, modèle `SearchAlias`, usage et agent, service `SearchAliasCurator`, commande planifiée, contrôleur,
      FormRequest, ressource.
- [x] Tests : `SearchAliasCuratorTest` (passerelle simulée : cible inexistante écartée, `rejected` jamais rouvert,
      `manual` intact), et « après `wakam → Ouakam`, `q=wakam` interprète `location=Ouakam` ».

## Critères d'acceptation

- [x] AC1 — Une proposition vers un quartier inexistant n'est pas enregistrée.
- [x] AC2 — Une variante rejetée n'est pas recréée au passage suivant.
- [x] AC3 — Une variante active est comprise par le parseur et trouvée dans l'index des suggestions.

## Hors périmètre

- Une page de console pour les variantes (l'API suffit pour l'instant).

## Notes d'implémentation

### Re-mesures (2026-11-04, arbre de `feat/radar-2-et-suggestions`, HEAD `156585e7b`)

- **Le geste `platform.*` le plus proche.** Aucun geste « recherche » réservé au `super_admin` : `platform.search.global`
  est la recherche transverse du `support`, `platform.radar.operate` aussi du `support`. Les candidats `super_admin` seul
  sont `platform.settings.manage` (régler la plateforme) et `platform.ai.manage` (régler la console IA). Retenu :
  **`platform.settings.manage`** — une variante règle ce que la recherche comprend, pas l'IA. Les routes ne déclarent
  **aucun** `platform-can:` : elles restent au `super_admin` par le refus par défaut de la console
  (`PlatformRoutesDefaultDenyTest` les couvre sans ligne de plus), et leurs FormRequest le redisent par ce geste.
- **Le contrat de `SuggestionIndexBuilder::withAliases()`** (TCK-2474) est tenu tel quel (`alias`, `target_kind`,
  `target_value`, `target_city`, `status`). Mesuré en route : une variante de LIEU entre aussi dans l'index par
  `referentialNames()`, qui lit `DatabasePlaceLexicon::entries()` — donc deux chemins, dédoublonnés par `aliases()`. Une
  variante de type ou de terme n'y entre que par `withAliases()` (l'ablation de `withAliases()` le montre).
- **Le test de TCK-2474 créait la table** (`Schema::create('search_aliases')` dans `SuggestionIndexBuilderTest`) : il
  lève désormais (« relation already exists »). Il écrit maintenant par le modèle.
- **`NamespaceAccessGuardTest` est rouge AVANT ce ticket**, sur HEAD : `{revision}` (`radar/targets/revisions/{revision}/revert`,
  TCK-2470) et `{target}` (`radar/targets/{target}`, TCK-2468) ne sont pas liés à une ligne réelle, le repli « 1 » rend
  404 avant la garde. Hors périmètre, non corrigé ; `{alias}` y est lié à une vraie variante, et
  `SearchAliasApiTest::test_un_admin_d_agence_est_refuse` prouve le 403 de nos deux routes directement.

### Décisions

1. **Au nom de qui l'IA est jugée.** La passerelle exige un acteur (seuls les embeddings s'en passent) et il n'y a pas
   de réglage à allumer (≠ TCK-2470). `search:refresh-aliases --operator=<id>` le désigne ; à défaut, **le plus ancien
   `super_admin` actif qui détient `platform.settings.manage`** (`SearchAliasCurator::defaultOperator()`). Aucun → issue
   `search.aliases.no_operator`, rien de lu ni d'appelé. *À trancher par le porteur s'il préfère un réglage explicite
   comme `radar_demand_settings`.*
2. **Classe de données `publique`**, comme le ticket le dit : saisies normalisées qui ont passé ADR-0088 §3 à l'écriture
   (re-vérifiées par `SearchJournal::isJournalisable()` avant envoi), portées par ≥ 2 visiteurs distincts.
3. **« ≥ 2 visiteurs distincts sur 30 jours »** se lit par `zeroResultDemand(30, 2, 200)` : la somme des visiteurs
   distincts des jours sans résultat (visiteurs-jours), seule mesure que le journal anonyme permet.
4. **Seules les saisies qui gardent un résidu** (texte que l'analyse ne comprend pas) partent : une recherche entièrement
   comprise et sans résultat est un manque de stock, pas une écriture inconnue. Conséquence : une variante qui marche
   retire ses saisies du passage suivant.
5. **Un terme** est une phrase du vocabulaire de `SearchQueryParser` hors types (contrat, période, ameublement,
   équipements) — `SearchQueryParser::termEntry()` / `terms()`. « F4 » n'est pas une cible : c'est la grammaire des
   chambres, déjà comprise.
6. **Le code valide, en plus de la cible** : l'écriture doit être lue en mots entiers dans une saisie reçue
   (`not_in_queries`) ; une écriture que l'analyse comprend déjà — le nom même, un mot-clé, son pluriel — est écartée
   (`already_understood`) ; une écriture proposée pour deux cibles n'en garde aucune (`duplicate`) ; confiance < 0,7 ;
   au plus 50 créations par passage. Un lieu se vise par son NOM du référentiel (un ancien nom est déjà compris), un
   quartier homonyme de deux villes sans ville proposée est écarté. Les écarts sont journalisés
   (`search.aliases.discarded`), sans révision en base (pas demandé).
7. **Un geste d'opérateur rend la variante `manual`** (PATCH) : l'IA ne la touche plus, et une rejetée ne revient jamais
   (vérifié par (écriture, sorte, cible), la clé unique).
8. **Pas d'appel inutile** : l'empreinte des saisies du dernier passage appelé est gardée en cache
   (`search.aliases.last_signature`, sans expiration) ; un cache perdu coûte un appel, jamais un doublon.
9. **Plafond** 0,25 $/jour ; **planification** le lundi 04:10 (Dakar), en file `ai` (`RefreshSearchAliases`, unique,
   85 s, une tentative).
10. **Lecture par l'analyse** : lieux par `DatabasePlaceLexicon::entries()` (variante → entrée du lieu qu'elle désigne,
    s'il est encore au référentiel) ; types et termes par une interface `VocabularyAliases` injectée dans le parseur
    (`DatabaseVocabularyAliases`, en cache 600 s, liée dans `AppServiceProvider`), lue comme les phrases du vocabulaire,
    jamais par la tolérance aux fautes. Toute écriture de variante vide les deux caches (`SearchAlias::forgetCaches()`).

### Correctif du parseur (décision de la session)

Le résidu perd une liste courte et fermée de mots vides fr/en (`SearchQueryParser::STOPWORDS`), sauf dans une phrase
gardée entière à dessein (« moins de 3 chambres », « grand standing »). Un résidu fait de mots vides est `null`.
« je cherche un appartement à almadies » → `type`, `city`, `location`, résidu `null`, et le compte de la suggestion est
celui de la liste (4 dans `SuggestInterpretationTest`). Attentes de TCK-2473 changées en conséquence : « maison de ma
tante » → résidu `ma tante` ; « villa de luxe » → `luxe` ; « je cherche un appartement » → `null` ; « bonjour je
voudrais des renseignements » → `bonjour renseignements` (sorti du jeu « incomprises », qui exige la saisie entière).

### À reporter dans les specs

- **`docs/models-spec.md`** — nouvelle entrée, après `SearchQueryStat` :

  > ### 122. SearchAlias 🆕
  >
  > **Table :** `search_aliases` (migration `2026_11_04_247600`, TCK-2476)
  > **Modèle :** `App\Models\SearchAlias` (`AbstractModel`) — `target_kind` casté en `SearchAliasTargetKind`, `origin` en
  > `SearchAliasOrigin`, `status` en `SearchAliasStatus`, `evidence` en `array`. Aucune relation.
  > **Description :** Les variantes d'écriture de la recherche (ADR-0088 §7) — « wakam » → Ouakam, « aprt » → appartement,
  > « clime » → climatisation —, proposées chaque semaine par l'usage IA `search.variantes` (`SearchAliasCurator`, commande
  > `search:refresh-aliases`) à partir des recherches sans résultat, ou tranchées par un `super_admin`
  > (`PATCH /api/admin/search/aliases/{alias}` : la variante devient `manual`). Une variante `active` est comprise par
  > l'analyse de la saisie (`DatabasePlaceLexicon`, `DatabaseVocabularyAliases`) et trouvée dans l'index des suggestions
  > (`SuggestionIndexBuilder`) ; une variante dont la cible a quitté le référentiel n'est plus lue. Une variante `rejected`
  > n'est jamais rouverte par l'IA ; une variante `manual` n'est jamais modifiée par elle.
  >
  > | Colonne | Type | Nullable | Défaut | Description |
  > |---------|------|----------|--------|-------------|
  > | id | bigint PK | | auto | |
  > | alias | string(80) | | | L'écriture, repliée (`CleDeQuartier::de()` : minuscules, sans accents, ponctuation → espace) |
  > | target_kind | string(20) | | | `city` \| `neighborhood` \| `property_type` \| `term` |
  > | target_value | string(120) | | | Le nom du lieu tel que le référentiel l'écrit, la valeur de `PropertyType`, ou le terme replié du vocabulaire de l'analyse |
  > | target_city | string(120) | oui | null | La ville d'un quartier |
  > | origin | string(16) | | `ai` | `ai` \| `manual` |
  > | status | string(16) | | `active` | `active` \| `rejected` |
  > | evidence | jsonb | oui | null | Preuves du dernier passage : `visitors` (visiteurs-jours distincts), `queries`, `period {from, to}`, `confidence`, `ai_call_id` |
  > | created_at / updated_at | timestamp | | auto | |
  >
  > **Contraintes :** unique `search_aliases_alias_target_unique (alias, target_kind, target_value)` ; index
  > `search_aliases_status_kind_idx (status, target_kind)`.

- **`docs/features.md`** (recherche publique) : la saisie comprend les variantes actives ; les mots d'intention et de
  liaison (« je cherche un… ») ne sont plus cherchés en texte ; routes `GET /api/admin/search/aliases`
  (`filter[status]`, `filter[origin]`, `filter[target_kind]`, `per_page` ≤ 100) et `PATCH /api/admin/search/aliases/{alias}`
  (`{status}`), `super_admin` seul.
- **ADR-0088 §4** dit « la demande sans résultat ne sort que vers l'usage `radar.cibles` et la console » : elle sort
  aussi, en texte normalisé, vers `search.variantes` (§7 le décide déjà ; §4 à amender pour ne pas se contredire).
- La liste des usages IA de la console (si une spec l'énumère) : `search.variantes`, rôle `extraction`, classe
  `publique`, plafond 0,25 $/jour, `platform.settings.manage`.
