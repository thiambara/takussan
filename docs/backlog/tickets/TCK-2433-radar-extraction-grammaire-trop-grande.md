---
id: TCK-2433
title: "Radar : l'extraction quitte la sortie structurée stricte, dont la grammaire compilée dépasse la limite d'Anthropic, et une garde borne les schémas stricts"
status: done
phase: P1
family: bug
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2411]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, ia, socle-ia, garde, adr-0076, adr-0077]
---

## Objectif utilisateur

Un opérateur du Radar qui colle une annonce obtient son extraction. Après TCK-2411, elle échoue
encore, avant d'atteindre le modèle.

## Contexte

L'évaluation payante `radar.extraction`, lancée depuis `dev` après la fusion de TCK-2411 (#1589,
`2d40d466f`), rend un autre HTTP 400 (`request_id` `req_011CgXcoW2oogB57WsCGbQkH`) :

> The compiled grammar is too large, which would cause performance issues. Simplify your tool
> schemas or reduce the number of strict tools.

La limite de 16 paramètres à union est respectée (14), mais la documentation d'Anthropic sur les
sorties structurées décrit, au-delà de ses trois limites explicites (20 outils stricts, 24 paramètres
optionnels, 16 unions), des « limites internes sur la taille de la grammaire compilée » : unions,
objets imbriqués, paramètres optionnels et outils interagissent, sans seuil publié. Le job
`ExtractRadarListing` sert le même schéma : l'extraction de production reste cassée.

## Contrat de données

- Aucune migration, aucun endpoint, aucun changement de forme : `radar_listings.extracted` reste la
  sortie de `ExtractionNormalizer`.
- Ce qui change est le **mode** de la sortie structurée pour l'agent `RadarExtraction` : un outil
  forcé non strict (`output_structured_data`) au lieu de `output_config.format` (grammaire
  compilée). Les autres agents restent stricts.

## Contraintes strictes

- Aucun test n'appelle un vrai modèle ni le réseau (`Http::fake`, `preventStrayRequests`).
- Le schéma, le prompt (`v2`) et le normaliseur de l'extraction ne changent pas : la qualité de
  l'extraction ne dépend pas de ce correctif.
- La décision se défait en une ligne (`SocleAgent::usesStrictSchema()`).

## Delta à produire

- [x] `SocleAgent::usesStrictSchema()` (vrai par défaut), `RadarExtraction` le passe à faux.
- [x] `AiGateway` sert un agent non strict par la sortie structurée par outil de laravel/ai
      (`use_native_structured_output = false`), sans changer le fournisseur journalisé.
- [x] Garde : un schéma strict au-delà de la taille du plus gros schéma dont la compilation est
      attestée par un vrai appel rougit ; ses limites sont écrites.

## Critères d'acceptation

- [x] AC1 — Une extraction envoie à Anthropic une requête sans `output_config`, avec l'outil
      `output_structured_data` non strict et `tool_choice` forcé sur lui ; la réponse de l'outil est
      relue en sortie structurée et journalisée sous le fournisseur `anthropic`.
- [x] AC2 — Un agent strict (`radar.verification_accord`) envoie toujours `output_config.format`.
- [x] AC3 — La garde rougit sur un agent strict plus gros que le plus gros schéma attesté (dont le
      schéma de `RadarExtraction` s'il redevenait strict), et laisse passer les agents livrés.
- [x] AC4 — Chaque AC rougit sans son correctif (ablation consignée).
- [x] AC5 — L'outil de sortie n'est jamais forcé (`tool_choice` `auto`, ni `tool` ni `any`), et un agent
      strict n'envoie aucun `tool_choice` ; une réponse sans sortie est un échec du maillon
      (`ai.response_invalid`), que `ExtractRadarListing` retente une fois.

## Notes d'implémentation

2026-10-30, sur `fix/ia-grammaire-trop-grande`.

- **Vérifié par l'évaluation réelle (2026-10-30, sur `2c35c0164`)** : `radar.extraction`,
  `anthropic/claude-sonnet-5-5`, **0,9560 sur 30 cas, 0 échec**, 420,81 XOF ; rôle `extraction` 0,9450
  (24 cas), rôle `vision` 1,0000 (6 cas) ; champ le plus faible `amenities`, 0,7718. La référence est
  versionnée (`resources/ai/evals/radar.extraction/baseline.json`, prompt `v3`). Refus précédents :
  grammaire compilée trop grosse (`req_011CgXcoW2oogB57WsCGbQkH`), puis outil forcé refusé
  (`req_011CgXdugoVPAgD4WoamUxvx`).

- **Ce qui gonfle la grammaire ne se mesure pas en local.** La documentation d'Anthropic (sorties
  structurées, « Schema complexity limits ») publie 20 outils stricts, 24 optionnels et 16 unions, puis
  des « limites internes sur la taille de la grammaire compilée », sans seuil, où unions, objets
  imbriqués, optionnels et outils interagissent. Relevé sur le schéma envoyé (sanitizer compris) :
  `RadarExtraction` 96 nœuds de schéma, 17 objets, 14 unions (chacune dans un objet imbriqué), 19 enums
  (71 valeurs, dont `property_type` à 16), 0 optionnel, aucun motif ni contrainte de longueur,
  6,9 ko ; `RadarConsentVerification`, compilé le 2026-10-29 : 21 nœuds, 1 objet, 5 unions à plat,
  1,2 ko. Le suspect le plus probable est la combinaison de 14 unions logées dans 15 objets imbriqués,
  mais rien ne permet de le prouver sans un vrai appel par variante.
