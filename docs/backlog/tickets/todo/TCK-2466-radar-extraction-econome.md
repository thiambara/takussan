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

_(à remplir)_
