---
id: TCK-651
title: Les réglages métier à repli global entrent au catalogue, la route brute n'écrit plus la portée globale
status: todo
phase: P2
family: full
estimate: M
wave: 79
created: 2026-10-14
updated: 2026-10-14
depends_on: [TCK-648]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#30-setting-
tags: [back, front, super-admin, settings, adr-0065]
---

## Objectif utilisateur

Le super-admin règle les défauts de plateforme que l'application lit — relances de facture,
plafond de révision, pénalité de résiliation, signature au renouvellement, plafond des pénalités de
retard — au même endroit, avec les mêmes contrôles et la même trace que les autres paramètres
plateforme ; et aucun écran ne lui fait régler une clé qu'aucun code ne lit.

## Contrat de données

- Décision : [ADR-0065](../../adr/0065-les-reglages-metier-a-repli-global-entrent-au-catalogue.md).
- Table `settings` inchangée (aucune migration).
- `GET` / `PATCH /api/admin/settings` (catalogue) : cinq entrées de plus, catégorie `rentals`.
- `/api/settings` (route brute) : `index` inchangé ; `store`, `update`, `destroy` refusent la portée
  `global` (422 `setting.global_not_writable`, traduit fr/en/wo).

## Direction UX / Artistique

Les cinq réglages apparaissent dans « Paramètres plateforme », dans une section « Location »,
rendus comme les autres : libellé, phrase d'explication, valeur, dernier auteur. Un plafond vide
se lit « aucun plafond », pas zéro.

## Contraintes strictes (métier)

- **Le défaut du catalogue est la constante du service**, référencée : deux défauts qui divergent
  feraient lire deux valeurs différentes selon le chemin.
- **Le repli par agence ne change pas** : la ligne de l'agence l'emporte, puis la valeur globale,
  puis le défaut.
- Validation à l'écriture : décalages de relance = 1 à 10 entiers entre 1 et 365 ; plafond de
  révision = décimal > 0 et ≤ 100 ; pénalité = entier de 1 à 24 mois ; signature = booléen ;
  plafond des pénalités = décimal de 0 à 100, ou vide.
- La route brute refuse la portée `global` **à tout appelant**, super-admin compris ; la portée
  `agency` reste ouverte selon ses règles actuelles.

## Delta à produire

- [ ] `EditablePlatformSettings` : les cinq clés, catégorie `rentals`, types `integer_list`,
      `decimal`, `integer`, `boolean`.
- [ ] `PlatformSettingService` : normalisation et validation des trois types neufs (valeur vide
      admise pour le plafond des pénalités).
- [ ] `ScopedSetting` et les cinq lecteurs : ligne de l'agence, sinon `getValue('<clé>')` littéral.
- [ ] Route brute : refus de la portée `global` sur `store`, `update`, `destroy` ; code d'erreur
      traduit.
- [ ] Front : l'éditeur du catalogue rend les trois types neufs ; section « Location » et libellés
      des cinq clés (fr/en/wo).
- [ ] Front : `/super-admin/settings/global`, son entrée de menu et ce qui ne servait qu'elle
      disparaissent.
- [ ] Tests : les cinq clés au catalogue (validation, journal) ; les lecteurs suivent la valeur du
      catalogue et la ligne d'agence l'emporte ; la route brute refuse le global et garde l'agence.

## Critères d'acceptation

- [ ] AC1 — une valeur réglée dans « Paramètres plateforme » pour chacune des cinq clés est celle
      que lit son service pour une agence sans réglage propre ; une agence qui a sa ligne garde la
      sienne.
- [ ] AC2 — une valeur hors règles (plafond de révision à `"abc"`, liste vide de relances) est
      refusée en 422 et n'est pas écrite ; une valeur acceptée laisse une entrée de journal.
- [ ] AC3 — `POST`/`PUT`/`DELETE /api/settings` en portée `global` rendent 422
      `setting.global_not_writable` pour un super-admin ; en portée `agency`, l'admin de l'agence
      écrit toujours.
- [ ] AC4 — retirer une des cinq clés du catalogue, ou faire lire à un lecteur la ligne globale
      sans passer par `getValue`, fait rougir un test ou une garde (vérifié par ablation).
- [ ] AC5 — `/super-admin/settings/global` rend 404 ; aucun lien du front n'y mène.

## Hors périmètre

- Un écran de réglage par agence de ces cinq clés (l'API seule le permet, comme avant).
- Le nettoyage des lignes globales hors catalogue déjà en base.
- Le catalogue des énumérations métier (`enum.*`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
