---
id: TCK-956
title: "Le revenu du bailleur est chiffré, masqué et rendu par `owners/{id}/sensitive` ; la fiche client du titulaire, pièce en clair, entre dans l'export du droit d'accès"
status: done
phase: P1
family: back
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-19
depends_on: [TCK-955]
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#34-ownerprofile-
    - docs/models-spec.md#7-customer
  adr:
    - docs/adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md
    - docs/adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-23--lectures-de-données-personnelles-sans-step-up-face-à-refused_reads
tags: [back, api, bailleurs, rgpd, chiffrement, migration, export, adr-0070, pistes]
---

## Contexte

Piste **P23.03**, dernière étape d'[ADR-0070](../../adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md)
(§ 1 à 5 pour `owner_profiles.monthly_income`, § 7 pour l'export).

**Décision du porteur** (recopiée mot pour mot de la ligne Statut de la piste) :

> traité hors agents, en session : un ADR qui étend ADR-0044 § 1 aux pièces du locataire et de la caution (chiffrement, forme masquée par défaut, lecture sous step-up journalisée), puis ses tickets

Le revenu du bailleur entre dans le périmètre par le point 6 de l'amendement A d'ADR-0044.

Relevé du 2026-10-18 (`ab982dbcc`) :

- `owner_profiles.monthly_income` est un `decimal(14,2)` en clair
  (`2026_05_02_000001_create_owner_profiles_table.php:20`). Il est dans `OwnerProfile::$queryFields`
  et sort par `OwnerProfileResource`.
- Aucune requête de l'API ne l'écrit : seuls la factory et les seeders le remplissent.
- `DataExportBuilder::payloads` ne contient aucune fiche client du titulaire : sa pièce, et le reste
  de sa fiche, manquent à son export.

## Objectif utilisateur

Le revenu d'un bailleur suit la même règle que son RIB : il est chiffré, rendu masqué, et lu en
clair par l'admin de son agence, sous step-up et journalisé. Celui qui demande son export reçoit sa
fiche client, pièce comprise, en clair.

## Delta à produire

- Migration `encrypt_monthly_income_on_owner_profiles` :
  - `up()` : passage en `text`, puis chiffrement par lots, idempotent ;
  - `down()` : déchiffrement, puis `numeric(14,2)` avec `USING`, sur la même forme que TCK-954.
- `OwnerProfile` :
  - `SENSITIVE` reçoit `monthly_income`, et `$hidden` le suit ;
  - cast `encrypted` à la place de `decimal:2` ;
  - `monthly_income` sort de `$queryFields`.
- `OwnerProfileResource` : ajoute `monthly_income_masked` (`Masking::presence()`).
- `OwnerProfileController::sensitive` : rend `monthly_income` en `float`. `index` le recharge déjà
  par l'`addSelect` de `SENSITIVE`.
- `DataExportBuilder` : un fichier `customers.json`, avec les fiches `customers.user_id = titulaire`
  et `makeVisible(Customer::SENSITIVE)`. Il est limité aux colonnes d'identité d'ADR-0070 § 7 :
  `id`, `agency_id`, `first_name`, `last_name`, `email`, `phone`, `id_type`, `id_number`,
  `occupation`, `emergency_contact_name`, `emergency_contact_phone`, `locale`, `created_at` et
  `updated_at`. Le fichier entre dans la liste des fichiers de l'archive.
- Front : le type du profil de bailleur (`src/lib/queries/owners.ts`) lit `monthly_income_masked`,
  et `OwnerSensitiveData` reçoit `monthly_income`.

## Critères d'acceptation

- [x] **AC1** — L'aller-retour de la migration est testé, comme dans TCK-954 : `350000.00` est
  chiffré, un second `up()` ne change rien, et `down()` rend `350000.00` et `numeric(14,2)`.
- [x] **AC2** — `GET /api/owners` ne porte pas `monthly_income`, porte `monthly_income_masked`, et
  `GET /api/owners?fields[owner_profiles]=id,monthly_income` rend 400.
- [x] **AC3** — `GET /api/owners/{id}/sensitive`, lu par l'admin de l'agence avec un step-up
  récent, rend `monthly_income: 350000` (`OwnerProfileSensitiveDataTest`).
- [x] **AC4** — L'archive d'export d'un titulaire qui a une fiche client avec la pièce `SN-112233`
  contient `customers.json`, où se lit `"id_number": "SN-112233"`, sans `notes` ni `metadata`. Son
  `profile.json` porte le `monthly_income` en clair de son profil de bailleur.
- [x] **AC5** — `php artisan backup:verify-encryption` imprime une ligne pour
  `owner_profiles.monthly_income`, sans illisible. `BackupVerifyEncryptionTest` porte désormais les
  quatre colonnes d'ADR-0070.
- [x] **AC6 — ablation** : sans `makeVisible(Customer::SENSITIVE)` dans `DataExportBuilder` (copie
  gardée, restaurée par `cp`, `md5` vérifié), AC4 rougit, parce que la pièce manque à
  l'export. Sans le cast `encrypted` sur `OwnerProfile`, AC1 et AC5 rougissent. Correctif remis :
  tout est vert.

## Hors périmètre

- Les notes, les métadonnées et les critères de recherche de la fiche dans l'export : c'est à
  TCK-537 et au conseil juridique d'en décider (ADR-0070 § 7).
- Un formulaire qui écrive le revenu du bailleur : il n'en existe aucun aujourd'hui.

## Notes d'implémentation

- Après la fusion : lancer `/sync-specs` pour `docs/models-spec.md` (§ 7 Customer, § 27 Guarantor,
  § 34 OwnerProfile : types `text` chiffrés, et le masque). `ProfileSchemaTest` liste les colonnes
  d'`owner_profiles` : il compte des noms, pas des types, et doit rester vert.
- La prochaine restauration à blanc relèvera plus de colonnes chiffrées que les 20 du relevé de
  `hebergement.md` : c'est attendu (ADR-0070 § 9).

## Mesures (2026-10-19, `02f685616`)

- `OwnerProfileSensitiveDataTest` et `BackupVerifyEncryptionTest` : 17 verts. Classes voisines
  (profils, export, droit d'accès, sauvegarde, garde d'impersonation) : 323 verts en 159 s.
  Front : `owners` 5 verts, `tsc --noEmit` et `lint` propres.
- AC1 : l'aller-retour lit `350000.00` chiffré, inchangé par un second `up()`, puis `350000.00` et
  `numeric(14,2)` après le `down()`.
- AC4 : `customers.json` porte `SN-112233` en clair, sans `notes` ni `metadata` ; `profile.json`
  porte `350000.00` dans le profil de bailleur.
- AC6, ablations (copies gardées, restaurées par `cp`, `md5` vérifié) :
  - sans `makeVisible(Customer::SENSITIVE)` dans `DataExportBuilder` : le test d'export rougit, la
    pièce manque ;
  - sans le cast `encrypted` sur `OwnerProfile` : l'aller-retour de la migration et la vérification
    des quatre colonnes rougissent ;
  - correctif remis : 17 verts.
