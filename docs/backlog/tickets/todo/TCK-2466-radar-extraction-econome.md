---
id: TCK-2466
title: "Radar : l'IA ne reçoit que la description et ce qui manque, sur un petit modèle ; la valeur lue fait foi"
status: todo
phase: P2
family: back
estimate: M
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2465]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, ia, cout, adr-0087]
---

## Objectif utilisateur

Le Radar extrait toutes les annonces d'un site pour une fraction du coût actuel, sans perdre en justesse.

## Contexte (mesuré le 2026-11-04)

30 extractions locales (`ai_calls`, `usage_key = radar.extraction`) : 5 896 jetons d'entrée et 1 159 de sortie en
moyenne sur `claude-sonnet-5-5` ≈ 0,023 $ l'annonce ; plafond 3,33 $/jour ≈ 140 annonces. `radar.extraction` est le seul
usage du rôle `extraction` (`grep AiModelRole::Extraction app`). TCK-2465 pose `source_fields` (valeurs lues sans IA).

## Contraintes strictes (métier)

- **Une valeur de `source_fields` fait foi** : elle est retenue avec la confiance `high` et la preuve « lue sur la page »
  (forme exacte à choisir, lisible dans la relecture) ; le modèle ne peut pas la remplacer.
- **Une contradiction se signale** : valeur du modèle ≠ valeur lue → drapeau `source_conflict` sur le champ (même
  mécanisme que `out_of_bounds` dans `ExtractionNormalizer`), visible à la relecture.
- Les clauses de la passerelle ne changent pas : budget, coupe-circuit, données externes délimitées (`ExternalContent`).
- La version du prompt avance (`resources/ai/prompts/versions.lock.json`), et le jeu d'évaluation
  (`resources/ai/evals/radar.extraction`) continue de passer.

## Delta à produire

- [ ] `ExtractRadarListing` : l'entrée du modèle = les champs déjà lus (liste courte « déjà connu ») + le titre et la
      description seuls ; le prompt demande de ne remplir que ce qui manque.
- [ ] **Appel sauté** quand `source_fields` porte type, contrat, prix, ville ou quartier, et (chambres, ou un type sans
      chambre : terrain, bureau, commerce, entrepôt) : l'extraction est composée sans le modèle, la nature de l'annonceur
      est déduite des `sellerSignals` (boutique / vérifié pro / promoteur → `agency` ou `intermediary` probable, sinon
      `unknown`), et l'annonce passe `extracted`. Aucune tentative n'est comptée.
- [ ] `ExtractionNormalizer` : fusion « lu d'abord », drapeau `source_conflict`.
- [ ] `config/ai.php`, rôle `extraction` : `claude-haiku-5-5` en premier maillon, `claude-sonnet-5-5` en repli.
- [ ] Tests : `RadarExtractionSourceFieldsTest` (valeur lue retenue, contradiction signalée, appel sauté quand tout est
      lu — la passerelle simulée n'est pas appelée), et une mesure : jetons d'entrée sur les fixtures de TCK-2465 avant /
      après, écrite dans les Notes.

## Critères d'acceptation

- [ ] AC1 — Une annonce dont la page donne type, contrat, prix, lieu et chambres est `extracted` sans aucun appel au modèle
      (aucune ligne `ai_calls`).
- [ ] AC2 — Quand le modèle rend un prix différent du prix lu, l'extraction garde le prix lu et porte `source_conflict`.
- [ ] AC3 — Le texte envoyé au modèle pour la fixture CoinAfrique de TCK-2465 fait moins de 2 000 caractères (contre
      6 041 mesurés).
- [ ] AC4 — Ablation : retirer la fusion « lu d'abord » fait rougir AC2.

## Hors périmètre

- Changer le schéma de sortie de l'agent (limite des 16 unions d'Anthropic, TCK-2411).

## Notes d'implémentation

### Re-mesures du 2026-11-04 (avant de coder, sur `07f1af07d` + l'arbre partagé)

- **Où entrent le texte et les champs** : `ExtractRadarListing::handle()` compose UNE entrée,
  `ExternalContent::wrap(<site>, raw_text)`, passée à `new AiRequest(...)` ; `source_fields` (TCK-2465) n'est lu que pour
  les numéros. Depuis TCK-2465, `raw_text` d'une page lue par l'adaptateur vaut déjà titre + description
  (`ListingPage::text()`) : **le gros de la baisse de caractères visée par AC3 est déjà livré par TCK-2465** (fixture
  CoinAfrique : 185 caractères de texte, 412 une fois délimité).
