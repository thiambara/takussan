---
id: TCK-3004
title: "La lecture des numéros dans un texte : un module qui lit une fois et rend les numéros trouvés, trois politiques nommées, motifs privés"
status: todo
phase: P2
family: back
estimate: M
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, radar, ia, recherche, donnees-personnelles, architecture]
---

## Objectif utilisateur

Un numéro de téléphone écrit dans un texte (annonce du Radar, requête de recherche, prompt envoyé à l'IA) est reconnu de la même façon partout, et une correction de la lecture vaut pour tous les usages.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7). `app/Support/PhoneMasker.php` (533 l.) déclare `mask` et `normalizeDigits`, mais ses constantes de motif sont lues de l'extérieur : `INVISIBLE` (×6), `MASK_PATTERN` (×4), `TOKEN` (×3), `CC1_NUMBER`, `FOREIGN_NUMBER`, `FLOOR_AFTER_PLUS`, `DEFINITIONS`, `PATTERN`, `SHAPED_NUMBER`. Appelants : `app/Support/RadarPhone.php`, `Services/Radar/RadarAmountParser.php:235-259`, `Services/Search/Query/SearchQueryParser.php:560-575`, `Services/Ai/Evaluation/EvalCaseAnonymizer.php:214,316-322`, `Services/Radar/RadarPublisher.php:590`. L'idiome `normalizeDigits(preg_replace(INVISIBLE…))` est recopié 6 fois (`RadarPhone.php:133,219`, `RadarAmountParser.php:254`, `ExtractionNormalizer.php:718`, `RadarListingIntake.php:191`, `RadarSimilarityText.php:36`) ; les trois derniers ne cherchent aucun numéro, ils replient un texte.

Les notions de « numéro » divergent **volontairement** et doivent être conservées :
- **masquer** : tout ce qui est sénégalais, étranger ou `wa.me`, par excès ;
- **refus STOP** (`RadarPhone::fromText`) : sénégalais, lecture large ;
- **contact d'office** (`RadarPhone::contactsFromText`) : la lecture la plus étroite (TCK-2412, 2441, 2454).

## Contraintes strictes (métier)

- **Aucune empreinte stockée ne change.** `RadarListingIntake::foldText` alimente `radar_listings.content_fingerprint` (unique) : le repli du texte ne bouge pas d'un octet. `RadarPhone::canonical` produit la clé de `phone_hmac` : toute écriture reconnue aujourd'hui l'est encore, sinon un refus STOP n'est plus retrouvé (ADR-0081, ADR-0082).
- **Comportement constant**, à une exception près : la recherche (`SearchQueryParser`) normalise désormais le texte (invisibles, chiffres non latins) avant de chercher un numéro, comme les autres appelants. Aujourd'hui un numéro en chiffres arabes ou coupé par un U+200B n'y est pas vu.
- La PCRE de production a déjà refusé un motif trop gros (TCK-2451) : le motif ne grossit pas.
- Le miroir JS `scripts/check-ai-evals-pii.mjs` garde sa parité sur `tests/fixtures/ai/donnees-personnelles.json`.

## Delta à produire

- [ ] Module : `App\Support\Telephone\LectureDesNumeros` — lit un texte une fois et rend des numéros trouvés (début et fin **dans le texte d'origine**, texte brut, forme E.164 à la demande, « contact » à la demande) ; politiques nommées `masquer`, `refusStop`, `contactDOffice`
- [ ] Fonction publique de repli du texte (invisibles + chiffres), distincte de la lecture des numéros
- [ ] Les constantes de motif de `PhoneMasker` deviennent privées ; `PhoneMasker::mask` reste l'entrée du masquage
- [ ] `RadarPhone` garde les empreintes HMAC et le choix de politique ; il ne lit plus les motifs de `PhoneMasker`
- [ ] `RadarAmountParser`, `SearchQueryParser`, `EvalCaseAnonymizer`, `RadarPublisher`, `ExtractionNormalizer`, `RadarListingIntake`, `RadarSimilarityText` passent par le module
- [ ] Tests : `tests/Unit/Support/Telephone/LectureDesNumerosTest.php` sur le fichier de cas partagé (une colonne « attendu » par politique), plus un test du défaut de la recherche, plus un test d'empreinte stable (`content_fingerprint` et `phone_hmac` d'un jeu de textes figé)

## Critères d'acceptation

- [ ] AC1 — `grep -rn "PhoneMasker::[A-Z_]\+" app/` ne rend plus aucune constante lue hors de `app/Support/Telephone/` et de `PhoneMasker`.
- [ ] AC2 — La recherche reconnaît un numéro écrit en chiffres arabes et un numéro coupé par U+200B (test rouge avant, vert après).
- [ ] AC3 — Les tests existants de `PhoneMasker`, `RadarPhone`, `RadarAmountParser`, `SearchQueryParser`, `EvalCaseAnonymizer` restent verts sans changer leurs attendus (hors AC2).
- [ ] AC4 — Les empreintes d'un jeu de textes figé sont identiques avant et après (test).

## Hors périmètre

- Les règles de chaque politique (on les déplace, on ne les change pas), le stockage des empreintes.

## Notes d'implémentation
