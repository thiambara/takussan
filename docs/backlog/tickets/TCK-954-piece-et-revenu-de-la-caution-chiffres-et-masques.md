---
id: TCK-954
title: "La pièce et le revenu d'une caution sont chiffrés en base et ne sortent plus que masqués ; la garde d'impersonation balaie les cautions"
status: done
phase: P1
family: back
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-19
depends_on: [TCK-953]
blocks: [TCK-955]
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#27-guarantor-
  adr:
    - docs/adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-23--lectures-de-données-personnelles-sans-step-up-face-à-refused_reads
tags: [back, api, baux, rgpd, chiffrement, migration, impersonation, adr-0070, pistes]
---

## Contexte

Piste **P23.03**, deuxième étape d'[ADR-0070](../../adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md)
(§ 1 à 3, § 6 et § 9, pour `guarantors.id_number` et `guarantors.monthly_income`).

**Décision du porteur** (recopiée mot pour mot de la ligne Statut de la piste) :

> traité hors agents, en session : un ADR qui étend ADR-0044 § 1 aux pièces du locataire et de la caution (chiffrement, forme masquée par défaut, lecture sous step-up journalisée), puis ses tickets

Relevé du 2026-10-18 (`ab982dbcc`) :

- `guarantors.id_number` est un `varchar(255)` et `guarantors.monthly_income` un `decimal(14,2)`,
  tous deux en clair (`2026_04_17_160007_create_guarantors_table.php:18,21`).
- `GuarantorController::format` les rend tous deux (l. 93 et 96) par `index`, `show`, `store` et
  `update`. Pour le super-admin, `index` couvre toutes les cautions de la plateforme.
- `ImpersonationReadSweepTest` ne balaie pas les routes des cautions : `guarantor` est dans
  `PARAMETRES_NON_REMPLIS`.

Aucun écran du front ne lit la fiche d'une caution : la section des cautions d'un bail ne fait que
créer, et liste par `GET /api/leases/{id}/guarantors`, qui ne rend ni la pièce ni le revenu.

## Objectif utilisateur

Ni le numéro de pièce ni le revenu d'une caution ne se lisent dans la base, dans une sauvegarde ou
dans une réponse de l'API. Seule leur présence est rendue.

## Delta à produire

- Migration `encrypt_identity_and_income_on_guarantors` :
  - `up()` : les deux colonnes passent en `text`, puis sont chiffrées par lots, de façon idempotente.
    Un montant est chiffré sous sa forme texte (`800000.00`) ;
  - `down()` : déchiffrement, puis `varchar(255)` pour la pièce et `numeric(14,2)` pour le revenu,
    avec `USING monthly_income::numeric(14,2)`, sauf si l'aller-retour montre que `->change()` le
    produit (ADR-0070 § 2).
- `Guarantor` :
  - `SENSITIVE = ['id_number', 'monthly_income']`, avec `$hidden = self::SENSITIVE` ;
  - casts `encrypted` simples, à la place de `decimal:2` pour le revenu.
- `Masking::presence()` : rend `••••` pour une valeur non vide, `null` sinon.
- `GuarantorController::format` : `id_number_masked` (`Masking::tail()`) et `monthly_income_masked`
  (`Masking::presence()`) remplacent les deux valeurs claires.
- Validation :
  - `id_number` reçoit `max:100` dans `Store`/`UpdateGuarantorRequest` et `AttachGuarantorLeaseRequest` ;
  - `monthly_income` reçoit `max:999999999999.99` dans ces trois mêmes requêtes.
- `PropertyRedactor::IDENTIFIER_SEGMENTS` reconnaît `income`.
- `ImpersonationReadSweepTest` :
  - `guarantor` sort de `PARAMETRES_NON_REMPLIS` ;
  - la cible reçoit une caution avec un numéro de garde et un revenu connus ;
  - la garde reconnaît le revenu en clair comme une fuite.
- `GuarantorTest` : les assertions lisent les masques.
- Front : le type `Guarantor` (`src/types/lease.ts`) lit `id_number_masked` et
  `monthly_income_masked` au lieu des valeurs claires.

## Critères d'acceptation

