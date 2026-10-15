---
id: TCK-651
title: Les réglages métier à repli global entrent au catalogue, la route brute n'écrit plus la portée globale
status: review
phase: P2
family: full
estimate: M
wave: 79
created: 2026-10-14
updated: 2026-10-15
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

- [x] `EditablePlatformSettings` : les cinq clés, catégorie `rentals`, types `integer_list`,
      `decimal`, `integer`, `boolean`.
- [x] `PlatformSettingService` : normalisation et validation des trois types neufs (valeur vide
      admise pour le plafond des pénalités).
- [x] `ScopedSetting` et les cinq lecteurs : ligne de l'agence, sinon `getValue('<clé>')` littéral.
- [x] Route brute : refus de la portée `global` sur `store`, `update`, `destroy` ; code d'erreur
      traduit.
- [x] Front : l'éditeur du catalogue rend les trois types neufs ; section « Location » et libellés
      des cinq clés (fr/en/wo).
- [x] Front : `/super-admin/settings/global`, son entrée de menu et ce qui ne servait qu'elle
      disparaissent.
- [x] Tests : les cinq clés au catalogue (validation, journal) ; les lecteurs suivent la valeur du
      catalogue et la ligne d'agence l'emporte ; la route brute refuse le global et garde l'agence.

## Critères d'acceptation

- [x] AC1 — une valeur réglée dans « Paramètres plateforme » pour chacune des cinq clés est celle
      que lit son service pour une agence sans réglage propre ; une agence qui a sa ligne garde la
      sienne.
- [x] AC2 — une valeur hors règles (plafond de révision à `"abc"`, liste vide de relances) est
      refusée en 422 et n'est pas écrite ; une valeur acceptée laisse une entrée de journal.
- [x] AC3 — `POST`/`PUT`/`DELETE /api/settings` en portée `global` rendent 422
      `setting.global_not_writable` pour un super-admin ; en portée `agency`, l'admin de l'agence
      écrit toujours.
- [x] AC4 — retirer une des cinq clés du catalogue, ou faire lire à un lecteur la ligne globale
      sans passer par `getValue`, fait rougir un test ou une garde (vérifié par ablation).
- [x] AC5 — `/super-admin/settings/global` rend 404 ; aucun lien du front n'y mène.

## Hors périmètre

- Un écran de réglage par agence de ces cinq clés (l'API seule le permet, comme avant).
- Le nettoyage des lignes globales hors catalogue déjà en base.
- Le catalogue des énumérations métier (`enum.*`).

## Notes d'implémentation

- **Catalogue** (`EditablePlatformSettings`) : cinq entrées `rentals`. Les défauts référencent
  `OverdueReminderService::DEFAULT_OFFSETS`, `RentReviewService::DEFAULT_MAX_PCT` et
  `EarlyTerminationService::SETTING_DEFAULT_MONTHS` ; `false` et `null` sont littéraux, faute de
  constante dans le service. `managedByCatalogue()` est supprimée : plus aucun appelant.
- **`PlatformSettingService`** : normalisation par type (`integer_list` triée, dédoublonnée), champ
  `nullable` servi à la console. Une ligne globale `{"value": …}` écrite autrefois par la route brute
  se relit déballée (`unwrap`), y compris dans l'ancienne valeur du journal. ⚠ `settings.value` est
  `NOT NULL` : un plafond vide s'écrit `{"value": null}`. La première version écrivait `null` nu et
  rendait 500 ; le test du plafond vide l'a attrapé.
- **Cache** : `Setting::booted()` vide le cache du catalogue à chaque écriture d'une ligne globale.
  Un seeder ou un test qui écrit la table directement ne laisse donc plus dix minutes de valeur
  périmée aux lecteurs.
- **Lecteurs** : `ScopedSetting::row()` (agence puis global) est remplacée par `agencyRow()`. Le repli
  global passe par `getValue('<clé>')` littéral, ce qui met les cinq lecteurs sous la garde
  `check-platform-catalogue-readers.mjs` (14 paramètres).
- **Route brute** : `store` rend 403 `global_forbidden` à qui n'est pas super-admin (inchangé), puis
  422 `setting.global_not_writable` ; `update` (dans `passedValidation`, après le 403 d'`authorize`)
  et `destroy` font de même. `setting.managed_by_catalogue` est remplacée en fr/en/wo.
- **Front** : l'éditeur rend `decimal` (vide = `null` si la clé l'admet, texte indicatif « Aucun
  plafond »), `boolean` (case `role="switch"`, patron d'`AgencyConfigForm`) et `integer_list`
  (saisie « 3, 7, 15 » ; un jeton non entier ou une liste vide bloque l'enregistrement côté client).
  Section « Location ». Supprimés : la page `/super-admin/settings/global` et son test,
  `SettingsManager`, les quatre actions de paramètres de `console.ts`, `fetchSettings` /
  `upsertSetting` / `updateSetting` / `deleteSetting` / `renderSettingValue`, le schéma
  `settingFormSchema` et ses deux auxiliaires, les types `Setting` / `SettingScope` /
  `SettingValue`, et les clés i18n mortes (`adminSettings.settings`,
  `superAdmin.pages.globalSettings`, `nav.superAdmin.items.globalSettings`,
  `validation.setting.key*`). `namespaces.json` est régénéré : `adminSettings` quitte la frontière
  super-admin. Le plafond de `/app` passe de 71 à 72 % sans que son code change : le dictionnaire a
  rétréci, et le plafond vaut `ceil(part) + 5`.
- **Ablations** (2026-10-15) :
  - `lease.rent_review_max_pct` retirée du catalogue → 4 rouges (dont AC1 et le défaut) ; la garde
    reste verte, ce sens n'est pas le sien.
  - `RentReviewService` lisant la ligne globale sans `getValue` → la garde sort en 1 (« la console
    l'édite et aucun code ne le lit »). Les tests restent verts : c'est la garde qui tient ce sens.
  - refus du `global` retiré de `store` → `GenericSettingsCatalogueBypassTest` rouge.
  - menu : entrée « Paramètres globaux » remise → 2 rouges sur 3 dans
    `SuperAdminSidebar.parametres.test.tsx`.
- **Vérifié de bout en bout, le 2026-10-15** (serveurs de dev, super-admin seedé avec une 2FA posée
  le temps de la mesure, jeton `verif-tck651` révoqué et lignes écrites supprimées ensuite) :
  - `/super-admin/settings` rend 200, et `/super-admin/settings/global` rend 404 ;
  - le BFF sert la catégorie `rentals` avec ses cinq types ;
  - `"abc"` et une liste vide rendent 422 sans rien écrire ;
  - `[20,5,10,5]` est relu `[5,10,20]`, et un plafond `null` est accepté, l'auteur tracé ;
  - la capture montre la section « Location » rendue avec ses cinq champs.

  Reste visible au passage, et ce n'est pas neuf : le message de validation dit « le champ value »
  pour toutes les clés du catalogue.
- **Suites** : API entière verte, 6 383 tests (durée prise sous charge, sans valeur de référence) ;
  Vitest 6 363 tests sur 740 fichiers, vert.
- **Correctif connexe** : la note de TCK-650 lisait le 422 de l'opérateur comme le refus d'une clé du
  catalogue. C'était une erreur de validation, et la note est corrigée.
- **Docs** : `models-spec.md` §30 (MC1 de la passe 014, MB13 de la passe 013) nomme les deux
  catalogues et la route brute limitée à l'agence. `features.md` l.671 est vraie telle quelle et ne
  change pas.
