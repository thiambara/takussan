# Jeu d'évaluation — `radar.extraction`

TCK-2386 (ADR-0077 §5, socle ADR-0076 §8). Joué par `php artisan ai:eval radar.extraction`.

## ⚠ Des cas écrits pour l'occasion, pas de vraies annonces

Le plan demandait des annonces **réelles** anonymisées. Au moment d'écrire ce jeu, le Radar n'avait
encore rien collecté : les 30 cas sont **réalistes mais écrits pour l'occasion** (quartiers de Dakar
et de sa région, jargon « F3 », « 1M5 », « 450.000f/mois », style WhatsApp, annonces d'agence, de
démarcheur et de propriétaire). Ils mesurent la lecture de formes connues ; ils ne disent rien de la
distribution réelle des annonces. Ils sont à remplacer dès que des annonces corrigées existent.

Ils sont anonymisés comme le seraient de vraies annonces : aucun numéro (le jeton `[TELEPHONE]`),
aucun nom de personne ni d'agence (le jeton `[NOM]`), aucun courriel. `scripts/check-ai-evals-pii.mjs`
le garde pour les numéros et les courriels ; rien ne garde les noms.

## Ce qu'il contient

- `cases/001.json` … `024.json` : des annonces en texte ;
- `cases/025.json` … `030.json` : des annonces en **captures** (`captures/*.png`, un texte d'annonce
  rendu par GD), jouées sur le rôle `vision` comme en production (`AttachmentsUseVision`) ;
- `fields.json` : le type de chaque champ noté et le chemin de sa valeur dans la sortie.

Un cas est `{ "input", "expected", "attachments"? }`. **`input` est exactement ce que le job
envoie** (`ExtractRadarListing`) : `ExternalContent::wrap(<source_site>, <texte rogné>)`, et un bloc
vide pour une saisie par captures, les images étant jointes. `RadarExtractionEvalSetTest` le
vérifie : un `input` écrit à la main, sans passer par `ExternalContent::wrap()`, y rougit.

## Ce qui est noté

Les **valeurs** des douze champs de `fields.json`, jamais les passages cités ni les confiances : la
sortie rend `{"price": {"value": …, "confidence": …, "evidence": …}}`, et `"path": "price.value"`
fait lire au `FieldScorer` la seule valeur. Ni `title`, ni `description`, ni `phones`, ni
`advertiser_name`, ni `nature_signals` ne sont notés.

- `price` : le texte tel qu'écrit (« 1M5 », « 450.000f/mois »), égalité sans casse ni espaces de bord ;
- `bedrooms`, `bathrooms` : nombres exacts ; `surface_m2` : nombre à 5 % près ;
- `amenities` : recouvrement de listes (Jaccard), chaque équipement tel qu'écrit ; `null` si aucun ;
- le reste : égalité (`null` compris — une valeur absente de l'annonce ne doit pas être inventée).

Une annonce à plusieurs offres (cas 013) attend la première ; une annonce sans prix (cas 015)
attend `price: null`.

## Pas de référence (`baseline.json`)

Elle exige un vrai modèle : elle se fixe par un jeu **complet**
(`php artisan ai:eval radar.extraction --update-baseline`, sans `--role` ni `--model` — une
première référence d'un seul rôle est refusée, `ai.eval.baseline_needs_full_run`).

## Remplacer ces cas par de vraies annonces

1. Partir d'annonces dont l'équipe a vérifié les champs. ⚠ `php artisan ai:export-eval-cases`
   ne lit que les suggestions corrigées (`ai_suggestions`, décision `edited`), et le Radar du lot 1
   n'en écrit pas : il garde sa sortie dans `radar_listings.extracted`. Tant que c'est le cas, un cas
   se construit à la main : le texte brut de l'annonce et ses valeurs vérifiées passent d'abord par
   `EvalCaseAnonymizer::anonymize()` (noms, téléphones, courriels jetonnés dans le texte et les
   attendus), **puis** le texte anonymisé est enveloppé par `ExternalContent::wrap()`. Dans l'autre
   ordre, la balise garde l'empreinte du texte d'origine et `RadarExtractionEvalSetTest` rougit. Si
   le Radar écrit un jour des suggestions, l'export s'applique, mais ses attendus (`final_value`)
   seront à ramener aux clés de `fields.json`, et son entrée à la même vérification.
2. Relire chaque cas exporté : l'anonymiseur ne reconnaît un nom que dans un champ personnel ; un
   nom écrit ailleurs dans l'annonce reste à jetonner à la main (`[NOM]`).
3. Garder la forme ci-dessus : `input` produit par `ExternalContent::wrap()`, `expected` limité aux
   clés de `fields.json`, captures sous `captures/`.
4. `node scripts/check-ai-evals-pii.mjs`, `php artisan test tests/Feature/Ai/RadarExtractionEvalSetTest.php`
   (ajuster le compte de cas qu'il attend), puis une nouvelle référence complète.