- [x] **AC1** — L'aller-retour de la migration est testé :
  - sur une caution `CNI-445566` avec un revenu de `800000.00`, `up()` chiffre les deux valeurs, et
    un second `up()` ne les change pas ;
  - `down()` rend `CNI-445566`, `800000.00`, et les types `character varying(255)` et
    `numeric(14,2)`, lus dans `information_schema.columns`.
- [x] **AC2** — `GET /api/guarantors`, `GET /api/guarantors/{id}`, `POST /api/guarantors` et
  `PUT /api/guarantors/{id}` ne portent ni `id_number` ni `monthly_income`. Ils portent
  `id_number_masked = "•••• 4566"` et `monthly_income_masked = "••••"`, ou `null` sans valeur.
- [x] **AC3** — `POST /api/leases/{id}/guarantors`, qui crée et rattache une caution, écrit les deux
  valeurs chiffrées : le modèle les relit en clair, la ligne brute ne les contient pas.
- [x] **AC4** — `monthly_income = 1000000000000` rend 422. `id_number` de 101 caractères rend 422.
- [x] **AC5** — `ImpersonationReadSweepTest` balaie `guarantors/{guarantor}` et reste vert, sans
  nouvelle fuite tolérée.
- [x] **AC6** — `php artisan backup:verify-encryption` imprime une ligne pour `guarantors.id_number`
  et une pour `guarantors.monthly_income`, sans illisible.
- [x] **AC7 — ablation** : `format()` revenu à sa forme d'origine (copie gardée, restaurée par `cp`,
  `md5` vérifié) fait rougir AC2. La garde d'impersonation de AC5 rougit aussi, sur
  `guarantors/{guarantor}`, ce qui prouve qu'elle balaie bien la route. Correctif remis : tout est
  vert.

## Hors périmètre

- La lecture claire `GET /api/guarantors/{id}/sensitive` (TCK-955).
- Une interface de révélation pour la caution : aucun écran ne la lit (ADR-0070 § 8).
- Le contrat PDF, qui ne cite ni la pièce ni le revenu de la caution (relu :
  `contract.blade.php`, l. 155-178).

## Notes d'implémentation

- Le cast `encrypted` relit le revenu comme une chaîne. Le seul autre lecteur est la lecture claire
  de TCK-955, qui le convertit en `float`, comme `format()` le faisait.
- `GuarantorSeeder` écrit par `Guarantor::create()` : le cast chiffre. Aucune écriture brute sur
  `guarantors` dans `app/` ni dans `database/seeders` (relu le 2026-10-18).

- **Livré le 2026-10-19.** La migration est `2026_10_19_110000_encrypt_identity_and_income_on_guarantors.php`.
  Son `down()` écrit le `USING monthly_income::numeric(14,2)` à la main. L'aller-retour vérifie le
  montant au centime et `numeric(14,2)` dans `information_schema`.
- **Coquille d'AC2 corrigée par le test.** L'AC2 attend `•••• 4566` pour `CNI-445566`. Les quatre
  derniers caractères sont `5566`, et le test vérifie `•••• 5566`.
- **Le cast `encrypted` sur un revenu entier** écrit la chaîne `650000`, sans décimales. Le modèle
  la relit telle quelle, et le `down()` la convertit en `650000.00`.
- **La garde d'impersonation** reconnaît le revenu par ses six premiers chiffres (`987654`). C'est
  la forme `(float)` que la fiche rendait avant ce ticket. Son témoin éprouve ce détecteur et lit
  les deux masques de la fiche de la caution.
- `Masking::presence()` a son test unitaire pur (`MaskingPresenceTest`).
- **Mesures.** Les classes du ticket donnent 42 verts. Les classes voisines (cautions, baux,
  impersonation, sauvegardes, journal) donnent 394 verts en 164 s, charge 5 sur 8 cœurs. Côté
  front, les tests des baux (74), `tsc` et `lint` sont verts.
- **Ablation (AC7).** `GuarantorController` remis dans sa forme de `pre-dev` : AC2 rougit, et la
  garde rougit sur `GET api/guarantors` et `GET api/guarantors/{guarantor}` (pièce et revenu). Le
  correctif remis par `cp`, avec un `md5` identique, rend 7 verts.
