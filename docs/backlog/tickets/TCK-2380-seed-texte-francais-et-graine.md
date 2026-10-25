---
id: TCK-2380
title: "Le seed écrit en français de métier et rejoue le même jeu : plus de lorem ipsum, une seule graine pour tous les tirages"
status: todo
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#111-avis--réputation"
  models:
    - "docs/models-spec.md#20-message-"
    - "docs/models-spec.md#11-review"
tags: [api, seed, données, démo, reproductibilité]
---

## Objectif utilisateur

Une démo commerciale ou une capture d'écran montre des messages, tâches, interventions, avis et
documents qui se lisent comme ceux d'une agence de Dakar, et deux seeds successifs donnent le même
jeu pour qu'une capture ou un bug se reproduise.

## Contexte

Audit du seeding du 2026-10-25 (base `takussan_seed_audit`) :

- Messages, titres de tâches, titres et descriptions de maintenance, avis, motifs d'annulation :
  **latin** (« *Fuga ea quia officia est blanditiis quia.* ») — `faker()->sentence()` /
  `paragraph()`, que la locale `fr_FR` ne traduit pas.
- Tous les documents de bien s'appellent « Titre foncier - … », type `other`.
- Le faker a une graine fixe (`SeedingContext::bootFaker`, 2026), mais `random_int`, `mt_rand`
  (`StatusDistribution::pick`), `Str::random` et `Collection::random` n'en ont pas : deux seeds ne
  donnent pas le même jeu.
- Tous les loyers passent par Wave, toutes les cautions par virement.

## Contraintes strictes (métier)

- Le texte semé est en **français** ; le wolof est en pause (pas de texte `wo` écrit, décision du
  2026-10-16).
- Le texte d'un objet correspond à son domaine : une intervention `plumbing` parle de plomberie,
  un message de prospect parle du bien du fil.
- Les références (`reference_number`, slugs) restent uniques ; leur déterminisme ne doit pas
  réintroduire de collision (cf. TCK-581, référence aléatoire complétée par préfixe).

## Delta à produire

- [ ] `SenegalFakerProvider` (ou provider voisin) : banques de phrases par domaine — messages
      (prospect, bailleur, locataire, groupe d'agence), tâches, interventions par catégorie,
      avis par note, motifs d'annulation, notes CRM, noms de documents par `DocumentType`.
- [ ] Remplacer chaque `sentence()`/`paragraph()` des seeders par ces banques.
- [ ] `DocumentSeeder` : types et noms variés selon le support (titre foncier, plan, diagnostic,
      pièce d'identité, contrat).
- [ ] Moyens de paiement répartis entre ceux que l'application accepte.
- [ ] Graine unique : tous les tirages des seeders passent par le faker de `SeedingContext`
      (ou `mt_srand`/`Random\Randomizer` initialisés sur la même graine), `SEED_RANDOM_SEED`
      surchargeable.
- [ ] Test : deux seeds `SeedingConfig::minimal()` consécutifs produisent les mêmes empreintes
      (titres de biens, montants, dates relatives à `now()` figé).

## Critères d'acceptation

- [ ] AC1 — Aucun texte semé ne contient un mot du vocabulaire lorem de Faker (liste du provider
      `Lorem`) : test sur `messages.content`, `tasks.title`, `maintenance_requests.title`,
      `reviews.content`, `customer_notes`.
- [ ] AC2 — Les titres de maintenance de deux catégories différentes ne partagent pas leur banque.
- [ ] AC3 — Deux seeds consécutifs avec la même graine et la même date figée produisent des
      empreintes identiques ; deux graines différentes produisent des empreintes différentes.
- [ ] AC4 — Au moins trois moyens de paiement apparaissent dans `lease_payments`.
- [ ] AC5 — Ablation : AC1 est rouge si on rétablit un `sentence()` ; AC3 est rouge si on rétablit un
      `random_int` non initialisé.

## Hors périmètre

- Les traductions anglaises du texte semé.
- Les médias (photos, avatars) : inchangés, `SEED_DOWNLOAD_MEDIA`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