- **D'où viennent les 5 896 jetons d'entrée** (relevé sur les 24 appels réussis `radar.extraction` du rôle `extraction`
  de la base locale, ids 25 à 48 = les cas 001 à 024 du jeu d'évaluation joué le 2026-10-30, dans l'ordre) : régression
  linéaire jetons d'entrée ~ caractères de l'entrée délimitée, **5 559 jetons fixes + 0,435 jeton par caractère** (écart
  maximal 36 jetons). **≈ 94 % des jetons d'entrée sont fixes** (prompt v3, 5 351 caractères, et schéma de l'outil de
  sortie) : raccourcir le texte de l'annonce ne baisse le coût d'entrée qu'à la marge. Les leviers sont le modèle
  (Haiku : 0,10 $/M en entrée contre 2,00) et la SORTIE (1 203 jetons en moyenne, ≈ la moitié du coût sur Sonnet, dont la
  recopie de `title` et `description`).
- **`ExtractionNormalizer`** : un drapeau est une chaîne dans `flags` d'un champ (`FLAG_*`), et « tout drapeau force la
  confiance à `low` ». Aucune liste de drapeaux côté API hors de ces constantes ; `RadarListingResource` rend
  `extracted` tel quel.
- **La relecture (front)** : `takussan-web/src/types/radar.ts` (`RADAR_FIELD_FLAGS`) et `fiche/confiance.ts` — un drapeau
  inconnu du front **alerte quand même** et s'affiche par son code brut ; un champ `high` sans drapeau n'affiche rien, et
  `evidence` n'est montré que s'il est non nul.
- **Version du prompt** : `RadarExtractionUsage::promptVersion()` (3) → `resources/ai/prompts/radar.extraction/v<N>.md`,
  figé par `versions.lock.json` (`PromptVersionsAreFrozenTest`). `baseline.json` du jeu d'évaluation porte
  `prompt_version: 3`, sans contrôle de concordance.
- **Jeu d'évaluation** : ses 24 cas texte sont des pages passées par `HtmlCleaner` SANS `source_fields`
  (`RadarExtractionEvalSetTest::test_each_input_is_what_the_job_sends` exige `input === ExternalContent::wrap(site,
  texte)`) : l'entrée d'une annonce sans champ lu doit rester exactement celle-là.
- **Les adaptateurs ne lisent jamais `bedrooms` sur la page d'une annonce** (`parseListing()` : CoinAfrique donne des
  PIÈCES, `rooms` ; Expat-Dakar, rien). Seules les cartes de liste en portent. Avec les adaptateurs d'aujourd'hui,
  **l'appel n'est donc sauté que pour un type sans chambre** (terrain, bureau, commerce, entrepôt).
- **`config/ai.php`** : le rôle `extraction` avait déjà `claude-haiku-5-5`, mais en SECOND maillon. Une ligne
  `ai_role_assignments` (console, ADR-0085) l'emporte sur ce repli : en préproduction, vérifier qu'aucune n'est posée.

### Décisions et écarts au Delta