- **Le schéma reste entier ; c'est la contrainte de décodage qui part.** Le non-strict ne compile aucune
  grammaire (la documentation : « Non-strict tools don't count toward this limit » ; son premier conseil
  est de réserver le strict aux schémas où une violation coûte). `ExtractionNormalizer` valide déjà
  chaque valeur : type et enum (`invalid_value`), bornes, passage cité, champ absent lu `null`, tout
  drapeau rabat à `low`, et un humain relit chaque fiche.
- **Le mode se règle par agent, mais laravel/ai ne le règle que par fournisseur**
  (`use_native_structured_output`, lu par `BuildsTextRequests::supportsNativeStructuredOutput()`).
  `AiGateway::providerFor()` enregistre donc à l'exécution un double du fournisseur du maillon
  (`anthropic-sortie-par-outil`), à ce réglage faux, et le passe à laravel/ai ; journal, coût, cache et
  chaîne gardent `anthropic`. Le double n'est pas dans `config/ai.php` : la liste fermée des
  fournisseurs et sa garde de confidentialité ne changent pas.
- **ADR-0076 §10 tient** : l'outil `output_structured_data` est le canal de la sortie, pas une
  capacité. laravel/ai l'écarte des appels d'outils réels et n'exécute rien ; l'agent n'implémente ni
  `HasTools` ni `HasSkills` (`ExternalContentPolicy`), et le test au fil vérifie que c'est le seul outil
  envoyé.
- **La garde voisine se calibre sur deux points.** `StrictSchemasStayWithinTheAttestedSizeTest` : un
  schéma strict ne dépasse pas 21 nœuds (le plus gros compilé par un vrai appel) ni 24 optionnels ; le
  schéma refusé (96) la ferait rougir. Elle ne voit ni un petit schéma de forme coûteuse, ni un
  changement des limites internes d'Anthropic. `AgentSchemasStayUnderTheUnionLimitTest` garde tous les
  agents, stricts ou non, et partage ses mesures (`Tests\Support\Ai\AnthropicSchemas`).
- **Ablations** (restauration prouvée par `cmp`) : `RadarExtraction::usesStrictSchema()` à vrai → la
  garde (96 nœuds) et le test au fil rougissent ; la passerelle sans `providerFor()` → le test au fil de
  l'extraction rougit ; le double servi à tous les agents → le test de l'agent strict rougit.

- **Second refus réel (2026-10-30, `req_011CgXdugoVPAgD4WoamUxvx`)** : « tool_choice: type "tool" and
  "any" are not supported for this model ». Documentation d'Anthropic, « Forcing tool use » : Opus 5.5,
  Sonnet 5.5, Fable 5.1 et Mythos 5.1 refusent l'outil forcé quels que soient les réglages de réflexion ;
  la réflexion manuelle le refuse sur tout modèle, l'adaptative non. Le rôle `extraction` joue
  `claude-sonnet-5-5` puis `claude-haiku-5-5`. `SocleAgent` implémente donc `HasProviderOptions` : un agent
  non strict envoie `tool_choice` `auto` (fusionné en dernier dans le corps par laravel/ai), un agent
  strict rien. laravel/ai relit la sortie dans l'appel d'outil, ou à défaut dans un JSON du texte ; une
  réponse qui n'en porte aucune devient, dans la passerelle, un échec du maillon `ai.response_invalid`
  (bascule, puis retentative unique du job, déjà prévue pour ce code). Prompt `v3` : la réponse est
  l'objet du schéma, rendue par l'outil de sortie quand il est proposé. Avec `auto`, le modèle peut
  réfléchir avant d'appeler l'outil (un appel forcé sautait la réflexion) : ses jetons comptent dans
  `max_tokens` (8 000), une réponse coupée bascule (`ai.response_truncated`).
- **Ablations du second correctif** (restauration prouvée par `cmp`) : sans `tool_choice` `auto` → le test au
  fil de l'extraction rougit ; `auto` pour tous les agents → le test de l'agent strict rougit ; sans l'échec
  sur sortie vide → le test au fil et `test_a_response_without_output_fails_over_then_is_retried_once`
  rougissent. Deux épreuves du job (`an invalid output …`) prennent une sortie incomplète au lieu de `[]`,
  qui n'arrive plus au job.

### Décisions prises en autonomie, à revoir

- **Retenu** : sortie par outil non strict pour `RadarExtraction` seul, réglable par agent en une ligne.
  **Écarté** : simplifier le schéma pour rester strict (aplatir les objets, retirer les unions), parce
  que le seuil n'est pas publié, que chaque essai coûte un vrai appel, et que la forme du schéma porte
  la sémantique que le normaliseur et le jeu d'évaluation lisent (`null`, `{value, confidence, evidence}`).
- **Retenu** : le réglage sur l'agent (`usesStrictSchema()`). **Écarté** : `use_native_structured_output`
  faux pour tout le fournisseur, qui aurait retiré le strict à `radar.verification_accord`, dont la
  référence réelle vient d'être fixée en strict.
- **Retenu** : `tool_choice` `auto` + prompt `v3` + échec sur sortie vide (piste a). **Écarté** : retirer la
  réflexion (piste b), sans effet sur Sonnet 5.5, qui refuse l'outil forcé de toute façon ; un schéma strict
  réduit (piste c), au seuil de grammaire non publié et payé d'un appel par essai ; `auto` seulement pour les
  modèles qui refusent le forcé, qui exigerait une liste de modèles à tenir à jour.
- **Retenu** : attendre l'évaluation réelle avant `done`. **Écarté** : `done` sur les seuls tests, qui ne
  joignent aucun modèle — le second refus (outil forcé) l'a justifié.