- **Forme d'une valeur lue** (« forme exacte à choisir ») : `{value, confidence: "high", evidence: null, flags, source:
  "page"}` (+ `raw`/`period` pour le prix, `neighborhood_id`/`suggestions` pour le quartier). `evidence` reste nul : rien
  n'est cité, la valeur est LUE ; c'est `source: "page"` qui le dit (le front possède le libellé). En cas de
  contradiction : `flags` porte `source_conflict` et `model_value` la valeur du modèle.
- **`source_conflict` ne rabaisse pas la confiance** (exception à « tout drapeau force `low` ») : il accuse le modèle, pas
  la page. Les autres drapeaux (`out_of_bounds` sur une valeur lue) rabaissent comme avant. Comparaison au repli près :
  nombres à 0,01, chaînes sans casse, accents, tirets ni blancs superflus ; un modèle qui rend `null` ne contredit rien.
- **Champs qui font foi** (`ExtractionNormalizer::PAGE_FIELDS`) : type, contrat, période, prix, quartier, ville,
  chambres, salles de bain, surface, meublé, titre, et `seller_name` → `advertiser_name`. Une valeur de la page qui ne
  passe pas la conversion (hors énumération) est ignorée. `rooms` (pièces) n'est jamais `bedrooms`.
- **Page lue par un adaptateur** (`source_fields.title` présent) : la description est `raw_text` sans la ligne du titre,
  numéros masqués (`PhoneMasker::mask`) ; le modèle ne la recopie plus (économie de SORTIE, ≈ la moitié du coût d'avant).
- **Numéros** : ceux de la page passent devant ceux du modèle dans `extracted.phones` (lu par `RadarMatcher`), et sortent
  de `phones_dropped`.
- **Nature déduite des indices du vendeur** (`natureFromSignals`, confiance `medium`) : `business_name` (nom d'entreprise :
  agence, immobilier, promoteur, SARL…) → `agency` ; `professional_badge` (boutique CoinAfrique) → `probable_intermediary` ;
  ni l'ancienneté, ni le nombre d'annonces, ni un numéro vérifié → `unknown`. Appliquée aussi quand le modèle est appelé
  mais rend `unknown` (ou une nature signalée) ; les indices de la page passent devant ceux du modèle dans
  `nature_signals`.
- **Appel sauté** (`readsEnough`) : type + contrat + prix + (ville OU quartier) + (chambres OU type ∈ land, office, shop,
  warehouse). Sans appel : ni `ai_calls`, ni tentative, **ni suggestion** `radar.extraction` (rien du modèle à juger ; le
  taux d'acceptation ne mesure que ce que le modèle propose). L'annonceur est rattaché et enrichi comme avant.
- **Enrichissement de l'annonceur** : une valeur `source: page` seulement contredite (`source_conflict`) compte comme
  « sans drapeau » — la valeur lue fait foi.
- **L'entrée du modèle** : UN seul bloc `ExternalContent` (la liste vient elle aussi de la page, donc d'une source
  externe) : `Déjà lu sur la page :` + lignes `champ: valeur` (noms du schéma, `pieces` en plus, `title, description: le
  texte ci-dessous`) + `Annonce :` + le texte. **Ni le nom du vendeur ni ses numéros** n'y figurent : ils ne servent à
  aucun champ manquant (minimisation). Sans champ lu (texte, captures, page `HtmlCleaner`), l'entrée est EXACTEMENT
  celle d'avant — le jeu d'évaluation reste la forme du job.
- **Prompt `v4`** = `v3` + la section « Ce qui est déjà lu sur la page » (+ 835 caractères). Schéma inchangé.

### Mesures (2026-11-04)

Entrée délimitée envoyée au modèle, en caractères, sur les fixtures de TCK-2465 :

| Fixture | `HtmlCleaner` (avant TCK-2465) | adaptateur, job d'avant | adaptateur + « déjà lu » (TCK-2466) |
|---|---|---|---|
| CoinAfrique | 763 | 422 | **630** (AC3 : < 2 000) |
| Expat-Dakar | 736 | 337 | 500 |

Les fixtures sont écrites à la main (sans le menu du site) : sur la page RÉELLE de CoinAfrique, `HtmlCleaner` rendait
6 041 caractères, l'adaptateur ≈ 375 de texte (rapport TCK-2465).

**En jetons** (modèle mesuré plus haut : 5 559 fixes + 0,435 par caractère) : page réelle CoinAfrique avant TCK-2465
≈ 8 280 jetons d'entrée ; fixture après TCK-2466 ≈ 5 830 + 250 à 360 de prompt en plus (835 caractères à 0,3-0,435) ≈
**6 100 jetons**. La liste « déjà lu » coûte ≈ 90 jetons d'entrée de plus que le seul texte : elle se paie par les
champs que le modèle n'a plus à rendre (sortie : 1 203 jetons en moyenne, non re-mesurée — elle demande un vrai appel).
**Le gain de coût vient du modèle** : à jetons égaux, Haiku coûte 20 fois moins que Sonnet (entrée 0,10 contre 2,00 $/M,
sortie 0,50 contre 10,00). Ordre de grandeur : 6 100 × 0,10 + 1 203 × 0,50 ≈ **0,0012 $ l'annonce** au pire (sortie
inchangée), contre 0,023 $ ; ≈ 2 750 annonces/jour sous le plafond de 3,33 $, et 0 $ pour une annonce dont l'appel est
sauté.

### Ce qui reste à faire hors de ce ticket

- **L'évaluation payante n'a pas été jouée** : `php artisan ai:eval radar.extraction` (vrai appel, clé requise) doit dire
  si Haiku tient la référence (`baseline.json` : 0,945 sur le rôle `extraction`, Sonnet, prompt v3). Le jeu à sec
  (`RadarExtractionEvalSetTest`) est vert. ⚠ Le jeu ne contient aucun cas « déjà lu » : il ne mesure pas la section neuve
  du prompt.
- **Front de relecture** : `RADAR_FIELD_FLAGS` (`takussan-web/src/types/radar.ts`) + libellé `confidence.flags.source_conflict`
  (fr/en/wo) — sans eux, le drapeau alerte mais s'affiche par son code brut ; afficher `model_value` à côté ; afficher
  « Lu sur la page » pour `source: "page"` (aujourd'hui : rien, un champ `high` sans passage n'affiche rien).

### À reporter dans les specs

- `docs/features.md` §2.12 : ce que la page d'une annonce dit en clair fait foi (confiance haute, « lu sur la page ») ;
  une valeur du modèle qui la contredit est signalée (`source_conflict`) et jamais retenue ; une annonce dont la page
  dit type, contrat, prix, lieu et chambres (ou un terrain, bureau, commerce, entrepôt) est extraite sans IA ; le modèle
  ne reçoit que la liste « déjà lu » et le titre + la description ; rôle `extraction` : Haiku d'abord, Sonnet en repli.
- `docs/models-spec.md`, `radar_listings.extracted` : un champ peut porter `source: "page"` et, contredit,
  `model_value` ; drapeau `source_conflict`.
