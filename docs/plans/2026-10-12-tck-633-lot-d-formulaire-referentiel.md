# TCK-633 — Lot D : formulaire et référentiel géographique — Implementation Plan

> **For Antigravity:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task. Chaque tâche est TDD : test rouge, code, test vert, **ablation** (retirer le
> correctif, constater le rouge, restaurer par `cp` et prouver par `md5`), puis signaler à la
> session les fichiers à commiter. Aucune commande git qui écrit.

**Goal:** Remplacer la saisie libre du lieu par un référentiel géographique du Sénégal (régions,
villes, quartiers ; quartier inconnu proposé puis modéré), lire une position collée (lien Google
Maps long ou court, WhatsApp, décimal, DMS, Plus Code), passer les nombres du formulaire en
listes, les équipements en multi-sélection extensible (Piscine et Climatisation fusionnées dans
`amenity`, nouveaux noms proposés puis modérés), retirer la devise (XOF forcé), refuser les frais
d'agence d'un particulier, et afficher le total du coût d'entrée dans l'aperçu.

**Architecture:** Côté API, trois tables `geo_*` chargées depuis un jeu de données versionné
(`database/data/geo/regions/*.json`, extrait d'OpenStreetMap par un script, relu par une
personne) par un service idempotent appelé par un seeder ET par la commande
`geo:sync-referential` (jouée au déploiement : la production ne lance aucun seeder). Les adresses
gagnent deux clés étrangères ; un crochet `saving` du modèle `Address` les canonise (noms
officiels, quartier replié ou proposé) — `PropertyController`, tenu par le lot C, n'est pas
touché. Les quartiers et les équipements proposés passent par une modération super-admin qui
réécrit les adresses et réindexe. Un résolveur de liens courts suit au plus trois redirections,
hôte vérifié à chaque saut. Côté front, une primitive `Combobox` (Base UI 1.7) porte les trois
listes du lieu et les équipements ; un parseur pur lit les positions collées ; une fonction pure
du coût d'entrée est tenue en concordance avec `CoutDEntree::pour` par une fixture partagée.

**Tech Stack:** Laravel 13 / PHP 8.4, PostgreSQL 17 (`und-x-icu`), Meilisearch (Scout), PHPUnit ;
Next.js 16, React 19, TypeScript 5, react-hook-form + zod, TanStack Query, `@base-ui/react` 1.7,
next-intl, Vitest + Testing Library ; Node 24 pour le script d'extraction (Overpass API).

---

## Contraintes globales (à relire avant chaque tâche)

1. **Arbre partagé.** Six lots travaillent dans le même dépôt. Aucune commande git qui écrit
   (`add`, `commit`, `checkout`, `stash`, `restore`, `reset`, `switch`, `merge`, `push`). Les étapes
   « commit » de ce plan sont des **signalements** : la session commite, par pathspecs.
2. **Territoire.** Le lot D tient seul (plan maître, § Territoires) : `app/Models/Geo*.php`,
   `app/Http/Controllers/**/Geo*`, `app/Services/Geo/**`, `routes/api/geo.php`,
   `database/data/geo/**`, `database/seeders/**/Geo*`, `TagSeeder`, `routes/api/tags.php`,
   `SyncPropertyTagRequest`, `CoutDEntree.php`, `components/ui/combobox.tsx`,
   `wizard/steps/StepLieu.tsx`, `StepCaracteristiques.tsx`, `StepPrix.tsx`,
   `wizard/ApercuAnnonce.tsx`, `lib/schemas/property.ts`, `components/property-form/field-matrix.ts`,
   `payload.ts`, `components/map/LocationPickerMap.tsx`, pages super-admin `geo/**` et `tags/**`.
   **Fichiers neufs** du domaine du lot (migrations `geo_*` et `tags`, factories `Geo*`, services
   `app/Services/Tags/**`, commandes `Geo*`/`Tags*`, enums neufs, tests neufs) : créés par D,
   aucun autre lot ne les touche.
3. **Fichiers co-tenus — Edit seulement, par petits blocs ancrés** : `StorePropertyRequest.php`,
   `UpdatePropertyRequest.php` (D, F), `lang/{fr,en,wo}/errors.php` (D : clés `geo` et `tags`),
   `YearOfActivitySeeder.php` (« System/* d'appel » : une ligne), `SuperAdminSidebar.tsx` (D, F),
   `PropertyWizard.tsx` (C, D), `messages/{fr,en,wo}.json` (règle 4), page légale (D seul). Si Edit
   signale que le fichier a changé : relire, rejouer.
4. **⚠ HORS TERRITOIRE.** Les étapes marquées `⚠ HORS TERRITOIRE` touchent un fichier existant
   qu'aucune ligne du plan maître n'attribue à D (liste complète en § « Écarts relevés », E-12).
   **Avant de les exécuter, demander à la session d'étendre le territoire de D à ces fichiers**
   (aucun n'est tenu par un autre lot : vérifié contre la table du plan maître). Sans réponse :
   écrire le diff exact dans `collisions` du rapport et marquer la tâche `bloquee`.
5. **Tests.** Jamais la suite entière. `php artisan test <fichier>` et `npx vitest run <fichier>`
   seulement, ou `php bin/impacted-tests.php --run`. Une commande de plus de 10 minutes ne se lance
   pas dans un agent. Prérequis : `docker compose up -d postgres meilisearch` (depuis la racine).
6. **Ablation** : copie de sauvegarde dans le scratchpad AVANT de modifier
   (`$S=…/scratchpad/lot-d`), restauration par `cp "$S/<fichier>" <fichier>` puis
   `md5 -q <fichier> "$S/<fichier>"` (les deux empreintes identiques). Jamais `git checkout`.
7. **Avant chaque signalement backend** : `./vendor/bin/pint <fichiers PHP touchés>`.
   **Front** : `npx tsc --noEmit`, `npm run lint`, `npm run check:i18n`.
8. **Postgres** (CLAUDE.md, pièges) : jamais de `try/catch` sur une erreur SQL suivie d'une requête
   dans la même transaction ; `lockForUpdate()` jamais sur un agrégat ; index nommés ≤ 63
   caractères ; `jsonb` jamais `json` ; repli de casse par `CaseInsensitive::sql()` +
   `CaseInsensitive::fold()` (ADR-0025), accents NON repliés.
9. **Prose** : l'API n'écrit pas de phrase (`ProseLitteraleInterditeTest`) : `abort_code()` +
   clés `lang/*/errors.php` ; le front passe par next-intl (`check:i18n`).
10. **Messages de commit** (pour la session) : français, `feat(api): … (TCK-633)` /
    `feat(web): … (TCK-633)` / `chore(data): … (TCK-633)`.
11. **Rapport** : `docs/plans/rapports/tck-633-lot-d.json` (Write), **verdict en premier**, puis
    `fichiers`, `tests`, `ablations`, `ecarts_au_ticket`, `collisions`. Message final : une ligne.

Variables utilisées dans les commandes :

```bash
R=/Users/aminethiam/Documents/perso/takussan
API=$R/takussan-api
WEB=$R/takussan-web
S=/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/d8d113e9-1161-4d06-81f8-7d483c3388c9/scratchpad/lot-d
```

---

## Carte des fichiers

Chemins back relatifs à `takussan-api/`, front à `takussan-web/src/`. « L » = lignes lues le
2026-10-12 sur `docs/tck-633-lot-retours-porteur` (`b3a4c6bf`).

### Back — créés

| Fichier | Rôle | Tâche |
|---|---|---|
| `database/migrations/2026_10_12_400000_create_geo_referential_tables.php` | `geo_regions`, `geo_cities`, `geo_neighborhoods`, index ICU | 1 |
| `database/migrations/2026_10_12_400100_add_geo_references_to_addresses.php` | `addresses.geo_city_id`, `geo_neighborhood_id` | 1 |
| `database/migrations/2026_10_12_400200_add_status_to_tags_and_merge_features.php` | `tags.status`, `created_by_id`, fusion `feature → amenity` | 10 |
| `app/Models/Enums/ReferentialStatus.php`, `GeoNeighborhoodOrigin.php` | statuts communs quartiers / tags, origine | 1 |
| `app/Models/GeoRegion.php`, `GeoCity.php`, `GeoNeighborhood.php` | modèles | 1 |
| `database/factories/GeoRegionFactory.php`, `GeoCityFactory.php`, `GeoNeighborhoodFactory.php` | factories | 1 |
| `database/data/geo/extract.mjs`, `corrections.json`, `regions/sn-*.json` (14) | jeu de données | 2 |
| `app/Services/Geo/GeoReferentialLoader.php`, `GeoAddressAttacher.php`, `GeoReferentialSync.php`, `GeoReindexation.php` | chargement idempotent, rattachement, réindexation | 4 |
| `database/seeders/System/GeoReferentialSeeder.php`, `app/Console/Commands/GeoSyncReferential.php` | seeder, commande `geo:sync-referential` | 4 |
| `app/Services/Geo/GeoNeighborhoodResolver.php`, `GeoAddressCanonicalizer.php`, `GeoAddressRules.php` | quartier replié ou proposé, canonisation, règles | 3 |
| `app/Http/Controllers/Public/GeoReferentialController.php`, `routes/api/geo.php` | endpoints publics | 5 |
| `app/Services/Geo/GeoNeighborhoodModeration.php`, `app/Http/Controllers/Api/Admin/GeoNeighborhoodAdminController.php`, `app/Http/Requests/Admin/GeoRenameRequest.php`, `GeoMergeRequest.php` | modération | 6 |
| `app/Services/Geo/GoogleMapsCoordinates.php`, `GeoLinkResolver.php`, `Senegal.php`, `app/Http/Controllers/Api/GeoLinkController.php`, `app/Http/Requests/Api/GeoResolveLinkRequest.php` | résolveur de liens | 7 |
| `tests/fixtures/liens-google-maps.json`, `tests/fixtures/cout-d-entree.json`, `tests/fixtures/geo/v1/sn-dk.json`, `tests/fixtures/geo/v2/sn-dk.json` | fixtures | 4, 7, 9 |
| `app/Services/Tags/TagCatalog.php`, `TagProposals.php`, `TagModeration.php`, `app/Console/Commands/TagsSyncCatalog.php`, `app/Http/Controllers/Api/Admin/TagModerationAdminController.php`, `app/Http/Requests/Admin/TagRenameRequest.php`, `TagMergeRequest.php` | équipements | 10–12 |
| `tests/Unit/Geo/GeoDatasetReviewedTest.php` | relecture du jeu signée, défauts mécaniques | 27 |

### Back — modifiés

| Fichier | Lignes lues | Modification | Tâche | Statut |
|---|---|---|---|---|
| `app/Models/Address.php` | L13-17 fillable, 51 lignes | fillable + crochet `saving` | 3 | ⚠ HORS TERRITOIRE |
| `app/Http/Requests/Api/StorePropertyRequest.php` | L45-90 | bornes, adresse, XOF, frais | 3, 8 | co-tenu (D, F) |
| `app/Http/Requests/UpdatePropertyRequest.php` | L36-94 | bornes, adresse, frais | 3, 8 | co-tenu (D, F) |
| `app/Services/Property/CoutDEntree.php` | L73-90 `regles()` | paramètre `$fraisAdmis`, `fraisDAgenceAdmis()` | 8 | territoire D |
| `database/seeders/YearOfActivitySeeder.php` | L56-109 PIPELINE | une ligne : `GeoReferentialSeeder::class` | 4 | co-tenu (« System/* d'appel ») |
| `docker/release.sh` | L9-14 | deux commandes idempotentes | 4, 10 | ⚠ HORS TERRITOIRE |
| `lang/{fr,en,wo}/errors.php` | ancres `'guarantor' => [` (L159), `'task' => [` (L496) | blocs `geo`, `tags` | 6, 12 | co-tenu |
| `app/Models/Tag.php` | 47 lignes | `status`, `created_by_id`, relation | 10 | ⚠ HORS TERRITOIRE |
| `app/Http/Controllers/Api/TagController.php` | `index()` L15-37, `format()` L110-130 | visibilité des `pending`, champs | 10 | ⚠ HORS TERRITOIRE |
| `app/Http/Requests/Api/StoreTagRequest.php`, `UpdateTagRequest.php` | `rules()` L37-46 | `feature` refusé à la création | 10 | ⚠ HORS TERRITOIRE |
| `database/seeders/System/TagSeeder.php` | 28 lignes | délègue à `TagCatalog` | 10 | territoire D |
| `routes/api/tags.php` | 13 lignes | routes de modération | 12 | territoire D |
| `tests/Feature/Seeders/FilterCoverageTagsTest.php` | L153 | `[amenity]` seul | 10 | ⚠ HORS TERRITOIRE |
| `app/Http/Requests/Api/SyncPropertyTagRequest.php` | L35-44 | `tag_names[]`, `pending` admis | 11 | territoire D |
| `app/Http/Controllers/Api/PropertyTagController.php` | `sync()` L27-39 | noms nouveaux attachés | 11 | ⚠ HORS TERRITOIRE |
| `app/Http/Resources/PropertyResource.php` | `buildLocation()` L279-296, `buildAgency()` | ids géo, `agency.kind` | 13 | ⚠ HORS TERRITOIRE |

### Front — créés

| Fichier | Rôle | Tâche |
|---|---|---|
| `types/geo.ts` | types des endpoints géo | 15 |
| `components/ui/combobox.tsx` + `components/ui/__tests__/combobox.test.tsx` | primitive (simple, multiple, saisie libre, « créer ») | 15 |
| `lib/geo/plus-code.ts`, `lib/geo/reconnaitre-position.ts` + tests | parseur de position | 16 |
| `lib/cout-d-entree.ts` + `lib/__tests__/cout-d-entree.concordance.test.ts` | total du coût d'entrée | 17 |
| `components/property-form/__tests__/payload.referentiel.test.ts` | corps de requête `geo_*`, `tag_names` | 18 |
| `components/property-form/useReferentielGeo.ts`, `ChampsLieu.tsx`, `ChampsPosition.tsx` + tests, `components/map/__tests__/LocationPickerMap.recentrage.test.tsx` | lieu en listes, position collée | 19 |
| `test/doublure-referentiel-geo.ts` | doublure de `useReferentielGeo` partagée par six tests | 19 (⚠ hors des dossiers de D, E-12) |
| `components/property-form/wizard/NombreEnListe.tsx`, `components/property-form/ChampEquipements.tsx` (racine : l'édition s'en sert aussi) + tests | listes de nombres, équipements | 20 |
| `components/property-form/__tests__/StepPrix.test.tsx`, `app/(dashboard)/app/properties/new/__tests__/page.frais-d-agence.test.tsx`, `lib/queries/__tests__/property-tags.tck-633.test.ts` | devise, frais d'un indépendant, équipements proposés | 21 |
| `components/admin/super/FileDePropositions.tsx`, `lib/queries/super-admin-propositions.ts` + leurs tests, `components/layout/__tests__/SuperAdminSidebar.propositions.test.tsx` | files de modération, menu | 25 |
| `app/(super-admin)/super-admin/geo/page.tsx`, `app/(super-admin)/super-admin/tags/proposals/page.tsx` | pages | 25 |
| `content/legal/__tests__/mention-odbl.test.ts` | mention ODbL du référentiel | 26 |

### Front — modifiés

| Fichier | Lignes lues | Modification | Tâche | Statut |
|---|---|---|---|---|
| `lib/schemas/property.ts` | L146 currency, L163-206 lieu, L207-249 bornes, L256 `tag_ids` | `geo_*`, `tag_names` | 18 | territoire D |
| `components/property-form/payload.ts` | L24-60, L97-125 | `geo_*` dans le bloc adresse, `tag_names` hors corps | 18 | territoire D |
| `components/map/LocationPickerMap.tsx` | 68 lignes | prop `centre`, recentrage | 19 | territoire D |
| `wizard/steps/StepLieu.tsx` | L155-175 trois `FormInput` | `ChampsLieu` | 19 | territoire D |
| `wizard/steps/StepCaracteristiques.tsx` | L86-119 nombres, L172-198 équipements | listes, `ChampEquipements` | 20 | territoire D |
| `wizard/steps/StepPrix.tsx` | L27-55 `EntryCostFields`, L75-94 devise | devise retirée, frais masqués | 21 | territoire D |
| `components/property-form/PropertyWizard.tsx` | L205-221 props, L303 tags, L413-431 géo-IP | prop `fraisDAgence`, `tag_names`, devise non devinée | 21 | co-tenu (C, D) |
| `app/(dashboard)/app/properties/new/page.tsx` | L70-127 | type d'agence → `fraisDAgence` | 21 | ⚠ HORS TERRITOIRE |
| `app/actions/dashboard-properties.ts` L266-278, `lib/queries/properties-server.ts` L385-395 | `tag_names` | 21 | ⚠ HORS TERRITOIRE |
| `wizard/ApercuAnnonce.tsx` | L28-31 docblock, L50-123, L200-206 | total à l'entrée | 22 | territoire D |
| `components/property-form/PropertyForm.tsx` | L100-125, L133-170, L395-455, L634+ | lieu, devise, frais, équipements | 23 | ⚠ HORS TERRITOIRE |
| `types/property.ts` | L1 imports, L117-133 `PropertyAgencyLite` / `PropertyTag`, L247-258 `location` | ids géo, `kind`, `status` | 23 | ⚠ HORS TERRITOIRE |
| `types/tag.ts` | L9-21 | `status`, `created_by_id` | 20 | ⚠ HORS TERRITOIRE |
| `lib/schemas/tag.ts` L12, `components/admin-tags/TagsManager.tsx` L365, L426, `components/admin-tags/__tests__/TagsManager.test.tsx` L63-65 | `feature` hors création | 24 | ⚠ HORS TERRITOIRE |
| `components/layout/SuperAdminSidebar.tsx` | L19-20 imports, L139 groupe `content` | entrée `geo`, enfant `tags/proposals` | 25 | co-tenu (D, F) |
| `i18n/namespaces.json` | régénéré | par `check-i18n-namespaces --update` | 14, 28 | ⚠ HORS TERRITOIRE |
| `messages/{fr,en,wo}.json` | ancres relevées en tâche 14 | clés D | 14 | règle 4 |
| `content/legal/notice.ts` | L11 docblock, fr L57, en L109 | crédit OSM étendu au référentiel | 26 | D seul |
| tests existants rendant `StepLieu` / `PropertyForm` | `wizard-steps.test.tsx`, `PropertyWizard.test.tsx`, `abonnement-des-etapes.test.tsx`, `cibles-tactiles.test.tsx`, `PropertyForm.test.tsx`, `StepCaracteristiques.test.tsx`, `StepBien.test.tsx`, `ApercuAnnonce.test.tsx` | `vi.mock` de `useReferentielGeo`, assertions de la devise et des équipements | 19–23 | `PropertyWizard.test.tsx` : co-tenu (C, D) ; autres ⚠ HORS TERRITOIRE sauf ceux des étapes D |

---

## Ordre et dépendances

Back d'abord (tâches 1 à 13), puis i18n (14), puis front (15 à 26), puis la relecture humaine du
jeu de données (27) et les vérifications finales (28). Chaque tâche se teste seule.

| Tâche | Dépend de | Bloquante pour |
|---|---|---|
| 1 référentiel (schéma) | — | 2, 3, 4, 5, 6 |
| 2 jeu de données | 1 | 3 (chargement réel), 27 |
| 3 canonisation des adresses | 1 | 4, 5, 6, 13 |
| 4 chargement du jeu | 1, 3 (fixtures de test : pas de 2) | 27 |
| 5 endpoints publics | 1 | 19 |
| 6 modération des quartiers | 4 | 25 |
| 7 liens courts | — | 19 |
| 8 bornes, XOF, frais | — | 21 |
| 9 concordance PHP | — | 17 |
| 10 tags | — | 11, 12 |
| 11 propositions d'équipements | 10 | 20, 21 |
| 12 modération des équipements | 10, 6 (`GeoReindexation`) | 25 |
| 13 ressource | 4 | 23 |
| 14 i18n | — | 15 à 26 |
| 15 combobox | 14 | 19, 20, 25 |
| 16 position collée | — | 19 |
| 17 coût d'entrée front | 9 (fixture) | 22 |
| 18 schéma et corps | — | 19 à 23 |
| 19 lieu | 5, 7, 15, 16, 18 | 23 |
| 20 nombres et équipements | 15, 18 | 23 |
| 21 prix, devise, frais | 8, 18 | 23 |
| 22 aperçu | 17 | — |
| 23 formulaire d'édition | 13, 19, 20, 21 | — |
| 24 type `feature` en admin | 10 | — |
| 25 files super-admin | 6, 12, 15 | — |
| 26 mention légale | 2 | — |
| 27 relecture humaine | 2, 4 | fusion |
| 28 vérifications finales | toutes | — |

---

## Tâche 0 — Préparation (5 min)

**Step 1 : services et charge**

```bash
cd /Users/aminethiam/Documents/perso/takussan && docker compose up -d postgres meilisearch
uptime && sysctl -n hw.ncpu
```

Attendu : deux conteneurs `Running`/`Started` ; noter les trois moyennes d'`uptime` dans le
rapport (`tests.charge`). Au-dessus de 16 sur 8 cœurs, un rouge ne s'interprète pas avant d'avoir
relevé la charge (`ps -Ao pcpu,comm -r | head`).

**Step 2 : aucun horodatage de migration en double**

```bash
ls /Users/aminethiam/Documents/perso/takussan/takussan-api/database/migrations | grep '^2026_10_12_4'
```

Attendu : sortie vide. Si un autre lot a pris `2026_10_12_4xxxxx`, décaler les trois migrations
de D en `2026_10_12_45xxxx` et le signaler en `collisions`.

**Step 3 : sauvegardes de tous les fichiers EXISTANTS que D modifie**

```bash
R=/Users/aminethiam/Documents/perso/takussan
S=/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/d8d113e9-1161-4d06-81f8-7d483c3388c9/scratchpad/lot-d
mkdir -p "$S/origine"
cd "$R"
for f in \
  takussan-api/app/Models/Address.php \
  takussan-api/app/Models/Tag.php \
  takussan-api/app/Http/Requests/Api/StorePropertyRequest.php \
  takussan-api/app/Http/Requests/UpdatePropertyRequest.php \
  takussan-api/app/Services/Property/CoutDEntree.php \
  takussan-api/database/seeders/YearOfActivitySeeder.php \
  takussan-api/database/seeders/System/TagSeeder.php \
  takussan-api/docker/release.sh \
  takussan-api/lang/fr/errors.php takussan-api/lang/en/errors.php takussan-api/lang/wo/errors.php \
  takussan-api/app/Http/Controllers/Api/TagController.php \
  takussan-api/app/Http/Requests/Api/StoreTagRequest.php \
  takussan-api/app/Http/Requests/Api/UpdateTagRequest.php \
  takussan-api/app/Http/Requests/Api/SyncPropertyTagRequest.php \
  takussan-api/app/Http/Controllers/Api/PropertyTagController.php \
  takussan-api/app/Http/Resources/PropertyResource.php \
  takussan-api/routes/api/tags.php \
  takussan-api/tests/Feature/Seeders/FilterCoverageTagsTest.php \
  takussan-web/src/lib/schemas/property.ts \
  takussan-web/src/lib/schemas/tag.ts \
  takussan-web/src/types/tag.ts \
  takussan-web/src/components/admin-tags/TagsManager.tsx \
  takussan-web/src/types/property.ts \
  takussan-web/src/components/property-form/payload.ts \
  takussan-web/src/components/property-form/PropertyWizard.tsx \
  takussan-web/src/components/property-form/PropertyForm.tsx \
  takussan-web/src/components/property-form/wizard/ApercuAnnonce.tsx \
  takussan-web/src/components/property-form/wizard/steps/StepLieu.tsx \
  takussan-web/src/components/property-form/wizard/steps/StepCaracteristiques.tsx \
  takussan-web/src/components/property-form/wizard/steps/StepPrix.tsx \
  takussan-web/src/components/map/LocationPickerMap.tsx \
  takussan-web/src/components/layout/SuperAdminSidebar.tsx \
  "takussan-web/src/app/(dashboard)/app/properties/new/page.tsx" \
  takussan-web/src/app/actions/dashboard-properties.ts \
  takussan-web/src/lib/queries/properties-server.ts \
  takussan-web/src/content/legal/notice.ts \
  takussan-web/src/messages/fr.json takussan-web/src/messages/en.json takussan-web/src/messages/wo.json \
  takussan-web/src/i18n/namespaces.json \
  takussan-web/src/components/property-form/__tests__/wizard-steps.test.tsx \
  takussan-web/src/components/property-form/__tests__/PropertyWizard.test.tsx \
  takussan-web/src/components/property-form/__tests__/abonnement-des-etapes.test.tsx \
  takussan-web/src/components/property-form/__tests__/cibles-tactiles.test.tsx \
  takussan-web/src/components/property-form/__tests__/PropertyForm.test.tsx \
  takussan-web/src/components/property-form/__tests__/StepCaracteristiques.test.tsx \
  takussan-web/src/components/property-form/__tests__/ApercuAnnonce.test.tsx \
  takussan-web/src/components/property-form/__tests__/StepBien.test.tsx \
  takussan-web/src/components/admin-tags/__tests__/TagsManager.test.tsx
do
  mkdir -p "$S/origine/$(dirname "$f")" && cp "$f" "$S/origine/$f"
done
( cd "$S/origine" && find . -type f -exec md5 -r {} \; | sort -k2 ) > "$S/origine.md5"
wc -l < "$S/origine.md5"
```

Attendu : `50`. Ces copies servent aux ablations et au rapport (`fichiers[].md5_avant`). Elles ne
servent **jamais** à écraser un fichier co-tenu qu'un autre lot a pu modifier entre-temps : une
restauration se fait toujours depuis la copie prise **juste avant** l'ablation
(`$S/abl/<tâche>/…`), jamais depuis `origine/`.

**Step 4 : les fichiers ⚠ HORS TERRITOIRE**

Envoyer à la session, avant la tâche 1, la liste de la section « Écarts relevés », E-12, avec la
demande d'extension du territoire. Noter la réponse dans le rapport (`collisions[].reponse`).
Les tâches qui n'en touchent aucun (1, 2, 5, 6, 7, 8, 9, 15, 16, 17, 18, 25, 26) avancent sans
attendre ; la tâche 3 (crochet de `Address`) est la première à en dépendre, et toutes celles
qui suivent la supposent faite.

---

## Tâche 1 — Le référentiel : tables, modèles, factories (15 min)

**Fichiers**
- Créer : `takussan-api/database/migrations/2026_10_12_400000_create_geo_referential_tables.php`
- Créer : `takussan-api/database/migrations/2026_10_12_400100_add_geo_references_to_addresses.php`
- Créer : `takussan-api/app/Models/Enums/ReferentialStatus.php`, `GeoNeighborhoodOrigin.php`
- Créer : `takussan-api/app/Models/GeoRegion.php`, `GeoCity.php`, `GeoNeighborhood.php`
- Créer : `takussan-api/database/factories/GeoRegionFactory.php`, `GeoCityFactory.php`, `GeoNeighborhoodFactory.php`
- Test : `takussan-api/tests/Feature/Geo/GeoNeighborhoodUniquenessTest.php`

**Step 1 : écrire le test (rouge : les classes n'existent pas)**

```php
<?php

namespace Tests\Feature\Geo;

use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0062 §4) — un quartier ne se double pas dans sa ville, ni par la casse, ni par un
 * caractère accentué en capitale : « LIBERTÉ 4 » est « Liberté 4 ».
 *
 * ⚠ L'index replie la casse PAR ICU (ADR-0025). Un `LOWER(name)` nu, sous `--locale=C`, rend
 * `libertÉ 4` : il laisserait passer exactement le doublon que ce test interdit.
 *
 * Les accents, eux, ne se replient PAS (reconduction d'ADR-0020 §2) : « Liberte 4 » est un autre
 * nom. C'est la liste déroulante qui le rapproche à l'écran, pas la base.
 */
class GeoNeighborhoodUniquenessTest extends TestCase
{
    use RefreshDatabase;

    private GeoCity $ville;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ville = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Liberté 4', 'slug' => 'liberte-4']);
    }

    public function test_la_meme_ville_refuse_le_meme_nom_en_capitales_accentuees(): void
    {
        $this->expectException(UniqueConstraintViolationException::class);

        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'LIBERTÉ 4', 'slug' => 'liberte-4-bis']);
    }

    public function test_une_autre_ville_porte_le_meme_nom(): void
    {
        $autre = GeoCity::factory()->create(['name' => 'Thiès', 'slug' => 'thies']);

        $quartier = GeoNeighborhood::factory()->for($autre, 'city')->create(['name' => 'Liberté 4', 'slug' => 'liberte-4']);

        $this->assertTrue($quartier->exists);
    }

    public function test_les_accents_ne_sont_pas_replies(): void
    {
        $quartier = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Liberte 4', 'slug' => 'liberte-4-sans-accent']);

        $this->assertTrue($quartier->exists);
    }

    public function test_un_quartier_refuse_ou_fusionne_ne_reserve_plus_son_nom(): void
    {
        $refuse = GeoNeighborhood::factory()->for($this->ville, 'city')->rejected()->create(['name' => 'Fass', 'slug' => 'fass']);
        $cible = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Colobane', 'slug' => 'colobane']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->create([
            'name' => 'Gueule Tapée', 'slug' => 'gueule-tapee', 'merged_into_id' => $cible->id,
        ]);

        $fass = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'FASS', 'slug' => 'fass-2']);
        $gueule = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Gueule Tapée', 'slug' => 'gueule-tapee-2']);

        $this->assertSame(ReferentialStatus::Rejected, $refuse->refresh()->status);
        $this->assertTrue($fass->exists && $gueule->exists);
    }

    public function test_l_index_porte_la_collation_icu_et_sa_condition(): void
    {
        $definition = DB::selectOne(
            "SELECT indexdef FROM pg_indexes WHERE indexname = 'geo_neighborhoods_city_name_ci_unique'"
        )->indexdef;

        $this->assertStringContainsString('und-x-icu', $definition);
        $this->assertStringContainsString('merged_into_id IS NULL', $definition);
    }
}
```

**Step 2 : lancer, constater le rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Feature/Geo/GeoNeighborhoodUniquenessTest.php
```

Attendu : `Error: Class "App\Models\GeoCity" not found` — 5 échecs.

**Step 3 : les deux enums**

`app/Models/Enums/ReferentialStatus.php` :

```php
<?php

namespace App\Models\Enums;

/**
 * TCK-633 (ADR-0062 §4, ADR-0061 §9) — l'état d'une entrée de référentiel proposée par un
 * utilisateur : un quartier, un équipement. Le jeu de données et le catalogue entrent `approved`.
 *
 * `pending` n'est visible que de son auteur ; `rejected` ne se montre à personne et ne se
 * repropose pas (le même nom retapé retombe sur la ligne refusée, sans en créer une autre).
 */
enum ReferentialStatus: string
{
    case Approved = 'approved';
    case Pending = 'pending';
    case Rejected = 'rejected';
}
```

`app/Models/Enums/GeoNeighborhoodOrigin.php` :

```php
<?php

namespace App\Models\Enums;

/** TCK-633 — d'où vient un quartier : le jeu de données versionné, ou une saisie. */
enum GeoNeighborhoodOrigin: string
{
    case Dataset = 'dataset';
    case User = 'user';
}
```

**Step 4 : la migration des trois tables**

`database/migrations/2026_10_12_400000_create_geo_referential_tables.php` :

```php
<?php

use App\Support\CaseInsensitive;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 (ADR-0062) — le référentiel géographique du Sénégal : région → ville → quartier.
 *
 * Les lignes viennent d'un jeu de données VERSIONNÉ (`database/data/geo/regions/*.json`), chargé
 * par `geo:sync-referential` au déploiement et par `GeoReferentialSeeder` en développement. Cette
 * migration ne charge rien : une migration qui insère casserait toute suite qui compte des lignes
 * (cf. « Écarts relevés », E-2).
 *
 * Unicité : un nom par ville, CASSE repliée par ICU (ADR-0025) — `CaseInsensitive::sql()` rend
 * l'expression exacte que les requêtes de `GeoNeighborhoodResolver` écrivent, sans quoi elles
 * n'emprunteraient pas l'index. L'index des quartiers est PARTIEL : un quartier refusé ou fusionné
 * ne réserve plus son nom.
 *
 * Noms d'index et de clés explicites : PostgreSQL TRONQUE un nom de plus de 63 caractères sans
 * erreur (CLAUDE.md, piège n°3).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('geo_regions', function (Blueprint $table) {
            $table->id();
            $table->string('code', 8)->unique('geo_regions_code_unique');
            $table->string('slug', 80)->unique('geo_regions_slug_unique');
            $table->string('name', 120);
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->timestamps();
        });

        Schema::create('geo_cities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('geo_region_id')
                ->constrained('geo_regions', 'id', 'geo_cities_region_fk')
                ->restrictOnDelete();
            $table->string('slug', 120);
            $table->string('name', 120);
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->timestamps();
            $table->unique(['geo_region_id', 'slug'], 'geo_cities_region_slug_unique');
        });

        Schema::create('geo_neighborhoods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('geo_city_id')
                ->constrained('geo_cities', 'id', 'geo_neighborhoods_city_fk')
                ->restrictOnDelete();
            $table->string('slug', 140);
            $table->string('name', 120);
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            // ADR-0007 : pas d'enum() SQL — une chaîne et `ReferentialStatus` côté application.
            $table->string('status', 16)->default('approved');
            $table->string('origin', 16)->default('dataset');
            $table->string('osm_ref', 32)->nullable();
            $table->foreignId('created_by_id')->nullable()
                ->constrained('users', 'id', 'geo_neighborhoods_created_by_fk')
                ->nullOnDelete();
            $table->foreignId('merged_into_id')->nullable()
                ->constrained('geo_neighborhoods', 'id', 'geo_neighborhoods_merged_into_fk')
                ->nullOnDelete();
            // Posé par un renommage en modération : le rechargement du jeu de données ne réécrit
            // plus ce nom (la décision humaine l'emporte sur l'extraction suivante).
            $table->timestamp('renamed_at')->nullable();
            $table->timestamps();
            $table->unique(['geo_city_id', 'slug'], 'geo_neighborhoods_city_slug_unique');
            // CLAUDE.md, piège n°8 : une FK n'est pas indexée d'office sous PostgreSQL.
            $table->index(['status', 'geo_city_id'], 'geo_neighborhoods_status_city_idx');
            $table->index('created_by_id', 'geo_neighborhoods_created_by_idx');
            $table->index('merged_into_id', 'geo_neighborhoods_merged_into_idx');
        });

        $nom = CaseInsensitive::sql('name');

        DB::statement("CREATE UNIQUE INDEX geo_cities_region_name_ci_unique ON geo_cities (geo_region_id, {$nom})");
        // Une ville se cherche par son nom dans TOUT le pays (rattachement des adresses existantes).
        DB::statement("CREATE INDEX geo_cities_name_ci_idx ON geo_cities ({$nom})");
        DB::statement(
            "CREATE UNIQUE INDEX geo_neighborhoods_city_name_ci_unique ON geo_neighborhoods (geo_city_id, {$nom}) "
            ."WHERE status <> 'rejected' AND merged_into_id IS NULL"
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('geo_neighborhoods');
        Schema::dropIfExists('geo_cities');
        Schema::dropIfExists('geo_regions');
    }
};
```

`database/migrations/2026_10_12_400100_add_geo_references_to_addresses.php` :

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 (ADR-0062 §4) — une adresse RÉFÉRENCE sa ville et son quartier, et garde ses textes.
 *
 * Les colonnes texte (`city`, `region`, `neighborhood`) restent la vérité affichée et indexée par
 * la recherche : les identifiants ne remplacent rien, ils canonisent (`GeoAddressCanonicalizer`).
 * `nullOnDelete` : une ligne de référentiel supprimée ne doit jamais emporter une adresse.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('addresses', function (Blueprint $table) {
            $table->foreignId('geo_city_id')->nullable()
                ->constrained('geo_cities', 'id', 'addresses_geo_city_fk')
                ->nullOnDelete();
            $table->foreignId('geo_neighborhood_id')->nullable()
                ->constrained('geo_neighborhoods', 'id', 'addresses_geo_neighborhood_fk')
                ->nullOnDelete();
            $table->index('geo_city_id', 'addresses_geo_city_idx');
            $table->index('geo_neighborhood_id', 'addresses_geo_neighborhood_idx');
        });
    }

    public function down(): void
    {
        Schema::table('addresses', function (Blueprint $table) {
            $table->dropForeign('addresses_geo_neighborhood_fk');
            $table->dropForeign('addresses_geo_city_fk');
            $table->dropIndex('addresses_geo_neighborhood_idx');
            $table->dropIndex('addresses_geo_city_idx');
            $table->dropColumn(['geo_neighborhood_id', 'geo_city_id']);
        });
    }
};
```

**Step 5 : les trois modèles**

`app/Models/GeoRegion.php` :

```php
<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** TCK-633 (ADR-0062) — une des 14 régions du Sénégal (`code` ISO 3166-2 : `SN-DK`…). */
class GeoRegion extends AbstractModel
{
    use HasFactory;

    protected $fillable = ['code', 'slug', 'name', 'latitude', 'longitude'];

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
    ];

    protected static array $requestSortable = ['id', 'name'];

    protected static array $queryFields = ['id', 'code', 'slug', 'name', 'latitude', 'longitude'];

    public function cities(): HasMany
    {
        return $this->hasMany(GeoCity::class);
    }
}
```

`app/Models/GeoCity.php` :

```php
<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * TCK-633 (ADR-0062 §2) — la VILLE telle que les annonces la nomment : la commune, sauf dans
 * l'agglomération dakaroise où c'est le département (Dakar, Pikine, Guédiawaye, Keur Massar), ses
 * communes d'arrondissement devenant des quartiers.
 */
class GeoCity extends AbstractModel
{
    use HasFactory;

    protected $fillable = ['geo_region_id', 'slug', 'name', 'latitude', 'longitude'];

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
    ];

    protected static array $requestFilterable = ['geo_region_id'];

    protected static array $requestSortable = ['id', 'name'];

    protected static array $queryFields = ['id', 'geo_region_id', 'slug', 'name', 'latitude', 'longitude'];

    public function region(): BelongsTo
    {
        return $this->belongsTo(GeoRegion::class, 'geo_region_id');
    }

    public function neighborhoods(): HasMany
    {
        return $this->hasMany(GeoNeighborhood::class);
    }
}
```

`app/Models/GeoNeighborhood.php` :

```php
<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\GeoNeighborhoodOrigin;
use App\Models\Enums\ReferentialStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * TCK-633 (ADR-0062 §4) — un quartier, venu du jeu de données (`dataset`, approuvé d'office) ou
 * proposé par une saisie (`user`, `pending` jusqu'à la modération).
 *
 * Une proposition n'est visible que de son auteur (`visiblesPour`). Une fusion ne supprime rien :
 * la source garde son nom et pointe sa cible (`merged_into_id`), si bien que le même nom retapé
 * plus tard retombe sur la cible (`canonique()`) au lieu de recréer la proposition.
 */
class GeoNeighborhood extends AbstractModel
{
    use HasFactory;

    /** La longueur de `name` — au-delà, une saisie ne devient pas une proposition. */
    public const NOM_MAX = 120;

    /** Une chaîne de fusions plus longue est une donnée corrompue : on s'arrête. */
    private const SAUTS_MAX = 5;

    protected $fillable = [
        'geo_city_id', 'slug', 'name', 'latitude', 'longitude', 'status', 'origin', 'osm_ref',
        'created_by_id', 'merged_into_id', 'renamed_at',
    ];

    protected $attributes = [
        'status' => 'approved',
        'origin' => 'dataset',
    ];

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
        'status' => ReferentialStatus::class,
        'origin' => GeoNeighborhoodOrigin::class,
        'renamed_at' => 'datetime',
    ];

    protected static array $requestFilterable = ['status', 'geo_city_id', 'origin'];

    protected static array $requestSortable = ['id', 'name', 'created_at'];

    protected static array $requestSearchFields = ['name'];

    protected static array $queryFields = [
        'id', 'geo_city_id', 'slug', 'name', 'latitude', 'longitude', 'status', 'origin',
        'created_by_id', 'merged_into_id', 'created_at',
    ];

    public function city(): BelongsTo
    {
        return $this->belongsTo(GeoCity::class, 'geo_city_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function mergedInto(): BelongsTo
    {
        return $this->belongsTo(self::class, 'merged_into_id');
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(Address::class, 'geo_neighborhood_id');
    }

    /** La ligne qui fait foi : la cible de la dernière fusion ; `null` si elle est refusée. */
    public function canonique(): ?self
    {
        $courant = $this;
        for ($saut = 0; $saut < self::SAUTS_MAX && $courant->merged_into_id !== null; $saut++) {
            $suivant = self::query()->find($courant->merged_into_id);
            if ($suivant === null) {
                return null;
            }
            $courant = $suivant;
        }

        if ($courant->merged_into_id !== null || $courant->status === ReferentialStatus::Rejected) {
            return null;
        }

        return $courant;
    }

    /** Approuvés, plus les propositions de `$user` ; jamais un refusé ni un fusionné. */
    public function scopeVisiblesPour(Builder $query, ?User $user): Builder
    {
        return $query
            ->whereNull('merged_into_id')
            ->where(function (Builder $q) use ($user) {
                $q->where('status', ReferentialStatus::Approved->value);
                if ($user !== null) {
                    $q->orWhere(fn (Builder $q) => $q
                        ->where('status', ReferentialStatus::Pending->value)
                        ->where('created_by_id', $user->id));
                }
            });
    }

    /** Un slug libre dans la ville : `nom`, puis `nom-2`, `nom-3`… */
    public static function slugLibre(int $villeId, string $nom): string
    {
        $base = Str::limit(Str::slug($nom), 130, '') ?: 'quartier';
        $slug = $base;
        for ($n = 2; self::query()->where('geo_city_id', $villeId)->where('slug', $slug)->exists(); $n++) {
            $slug = $base.'-'.$n;
        }

        return $slug;
    }
}
```

**Step 6 : les trois factories**

`database/factories/GeoRegionFactory.php` :

```php
<?php

namespace Database\Factories;

use App\Models\GeoRegion;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class GeoRegionFactory extends Factory
{
    protected $model = GeoRegion::class;

    public function definition(): array
    {
        $nom = 'Région '.fake()->unique()->lexify('????????');

        return [
            'code' => 'T-'.fake()->unique()->numerify('#####'),
            'slug' => Str::slug($nom),
            'name' => $nom,
            'latitude' => 14.7,
            'longitude' => -17.4,
        ];
    }
}
```

`database/factories/GeoCityFactory.php` :

```php
<?php

namespace Database\Factories;

use App\Models\GeoCity;
use App\Models\GeoRegion;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class GeoCityFactory extends Factory
{
    protected $model = GeoCity::class;

    public function definition(): array
    {
        $nom = 'Ville '.fake()->unique()->lexify('????????');

        return [
            'geo_region_id' => GeoRegion::factory(),
            'slug' => Str::slug($nom),
            'name' => $nom,
            'latitude' => 14.7,
            'longitude' => -17.4,
        ];
    }
}
```

`database/factories/GeoNeighborhoodFactory.php` :

```php
<?php

namespace Database\Factories;

use App\Models\Enums\GeoNeighborhoodOrigin;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class GeoNeighborhoodFactory extends Factory
{
    protected $model = GeoNeighborhood::class;

    public function definition(): array
    {
        $nom = 'Quartier '.fake()->unique()->lexify('????????');

        return [
            'geo_city_id' => GeoCity::factory(),
            'slug' => Str::slug($nom),
            'name' => $nom,
            'latitude' => 14.7,
            'longitude' => -17.4,
            'status' => ReferentialStatus::Approved,
            'origin' => GeoNeighborhoodOrigin::Dataset,
        ];
    }

    public function pending(User $auteur): static
    {
        return $this->state(fn () => [
            'status' => ReferentialStatus::Pending,
            'origin' => GeoNeighborhoodOrigin::User,
            'created_by_id' => $auteur->id,
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn () => ['status' => ReferentialStatus::Rejected]);
    }
}
```

**Step 7 : lancer, constater le vert**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Feature/Geo/GeoNeighborhoodUniquenessTest.php
```

Attendu : `Tests: 5 passed`.

**Step 8 : ablation — la collation ICU**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api
M=database/migrations/2026_10_12_400000_create_geo_referential_tables.php
mkdir -p "$S/abl/t1" && cp "$M" "$S/abl/t1/migration.php"
sed -i '' 's/\$nom = CaseInsensitive::sql(.name.);/$nom = "LOWER(name)";/' "$M"
grep -n '\$nom = ' "$M"
php artisan test tests/Feature/Geo/GeoNeighborhoodUniquenessTest.php
cp "$S/abl/t1/migration.php" "$M" && md5 -q "$M" "$S/abl/t1/migration.php"
php artisan test tests/Feature/Geo/GeoNeighborhoodUniquenessTest.php
```

Attendu : `grep` montre `$nom = "LOWER(name)";` ; le test rend **2 échecs**
(`la_meme_ville_refuse…` : « Failed asserting that exception of type
UniqueConstraintViolationException is thrown » ; `l_index_porte_la_collation_icu…`) ; les deux
`md5` identiques ; le dernier passage `5 passed`.

**Step 9 : Pint, puis signaler**

```bash
./vendor/bin/pint database/migrations/2026_10_12_400000_create_geo_referential_tables.php database/migrations/2026_10_12_400100_add_geo_references_to_addresses.php app/Models/Enums/ReferentialStatus.php app/Models/Enums/GeoNeighborhoodOrigin.php app/Models/GeoRegion.php app/Models/GeoCity.php app/Models/GeoNeighborhood.php database/factories/GeoRegionFactory.php database/factories/GeoCityFactory.php database/factories/GeoNeighborhoodFactory.php tests/Feature/Geo/GeoNeighborhoodUniquenessTest.php
```

Signaler à la session : ces 11 fichiers, message proposé
`feat(api): référentiel géographique — tables, modèles, unicité ICU des quartiers (TCK-633)`.
⚠ `node scripts/check-models-spec.mjs` rougit désormais sur `GeoRegion`, `GeoCity`,
`GeoNeighborhood` : attendu (règle 5 du plan maître), à porter dans le rapport.

---

## Tâche 2 — Le jeu de données : extraction OpenStreetMap, corrections, 14 fichiers (script : 10 min ; extraction : 14 commandes de 1 à 9 min)

**Fichiers**
- Créer : `takussan-api/database/data/geo/extract.mjs`
- Créer : `takussan-api/database/data/geo/corrections.json`
- Produire : `takussan-api/database/data/geo/regions/sn-{dk,db,fk,ka,kl,ke,kd,lg,mt,sl,se,tc,th,zg}.json`

Ce script ne tourne ni en CI ni au déploiement : il PRODUIT des fichiers versionnés, qu'une
personne relit (tâche 27) avant la fusion. Le chargement en base est l'affaire de la tâche 4.

### Format exact d'un fichier de région

```text
{
  "region":  { "code": "SN-DK", "slug": "dakar", "name": "Dakar", "latitude": <float>, "longitude": <float> },
  "source":  { "osm_base": "<horodatage Overpass ISO 8601 ou null>", "extraite_le": "AAAA-MM-JJ",
               "licence": "ODbL 1.0 — © les contributeurs d’OpenStreetMap",
               "relu_par": null | "<nom de la personne>", "relu_le": null | "AAAA-MM-JJ" },
  "cities":  [ { "slug": "<a-z0-9->", "name": "<nom affiché>", "latitude": <float>, "longitude": <float>,
                 "neighborhoods": [ { "slug": "<a-z0-9->", "name": "<nom affiché>",
                                      "latitude": <float>, "longitude": <float>,
                                      "osm": "n123" | "w123" | "r123" | null } ] } ]
}
```

Règles tenues par le script et vérifiées par `GeoDatasetReviewedTest` (tâche 27) : villes et
quartiers triés par nom (`localeCompare('fr')`) ; `slug` unique dans sa ville ; coordonnées à
7 décimales ; `osm: null` pour une ligne ajoutée ou regroupée par `corrections.json` ;
`relu_par`/`relu_le` à `null` tant que la relecture humaine n'est pas faite.

### Extrait réel — `sn-dk.json`, extrait le 2026-10-12 (`osm_base` 2026-10-12T01:32:19Z)

13 villes, 198 quartiers. Trois villes reproduites telles que le script les a écrites :

```json
{
  "region": {
    "code": "SN-DK",
    "slug": "dakar",
    "name": "Dakar",
    "latitude": 14.7394224,
    "longitude": -17.3348176
  },
  "source": {
    "osm_base": "2026-10-12T01:32:19Z",
    "extraite_le": "2026-10-12",
    "licence": "ODbL 1.0 — © les contributeurs d’OpenStreetMap",
    "relu_par": null,
    "relu_le": null
  },
  "cities": [
    {
      "slug": "bambylor",
      "name": "Bambylor",
      "latitude": 14.8342125,
      "longitude": -17.1881483,
      "neighborhoods": []
    },
    {
      "slug": "guediawaye",
      "name": "Guédiawaye",
      "latitude": 14.7799944,
      "longitude": -17.3948339,
      "neighborhoods": [
        { "slug": "cite-barry-et-ly", "name": "Cité Barry et Ly", "latitude": 14.7793117, "longitude": -17.3979343, "osm": "w385869090" },
        { "slug": "cite-biagui-2", "name": "Cité Biagui 2", "latitude": 14.7870205, "longitude": -17.3808113, "osm": "n3666292248" },
        { "slug": "cite-sofraco", "name": "Cité SOFRACO", "latitude": 14.7876995, "longitude": -17.3785205, "osm": "n3666233439" },
        { "slug": "golf-sud", "name": "Golf Sud", "latitude": 14.7723006, "longitude": -17.4155893, "osm": "r12982144" },
        { "slug": "golf-sud-cite-aliou-sow", "name": "Golf Sud(Cité Aliou SOW)", "latitude": 14.7716198, "longitude": -17.4139148, "osm": "n8047907843" },
        { "slug": "hamo-6", "name": "Hamo 6", "latitude": 14.7849453, "longitude": -17.3842327, "osm": "n3666295353" },
        { "slug": "medina-gounass", "name": "Medina Gounass", "latitude": 14.7717319, "longitude": -17.3823056, "osm": "r12982140" },
        { "slug": "ndiareme-limamoulaye", "name": "Ndiarème Limamoulaye", "latitude": 14.7904747, "longitude": -17.3896021, "osm": "r12982143" },
        { "slug": "sam-notaire", "name": "Sam Notaire", "latitude": 14.7845357, "longitude": -17.3962327, "osm": "r12982142" },
        { "slug": "sentenac", "name": "Sentenac", "latitude": 14.7855335, "longitude": -17.381845, "osm": "n3666297212" },
        { "slug": "wakhinane-nimzatt", "name": "Wakhinane Nimzatt", "latitude": 14.7932388, "longitude": -17.3757339, "osm": "r12982141" }
      ]
    },
    {
      "slug": "rufisque",
      "name": "Rufisque",
      "latitude": 14.7173347,
      "longitude": -17.2603642,
      "neighborhoods": [
        { "slug": "cite-sidak", "name": "Cité Sidak", "latitude": 14.7355252, "longitude": -17.3146292, "osm": "n8848178583" },
        { "slug": "rufisque-est", "name": "Rufisque Est", "latitude": 14.7173347, "longitude": -17.2603642, "osm": null },
        { "slug": "rufisque-nord", "name": "Rufisque Nord", "latitude": 14.7312031, "longitude": -17.2674434, "osm": null },
        { "slug": "rufisque-ouest", "name": "Rufisque Ouest", "latitude": 14.7300482, "longitude": -17.2954801, "osm": null }
      ]
    }
  ]
}
```

(Le script écrit chaque quartier sur six lignes, `JSON.stringify(…, null, 2)` ; l'extrait les
replie sur une ligne pour la lecture. Les valeurs sont identiques.)

Répartition des 13 villes de SN-DK : bambylor 0, bargny 1, dakar 151, diamniadio 1,
guediawaye 11, keur-massar 11, pikine 14, rufisque 4, sangalkam 3, sebikhotane 0, sendou 0,
tivaouane-peulh-niaga 2, yenne 0. Dans `dakar` : `almadies` (14.7441857, -17.5175251,
n2214678829), `mermoz` (14.7074454, -17.474397, n562878265), `point-e` (14.6964782,
-17.4641817, n299636390), `sacre-coeur-3` (14.720456, -17.4674393, w279672366), `yoff`
(14.7536274, -17.4773789, r12988608), `liberte-4` et `liberte-6` (`osm: null`, ajoutés par
`corrections.json`).

**Step 1 : écrire le script**

`takussan-api/database/data/geo/extract.mjs` (exécutable : `chmod +x`) :

```js
#!/usr/bin/env node
/**
 * TCK-633 (ADR-0062 §3) — extraction du référentiel géographique du Sénégal depuis OpenStreetMap.
 *
 * Ce script ne s'exécute PAS en CI ni au déploiement : il PRODUIT les fichiers versionnés de
 * `database/data/geo/regions/`, que la personne qui le lance relit avant de les commiter
 * (`relu_par`, `relu_le`). Le chargement en base est l'affaire de `GeoReferentialLoader`.
 *
 *   node database/data/geo/extract.mjs                  # les 14 régions
 *   node database/data/geo/extract.mjs --region=SN-DK   # une seule
 *   node database/data/geo/extract.mjs --brut=/tmp/geo  # garde aussi les réponses brutes d'Overpass
 *   node database/data/geo/extract.mjs --depuis=/tmp/geo  # rejoue sur des réponses brutes gardées
 *
 * Découpage (ADR-0062 §2) : dans les départements de l'agglomération dakaroise, la VILLE est le
 * département et ses communes d'arrondissement sont des QUARTIERS, à côté des lieux nommés
 * d'OSM ; ailleurs, la ville est la commune. Niveaux OSM mesurés le 2026-10-12 sur la région de
 * Dakar : 4 = région, 5 = département, 7 = arrondissement, 8 = commune.
 *
 * ⚠ Overpass refuse (406) une requête sans User-Agent, et rend souvent 504 / 500 sous charge :
 * le script essaie trois serveurs, avec une attente croissante.
 *
 * Données © les contributeurs d'OpenStreetMap, licence ODbL 1.0.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, 'regions');
const CORRECTIONS = join(ICI, 'corrections.json');

const REGIONS = [
  'SN-DK', 'SN-DB', 'SN-FK', 'SN-KA', 'SN-KL', 'SN-KE', 'SN-KD',
  'SN-LG', 'SN-MT', 'SN-SL', 'SN-SE', 'SN-TC', 'SN-TH', 'SN-ZG',
];

/** Les départements où la ville est le département (ADR-0062 §2), par nom OSM débarrassé du préfixe. */
const AGGLOMERATION = new Set(['Dakar', 'Pikine', 'Guédiawaye', 'Keur Massar']);

const SERVEURS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const AGENT = 'takussan-geo-extract/1.0 (+https://www.takussan.com)';
const TENTATIVES = 6;

/** Les sigles qui restent en capitales quand un nom tout en capitales est remis en casse de titre. */
const SIGLES = new Set(['HLM', 'SICAP', 'SCAT', 'ASECNA', 'SIPRES', 'SICA', 'SONATEL', 'CSE', 'VDN', 'SOFRACO', 'SIDAK', 'JUS', 'UCAD', 'SDE', 'BCEAO', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII']);

const PREFIXES = /^(?:r[ée]gion|d[ée]partement|commune(?: d'arrondissement)?|communaut[ée] rurale|arrondissement)\s+(?:de la |de l'|de l’|des |du |de |d'|d’)?/i;

function requete(code) {
  return `[out:json][timeout:600];
rel["boundary"="administrative"]["admin_level"="4"]["ISO3166-2"="${code}"]->.reg;
.reg out tags center;
.reg map_to_area->.r;
rel(area.r)["boundary"="administrative"]["admin_level"="5"];
foreach->.d(
  .d out tags center;
  .d map_to_area->.da;
  rel(area.da)["boundary"="administrative"]["admin_level"="8"];
  foreach->.c(
    .c out tags center;
    .c map_to_area->.ca;
    nwr(area.ca)["place"~"^(suburb|quarter|neighbourhood)$"]["name"]->.p;
    (.p; - rel.p["admin_level"~"^[1-8]$"];);
    out tags center;
  );
);`;
}

async function overpass(code) {
  for (let essai = 1; essai <= TENTATIVES; essai++) {
    for (const serveur of SERVEURS) {
      try {
        const reponse = await fetch(serveur, {
          method: 'POST',
          headers: { 'User-Agent': AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: requete(code) }),
          signal: AbortSignal.timeout(620_000),
        });
        if (reponse.ok) return await reponse.json();
        console.error(`  ${code} · ${serveur} → ${reponse.status}`);
      } catch (erreur) {
        console.error(`  ${code} · ${serveur} → ${erreur.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 20_000 * essai));
  }
  throw new Error(`Overpass n'a pas répondu pour ${code} après ${TENTATIVES} tours.`);
}

export function slug(nom) {
  return nom
    // « Cœur » : la ligature ne se décompose pas en NFD — sans ce remplacement, « c-ur ».
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function nomPropre(brut) {
  let nom = brut.trim().replace(/\s+/g, ' ').replace(PREFIXES, '');
  const lettres = nom.replace(/[^\p{L}]/gu, '');
  if (lettres.length > 3 && lettres === lettres.toLocaleUpperCase('fr')) {
    nom = nom
      .split(' ')
      .map((mot) => (SIGLES.has(mot.replace(/[^\p{L}]/gu, '')) ? mot : mot.charAt(0) + mot.slice(1).toLocaleLowerCase('fr')))
      .join(' ');
  }
  return nom.charAt(0).toLocaleUpperCase('fr') + nom.slice(1);
}

function centre(element) {
  const c = element.center ?? { lat: element.lat, lon: element.lon };
  return { latitude: Number(c.lat.toFixed(7)), longitude: Number(c.lon.toFixed(7)) };
}

function osm(element) {
  return `${element.type[0]}${element.id}`;
}

/** Transforme le flux ordonné d'Overpass (région, puis département, commune, lieux…) en arbre. */
export function arbre(code, reponse) {
  const [tete, ...reste] = reponse.elements;
  if (!tete || tete.tags?.admin_level !== '4') throw new Error(`${code} : la réponse ne commence pas par la région.`);

  const region = { code, slug: slug(nomPropre(tete.tags.name)), name: nomPropre(tete.tags.name), ...centre(tete) };
  const villes = new Map();
  let departement = null;
  let commune = null;
  const vus = new Set();

  const ville = (nom, element) => {
    const cle = slug(nom);
    if (!villes.has(cle)) villes.set(cle, { slug: cle, name: nom, ...centre(element), neighborhoods: new Map() });
    return villes.get(cle);
  };
  const quartier = (v, nom, element) => {
    const cle = slug(nom);
    if (cle === '' || cle === v.slug || nom.length > 60 || v.neighborhoods.has(cle)) return;
    v.neighborhoods.set(cle, { slug: cle, name: nom, ...centre(element), osm: osm(element) });
  };

  for (const e of reste) {
    const niveau = e.tags?.boundary === 'administrative' ? e.tags.admin_level : null;
    if (niveau === '5') {
      departement = { nom: nomPropre(e.tags.name), element: e };
      commune = null;
      continue;
    }
    if (niveau === '8') {
      const nom = nomPropre(e.tags.name);
      if (departement && AGGLOMERATION.has(departement.nom)) {
        commune = ville(departement.nom, departement.element);
        quartier(commune, nom, e);
      } else {
        commune = ville(nom, e);
      }
      continue;
    }
    if (!commune || vus.has(osm(e))) continue;
    vus.add(osm(e));
    quartier(commune, nomPropre(e.tags.name), e);
  }

  return { region, villes };
}

export function appliquerCorrections({ region, villes }, corrections) {
  const prefixe = region.code;
  // Regrouper des communes sous la ville que les annonces nomment (« Rufisque » pour Rufisque
  // Est, Nord et Ouest) : chaque commune devient un quartier, ses quartiers suivent.
  for (const groupe of corrections.regrouper ?? []) {
    if (groupe.region !== prefixe) continue;
    const membres = groupe.communes.map((c) => villes.get(c)).filter(Boolean);
    if (membres.length === 0) continue;
    const cle = slug(groupe.ville);
    const cible = villes.get(cle) ?? { slug: cle, name: groupe.ville, latitude: membres[0].latitude, longitude: membres[0].longitude, neighborhoods: new Map() };
    for (const m of membres) {
      if (m === cible) continue;
      if (!cible.neighborhoods.has(m.slug)) {
        cible.neighborhoods.set(m.slug, { slug: m.slug, name: m.name, latitude: m.latitude, longitude: m.longitude, osm: null });
      }
      for (const [k, n] of m.neighborhoods) if (!cible.neighborhoods.has(k)) cible.neighborhoods.set(k, n);
      villes.delete(m.slug);
    }
    villes.set(cle, cible);
  }
  for (const [chemin, champs] of Object.entries(corrections.villes ?? {})) {
    const [c, v] = chemin.split('/');
    if (c === prefixe && villes.has(v)) Object.assign(villes.get(v), champs);
  }
  for (const [chemin, nom] of Object.entries(corrections.renommer ?? {})) {
    const [c, v, q] = chemin.split('/');
    const n = c === prefixe ? villes.get(v)?.neighborhoods.get(q) : undefined;
    if (n) n.name = nom;
  }
  for (const chemin of corrections.retirer ?? []) {
    const [c, v, q] = chemin.split('/');
    if (c === prefixe) villes.get(v)?.neighborhoods.delete(q);
  }
  for (const ajout of corrections.ajouter ?? []) {
    const [c, v] = ajout.chemin.split('/');
    const cible = c === prefixe ? villes.get(v) : undefined;
    if (cible && !cible.neighborhoods.has(slug(ajout.name))) {
      cible.neighborhoods.set(slug(ajout.name), {
        slug: slug(ajout.name), name: ajout.name, latitude: ajout.latitude, longitude: ajout.longitude, osm: null,
      });
    }
  }
}

const parNom = (a, b) => a.name.localeCompare(b.name, 'fr');

export function fichier({ region, villes }, osmBase) {
  return {
    region,
    source: {
      osm_base: osmBase,
      extraite_le: new Date().toISOString().slice(0, 10),
      licence: 'ODbL 1.0 — © les contributeurs d’OpenStreetMap',
      relu_par: null,
      relu_le: null,
    },
    cities: [...villes.values()].sort(parNom).map((v) => ({
      slug: v.slug,
      name: v.name,
      latitude: v.latitude,
      longitude: v.longitude,
      neighborhoods: [...v.neighborhoods.values()].sort(parNom),
    })),
  };
}

async function principal() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
  const codes = args.region ? [args.region] : REGIONS;
  const corrections = JSON.parse(await readFile(CORRECTIONS, 'utf8').catch(() => '{}'));
  await mkdir(SORTIE, { recursive: true });

  for (const code of codes) {
    console.log(`→ ${code}`);
    const reponse = args.depuis
      ? JSON.parse(await readFile(join(args.depuis, `${code.toLowerCase()}.json`), 'utf8'))
      : await overpass(code);
    if (args.brut) {
      await mkdir(args.brut, { recursive: true });
      await writeFile(join(args.brut, `${code.toLowerCase()}.json`), JSON.stringify(reponse));
    }
    const resultat = arbre(code, reponse);
    appliquerCorrections(resultat, corrections);
    const contenu = fichier(resultat, reponse.osm3s?.timestamp_osm_base ?? null);
    const cible = join(SORTIE, `${code.toLowerCase()}.json`);
    await writeFile(cible, `${JSON.stringify(contenu, null, 2)}\n`);
    const quartiers = contenu.cities.reduce((n, v) => n + v.neighborhoods.length, 0);
    console.log(`  ${contenu.cities.length} villes, ${quartiers} quartiers → ${cible}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
```

**Step 2 : écrire les corrections**

`takussan-api/database/data/geo/corrections.json` :

```json
{
  "_": "TCK-633 (ADR-0062 §3) — corrections relues à la main, rejouées à chaque extraction. Clés : <RÉGION>/<ville>/<quartier>, slugs calculés AVANT correction.",
  "regrouper": [
    { "region": "SN-DK", "ville": "Rufisque", "communes": ["rufisque-est", "rufisque-nord", "rufisque-ouest"] }
  ],
  "villes": {},
  "renommer": {
    "SN-DK/dakar/yyoff-apecsy": "Yoff Apecsy",
    "SN-DK/dakar/cite-avion": "Cité Avion",
    "SN-DK/dakar/cite-keretou": "Cité Keretou",
    "SN-DK/dakar/cite-millionnaire": "Cité Millionnaire",
    "SN-DK/dakar/sacre-coeur": "Sacré-Cœur",
    "SN-DK/dakar/sacre-coeur-2": "Sacré-Cœur 2",
    "SN-DK/dakar/sacre-coeur-3": "Sacré-Cœur 3",
    "SN-DK/dakar/unite-14": "Unité 14",
    "SN-DK/dakar/unite-17": "Unité 17",
    "SN-DK/dakar/unite-18": "Unité 18",
    "SN-DK/dakar/unite-23": "Unité 23"
  },
  "retirer": [
    "SN-DK/dakar/chef-de-quartier-bagdad",
    "SN-DK/dakar/gardien",
    "SN-DK/dakar/liberte-vi-extension"
  ],
  "ajouter": [
    { "chemin": "SN-DK/dakar", "name": "Liberté 1", "latitude": 14.7189, "longitude": -17.4580 },
    { "chemin": "SN-DK/dakar", "name": "Liberté 2", "latitude": 14.7214, "longitude": -17.4560 },
    { "chemin": "SN-DK/dakar", "name": "Liberté 3", "latitude": 14.7236, "longitude": -17.4588 },
    { "chemin": "SN-DK/dakar", "name": "Liberté 4", "latitude": 14.7178, "longitude": -17.4627 },
    { "chemin": "SN-DK/dakar", "name": "Liberté 5", "latitude": 14.7215, "longitude": -17.4625 },
    { "chemin": "SN-DK/dakar", "name": "Liberté 6", "latitude": 14.7272, "longitude": -17.4618 },
    { "chemin": "SN-DK/dakar", "name": "Sicap Baobab", "latitude": 14.7108, "longitude": -17.4605 }
  ]
}
```

**Step 3 : vérifier les fonctions pures du script (rouge si une régression touche le slug)**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api/database/data/geo && node --input-type=module -e "
import { slug, nomPropre } from './extract.mjs';
const cas = [
  [slug('Sacré-Cœur 3'), 'sacre-coeur-3'],
  [slug(\"Patte d'Oie\"), 'patte-d-oie'],
  [slug('Golf Sud(Cité Aliou SOW)'), 'golf-sud-cite-aliou-sow'],
  [nomPropre('COMMUNE DE NGOR'), 'Ngor'],
  [nomPropre('HLM GRAND YOFF'), 'HLM Grand Yoff'],
  [nomPropre('Région de Dakar'), 'Dakar'],
];
let ko = 0;
for (const [obtenu, attendu] of cas) { if (obtenu !== attendu) { ko++; console.log('✗', obtenu, '≠', attendu); } }
console.log(ko === 0 ? '✓ 6 cas' : '✗ ' + ko + ' échec(s)'); process.exit(ko);
"
```

Attendu : `✓ 6 cas`. **Ablation** : retirer la ligne
`.replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE')` (copie
préalable `cp extract.mjs "$S/abl/t2-extract.mjs"`) → `✗ sacre-c-ur-3 ≠ sacre-coeur-3` et
`✗ 1 échec(s)` ; restaurer par `cp "$S/abl/t2-extract.mjs" extract.mjs` puis
`md5 -q extract.mjs "$S/abl/t2-extract.mjs"`.

**Step 4 : extraire les 14 régions — UNE commande par région**

⚠ Une requête Overpass prend de 1 à 9 minutes et rend souvent 504 sous charge : le script essaie
trois serveurs, six tours. Une commande qui dépasse **9 minutes** est interrompue et confiée à la
session (CLAUDE.md : au-delà de 10 minutes, un agent est coupé sans rien produire). Les réponses
brutes sont gardées (`--brut`) : une correction se rejoue ensuite sans réseau (`--depuis`).

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api
node database/data/geo/extract.mjs --region=SN-DK --brut="$S/geo-brut"
```

Attendu : `→ SN-DK` puis `  13 villes, 198 quartiers → …/regions/sn-dk.json` (± quelques
quartiers si OSM a changé depuis le 2026-10-12 : noter l'écart dans le rapport). Puis, une à une :
`SN-DB`, `SN-FK`, `SN-KA`, `SN-KL`, `SN-KE`, `SN-KD`, `SN-LG`, `SN-MT`, `SN-SL`, `SN-SE`,
`SN-TC`, `SN-TH`, `SN-ZG` — même commande, en changeant `--region`.

⚠ Le User-Agent est `takussan-geo-extract/1.0 (+https://www.takussan.com)`. N'y mettre **aucune
adresse e-mail** : Overpass est un service tiers.

**Step 5 : Touba**

```bash
node -e "const f=require('./database/data/geo/regions/sn-db.json'); console.log(f.cities.filter(c=>/touba/.test(c.slug)).map(c=>c.slug+' '+c.neighborhoods.length).join('\n'))"
```

OSM nomme la commune « Touba Mosquée » ; les annonces écrivent « Touba ». Si la sortie contient
`touba-mosquee`, ajouter dans `corrections.json`, clé `villes` :

```json
"villes": {
  "SN-DB/touba-mosquee": { "slug": "touba", "name": "Touba" }
}
```

puis rejouer sans réseau : `node database/data/geo/extract.mjs --region=SN-DB --depuis="$S/geo-brut"`.
Attendu : la commande précédente affiche `touba <n>`.

**Step 6 : contrôles mécaniques sur les 14 fichiers**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && node -e "
const fs=require('fs'); const d='database/data/geo/regions'; const fichiers=fs.readdirSync(d).filter(f=>f.endsWith('.json'));
let ko=0, villes=0, quartiers=0;
const dans=(la,lo)=>la>=12.2&&la<=16.8&&lo>=-17.6&&lo<=-11.3;
for (const f of fichiers) {
  const j=JSON.parse(fs.readFileSync(d+'/'+f,'utf8'));
  const sv=new Set();
  for (const v of j.cities) {
    villes++; if (sv.has(v.slug)) { ko++; console.log('✗ ville en double', f, v.slug); } sv.add(v.slug);
    if (!dans(v.latitude,v.longitude)) { ko++; console.log('✗ ville hors cadre', f, v.slug); }
    const sq=new Set();
    for (const q of v.neighborhoods) {
      quartiers++; if (sq.has(q.slug)) { ko++; console.log('✗ quartier en double', f, v.slug, q.slug); } sq.add(q.slug);
      if (!dans(q.latitude,q.longitude)) { ko++; console.log('✗ quartier hors cadre', f, v.slug, q.slug); }
    }
  }
}
console.log(fichiers.length+' fichiers, '+villes+' villes, '+quartiers+' quartiers, '+ko+' défaut(s)'); process.exit(ko);
"
```

Attendu : `14 fichiers, <V> villes, <Q> quartiers, 0 défaut(s)`. Reporter V et Q dans le rapport.
Un quartier « hors cadre » est une donnée OSM fausse : l'ajouter à `retirer` dans
`corrections.json`, rejouer la région avec `--depuis`.

**Step 7 : signaler**

Signaler à la session : `database/data/geo/extract.mjs`, `database/data/geo/corrections.json`,
`database/data/geo/regions/*.json` (14), message proposé
`chore(data): référentiel géographique du Sénégal extrait d'OpenStreetMap, non relu (TCK-633)`.
⚠ Les fichiers portent `relu_par: null` : `GeoDatasetReviewedTest` (tâche 27) restera rouge
jusqu'à la relecture humaine, et c'est voulu — il bloque la fusion, pas le travail.

---

## Tâche 3 — La canonisation des adresses : quartier replié ou proposé (20 min) — ⚠ HORS TERRITOIRE (`Address.php`)

**Fichiers**
- Créer : `takussan-api/app/Services/Geo/GeoNeighborhoodResolver.php`
- Créer : `takussan-api/app/Services/Geo/GeoAddressCanonicalizer.php`
- Créer : `takussan-api/app/Services/Geo/GeoAddressRules.php`
- Modifier : `takussan-api/app/Models/Address.php` (fillable L13-17, crochet `saving`) — ⚠ HORS TERRITOIRE
- Modifier : `takussan-api/app/Http/Requests/Api/StorePropertyRequest.php` (L73-81) — co-tenu D/F, Edit seulement
- Modifier : `takussan-api/app/Http/Requests/UpdatePropertyRequest.php` (L67-75) — co-tenu D/F, Edit seulement
- Test : `takussan-api/tests/Feature/Geo/GeoNeighborhoodProposalTest.php`

**Step 1 : écrire le test**

```php
<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\GeoNeighborhoodOrigin;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\GeoRegion;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (AC5, ADR-0062 §4) — un quartier saisi se replie sur l'existant, ou devient une
 * proposition visible de son seul auteur ; un nom refusé ne se repropose pas ; un nom fusionné
 * retombe sur sa cible ; la ville référencée impose ses noms officiels et le pays.
 *
 * Chaque assertion porte sur la ligne RELUE en base : la canonisation vit dans le crochet `saving`
 * d'`Address`, et un crochet absent ne produit pas d'erreur, il produit un 201 parfaitement vert.
 */
class GeoNeighborhoodProposalTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private GeoCity $dakar;

    private GeoNeighborhood $liberte4;

    protected function setUp(): void
    {
        parent::setUp();
        $region = GeoRegion::factory()->create(['code' => 'SN-DK', 'slug' => 'dakar', 'name' => 'Dakar']);
        $this->dakar = GeoCity::factory()->for($region, 'region')->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $this->liberte4 = GeoNeighborhood::factory()->for($this->dakar, 'city')->create(['slug' => 'liberte-4', 'name' => 'Liberté 4']);

        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->actingAsRole('agent', ['agency_id' => $this->agency->id]);
    }

    /** @param  array<string, mixed>  $adresse */
    private function creer(array $adresse): Address
    {
        $id = $this->postJson('/api/properties', [
            'title' => 'Appartement F3',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 300_000,
            'agency_id' => $this->agency->id,
            'address' => $adresse,
        ])->assertCreated()->json('data.id');

        return Property::query()->findOrFail($id)->address()->firstOrFail();
    }

    public function test_un_quartier_inconnu_devient_une_proposition_de_son_auteur(): void
    {
        $adresse = $this->creer(['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'neighborhood' => '  Cité  Djily Mbaye ']);

        $proposition = GeoNeighborhood::query()->where('name', 'Cité Djily Mbaye')->firstOrFail();
        $this->assertSame(ReferentialStatus::Pending, $proposition->status);
        $this->assertSame(GeoNeighborhoodOrigin::User, $proposition->origin);
        $this->assertSame($this->agent->id, $proposition->created_by_id);
        $this->assertSame($proposition->id, $adresse->geo_neighborhood_id);
        $this->assertSame('Cité Djily Mbaye', $adresse->neighborhood);
    }

    public function test_un_nom_existant_en_autre_casse_se_replie_sans_rien_creer(): void
    {
        $avant = GeoNeighborhood::query()->count();

        $adresse = $this->creer(['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'neighborhood' => 'LIBERTÉ   4']);

        $this->assertSame($avant, GeoNeighborhood::query()->count());
        $this->assertSame($this->liberte4->id, $adresse->geo_neighborhood_id);
        $this->assertSame('Liberté 4', $adresse->neighborhood);
    }

    public function test_un_nom_refuse_ne_se_repropose_pas(): void
    {
        GeoNeighborhood::factory()->for($this->dakar, 'city')->rejected()->create(['slug' => 'fass', 'name' => 'Fass']);
        $avant = GeoNeighborhood::query()->count();

        $adresse = $this->creer(['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'neighborhood' => 'fass']);

        $this->assertSame($avant, GeoNeighborhood::query()->count());
        $this->assertNull($adresse->geo_neighborhood_id);
        $this->assertSame('fass', $adresse->neighborhood);
    }

    public function test_un_nom_fusionne_retombe_sur_sa_cible(): void
    {
        $cible = GeoNeighborhood::factory()->for($this->dakar, 'city')->create(['slug' => 'colobane', 'name' => 'Colobane']);
        GeoNeighborhood::factory()->for($this->dakar, 'city')->create([
            'slug' => 'gueule-tapee', 'name' => 'Gueule Tapée', 'merged_into_id' => $cible->id,
        ]);

        $adresse = $this->creer(['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'neighborhood' => 'gueule tapée']);

        $this->assertSame($cible->id, $adresse->geo_neighborhood_id);
        $this->assertSame('Colobane', $adresse->neighborhood);
    }

    public function test_la_proposition_d_un_autre_est_refusee_par_identifiant(): void
    {
        $autre = User::factory()->create();
        $sienne = GeoNeighborhood::factory()->for($this->dakar, 'city')->pending($autre)->create(['slug' => 'x', 'name' => 'Cité X']);

        $this->postJson('/api/properties', [
            'title' => 'Studio', 'type' => 'apartment', 'contract_type' => 'rent', 'price' => 100_000,
            'agency_id' => $this->agency->id,
            'address' => ['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'geo_neighborhood_id' => $sienne->id],
        ])->assertUnprocessable()->assertJsonValidationErrors('address.geo_neighborhood_id');
    }

    public function test_sa_propre_proposition_est_admise_par_identifiant(): void
    {
        $mienne = GeoNeighborhood::factory()->for($this->dakar, 'city')->pending($this->agent)->create(['slug' => 'y', 'name' => 'Cité Y']);

        $adresse = $this->creer(['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'geo_neighborhood_id' => $mienne->id]);

        $this->assertSame($mienne->id, $adresse->geo_neighborhood_id);
        $this->assertSame('Cité Y', $adresse->neighborhood);
    }

    public function test_un_quartier_d_une_autre_ville_est_refuse(): void
    {
        $thies = GeoCity::factory()->create(['slug' => 'thies', 'name' => 'Thiès']);
        $ailleurs = GeoNeighborhood::factory()->for($thies, 'city')->create(['slug' => 'randoulene', 'name' => 'Randoulène']);

        $this->postJson('/api/properties', [
            'title' => 'Studio', 'type' => 'apartment', 'contract_type' => 'rent', 'price' => 100_000,
            'agency_id' => $this->agency->id,
            'address' => ['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'geo_neighborhood_id' => $ailleurs->id],
        ])->assertUnprocessable()->assertJsonValidationErrors('address.geo_neighborhood_id');
    }

    public function test_une_ville_en_texte_seul_se_rattache_et_impose_ses_noms_et_le_pays(): void
    {
        $adresse = $this->creer(['city' => 'dakar', 'region' => 'dkr', 'country' => 'FR', 'neighborhood' => 'liberté 4']);

        $this->assertSame($this->dakar->id, $adresse->geo_city_id);
        $this->assertSame('Dakar', $adresse->city);
        $this->assertSame('Dakar', $adresse->region);
        $this->assertSame('SN', $adresse->country);
        $this->assertSame($this->liberte4->id, $adresse->geo_neighborhood_id);
    }

    public function test_les_longueurs_d_adresse_sont_bornees(): void
    {
        $this->postJson('/api/properties', [
            'title' => 'Studio', 'type' => 'apartment', 'contract_type' => 'rent', 'price' => 100_000,
            'agency_id' => $this->agency->id,
            'address' => ['city' => str_repeat('a', 121), 'neighborhood' => str_repeat('b', 121)],
        ])->assertUnprocessable()->assertJsonValidationErrors(['address.city', 'address.neighborhood']);
    }
}
```

**Step 2 : lancer, constater le rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Feature/Geo/GeoNeighborhoodProposalTest.php
```

Attendu : 9 échecs — `geo_city_id` n'est ni validé ni écrit (le 201 laisse `geo_neighborhood_id`
à `null`), et les deux 422 attendus rendent 201.

**Step 3 : le résolveur de quartier**

`app/Services/Geo/GeoNeighborhoodResolver.php` :

```php
<?php

namespace App\Services\Geo;

use App\Models\Enums\GeoNeighborhoodOrigin;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 (ADR-0062 §4) — un nom de quartier saisi, rapporté au référentiel de sa ville.
 *
 * L'ordre de recherche n'est pas indifférent : un quartier ACTIF d'abord, puis un FUSIONNÉ (qui
 * renvoie à sa cible), puis un REFUSÉ (qui renvoie `null`). Sans ce dernier, un nom refusé
 * retapé le lendemain recréerait la proposition que la modération vient d'écarter.
 *
 * La comparaison écrit EXACTEMENT l'expression de l'index (`CaseInsensitive::sql`), sinon elle ne
 * l'emprunte pas (CLAUDE.md, piège n°9).
 */
final class GeoNeighborhoodResolver
{
    public function nettoyer(string $texte): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $texte));
    }

    public function trouver(GeoCity $ville, string $texte): ?GeoNeighborhood
    {
        $nom = $this->nettoyer($texte);
        if ($nom === '') {
            return null;
        }

        return GeoNeighborhood::query()
            ->where('geo_city_id', $ville->getKey())
            ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])
            ->orderByRaw("CASE WHEN merged_into_id IS NULL AND status <> 'rejected' THEN 0 WHEN merged_into_id IS NOT NULL THEN 1 ELSE 2 END")
            ->orderBy('id')
            ->first();
    }

    /**
     * Le quartier qui fait foi pour ce texte, créé en proposition s'il n'existe pas et qu'un auteur
     * est connu. `null` : texte vide, nom refusé, ou aucun auteur (un chargement en console ne
     * propose rien).
     */
    public function resoudreOuProposer(GeoCity $ville, string $texte, ?int $auteurId): ?GeoNeighborhood
    {
        $nom = $this->nettoyer($texte);
        if ($nom === '') {
            return null;
        }

        return DB::transaction(function () use ($ville, $nom, $auteurId): ?GeoNeighborhood {
            // CLAUDE.md, piège n°2 : deux propositions simultanées du même nom se sérialisent sur
            // la ligne PARENT ; verrouiller les quartiers existants ne fermerait aucune course.
            GeoCity::query()->whereKey($ville->getKey())->lockForUpdate()->first();

            $existant = $this->trouver($ville, $nom);
            if ($existant !== null) {
                return $existant->canonique();
            }

            if ($auteurId === null || mb_strlen($nom) > GeoNeighborhood::NOM_MAX) {
                return null;
            }

            return GeoNeighborhood::query()->create([
                'geo_city_id' => $ville->getKey(),
                'slug' => GeoNeighborhood::slugLibre((int) $ville->getKey(), $nom),
                'name' => $nom,
                'status' => ReferentialStatus::Pending,
                'origin' => GeoNeighborhoodOrigin::User,
                'created_by_id' => $auteurId,
            ]);
        });
    }
}
```

**Step 4 : le canoniseur**

`app/Services/Geo/GeoAddressCanonicalizer.php` :

```php
<?php

namespace App\Services\Geo;

use App\Models\Address;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Support\CaseInsensitive;

/**
 * TCK-633 (ADR-0062 §4) — ce qu'une adresse devient avant d'être écrite, appelé par le crochet
 * `saving` d'`Address`. Cinq règles, dans cet ordre :
 *
 *   1. ville en TEXTE modifiée sans identifiant fourni → rapprochée par son nom (unique, ou
 *      départagée par la région) ; l'ancien quartier référencé tombe s'il n'est pas renvoyé ;
 *   2. quartier en TEXTE modifié sans identifiant fourni → l'ancien identifiant ne tient que si
 *      le nom concorde encore ;
 *   3. quartier référencé → sa forme canonique (fusion suivie), sa ville, son nom ; refusé, ou
 *      d'une autre ville que celle fournie → il tombe ;
 *   4. ville référencée, quartier en texte seul → replié sur l'existant, ou proposé au nom de
 *      l'utilisateur connecté (`GeoNeighborhoodResolver`) ;
 *   5. ville référencée → noms officiels de la ville et de la région, pays `SN`.
 *
 * Le texte reste la vérité affichée et indexée : la règle 5 l'ALIGNE, elle ne le remplace pas.
 * Une adresse hors référentiel (ville inconnue, étranger) traverse sans changement.
 */
final class GeoAddressCanonicalizer
{
    /** @var list<string> */
    private const CHAMPS = ['city', 'region', 'neighborhood', 'geo_city_id', 'geo_neighborhood_id'];

    public function __construct(private readonly GeoNeighborhoodResolver $resolveur) {}

    public function canoniser(Address $adresse): void
    {
        if (! $adresse->isDirty(self::CHAMPS)) {
            return;
        }

        // 1.
        if ($adresse->isDirty('city') && ($adresse->geo_city_id === null || ! $adresse->isDirty('geo_city_id'))) {
            $adresse->geo_city_id = $this->villeParNom($adresse->city, $adresse->region)?->getKey();
            if (! $adresse->isDirty('geo_neighborhood_id')) {
                $adresse->geo_neighborhood_id = null;
            }
        }

        // 2.
        if ($adresse->isDirty('neighborhood') && ! $adresse->isDirty('geo_neighborhood_id') && $adresse->geo_neighborhood_id !== null) {
            $actuel = GeoNeighborhood::query()->find($adresse->geo_neighborhood_id);
            if ($actuel === null || CaseInsensitive::fold($actuel->name) !== CaseInsensitive::fold((string) $adresse->neighborhood)) {
                $adresse->geo_neighborhood_id = null;
            }
        }

        // 3.
        if ($adresse->geo_neighborhood_id !== null) {
            $quartier = GeoNeighborhood::query()->find($adresse->geo_neighborhood_id)?->canonique();
            $villeFournie = $adresse->isDirty('geo_city_id') ? $adresse->geo_city_id : null;
            if ($quartier === null || ($villeFournie !== null && (int) $villeFournie !== (int) $quartier->geo_city_id)) {
                $adresse->geo_neighborhood_id = null;
            } else {
                $adresse->geo_neighborhood_id = $quartier->getKey();
                $adresse->geo_city_id = $quartier->geo_city_id;
                $adresse->neighborhood = $quartier->name;
            }
        }

        // 4.
        if ($adresse->geo_neighborhood_id === null
            && $adresse->geo_city_id !== null
            && filled($adresse->neighborhood)
            && $adresse->isDirty(['neighborhood', 'geo_city_id'])) {
            $ville = GeoCity::query()->find($adresse->geo_city_id);
            $quartier = $ville !== null
                ? $this->resolveur->resoudreOuProposer($ville, (string) $adresse->neighborhood, auth()->id())
                : null;
            if ($quartier !== null) {
                $adresse->geo_neighborhood_id = $quartier->getKey();
                $adresse->neighborhood = $quartier->name;
            }
        }

        // 5.
        if ($adresse->geo_city_id !== null) {
            $ville = GeoCity::query()->with('region')->find($adresse->geo_city_id);
            if ($ville !== null) {
                $adresse->city = $ville->name;
                $adresse->region = $ville->region->name;
                $adresse->country = 'SN';
            }
        }
    }

    /** La ville de ce nom : unique dans le pays, sinon départagée par la région ; `null` sinon. */
    public function villeParNom(?string $ville, ?string $region): ?GeoCity
    {
        $nom = trim((string) $ville);
        if ($nom === '') {
            return null;
        }

        $candidates = GeoCity::query()
            ->with('region')
            ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])
            ->limit(10)
            ->get();

        if ($candidates->count() === 1) {
            return $candidates->first();
        }

        $nomRegion = trim((string) $region);
        if ($nomRegion === '') {
            return null;
        }

        $parRegion = $candidates->filter(
            fn (GeoCity $c) => CaseInsensitive::fold($c->region->name) === CaseInsensitive::fold($nomRegion)
        );

        return $parRegion->count() === 1 ? $parRegion->first() : null;
    }
}
```

**Step 5 : les règles de validation partagées**

`app/Services/Geo/GeoAddressRules.php` :

```php
<?php

namespace App\Services\Geo;

use App\Models\Enums\ReferentialStatus;
use App\Models\User;
use Illuminate\Validation\Rule;

/**
 * TCK-633 — les deux identifiants géographiques d'une adresse, mêmes règles à la création et à la
 * modification d'un bien. Un quartier se désigne par identifiant s'il est approuvé, ou s'il est
 * une proposition DE L'APPELANT — jamais la proposition d'un autre, qu'il ne voit pas.
 */
final class GeoAddressRules
{
    /** @return array<string, list<mixed>> */
    public static function regles(?User $user, mixed $villeId, bool $partiel): array
    {
        $base = $partiel ? ['sometimes', 'nullable'] : ['nullable'];
        $ville = is_numeric($villeId) ? (int) $villeId : null;

        return [
            'address.geo_city_id' => [...$base, 'integer', Rule::exists('geo_cities', 'id')],
            'address.geo_neighborhood_id' => [
                ...$base,
                'integer',
                Rule::exists('geo_neighborhoods', 'id')->where(function ($q) use ($user, $ville) {
                    $q->whereNull('merged_into_id');
                    if ($ville !== null) {
                        $q->where('geo_city_id', $ville);
                    }
                    $q->where(function ($q) use ($user) {
                        $q->where('status', ReferentialStatus::Approved->value);
                        if ($user !== null) {
                            $q->orWhere(fn ($q) => $q
                                ->where('status', ReferentialStatus::Pending->value)
                                ->where('created_by_id', $user->id));
                        }
                    });
                }),
            ],
        ];
    }
}
```

**Step 6 : `Address` — ⚠ HORS TERRITOIRE (n'éditer qu'après extension ; sinon porter ce diff en `collisions`)**

Edit 1 — fillable :

```
old:        'country', 'postal_code', 'latitude', 'longitude', 'metadata',
    ];
new:        'country', 'postal_code', 'latitude', 'longitude', 'metadata',
        // TCK-633 — le référentiel (ADR-0062) : canonisés par `GeoAddressCanonicalizer`.
        'geo_city_id', 'geo_neighborhood_id',
    ];
```

Edit 2 — imports :

```
old:use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\MorphTo;
new:use App\Models\Bases\AbstractModel;
use App\Services\Geo\GeoAddressCanonicalizer;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
```

Edit 3 — crochet et relations, juste après `addressable()` :

```
old:    public function addressable(): MorphTo
    {
        return $this->morphTo();
    }
new:    public function addressable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * TCK-633 (ADR-0062 §4) — toute écriture d'adresse passe par la canonisation. Elle vit ICI et
     * non dans `PropertyController` : aucune écriture ne la contourne — création, modification,
     * duplication, rattachement en console.
     */
    protected static function booted(): void
    {
        static::saving(fn (self $adresse) => app(GeoAddressCanonicalizer::class)->canoniser($adresse));
    }

    public function geoCity(): BelongsTo
    {
        return $this->belongsTo(GeoCity::class, 'geo_city_id');
    }

    public function geoNeighborhood(): BelongsTo
    {
        return $this->belongsTo(GeoNeighborhood::class, 'geo_neighborhood_id');
    }
```

**Step 7 : `StorePropertyRequest` — co-tenu (Edit seulement, blocs ancrés)**

Edit 1 — import :

```
old:use App\Rules\HoteDeVisiteVirtuelle;
use App\Services\Property\CoutDEntree;
new:use App\Rules\HoteDeVisiteVirtuelle;
use App\Services\Geo\GeoAddressRules;
use App\Services\Property\CoutDEntree;
```

Edit 2 — longueurs (L74-77) :

```
old:            'address.street' => ['nullable', 'string'],
            'address.neighborhood' => ['nullable', 'string'],
            'address.city' => ['nullable', 'string'],
            'address.region' => ['nullable', 'string'],
new:            // TCK-633 — les longueurs du formulaire (`lib/schemas/property.ts`) : sans elles, un
            // texte de 121 caractères devenait une proposition de quartier que la colonne refuse.
            'address.street' => ['nullable', 'string', 'max:255'],
            'address.neighborhood' => ['nullable', 'string', 'max:120'],
            'address.city' => ['nullable', 'string', 'max:120'],
            'address.region' => ['nullable', 'string', 'max:120'],
```

Edit 3 — identifiants, après la longitude (L81) :

```
old:            'address.longitude' => ['nullable', 'numeric'],
            // TCK-598 — la visite virtuelle : un LIEN https vers un hôte autorisé, jamais un fichier.
            'virtual_tour_url' => ['nullable',
new:            'address.longitude' => ['nullable', 'numeric'],
            // TCK-633 — la ville et le quartier du référentiel (ADR-0062).
            ...GeoAddressRules::regles($this->user(), $this->input('address.geo_city_id'), partiel: false),
            // TCK-598 — la visite virtuelle : un LIEN https vers un hôte autorisé, jamais un fichier.
            'virtual_tour_url' => ['nullable',
```

**Step 8 : `UpdatePropertyRequest` — co-tenu (Edit seulement)**

Edit 1 — import :

```
old:use App\Rules\HoteDeVisiteVirtuelle;
use App\Services\Property\CoutDEntree;
new:use App\Rules\HoteDeVisiteVirtuelle;
use App\Services\Geo\GeoAddressRules;
use App\Services\Property\CoutDEntree;
```

Edit 2 — longueurs (L68-71) :

```
old:            'address.street' => ['sometimes', 'nullable', 'string'],
            'address.neighborhood' => ['sometimes', 'nullable', 'string'],
            'address.city' => ['sometimes', 'nullable', 'string'],
            'address.region' => ['sometimes', 'nullable', 'string'],
new:            'address.street' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address.neighborhood' => ['sometimes', 'nullable', 'string', 'max:120'],
            'address.city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'address.region' => ['sometimes', 'nullable', 'string', 'max:120'],
```

Edit 3 — identifiants (L75) :

```
old:            'address.longitude' => ['sometimes', 'nullable', 'numeric'],
            // TCK-598 — la visite virtuelle
new:            'address.longitude' => ['sometimes', 'nullable', 'numeric'],
            // TCK-633 — la ville et le quartier du référentiel (ADR-0062).
            ...GeoAddressRules::regles($this->user(), $this->input('address.geo_city_id'), partiel: true),
            // TCK-598 — la visite virtuelle
```

**Step 9 : lancer, constater le vert, puis les tests voisins**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api
php artisan test tests/Feature/Geo/GeoNeighborhoodProposalTest.php
php artisan test tests/Feature/Api/Property/PropertyEntryCostAndTourTest.php
php bin/impacted-tests.php --run
```

Attendu : `9 passed` ; `PropertyEntryCostAndTourTest` vert ; `impacted-tests` vert (il joue les
classes qui touchent `Address`, `StorePropertyRequest`, `UpdatePropertyRequest`). Un rouge dans
une classe d'adresse existante (fabrique `city => 'Dakar'` sans référentiel en base) indiquerait
que la règle 1 réécrit un texte sans ville trouvée : elle ne doit RIEN écrire dans ce cas.

**Step 10 : ablations**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && mkdir -p "$S/abl/t3"
# a) sans le crochet `saving`
cp app/Models/Address.php "$S/abl/t3/Address.php"
sed -i '' '/static::saving(fn (self \$adresse) => app(GeoAddressCanonicalizer::class)->canoniser(\$adresse));/d' app/Models/Address.php
php artisan test tests/Feature/Geo/GeoNeighborhoodProposalTest.php
cp "$S/abl/t3/Address.php" app/Models/Address.php && md5 -q app/Models/Address.php "$S/abl/t3/Address.php"
# b) la proposition d'un autre admise
cp app/Services/Geo/GeoAddressRules.php "$S/abl/t3/GeoAddressRules.php"
sed -i '' "s/->where('created_by_id', \$user->id));/);/" app/Services/Geo/GeoAddressRules.php
php artisan test tests/Feature/Geo/GeoNeighborhoodProposalTest.php --filter=autre_est_refusee
cp "$S/abl/t3/GeoAddressRules.php" app/Services/Geo/GeoAddressRules.php && md5 -q app/Services/Geo/GeoAddressRules.php "$S/abl/t3/GeoAddressRules.php"
php artisan test tests/Feature/Geo/GeoNeighborhoodProposalTest.php
```

Attendu : a) 5 échecs — `inconnu_devient`, `autre_casse`, `fusionne`, `propre_proposition`,
`texte_seul` (sans crochet, l'identifiant n'est même pas écrit : `geo_neighborhood_id` reste
`null`, `neighborhood` garde la saisie brute) ; `refuse`, `autre_est_refusee`, `autre_ville` et
`longueurs` restent verts, ils ne dépendent pas du crochet ; b) 1 échec (« Failed asserting that the response status code is 422 ») ;
`md5` identiques ; dernier passage `9 passed`.

**Step 11 : Pint, signaler**

```bash
./vendor/bin/pint app/Services/Geo/GeoNeighborhoodResolver.php app/Services/Geo/GeoAddressCanonicalizer.php app/Services/Geo/GeoAddressRules.php app/Models/Address.php app/Http/Requests/Api/StorePropertyRequest.php app/Http/Requests/UpdatePropertyRequest.php tests/Feature/Geo/GeoNeighborhoodProposalTest.php
```

Signaler : ces 7 fichiers, `feat(api): adresses canonisées sur le référentiel, quartiers proposés (TCK-633)`.

---

## Tâche 4 — Le chargement du jeu : service idempotent, commande, seeder, déploiement (20 min) — ⚠ HORS TERRITOIRE (`docker/release.sh`)

**Fichiers**
- Créer : `takussan-api/app/Services/Geo/GeoReferentialLoader.php`, `GeoAddressAttacher.php`, `GeoReindexation.php`, `GeoReferentialSync.php`
- Créer : `takussan-api/app/Console/Commands/GeoSyncReferential.php`
- Créer : `takussan-api/database/seeders/System/GeoReferentialSeeder.php`
- Créer : `takussan-api/tests/fixtures/geo/v1/sn-dk.json`, `takussan-api/tests/fixtures/geo/v2/sn-dk.json`
- Modifier : `takussan-api/database/seeders/YearOfActivitySeeder.php` (import L45-46, PIPELINE L102-107) — co-tenu, Edit seulement
- Modifier : `takussan-api/docker/release.sh` (après L14) — ⚠ HORS TERRITOIRE
- Test : `takussan-api/tests/Feature/Geo/GeoReferentialSeederTest.php`

**Step 1 : les deux fixtures**

`tests/fixtures/geo/v1/sn-dk.json` :

```json
{
  "region": { "code": "SN-DK", "slug": "dakar", "name": "Dakar", "latitude": 14.7394224, "longitude": -17.3348176 },
  "source": { "osm_base": "2026-10-12T01:32:19Z", "extraite_le": "2026-10-12", "licence": "ODbL 1.0 — © les contributeurs d’OpenStreetMap", "relu_par": "fixture de test", "relu_le": "2026-10-12" },
  "cities": [
    {
      "slug": "dakar", "name": "Dakar", "latitude": 14.721548, "longitude": -17.4728141,
      "neighborhoods": [
        { "slug": "liberte-4", "name": "Liberté 4", "latitude": 14.7178, "longitude": -17.4627, "osm": null },
        { "slug": "mermoz", "name": "Mermoz", "latitude": 14.7074454, "longitude": -17.474397, "osm": "n562878265" },
        { "slug": "point-e", "name": "Point E", "latitude": 14.6964782, "longitude": -17.4641817, "osm": "n299636390" },
        { "slug": "sacre-coeur-3", "name": "Sacré-Cœur 3", "latitude": 14.720456, "longitude": -17.4674393, "osm": "w279672366" }
      ]
    },
    {
      "slug": "guediawaye", "name": "Guédiawaye", "latitude": 14.7799944, "longitude": -17.3948339,
      "neighborhoods": [
        { "slug": "golf-sud", "name": "Golf Sud", "latitude": 14.7723006, "longitude": -17.4155893, "osm": "r12982144" },
        { "slug": "sam-notaire", "name": "Sam Notaire", "latitude": 14.7845357, "longitude": -17.3962327, "osm": "r12982142" }
      ]
    }
  ]
}
```

`tests/fixtures/geo/v2/sn-dk.json` — Mermoz déplacé, Liberté 5 ajouté, Sam Notaire absent :

```json
{
  "region": { "code": "SN-DK", "slug": "dakar", "name": "Dakar", "latitude": 14.7394224, "longitude": -17.3348176 },
  "source": { "osm_base": "2026-11-01T00:00:00Z", "extraite_le": "2026-11-01", "licence": "ODbL 1.0 — © les contributeurs d’OpenStreetMap", "relu_par": "fixture de test", "relu_le": "2026-11-01" },
  "cities": [
    {
      "slug": "dakar", "name": "Dakar", "latitude": 14.721548, "longitude": -17.4728141,
      "neighborhoods": [
        { "slug": "liberte-4", "name": "Liberté 4", "latitude": 14.7178, "longitude": -17.4627, "osm": null },
        { "slug": "liberte-5", "name": "Liberté 5", "latitude": 14.7215, "longitude": -17.4625, "osm": null },
        { "slug": "mermoz", "name": "Mermoz", "latitude": 14.708, "longitude": -17.475, "osm": "n562878265" },
        { "slug": "point-e", "name": "Point E", "latitude": 14.6964782, "longitude": -17.4641817, "osm": "n299636390" },
        { "slug": "sacre-coeur-3", "name": "Sacré-Cœur 3", "latitude": 14.720456, "longitude": -17.4674393, "osm": "w279672366" }
      ]
    },
    {
      "slug": "guediawaye", "name": "Guédiawaye", "latitude": 14.7799944, "longitude": -17.3948339,
      "neighborhoods": [
        { "slug": "golf-sud", "name": "Golf Sud", "latitude": 14.7723006, "longitude": -17.4155893, "osm": "r12982144" }
      ]
    }
  ]
}
```

**Step 2 : écrire le test**

```php
<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\GeoRegion;
use App\Models\Property;
use App\Models\User;
use Database\Seeders\System\GeoReferentialSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0062 §3) — le jeu de données se recharge SANS rien détruire : idempotent, il met à
 * jour les coordonnées, ajoute ce qui manque, ne supprime jamais, ne ressuscite ni un refusé ni un
 * fusionné, respecte un renommage décidé en modération, approuve la proposition que le jeu
 * confirme — puis rattache les adresses existantes qui nomment une ville connue.
 *
 * Il passe par la COMMANDE (`geo:sync-referential`) : c'est elle que le déploiement joue, la
 * production ne lançant aucun seeder (« Écarts relevés », E-2).
 */
class GeoReferentialSeederTest extends TestCase
{
    use RefreshDatabase;

    private const V1 = __DIR__.'/../../fixtures/geo/v1';

    private const V2 = __DIR__.'/../../fixtures/geo/v2';

    private function charger(string $repertoire): void
    {
        $this->artisan('geo:sync-referential', ['--dir' => $repertoire])->assertSuccessful();
    }

    private function quartier(string $slug): GeoNeighborhood
    {
        return GeoNeighborhood::query()->where('slug', $slug)->firstOrFail();
    }

    public function test_la_commande_charge_le_jeu(): void
    {
        $this->charger(self::V1);

        $this->assertSame(1, GeoRegion::query()->count());
        $this->assertSame(2, GeoCity::query()->count());
        $this->assertSame(6, GeoNeighborhood::query()->count());
        $this->assertSame('14.7074454', $this->quartier('mermoz')->latitude);
        $this->assertSame('n562878265', $this->quartier('mermoz')->osm_ref);
    }

    public function test_un_second_chargement_ne_change_rien(): void
    {
        $this->charger(self::V1);
        $avant = GeoNeighborhood::query()->orderBy('id')->get(['id', 'slug', 'name', 'latitude'])->toArray();

        $this->charger(self::V1);

        $this->assertSame($avant, GeoNeighborhood::query()->orderBy('id')->get(['id', 'slug', 'name', 'latitude'])->toArray());
    }

    public function test_une_nouvelle_version_met_a_jour_ajoute_et_ne_supprime_rien(): void
    {
        $this->charger(self::V1);
        $mermoz = $this->quartier('mermoz')->id;

        $this->charger(self::V2);

        $this->assertSame($mermoz, $this->quartier('mermoz')->id);
        $this->assertSame('14.7080000', $this->quartier('mermoz')->latitude);
        $this->assertSame('Liberté 5', $this->quartier('liberte-5')->name);
        $this->assertSame(ReferentialStatus::Approved, $this->quartier('sam-notaire')->status);
        $this->assertSame(7, GeoNeighborhood::query()->count());
    }

    public function test_un_quartier_refuse_ou_fusionne_n_est_pas_ressuscite(): void
    {
        $this->charger(self::V1);
        $this->quartier('point-e')->forceFill(['status' => ReferentialStatus::Rejected])->save();
        $this->quartier('golf-sud')->forceFill(['merged_into_id' => $this->quartier('sam-notaire')->id])->save();

        $this->charger(self::V2);

        $this->assertSame(ReferentialStatus::Rejected, $this->quartier('point-e')->status);
        $this->assertSame($this->quartier('sam-notaire')->id, $this->quartier('golf-sud')->merged_into_id);
    }

    public function test_un_renommage_de_moderation_l_emporte_sur_le_jeu(): void
    {
        $this->charger(self::V1);
        $this->quartier('mermoz')->forceFill(['name' => 'Mermoz Pyrotechnie', 'renamed_at' => now()])->save();

        $this->charger(self::V2);

        $this->assertSame('Mermoz Pyrotechnie', $this->quartier('mermoz')->name);
        $this->assertSame('14.7080000', $this->quartier('mermoz')->latitude);
    }

    public function test_le_jeu_approuve_la_proposition_qu_il_confirme(): void
    {
        $this->charger(self::V1);
        $auteur = User::factory()->create();
        $proposition = GeoNeighborhood::factory()
            ->for(GeoCity::query()->where('slug', 'dakar')->firstOrFail(), 'city')
            ->pending($auteur)
            ->create(['slug' => 'liberte-5', 'name' => 'LIBERTÉ 5']);

        $this->charger(self::V2);

        $relue = $proposition->refresh();
        $this->assertSame(ReferentialStatus::Approved, $relue->status);
        $this->assertSame('Liberté 5', $relue->name);
        $this->assertSame(7, GeoNeighborhood::query()->count());
    }

    public function test_les_adresses_existantes_se_rattachent_aux_noms_officiels(): void
    {
        $bien = Property::factory()->create();
        $adresse = Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'dakar',
            'region' => null,
            'country' => null,
            'neighborhood' => 'POINT E',
        ]);
        $this->assertNull($adresse->refresh()->geo_city_id);

        $this->charger(self::V1);

        $relue = $adresse->refresh();
        $this->assertSame(GeoCity::query()->where('slug', 'dakar')->value('id'), $relue->geo_city_id);
        $this->assertSame($this->quartier('point-e')->id, $relue->geo_neighborhood_id);
        $this->assertSame('Dakar', $relue->city);
        $this->assertSame('Dakar', $relue->region);
        $this->assertSame('Point E', $relue->neighborhood);
        $this->assertSame('SN', $relue->country);
    }

    public function test_une_ville_ambigue_ne_se_rattache_que_par_sa_region(): void
    {
        $this->charger(self::V1);
        $autreRegion = GeoRegion::factory()->create(['code' => 'SN-TH', 'slug' => 'thies', 'name' => 'Thiès']);
        GeoCity::factory()->for($autreRegion, 'region')->create(['slug' => 'guediawaye', 'name' => 'Guédiawaye']);
        $bien = Property::factory()->create();
        $sansRegion = Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => $bien->id,
            'city' => 'Guédiawaye', 'region' => null, 'neighborhood' => null,
        ]);
        $avecRegion = Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => Property::factory()->create()->id,
            'city' => 'Guédiawaye', 'region' => 'dakar', 'neighborhood' => null,
        ]);

        $this->charger(self::V1);

        $this->assertNull($sansRegion->refresh()->geo_city_id);
        $this->assertSame(
            GeoCity::query()->whereHas('region', fn ($q) => $q->where('code', 'SN-DK'))->where('slug', 'guediawaye')->value('id'),
            $avecRegion->refresh()->geo_city_id,
        );
    }

    public function test_un_repertoire_vide_echoue_bruyamment(): void
    {
        $vide = sys_get_temp_dir().'/geo-vide-'.uniqid();
        mkdir($vide);

        $this->artisan('geo:sync-referential', ['--dir' => $vide])->assertFailed();

        rmdir($vide);
    }

    public function test_le_seeder_charge_les_quatorze_regions_versionnees(): void
    {
        $this->seed(GeoReferentialSeeder::class);

        $this->assertSame(14, GeoRegion::query()->count());
        $this->assertGreaterThan(14, GeoCity::query()->count());
    }
}
```

**Step 3 : lancer, constater le rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Feature/Geo/GeoReferentialSeederTest.php
```

Attendu : 10 échecs (`The command "geo:sync-referential" does not exist.` ;
`Class "Database\Seeders\System\GeoReferentialSeeder" not found`).

**Step 4 : le chargeur**

`app/Services/Geo/GeoReferentialLoader.php` :

```php
<?php

namespace App\Services\Geo;

use App\Models\Enums\GeoNeighborhoodOrigin;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\GeoRegion;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * TCK-633 (ADR-0062 §3) — charge `database/data/geo/regions/*.json` en base, autant de fois
 * qu'on veut.
 *
 * Une ligne se retrouve par son SLUG, puis par son NOM replié (le slug de PHP et celui du script
 * divergent sur une apostrophe : `Str::slug("Patte d'Oie")` rend `patte-doie`, le script
 * `patte-d-oie` — « Écarts relevés », E-18). Ce qui existe déjà :
 *   · reçoit les coordonnées et la référence OSM du jeu ;
 *   · garde son NOM s'il a été renommé en modération (`renamed_at`) ;
 *   · est APPROUVÉ s'il était une proposition (le jeu la confirme) ;
 *   · est IGNORÉ s'il est refusé ou fusionné — la décision humaine tient.
 * Rien n'est jamais supprimé : une ligne absente d'une extraction peut porter des adresses.
 */
final class GeoReferentialLoader
{
    /** @return array{regions: int, villes: int, quartiers_crees: int, quartiers_mis_a_jour: int, quartiers_ignores: int} */
    public function charger(string $repertoire): array
    {
        $fichiers = glob(rtrim($repertoire, '/').'/*.json') ?: [];
        sort($fichiers);
        if ($fichiers === []) {
            throw new RuntimeException("Aucun fichier de référentiel dans {$repertoire}.");
        }

        $bilan = ['regions' => 0, 'villes' => 0, 'quartiers_crees' => 0, 'quartiers_mis_a_jour' => 0, 'quartiers_ignores' => 0];
        foreach ($fichiers as $fichier) {
            /** @var array{region: array<string, mixed>, cities: list<array<string, mixed>>} $donnees */
            $donnees = json_decode((string) file_get_contents($fichier), true, flags: JSON_THROW_ON_ERROR);
            DB::transaction(function () use ($donnees, &$bilan) {
                $this->chargerRegion($donnees, $bilan);
            });
        }

        return $bilan;
    }

    /**
     * @param  array{region: array<string, mixed>, cities: list<array<string, mixed>>}  $donnees
     * @param  array<string, int>  $bilan
     */
    private function chargerRegion(array $donnees, array &$bilan): void
    {
        $r = $donnees['region'];
        $region = GeoRegion::query()->updateOrCreate(
            ['code' => $r['code']],
            ['slug' => $r['slug'], 'name' => $r['name'], 'latitude' => $r['latitude'] ?? null, 'longitude' => $r['longitude'] ?? null],
        );
        $bilan['regions']++;

        foreach ($donnees['cities'] as $v) {
            $ville = $this->ville($region, $v);
            $bilan['villes']++;
            foreach ($v['neighborhoods'] as $q) {
                $this->quartier($ville, $q, $bilan);
            }
        }
    }

    /** @param  array<string, mixed>  $v */
    private function ville(GeoRegion $region, array $v): GeoCity
    {
        $ville = GeoCity::query()->where('geo_region_id', $region->getKey())->where('slug', $v['slug'])->first()
            ?? GeoCity::query()->where('geo_region_id', $region->getKey())
                ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($v['name'])])
                ->first()
            ?? new GeoCity(['geo_region_id' => $region->getKey(), 'slug' => $v['slug']]);

        $ville->fill(['name' => $v['name'], 'latitude' => $v['latitude'] ?? null, 'longitude' => $v['longitude'] ?? null]);
        if (! $ville->exists || $ville->isDirty()) {
            $ville->save();
        }

        return $ville;
    }

    /**
     * @param  array<string, mixed>  $q
     * @param  array<string, int>  $bilan
     */
    private function quartier(GeoCity $ville, array $q, array &$bilan): void
    {
        $existant = GeoNeighborhood::query()->where('geo_city_id', $ville->getKey())->where('slug', $q['slug'])->first()
            ?? GeoNeighborhood::query()->where('geo_city_id', $ville->getKey())
                ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($q['name'])])
                ->orderByRaw("CASE WHEN merged_into_id IS NULL AND status <> 'rejected' THEN 0 ELSE 1 END")
                ->first();

        if ($existant === null) {
            GeoNeighborhood::query()->create([
                'geo_city_id' => $ville->getKey(),
                'slug' => $q['slug'],
                'name' => $q['name'],
                'latitude' => $q['latitude'] ?? null,
                'longitude' => $q['longitude'] ?? null,
                'osm_ref' => $q['osm'] ?? null,
                'status' => ReferentialStatus::Approved,
                'origin' => GeoNeighborhoodOrigin::Dataset,
            ]);
            $bilan['quartiers_crees']++;

            return;
        }

        if ($existant->status === ReferentialStatus::Rejected || $existant->merged_into_id !== null) {
            $bilan['quartiers_ignores']++;

            return;
        }

        $champs = [
            'latitude' => $q['latitude'] ?? $existant->latitude,
            'longitude' => $q['longitude'] ?? $existant->longitude,
            'osm_ref' => $q['osm'] ?? $existant->osm_ref,
            'status' => ReferentialStatus::Approved,
        ];
        if ($existant->renamed_at === null) {
            $champs['name'] = $q['name'];
        }
        $existant->fill($champs);
        if ($existant->isDirty()) {
            $existant->save();
            $bilan['quartiers_mis_a_jour']++;
        }
    }
}
```

**Step 5 : rattachement, réindexation, orchestration**

`app/Services/Geo/GeoReindexation.php` :

```php
<?php

namespace App\Services\Geo;

use App\Models\Property;
use Illuminate\Database\Eloquent\Collection;
use Laravel\Scout\ModelObserver;

/**
 * TCK-633 — réindexe les biens dont une adresse ou un équipement vient de changer de NOM.
 *
 * La recherche indexe des textes (`Property::toSearchableArray()` : `city`, `neighborhood`, noms
 * des tags) : renommer, fusionner ou rattacher sans réindexer laisserait l'ancien nom trouvable
 * et le nouveau introuvable.
 *
 * Elle suit la synchronisation des modèles : coupée (suite de tests hors recherche, `db:seed` sous
 * `SCOUT_DRIVER=null`), elle ne fait rien — c'est l'importation qui suivra qui indexera.
 */
final class GeoReindexation
{
    /** @param  list<int>  $ids */
    public function biens(array $ids): void
    {
        if ($ids === [] || ModelObserver::syncingDisabledFor(Property::class)) {
            return;
        }

        Property::query()->whereKey(array_values(array_unique($ids)))->chunkById(200, function (Collection $biens) {
            $biens->filter->shouldBeSearchable()->searchable();
        });
    }
}
```

`app/Services/Geo/GeoAddressAttacher.php` :

```php
<?php

namespace App\Services\Geo;

use App\Models\Address;
use App\Models\Property;
use Illuminate\Database\Eloquent\Collection;

/**
 * TCK-633 (ADR-0062 §3) — rattache au référentiel les adresses écrites AVANT lui : celles qui
 * nomment une ville connue, au Sénégal ou sans pays. L'écriture passe par `save()` : c'est le
 * crochet d'`Address` qui pose les noms officiels et retrouve le quartier — sans auteur connu, il
 * ne propose rien.
 */
final class GeoAddressAttacher
{
    public function __construct(private readonly GeoAddressCanonicalizer $canoniseur) {}

    /** @return list<int> les biens dont l'adresse a changé */
    public function rattacher(): array
    {
        $biens = [];

        Address::query()
            ->whereNull('geo_city_id')
            ->whereNotNull('city')
            ->where(fn ($q) => $q->whereNull('country')->orWhere('country', 'SN'))
            ->chunkById(200, function (Collection $adresses) use (&$biens) {
                foreach ($adresses as $adresse) {
                    $ville = $this->canoniseur->villeParNom($adresse->city, $adresse->region);
                    if ($ville === null) {
                        continue;
                    }
                    $adresse->geo_city_id = $ville->getKey();
                    $adresse->save();
                    if ($adresse->addressable_type === Property::class) {
                        $biens[] = (int) $adresse->addressable_id;
                    }
                }
            });

        return $biens;
    }
}
```

`app/Services/Geo/GeoReferentialSync.php` :

```php
<?php

namespace App\Services\Geo;

/** TCK-633 — charger, rattacher, réindexer : ce que jouent la commande et le seeder. */
final class GeoReferentialSync
{
    public function __construct(
        private readonly GeoReferentialLoader $chargeur,
        private readonly GeoAddressAttacher $rattacheur,
        private readonly GeoReindexation $reindexation,
    ) {}

    public static function repertoireParDefaut(): string
    {
        return database_path('data/geo/regions');
    }

    /** @return array<string, int> */
    public function executer(string $repertoire): array
    {
        $bilan = $this->chargeur->charger($repertoire);
        $biens = $this->rattacheur->rattacher();
        $this->reindexation->biens($biens);

        return $bilan + ['biens_rattaches' => count(array_unique($biens))];
    }
}
```

**Step 6 : la commande et le seeder**

`app/Console/Commands/GeoSyncReferential.php` :

```php
<?php

namespace App\Console\Commands;

use App\Services\Geo\GeoReferentialSync;
use Illuminate\Console\Command;
use RuntimeException;

/**
 * TCK-633 (ADR-0062 §3) — charge le référentiel géographique versionné. Idempotente : jouée à
 * chaque déploiement par `docker/release.sh`, parce que la production ne lance AUCUN seeder
 * (« Écarts relevés », E-2).
 */
class GeoSyncReferential extends Command
{
    protected $signature = 'geo:sync-referential {--dir= : répertoire des fichiers de région (défaut : database/data/geo/regions)}';

    protected $description = 'Charge le référentiel géographique versionné et rattache les adresses existantes (idempotent).';

    public function handle(GeoReferentialSync $sync): int
    {
        $repertoire = (string) ($this->option('dir') ?: GeoReferentialSync::repertoireParDefaut());

        try {
            $bilan = $sync->executer($repertoire);
        } catch (RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        foreach ($bilan as $cle => $valeur) {
            $this->line("{$cle} : {$valeur}");
        }

        return self::SUCCESS;
    }
}
```

`database/seeders/System/GeoReferentialSeeder.php` :

```php
<?php

namespace Database\Seeders\System;

use App\Services\Geo\GeoReferentialSync;
use Illuminate\Database\Seeder;

/** TCK-633 — le référentiel géographique en développement : la même chose que `geo:sync-referential`. */
class GeoReferentialSeeder extends Seeder
{
    public function run(GeoReferentialSync $sync): void
    {
        $sync->executer(GeoReferentialSync::repertoireParDefaut());
    }
}
```

**Step 7 : le pipeline de développement — co-tenu, Edit seulement**

`database/seeders/YearOfActivitySeeder.php`, Edit 1 :

```
old:use Database\Seeders\System\AgencyUpgradeRequestSeeder;
use Database\Seeders\System\SettingsSeeder;
new:use Database\Seeders\System\AgencyUpgradeRequestSeeder;
use Database\Seeders\System\GeoReferentialSeeder;
use Database\Seeders\System\SettingsSeeder;
```

Edit 2 — APRÈS les seeders qui écrivent des adresses, AVANT les médias :

```
old:        EdgeCaseSeeder::class,
        // PropertyMediaSeeder runs last
new:        EdgeCaseSeeder::class,
        // TCK-633 — après TOUS les seeders qui écrivent des adresses : il les rattache au
        // référentiel (noms officiels, quartier retrouvé). Avant eux, il n'aurait rien à rattacher.
        GeoReferentialSeeder::class,
        // PropertyMediaSeeder runs last
```

**Step 8 : le déploiement — ⚠ HORS TERRITOIRE (`docker/release.sh`)**

Edit — après la réconciliation des rôles (L12-14), avant le bloc `if [ "${SCOUT_DRIVER:-}" = …` :

```
old:  || echo "AVERTISSEMENT : membership:reconcile-system-roles a échoué — les rôles système retardent sur le catalogue jusqu'au prochain déploiement." >&2

new:  || echo "AVERTISSEMENT : membership:reconcile-system-roles a échoué — les rôles système retardent sur le catalogue jusqu'au prochain déploiement." >&2

# TCK-633 — les référentiels versionnés (ADR-0062, ADR-0061 §9). La production ne lance AUCUN
# seeder : sans ces lignes, la liste des quartiers et celle des équipements resteraient vides.
# Idempotentes ; SCOUT_QUEUE=false pour que la réindexation des biens rattachés se fasse avec le
# code de CETTE image, pas avec l'ancien worker. Un échec n'arrête pas le déploiement : la
# version précédente du référentiel reste en place.
SCOUT_QUEUE=false php artisan geo:sync-referential \
  || echo "AVERTISSEMENT : geo:sync-referential a échoué — référentiel géographique inchangé jusqu'au prochain déploiement." >&2

```

(La ligne `tags:sync-catalog` s'ajoute au même endroit en tâche 10.)

**Step 9 : lancer, constater le vert, et le harnais de `release.sh`**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Feature/Geo/GeoReferentialSeederTest.php
cd /Users/aminethiam/Documents/perso/takussan && sh scripts/test-release-reindex.sh
```

Attendu : `10 passed` (si la tâche 2 n'est pas finie, `le_seeder_charge_les_quatorze_regions`
échoue sur le compte : la finir d'abord) ; puis
`✓ décision de réindexation de release.sh : 10 vérifications et une ablation` (le talon `php`
du harnais accepte toute commande ; « SCOUT_DRIVER=collection : aucun appel scout » reste vrai :
`geo:sync-referential` ne contient pas le mot `scout`).

**Step 10 : ablations**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && mkdir -p "$S/abl/t4"
F=app/Services/Geo/GeoReferentialLoader.php
cp $F "$S/abl/t4/loader.php"
# a) le refusé ressuscite
sed -i '' 's/if (\$existant->status === ReferentialStatus::Rejected || \$existant->merged_into_id !== null) {/if (false) {/' $F
php artisan test tests/Feature/Geo/GeoReferentialSeederTest.php --filter=ressuscite
cp "$S/abl/t4/loader.php" $F && md5 -q $F "$S/abl/t4/loader.php"
# b) le renommage écrasé
sed -i '' 's/if (\$existant->renamed_at === null) {/if (true) {/' $F
php artisan test tests/Feature/Geo/GeoReferentialSeederTest.php --filter=renommage
cp "$S/abl/t4/loader.php" $F && md5 -q $F "$S/abl/t4/loader.php"
# c) sans rattachement
F2=app/Services/Geo/GeoReferentialSync.php
cp $F2 "$S/abl/t4/sync.php"
sed -i '' 's/\$biens = \$this->rattacheur->rattacher();/$biens = [];/' $F2
php artisan test tests/Feature/Geo/GeoReferentialSeederTest.php --filter=rattach
cp "$S/abl/t4/sync.php" $F2 && md5 -q $F2 "$S/abl/t4/sync.php"
php artisan test tests/Feature/Geo/GeoReferentialSeederTest.php
```

Attendu : a) 1 échec (`Failed asserting that two variables reference the same object` sur
`ReferentialStatus::Rejected`) ; b) 1 échec (`'Mermoz Pyrotechnie'` contre `'Mermoz'`) ; c)
1 échec (`adresses_existantes` ; `ville_ambigue` reste vert, l'adresse « avec région » se
rattachant dès sa création par le crochet de la tâche 3) ; chaque paire de `md5` identique ; dernier
passage `10 passed`.

**Step 11 : Pint, signaler**

```bash
./vendor/bin/pint app/Services/Geo/GeoReferentialLoader.php app/Services/Geo/GeoAddressAttacher.php app/Services/Geo/GeoReindexation.php app/Services/Geo/GeoReferentialSync.php app/Console/Commands/GeoSyncReferential.php database/seeders/System/GeoReferentialSeeder.php database/seeders/YearOfActivitySeeder.php tests/Feature/Geo/GeoReferentialSeederTest.php
node /Users/aminethiam/Documents/perso/takussan/scripts/check-command-prefixes.mjs
```

Attendu : la garde des préfixes verte (`geo:sync-referential` est `domaine:verbe-kebab`).
Signaler : ces 8 fichiers, les deux fixtures, `docker/release.sh` (si le territoire a été
étendu), `feat(api): chargement idempotent du référentiel géographique, au seed et au déploiement (TCK-633)`.

---

## Tâche 5 — Les points d'accès publics du référentiel (15 min)

Interface promise au lot E (plan maître, « Interfaces D → E ») :

| Route | Réponse |
|---|---|
| `GET /api/public/geo/regions` | `{data:[{id,name,slug}]}` |
| `GET /api/public/geo/cities?region={id}&q=` | `{data:[{id,region_id,name,slug,latitude,longitude}]}` — sans `region`, toutes |
| `GET /api/public/geo/cities/{id}` | `{data:{id,region_id,name,slug,latitude,longitude}}` |
| `GET /api/public/geo/neighborhoods?city={id}&q=` | `{data:[{id,city_id,name,slug,latitude,longitude,status}]}` — approuvés, plus les propositions de l'appelant authentifié |

`q` filtre par nom (casse repliée par ICU, accents non repliés). Paramètres en clair et non
`filter[…]` : listes non paginées à forme fixe (« Écarts relevés », E-14). Tri par nom en
collation ICU (`Dakar` avant `dakar-bis`, `Médina` entre `Mbao` et `Mermoz`).

**Fichiers**
- Créer : `takussan-api/app/Http/Controllers/Public/GeoReferentialController.php`
- Créer : `takussan-api/app/Http/Requests/Geo/GeoCitiesRequest.php`, `GeoNeighborhoodsRequest.php`
- Créer : `takussan-api/routes/api/geo.php`
- Test : `takussan-api/tests/Feature/Geo/GeoPublicEndpointsTest.php`

**Step 1 : écrire le test**

```php
<?php

namespace Tests\Feature\Geo;

use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\GeoRegion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-633 — les listes du référentiel, lues sans compte par le formulaire et par la recherche
 * (lot E). Une proposition de quartier n'apparaît qu'à son auteur ; un refusé et un fusionné, à
 * personne.
 */
class GeoPublicEndpointsTest extends TestCase
{
    use RefreshDatabase;

    private GeoRegion $dakar;

    private GeoCity $ville;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dakar = GeoRegion::factory()->create(['code' => 'SN-DK', 'slug' => 'dakar', 'name' => 'Dakar']);
        GeoRegion::factory()->create(['code' => 'SN-TH', 'slug' => 'thies', 'name' => 'Thiès']);
        $this->ville = GeoCity::factory()->for($this->dakar, 'region')->create(['slug' => 'dakar', 'name' => 'Dakar', 'latitude' => 14.721548, 'longitude' => -17.4728141]);
        GeoCity::factory()->for($this->dakar, 'region')->create(['slug' => 'guediawaye', 'name' => 'Guédiawaye']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['slug' => 'mermoz', 'name' => 'Mermoz']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['slug' => 'liberte-4', 'name' => 'Liberté 4']);
    }

    public function test_les_regions_triees_par_nom(): void
    {
        $this->getJson('/api/public/geo/regions')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Dakar')
            ->assertJsonPath('data.1.name', 'Thiès')
            ->assertJsonStructure(['data' => [['id', 'name', 'slug']]]);
    }

    public function test_les_villes_d_une_region_et_leur_centre(): void
    {
        $this->getJson("/api/public/geo/cities?region={$this->dakar->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Dakar')
            ->assertJsonPath('data.0.region_id', $this->dakar->id)
            ->assertJsonPath('data.0.latitude', 14.721548)
            ->assertJsonPath('data.1.name', 'Guédiawaye');
    }

    public function test_une_ville_seule_donne_sa_region(): void
    {
        $this->getJson("/api/public/geo/cities/{$this->ville->id}")
            ->assertOk()
            ->assertJsonPath('data.region_id', $this->dakar->id)
            ->assertJsonPath('data.slug', 'dakar');
    }

    public function test_les_quartiers_exigent_leur_ville(): void
    {
        $this->getJson('/api/public/geo/neighborhoods')->assertUnprocessable()->assertJsonValidationErrors('city');
    }

    public function test_un_anonyme_ne_voit_que_les_quartiers_approuves(): void
    {
        $auteur = User::factory()->create();
        GeoNeighborhood::factory()->for($this->ville, 'city')->pending($auteur)->create(['slug' => 'cite-x', 'name' => 'Cité X']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->rejected()->create(['slug' => 'fass', 'name' => 'Fass']);

        $noms = collect($this->getJson("/api/public/geo/neighborhoods?city={$this->ville->id}")->assertOk()->json('data'))->pluck('name')->all();

        $this->assertSame(['Liberté 4', 'Mermoz'], $noms);
    }

    public function test_l_auteur_voit_sa_proposition_et_pas_celle_des_autres(): void
    {
        $moi = User::factory()->create();
        $autre = User::factory()->create();
        GeoNeighborhood::factory()->for($this->ville, 'city')->pending($moi)->create(['slug' => 'cite-moi', 'name' => 'Cité Moi']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->pending($autre)->create(['slug' => 'cite-autre', 'name' => 'Cité Autre']);
        Sanctum::actingAs($moi);

        $reponse = $this->getJson("/api/public/geo/neighborhoods?city={$this->ville->id}")->assertOk();

        $this->assertSame(['Cité Moi', 'Liberté 4', 'Mermoz'], collect($reponse->json('data'))->pluck('name')->all());
        $this->assertSame('pending', collect($reponse->json('data'))->firstWhere('name', 'Cité Moi')['status']);
    }

    public function test_un_quartier_fusionne_disparait_de_la_liste(): void
    {
        $cible = GeoNeighborhood::query()->where('slug', 'mermoz')->firstOrFail();
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['slug' => 'mermoz-bis', 'name' => 'Mermoz Bis', 'merged_into_id' => $cible->id]);

        $noms = collect($this->getJson("/api/public/geo/neighborhoods?city={$this->ville->id}")->json('data'))->pluck('name')->all();

        $this->assertNotContains('Mermoz Bis', $noms);
    }

    public function test_q_filtre_par_nom_sans_tenir_compte_de_la_casse(): void
    {
        $this->getJson("/api/public/geo/neighborhoods?city={$this->ville->id}&q=LIBERTÉ")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Liberté 4');
        $this->getJson('/api/public/geo/cities?q=guéd')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }
}
```

**Step 2 : rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Feature/Geo/GeoPublicEndpointsTest.php
```

Attendu : 8 échecs (`404` — aucune route).

**Step 3 : les deux FormRequests**

`app/Http/Requests/Geo/GeoCitiesRequest.php` :

```php
<?php

namespace App\Http\Requests\Geo;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 — `GET /api/public/geo/cities` : lecture publique. */
class GeoCitiesRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'region' => ['sometimes', 'nullable', 'integer'],
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
        ];
    }
}
```

`app/Http/Requests/Geo/GeoNeighborhoodsRequest.php` :

```php
<?php

namespace App\Http\Requests\Geo;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 — `GET /api/public/geo/neighborhoods` : la ville est obligatoire (une liste par ville). */
class GeoNeighborhoodsRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'city' => ['required', 'integer'],
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
        ];
    }
}
```

**Step 4 : le contrôleur**

`app/Http/Controllers/Public/GeoReferentialController.php` :

```php
<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Geo\GeoCitiesRequest;
use App\Http\Requests\Geo\GeoNeighborhoodsRequest;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\GeoRegion;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

/**
 * TCK-633 (ADR-0062) — les listes du référentiel géographique, publiques.
 *
 * ⚠ Aucun `cache.headers` : la liste des quartiers VARIE avec l'appelant (ses propositions), et
 * un cache partagé la servirait à un autre (cf. `CataloguePublicCacheTest`). L'appelant se lit par
 * `user('sanctum')` : la route n'exige pas de compte.
 */
class GeoReferentialController extends Controller
{
    private const TRI = 'name COLLATE "und-x-icu"';

    public function regions(): JsonResponse
    {
        $regions = GeoRegion::query()->orderByRaw(self::TRI)->get();

        return $this->json(['data' => $regions->map(fn (GeoRegion $r) => [
            'id' => $r->id,
            'name' => $r->name,
            'slug' => $r->slug,
        ])->values()]);
    }

    public function cities(GeoCitiesRequest $request): JsonResponse
    {
        $villes = GeoCity::query()
            ->when($request->validated('region') !== null, fn (Builder $q) => $q->where('geo_region_id', (int) $request->validated('region')))
            ->when(filled($request->validated('q')), fn (Builder $q) => $this->parNom($q, (string) $request->validated('q')))
            ->orderByRaw(self::TRI)
            ->get();

        return $this->json(['data' => $villes->map(fn (GeoCity $v) => $this->ville($v))->values()]);
    }

    public function city(GeoCity $city): JsonResponse
    {
        return $this->json(['data' => $this->ville($city)]);
    }

    public function neighborhoods(GeoNeighborhoodsRequest $request): JsonResponse
    {
        $quartiers = GeoNeighborhood::query()
            ->where('geo_city_id', (int) $request->validated('city'))
            ->visiblesPour($request->user('sanctum'))
            ->when(filled($request->validated('q')), fn (Builder $q) => $this->parNom($q, (string) $request->validated('q')))
            ->orderByRaw(self::TRI)
            ->get();

        return $this->json(['data' => $quartiers->map(fn (GeoNeighborhood $q) => [
            'id' => $q->id,
            'city_id' => $q->geo_city_id,
            'name' => $q->name,
            'slug' => $q->slug,
            'latitude' => $q->latitude !== null ? (float) $q->latitude : null,
            'longitude' => $q->longitude !== null ? (float) $q->longitude : null,
            'status' => $q->status->value,
        ])->values()]);
    }

    /** @return array<string, mixed> */
    private function ville(GeoCity $v): array
    {
        return [
            'id' => $v->id,
            'region_id' => $v->geo_region_id,
            'name' => $v->name,
            'slug' => $v->slug,
            'latitude' => $v->latitude !== null ? (float) $v->latitude : null,
            'longitude' => $v->longitude !== null ? (float) $v->longitude : null,
        ];
    }

    private function parNom(Builder $q, string $texte): Builder
    {
        $motif = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], CaseInsensitive::fold(trim($texte))).'%';

        return $q->whereRaw(CaseInsensitive::sql('name').' LIKE ?', [$motif]);
    }
}
```

**Step 5 : les routes**

`routes/api/geo.php` (chargé par le `glob` de `routes/api.php`, L10) :

```php
<?php

use App\Http\Controllers\Public\GeoReferentialController;
use Illuminate\Support\Facades\Route;

/*
| TCK-633 (ADR-0062) — le référentiel géographique. Fichier propre au lot D : `routes/api/public.php`
| est tenu par un autre lot. Même groupe que les lectures publiques : préfixe `public`, nom
| `public.`, limiteur `public-read`.
*/
Route::prefix('public/geo')->name('public.geo.')->middleware('throttle:public-read')->group(function () {
    Route::get('regions', [GeoReferentialController::class, 'regions'])->name('regions');
    Route::get('cities', [GeoReferentialController::class, 'cities'])->name('cities');
    Route::get('cities/{city}', [GeoReferentialController::class, 'city'])->whereNumber('city')->name('cities.show');
    Route::get('neighborhoods', [GeoReferentialController::class, 'neighborhoods'])->name('neighborhoods');
});
```

**Step 6 : vert**

```bash
php artisan test tests/Feature/Geo/GeoPublicEndpointsTest.php
```

Attendu : `8 passed`.

**Step 7 : ablation — la visibilité**

```bash
mkdir -p "$S/abl/t5" && F=app/Http/Controllers/Public/GeoReferentialController.php && cp $F "$S/abl/t5/c.php"
sed -i '' "s/->visiblesPour(\$request->user('sanctum'))/->whereNull('merged_into_id')/" $F
php artisan test tests/Feature/Geo/GeoPublicEndpointsTest.php
cp "$S/abl/t5/c.php" $F && md5 -q $F "$S/abl/t5/c.php" && php artisan test tests/Feature/Geo/GeoPublicEndpointsTest.php
```

Attendu : 2 échecs (`un_anonyme…` voit `Cité X` et `Fass` ; `l_auteur_voit…` voit
`Cité Autre`) ; `md5` identiques ; `8 passed`.

**Step 8 : Pint, gardes, signaler**

```bash
./vendor/bin/pint app/Http/Controllers/Public/GeoReferentialController.php app/Http/Requests/Geo routes/api/geo.php tests/Feature/Geo/GeoPublicEndpointsTest.php
cd /Users/aminethiam/Documents/perso/takussan && node scripts/check-inline-validation.mjs && node scripts/check-controller-authorization.mjs
```

Attendu : les deux gardes vertes. Signaler : ces 5 fichiers,
`feat(api): listes publiques du référentiel géographique (TCK-633)`.

---

## Tâche 6 — La modération des quartiers proposés (20 min)

**Fichiers**
- Créer : `takussan-api/app/Services/Geo/GeoNeighborhoodModeration.php`
- Créer : `takussan-api/app/Http/Controllers/Api/Admin/GeoNeighborhoodAdminController.php`
- Créer : `takussan-api/app/Http/Requests/Admin/GeoRenameRequest.php`, `GeoMergeRequest.php`
- Modifier : `takussan-api/routes/api/geo.php` (territoire D)
- Modifier : `takussan-api/lang/{fr,en,wo}/errors.php` — co-tenu, Edit avant `    'guarantor' => [` (fr L159)
- Tests : `takussan-api/tests/Feature/Geo/GeoNeighborhoodModerationTest.php`, `GeoNeighborhoodMergeSearchTest.php`

**Step 1 : écrire les tests**

`tests/Feature/Geo/GeoNeighborhoodModerationTest.php` :

```php
<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (AC5) — la file des quartiers proposés : approuver, refuser, renommer, fusionner. Un
 * refus détache les adresses sans effacer leur texte ; un renommage et une fusion RÉÉCRIVENT le
 * texte des adresses, parce que c'est lui qu'affichent les fiches et qu'indexe la recherche.
 */
class GeoNeighborhoodModerationTest extends TestCase
{
    use RefreshDatabase;

    private GeoCity $ville;

    private User $auteur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ville = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $this->auteur = User::factory()->create();
    }

    private function proposition(string $nom, string $slug): GeoNeighborhood
    {
        return GeoNeighborhood::factory()->for($this->ville, 'city')->pending($this->auteur)->create(['name' => $nom, 'slug' => $slug]);
    }

    private function adresseSur(GeoNeighborhood $quartier): Address
    {
        return Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => Property::factory()->create()->id,
            'geo_city_id' => $this->ville->id,
            'geo_neighborhood_id' => $quartier->id,
            'city' => 'Dakar',
            'neighborhood' => $quartier->name,
        ]);
    }

    public function test_un_agent_n_entre_pas_dans_la_file(): void
    {
        $this->actingAsRole('agent');
        $q = $this->proposition('Cité X', 'cite-x');

        $this->getJson('/api/admin/geo/neighborhoods')->assertForbidden();
        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/approve")->assertForbidden();
    }

    public function test_la_file_liste_les_propositions_avec_leur_auteur_et_leur_usage(): void
    {
        $this->actingAsRole('super_admin');
        $q = $this->proposition('Cité X', 'cite-x');
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Mermoz', 'slug' => 'mermoz']);
        $this->adresseSur($q);

        $this->getJson('/api/admin/geo/neighborhoods?filter[status]=pending')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Cité X')
            ->assertJsonPath('data.0.city.name', 'Dakar')
            ->assertJsonPath('data.0.created_by.id', $this->auteur->id)
            ->assertJsonPath('data.0.addresses_count', 1)
            ->assertJsonPath('meta.total', 1);
    }

    public function test_approuver_puis_reapprouver(): void
    {
        $this->actingAsRole('super_admin');
        $q = $this->proposition('Cité X', 'cite-x');

        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/approve")->assertStatus(409)->assertJsonPath('code', 'geo.neighborhood_not_pending');
    }

    public function test_refuser_detache_les_adresses_et_garde_leur_texte(): void
    {
        $this->actingAsRole('super_admin');
        $q = $this->proposition('Cité X', 'cite-x');
        $adresse = $this->adresseSur($q);

        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/reject")->assertOk()->assertJsonPath('data.status', 'rejected');

        $relue = $adresse->refresh();
        $this->assertNull($relue->geo_neighborhood_id);
        $this->assertSame('Cité X', $relue->neighborhood);
    }

    public function test_renommer_reecrit_les_adresses_et_se_marque(): void
    {
        $this->actingAsRole('super_admin');
        $q = $this->proposition('Cite x', 'cite-x');
        $adresse = $this->adresseSur($q);

        $this->patchJson("/api/admin/geo/neighborhoods/{$q->id}", ['name' => 'Cité X'])->assertOk()->assertJsonPath('data.name', 'Cité X');

        $this->assertNotNull($q->refresh()->renamed_at);
        $this->assertSame('Cité X', $adresse->refresh()->neighborhood);
        $this->assertSame($q->id, $adresse->geo_neighborhood_id);
    }

    public function test_renommer_vers_un_nom_pris_est_refuse(): void
    {
        $this->actingAsRole('super_admin');
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Mermoz', 'slug' => 'mermoz']);
        $q = $this->proposition('Mermos', 'mermos');

        $this->patchJson("/api/admin/geo/neighborhoods/{$q->id}", ['name' => 'MERMOZ'])->assertStatus(409)->assertJsonPath('code', 'geo.name_taken');
    }

    public function test_fusionner_deplace_les_adresses_vers_la_cible(): void
    {
        $this->actingAsRole('super_admin');
        $cible = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Liberté 4', 'slug' => 'liberte-4']);
        $source = $this->proposition('Liberte Quatre', 'liberte-quatre');
        $ancienne = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Lib 4', 'slug' => 'lib-4', 'merged_into_id' => $source->id]);
        $adresse = $this->adresseSur($source);

        $this->postJson("/api/admin/geo/neighborhoods/{$source->id}/merge", ['into_id' => $cible->id])->assertOk();

        $this->assertSame($cible->id, $source->refresh()->merged_into_id);
        $this->assertSame($cible->id, $ancienne->refresh()->merged_into_id);
        $relue = $adresse->refresh();
        $this->assertSame($cible->id, $relue->geo_neighborhood_id);
        $this->assertSame('Liberté 4', $relue->neighborhood);
    }

    public function test_les_fusions_impossibles(): void
    {
        $this->actingAsRole('super_admin');
        $q = $this->proposition('Cité X', 'cite-x');
        $ailleurs = GeoNeighborhood::factory()->create(['name' => 'Randoulène', 'slug' => 'randoulene']);
        $refuse = GeoNeighborhood::factory()->for($this->ville, 'city')->rejected()->create(['name' => 'Fass', 'slug' => 'fass']);

        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/merge", ['into_id' => $q->id])->assertUnprocessable()->assertJsonPath('code', 'geo.merge_into_self');
        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/merge", ['into_id' => $ailleurs->id])->assertUnprocessable()->assertJsonPath('code', 'geo.merge_other_city');
        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/merge", ['into_id' => $refuse->id])->assertUnprocessable()->assertJsonPath('code', 'geo.merge_target_inactive');
        $this->assertSame(ReferentialStatus::Pending, $q->refresh()->status);
    }
}
```

`tests/Feature/Geo/GeoNeighborhoodMergeSearchTest.php` :

```php
<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-633 — une fusion RÉINDEXE : la recherche lit le texte du quartier, et sans réindexation le
 * bien resterait trouvable sous l'ancien nom et introuvable sous le nouveau.
 */
class GeoNeighborhoodMergeSearchTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @return list<int> */
    private function biensDuQuartier(string $nom): array
    {
        return Property::search('')->where('neighborhood', $nom)->keys()->map(fn ($k) => (int) $k)->all();
    }

    public function test_une_fusion_rend_le_bien_trouvable_sous_le_nom_de_la_cible(): void
    {
        $this->actingAsRole('super_admin');
        $ville = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $cible = GeoNeighborhood::factory()->for($ville, 'city')->create(['name' => 'Liberté 4', 'slug' => 'liberte-4']);
        $source = GeoNeighborhood::factory()->for($ville, 'city')->pending(User::factory()->create())->create(['name' => 'Liberte Quatre', 'slug' => 'liberte-quatre']);
        $bien = Property::factory()->published()->create();
        Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => $bien->id,
            'geo_city_id' => $ville->id, 'geo_neighborhood_id' => $source->id,
            'city' => 'Dakar', 'neighborhood' => 'Liberte Quatre',
        ]);
        $this->indexProperties();
        $this->assertSame([$bien->id], $this->biensDuQuartier('Liberte Quatre'));

        $this->postJson("/api/admin/geo/neighborhoods/{$source->id}/merge", ['into_id' => $cible->id])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame([$bien->id], $this->biensDuQuartier('Liberté 4'));
        $this->assertSame([], $this->biensDuQuartier('Liberte Quatre'));
    }
}
```

Si la première assertion (avant fusion) échoue sur une liste vide, le bien de fabrique n'est pas
indexable : reprendre la fabrique de bien de `tests/Feature/Search/SearchServiceGeoTest.php`, sans
toucher au reste du test.

**Step 2 : rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Feature/Geo/GeoNeighborhoodModerationTest.php tests/Feature/Geo/GeoNeighborhoodMergeSearchTest.php
```

Attendu : 9 échecs (`404`, routes absentes ; l'agent reçoit 404 au lieu de 403).

**Step 3 : les messages d'erreur — co-tenu, Edit seulement**

`lang/fr/errors.php` :

```
old:    'guarantor' => [
new:    'geo' => [
        'link_unresolved' => 'Ce lien ne mène à aucune position lisible.',
        'merge_into_self' => 'Un quartier ne se fusionne pas avec lui-même.',
        'merge_other_city' => 'Les deux quartiers doivent appartenir à la même ville.',
        'merge_target_inactive' => 'Le quartier cible est refusé ou déjà fusionné.',
        'name_taken' => 'Ce nom est déjà pris dans cette ville.',
        'neighborhood_not_pending' => 'Ce quartier n\'est plus en attente de modération.',
    ],
    'guarantor' => [
```

`lang/en/errors.php` :

```
old:    'guarantor' => [
new:    'geo' => [
        'link_unresolved' => 'This link does not lead to a readable location.',
        'merge_into_self' => 'A neighbourhood cannot be merged into itself.',
        'merge_other_city' => 'Both neighbourhoods must belong to the same city.',
        'merge_target_inactive' => 'The target neighbourhood is rejected or already merged.',
        'name_taken' => 'This name is already used in this city.',
        'neighborhood_not_pending' => 'This neighbourhood is no longer awaiting moderation.',
    ],
    'guarantor' => [
```

`lang/wo/errors.php` (⚠ brouillon à faire relire par un locuteur — à signaler dans le rapport) :

```
old:    'guarantor' => [
new:    'geo' => [
        'link_unresolved' => 'Lien bii jëmul ci benn bérab bu ñu man a jàng.',
        'merge_into_self' => 'Benn gox du boole ak boppam.',
        'merge_other_city' => 'Ñaari gox yi war nañu bokk ci benn dëkk.',
        'merge_target_inactive' => 'Gox bi ñu jëm dañu ko bañ, walla boole nañu ko ba noppi.',
        'name_taken' => 'Tur wii am na ba noppi ci dëkk bii.',
        'neighborhood_not_pending' => 'Gox bii nekkatul di xaar ñu saytu ko.',
    ],
    'guarantor' => [
```

**Step 4 : le service**

`app/Services/Geo/GeoNeighborhoodModeration.php` :

```php
<?php

namespace App\Services\Geo;

use App\Models\Address;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\User;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 (AC5) — les quatre décisions de la file des quartiers.
 *
 * Chaque décision verrouille la ligne (`lockForUpdate`) : deux super-admins qui tranchent la même
 * proposition ne doivent pas l'approuver et la refuser à la fois. Une fusion verrouille les deux
 * lignes dans l'ordre des identifiants, pour ne jamais s'interbloquer avec la fusion inverse.
 *
 * Les adresses se réécrivent par `save()` : c'est le crochet d'`Address` qui aligne leur texte.
 * La réindexation suit la transaction — jamais dedans, où un rollback laisserait l'index en avance.
 */
final class GeoNeighborhoodModeration
{
    public function __construct(private readonly GeoReindexation $reindexation) {}

    public function approuver(GeoNeighborhood $quartier, User $par): GeoNeighborhood
    {
        DB::transaction(function () use ($quartier) {
            $ligne = $this->verrouiller($quartier);
            $this->exigerEnAttente($ligne);
            $ligne->forceFill(['status' => ReferentialStatus::Approved])->save();
        });
        $this->journaliser($quartier, $par, 'super_admin_geo_neighborhood_approved', [], 'Quartier approuvé');

        return $quartier->refresh();
    }

    public function rejeter(GeoNeighborhood $quartier, User $par): GeoNeighborhood
    {
        DB::transaction(function () use ($quartier) {
            $ligne = $this->verrouiller($quartier);
            $this->exigerEnAttente($ligne);
            $ligne->forceFill(['status' => ReferentialStatus::Rejected])->save();
            // Le texte reste : c'est ce que la personne a écrit, et la fiche continue de l'afficher.
            $this->reecrireAdresses($ligne, null);
        });
        $this->journaliser($quartier, $par, 'super_admin_geo_neighborhood_rejected', [], 'Quartier refusé');

        return $quartier->refresh();
    }

    public function renommer(GeoNeighborhood $quartier, string $nom, User $par): GeoNeighborhood
    {
        $nom = trim((string) preg_replace('/\s+/u', ' ', $nom));
        $ancien = $quartier->name;

        $biens = DB::transaction(function () use ($quartier, $nom) {
            $ligne = $this->verrouiller($quartier);
            $pris = GeoNeighborhood::query()
                ->where('geo_city_id', $ligne->geo_city_id)
                ->whereKeyNot($ligne->getKey())
                ->whereNull('merged_into_id')
                ->where('status', '<>', ReferentialStatus::Rejected->value)
                ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])
                ->exists();
            abort_code_if($pris, 409, 'geo.name_taken');
            $ligne->forceFill(['name' => $nom, 'renamed_at' => now()])->save();

            return $this->reecrireAdresses($ligne, $ligne);
        });
        $this->reindexation->biens($biens);
        $this->journaliser($quartier, $par, 'super_admin_geo_neighborhood_renamed', ['from' => $ancien, 'to' => $nom], 'Quartier renommé');

        return $quartier->refresh();
    }

    public function fusionner(GeoNeighborhood $source, GeoNeighborhood $cible, User $par): GeoNeighborhood
    {
        abort_code_if($source->is($cible), 422, 'geo.merge_into_self');
        abort_code_if((int) $source->geo_city_id !== (int) $cible->geo_city_id, 422, 'geo.merge_other_city');

        $biens = DB::transaction(function () use ($source, $cible) {
            foreach ($source->getKey() < $cible->getKey() ? [$source, $cible] : [$cible, $source] as $ligne) {
                $this->verrouiller($ligne);
            }
            $src = GeoNeighborhood::query()->findOrFail($source->getKey());
            $cbl = GeoNeighborhood::query()->findOrFail($cible->getKey());
            abort_code_if(
                $cbl->status === ReferentialStatus::Rejected || $cbl->merged_into_id !== null || $src->merged_into_id !== null,
                422,
                'geo.merge_target_inactive',
            );

            // Ce qui avait été fusionné DANS la source suit la cible : aucune chaîne ne s'allonge.
            GeoNeighborhood::query()->where('merged_into_id', $src->getKey())->update(['merged_into_id' => $cbl->getKey(), 'updated_at' => now()]);
            $src->forceFill(['merged_into_id' => $cbl->getKey()])->save();

            return $this->reecrireAdresses($src, $cbl);
        });
        $this->reindexation->biens($biens);
        $this->journaliser($source, $par, 'super_admin_geo_neighborhood_merged', ['into_id' => $cible->getKey()], 'Quartier fusionné');

        return $cible->refresh();
    }

    private function verrouiller(GeoNeighborhood $quartier): GeoNeighborhood
    {
        return GeoNeighborhood::query()->whereKey($quartier->getKey())->lockForUpdate()->firstOrFail();
    }

    private function exigerEnAttente(GeoNeighborhood $ligne): void
    {
        abort_code_if(
            $ligne->status !== ReferentialStatus::Pending || $ligne->merged_into_id !== null,
            409,
            'geo.neighborhood_not_pending',
        );
    }

    /** @return list<int> les biens dont l'adresse a changé */
    private function reecrireAdresses(GeoNeighborhood $source, ?GeoNeighborhood $cible): array
    {
        $biens = [];
        Address::query()->where('geo_neighborhood_id', $source->getKey())->chunkById(200, function (Collection $adresses) use ($cible, &$biens) {
            foreach ($adresses as $adresse) {
                $adresse->geo_neighborhood_id = $cible?->getKey();
                if ($cible !== null) {
                    $adresse->geo_city_id = $cible->geo_city_id;
                    $adresse->neighborhood = $cible->name;
                }
                $adresse->save();
                if ($adresse->addressable_type === Property::class) {
                    $biens[] = (int) $adresse->addressable_id;
                }
            }
        });

        return $biens;
    }

    /** @param  array<string, mixed>  $details */
    private function journaliser(GeoNeighborhood $quartier, User $par, string $evenement, array $details, string $libelle): void
    {
        activity('Admin')
            ->performedOn($quartier)
            ->causedBy($par)
            ->withProperties(['geo_neighborhood_id' => $quartier->getKey(), 'name' => $quartier->name] + $details)
            ->event($evenement)
            ->log($libelle);
    }
}
```

**Step 5 : les FormRequests et le contrôleur**

`app/Http/Requests/Admin/GeoRenameRequest.php` :

```php
<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 — renommer un quartier proposé (console super-admin). */
class GeoRenameRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['name' => ['required', 'string', 'max:120']];
    }
}
```

`app/Http/Requests/Admin/GeoMergeRequest.php` :

```php
<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 — fusionner un quartier dans un autre de la même ville. */
class GeoMergeRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['into_id' => ['required', 'integer', 'exists:geo_neighborhoods,id']];
    }
}
```

`app/Http/Controllers/Api/Admin/GeoNeighborhoodAdminController.php` :

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Admin\GeoMergeRequest;
use App\Http\Requests\Admin\GeoRenameRequest;
use App\Models\GeoNeighborhood;
use App\Services\Geo\GeoNeighborhoodModeration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-633 (AC5) — la file des quartiers proposés. Les routes sont sous `admin/` et le middleware
 * `super-admin` (cf. `PlatformRoutesDefaultDenyTest`) : aucun geste plateforme ne les ouvre à un
 * opérateur `viewer` ou `support`.
 */
class GeoNeighborhoodAdminController extends Controller
{
    public function __construct(private readonly GeoNeighborhoodModeration $moderation) {}

    public function index(Request $request): JsonResponse
    {
        $base = GeoNeighborhood::query()
            ->whereNull('merged_into_id')
            ->with(['city.region', 'createdBy'])
            ->withCount('addresses');

        $paginator = GeoNeighborhood::buildQuery($base, $request)->defaultSort('-created_at')->paginate();

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (GeoNeighborhood $q) => $this->format($q))->values());
    }

    public function approve(Request $request, GeoNeighborhood $neighborhood): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->approuver($neighborhood, $request->user()))]);
    }

    public function reject(Request $request, GeoNeighborhood $neighborhood): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->rejeter($neighborhood, $request->user()))]);
    }

    public function rename(GeoRenameRequest $request, GeoNeighborhood $neighborhood): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->renommer($neighborhood, (string) $request->validated('name'), $request->user()))]);
    }

    public function merge(GeoMergeRequest $request, GeoNeighborhood $neighborhood): JsonResponse
    {
        $cible = GeoNeighborhood::query()->findOrFail((int) $request->validated('into_id'));

        return $this->json(['data' => $this->format($this->moderation->fusionner($neighborhood, $cible, $request->user()))]);
    }

    /** @return array<string, mixed> */
    private function format(GeoNeighborhood $q): array
    {
        $q->loadMissing(['city.region', 'createdBy']);

        return [
            'id' => $q->id,
            'name' => $q->name,
            'slug' => $q->slug,
            'status' => $q->status->value,
            'origin' => $q->origin->value,
            'city' => ['id' => $q->city->id, 'name' => $q->city->name],
            'region' => ['id' => $q->city->region->id, 'name' => $q->city->region->name],
            'created_by' => $q->createdBy !== null ? ['id' => $q->createdBy->id, 'name' => trim($q->createdBy->first_name.' '.$q->createdBy->last_name)] : null,
            'addresses_count' => (int) ($q->addresses_count ?? $q->addresses()->count()),
            'created_at' => $q->created_at?->toIso8601String(),
        ];
    }
}
```

**Step 6 : les routes — `routes/api/geo.php` (territoire D)**

Edit 1 — import :

```
old:use App\Http\Controllers\Public\GeoReferentialController;
new:use App\Http\Controllers\Api\Admin\GeoNeighborhoodAdminController;
use App\Http\Controllers\Public\GeoReferentialController;
```

Edit 2 — en fin de fichier, après le groupe public :

```
old:    Route::get('neighborhoods', [GeoReferentialController::class, 'neighborhoods'])->name('neighborhoods');
});
new:    Route::get('neighborhoods', [GeoReferentialController::class, 'neighborhoods'])->name('neighborhoods');
});

// TCK-633 (AC5) — la file des quartiers proposés : super-admin seulement.
Route::middleware(['auth:sanctum', 'super-admin'])->prefix('admin/geo')->name('admin.geo.')->group(function () {
    Route::get('neighborhoods', [GeoNeighborhoodAdminController::class, 'index'])->name('neighborhoods.index');
    Route::post('neighborhoods/{neighborhood}/approve', [GeoNeighborhoodAdminController::class, 'approve'])->name('neighborhoods.approve');
    Route::post('neighborhoods/{neighborhood}/reject', [GeoNeighborhoodAdminController::class, 'reject'])->name('neighborhoods.reject');
    Route::patch('neighborhoods/{neighborhood}', [GeoNeighborhoodAdminController::class, 'rename'])->name('neighborhoods.rename');
    Route::post('neighborhoods/{neighborhood}/merge', [GeoNeighborhoodAdminController::class, 'merge'])->name('neighborhoods.merge');
});
```

**Step 7 : vert, et les gardes de la console**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api
php artisan test tests/Feature/Geo/GeoNeighborhoodModerationTest.php tests/Feature/Geo/GeoNeighborhoodMergeSearchTest.php
php artisan test tests/Feature/Admin/Platform/PlatformRoutesDefaultDenyTest.php tests/Unit/Lang/LangGroupParityTest.php
```

Attendu : `9 passed`, puis les deux classes de garde vertes (les routes `admin/geo/*` portent
`super-admin` ; les trois `errors.php` ont les mêmes clés).

**Step 8 : ablations**

```bash
mkdir -p "$S/abl/t6" && F=app/Services/Geo/GeoNeighborhoodModeration.php && cp $F "$S/abl/t6/m.php"
# a) fusion sans réindexation
perl -0pi -e 's/(return \$this->reecrireAdresses\(\$src, \$cbl\);\n        \}\);\n)        \$this->reindexation->biens\(\$biens\);\n/$1/' $F
php artisan test tests/Feature/Geo/GeoNeighborhoodMergeSearchTest.php
cp "$S/abl/t6/m.php" $F && md5 -q $F "$S/abl/t6/m.php"
# b) fusion sans réécriture des adresses
sed -i '' 's/return \$this->reecrireAdresses(\$src, \$cbl);/return [];/' $F
php artisan test tests/Feature/Geo/GeoNeighborhoodModerationTest.php --filter=deplace
cp "$S/abl/t6/m.php" $F && md5 -q $F "$S/abl/t6/m.php"
php artisan test tests/Feature/Geo/GeoNeighborhoodModerationTest.php tests/Feature/Geo/GeoNeighborhoodMergeSearchTest.php
```

Attendu : a) 1 échec (`[]` au lieu de `[<id>]` pour `Liberté 4`) ; b) 1 échec
(`geo_neighborhood_id` reste celui de la source) ; `md5` identiques ; `9 passed`.

**Step 9 : Pint, signaler**

```bash
./vendor/bin/pint app/Services/Geo/GeoNeighborhoodModeration.php app/Http/Controllers/Api/Admin/GeoNeighborhoodAdminController.php app/Http/Requests/Admin/GeoRenameRequest.php app/Http/Requests/Admin/GeoMergeRequest.php routes/api/geo.php lang/fr/errors.php lang/en/errors.php lang/wo/errors.php tests/Feature/Geo/GeoNeighborhoodModerationTest.php tests/Feature/Geo/GeoNeighborhoodMergeSearchTest.php
```

Signaler : ces 10 fichiers, `feat(api): modération des quartiers proposés (TCK-633)`.

---

## Tâche 7 — Les liens Google Maps : lecture sans réseau, liens courts résolus par le serveur (20 min)

**Fichiers**
- Créer : `takussan-api/tests/fixtures/liens-google-maps.json` (partagée avec le front, tâche 16)
- Créer : `takussan-api/app/Services/Geo/GoogleMapsCoordinates.php`, `GeoLinkResolver.php`, `Senegal.php`
- Créer : `takussan-api/app/Http/Controllers/Api/GeoLinkController.php`, `takussan-api/app/Http/Requests/Api/GeoResolveLinkRequest.php`
- Modifier : `takussan-api/routes/api/geo.php`
- Tests : `takussan-api/tests/Unit/Services/Geo/GoogleMapsCoordinatesTest.php`, `takussan-api/tests/Feature/Geo/GeoLinkResolverTest.php`

Contrat (« Écarts relevés », E-13) : `POST /api/geo/resolve-link {url}` → `200 {data:{latitude,
longitude, outside_senegal}}` ou `422 {code:'geo.link_unresolved'}` ; authentifié ; 20 appels par
minute.

**Step 1 : la fixture partagée**

`tests/fixtures/liens-google-maps.json` :

```json
{
    "_": "TCK-633 (AC9) — liens Google Maps lus SANS réseau. Lu par tests/Unit/Services/Geo/GoogleMapsCoordinatesTest.php (API) et par takussan-web/src/lib/geo/__tests__/reconnaitre-position.test.ts (front) : un format ajouté d'un seul côté rougit l'autre suite. latitude null = aucune coordonnée lisible dans le lien (un lien court se résout par le serveur).",
    "liens": [
        { "cas": "fiche : le repère !3d!4d l'emporte sur le centre @", "url": "https://www.google.com/maps/place/Point+E,+Dakar/@14.69,-17.46,16z/data=!4m6!3m5!1s0xec172b8e0a1b2c3:0x1!8m2!3d14.6964782!4d-17.4641817!16s", "latitude": 14.6964782, "longitude": -17.4641817 },
        { "cas": "fiche sur google.sn", "url": "https://www.google.sn/maps/place/Mermoz/@14.7074454,-17.474397,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d14.7074454!4d-17.474397", "latitude": 14.7074454, "longitude": -17.474397 },
        { "cas": "carte centrée : @lat,lng,zoom", "url": "https://www.google.com/maps/@14.6928,-17.4467,17z", "latitude": 14.6928, "longitude": -17.4467 },
        { "cas": "paramètre q (lien de partage d'un point)", "url": "https://maps.google.com/?q=14.7166875,-17.4676875", "latitude": 14.7166875, "longitude": -17.4676875 },
        { "cas": "message de position WhatsApp : q encodé", "url": "https://maps.google.com/maps?q=14.72046%2C-17.46744&z=17&hl=fr", "latitude": 14.72046, "longitude": -17.46744 },
        { "cas": "API de recherche : query", "url": "https://www.google.com/maps/search/?api=1&query=14.74419,-17.51753", "latitude": 14.74419, "longitude": -17.51753 },
        { "cas": "paramètre ll", "url": "https://www.google.com/maps?ll=14.7536274,-17.4773789&z=15", "latitude": 14.7536274, "longitude": -17.4773789 },
        { "cas": "q est un NOM : on retombe sur @", "url": "https://www.google.com/maps/search/Yoff/@14.7536274,-17.4773789,14z", "latitude": 14.7536274, "longitude": -17.4773789 },
        { "cas": "une fiche sans coordonnées", "url": "https://www.google.com/maps/place/Dakar", "latitude": null, "longitude": null },
        { "cas": "un lien court ne porte rien", "url": "https://maps.app.goo.gl/x7Jk2mN9pQ", "latitude": null, "longitude": null },
        { "cas": "une latitude impossible est refusée", "url": "https://www.google.com/maps/@91.5,-17.4467,15z", "latitude": null, "longitude": null }
    ]
}
```

(Ces onze cas passent tels quels contre l'implémentation TypeScript de la tâche 16 — vérifié le
2026-10-12 dans un harnais hors dépôt.)

**Step 2 : les tests**

`tests/Unit/Services/Geo/GoogleMapsCoordinatesTest.php` :

```php
<?php

namespace Tests\Unit\Services\Geo;

use App\Services\Geo\GoogleMapsCoordinates;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-633 (AC9) — la jumelle PHP de `coordonneesDepuisLienGoogle` (front) : même fixture, mêmes
 * réponses. Un format lu d'un seul côté ferait accepter au serveur ce que l'écran refuse.
 */
class GoogleMapsCoordinatesTest extends TestCase
{
    /** @return iterable<string, array{string, ?float, ?float}> */
    public static function liens(): iterable
    {
        $fixture = json_decode((string) file_get_contents(__DIR__.'/../../../fixtures/liens-google-maps.json'), true, flags: JSON_THROW_ON_ERROR);
        foreach ($fixture['liens'] as $lien) {
            yield $lien['cas'] => [$lien['url'], $lien['latitude'], $lien['longitude']];
        }
    }

    #[DataProvider('liens')]
    public function test_les_coordonnees_d_un_lien(string $url, ?float $latitude, ?float $longitude): void
    {
        $lu = GoogleMapsCoordinates::depuisUrl($url);

        if ($latitude === null) {
            $this->assertNull($lu);

            return;
        }
        $this->assertNotNull($lu);
        $this->assertEqualsWithDelta($latitude, $lu['latitude'], 1e-9);
        $this->assertEqualsWithDelta($longitude, $lu['longitude'], 1e-9);
    }
}
```

`tests/Feature/Geo/GeoLinkResolverTest.php` :

```php
<?php

namespace Tests\Feature\Geo;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-633 (AC9) — un lien court (`maps.app.goo.gl/…`) se suit côté serveur, et c'est une requête
 * SORTANTE déclenchée par une saisie : la garde SSRF est le sujet du test, pas un détail.
 *
 * https seulement, ni identifiants ni port, hôte vérifié à CHAQUE saut, trois requêtes au plus,
 * aucune redirection suivie automatiquement. Un hôte de lecture (`www.google.com`) se lit sans
 * requête ; seuls les hôtes de redirection de Google sont appelés.
 */
class GeoLinkResolverTest extends TestCase
{
    use RefreshDatabase;

    private const FICHE = 'https://www.google.com/maps/place/Point+E/@14.69,-17.46,16z/data=!3m1!4b1!4m6!3m5!8m2!3d14.6964782!4d-17.4641817';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function resoudre(string $url): TestResponse
    {
        $this->actingAsRole('agent');

        return $this->postJson('/api/geo/resolve-link', ['url' => $url]);
    }

    private function redirection(string $vers): \GuzzleHttp\Promise\PromiseInterface
    {
        return Http::response('', 302, ['Location' => $vers]);
    }

    public function test_un_lien_court_se_resout_par_sa_redirection(): void
    {
        Http::fake(['maps.app.goo.gl/x7Jk2mN9pQ' => $this->redirection(self::FICHE)]);

        $this->resoudre('https://maps.app.goo.gl/x7Jk2mN9pQ')
            ->assertOk()
            ->assertJsonPath('data.latitude', 14.6964782)
            ->assertJsonPath('data.longitude', -17.4641817)
            ->assertJsonPath('data.outside_senegal', false);
        Http::assertSentCount(1);
    }

    public function test_deux_sauts_et_une_location_relative(): void
    {
        Http::fake([
            'maps.app.goo.gl/a' => $this->redirection('/b'),
            'maps.app.goo.gl/b' => $this->redirection('https://maps.google.com/maps?q=14.72046%2C-17.46744&z=17'),
        ]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertOk()->assertJsonPath('data.latitude', 14.72046);
        Http::assertSentCount(2);
    }

    public function test_au_dela_de_trois_requetes_on_renonce(): void
    {
        Http::fake([
            'maps.app.goo.gl/a' => $this->redirection('https://maps.app.goo.gl/b'),
            'maps.app.goo.gl/b' => $this->redirection('https://maps.app.goo.gl/c'),
            'maps.app.goo.gl/c' => $this->redirection('https://maps.app.goo.gl/d'),
            'maps.app.goo.gl/d' => $this->redirection(self::FICHE),
        ]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertUnprocessable()->assertJsonPath('code', 'geo.link_unresolved');
        Http::assertSentCount(3);
    }

    public function test_une_redirection_vers_une_adresse_interne_est_refusee(): void
    {
        Http::fake(['maps.app.goo.gl/a' => $this->redirection('http://169.254.169.254/latest/meta-data/')]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertUnprocessable()->assertJsonPath('code', 'geo.link_unresolved');
        Http::assertSentCount(1);
    }

    public function test_une_redirection_vers_un_hote_etranger_est_refusee_meme_avec_des_coordonnees(): void
    {
        Http::fake(['maps.app.goo.gl/a' => $this->redirection('https://evil.example/maps/@14.7,-17.4,15z')]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertUnprocessable();
        Http::assertSentCount(1);
    }

    public function test_la_page_de_consentement_se_lit_sans_requete(): void
    {
        $url = 'https://consent.google.com/ml?continue='.rawurlencode('https://www.google.com/maps/@14.6928,-17.4467,17z').'&gl=SN';

        $this->resoudre($url)->assertOk()->assertJsonPath('data.latitude', 14.6928);
        Http::assertNothingSent();
    }

    public function test_un_lien_long_se_lit_sans_requete(): void
    {
        $this->resoudre(self::FICHE)->assertOk()->assertJsonPath('data.longitude', -17.4641817);
        Http::assertNothingSent();
    }

    public function test_port_hote_inconnu_et_chemin_non_cartographique_sont_refuses_sans_requete(): void
    {
        $this->resoudre('https://maps.app.goo.gl:8443/x')->assertUnprocessable();
        $this->resoudre('https://example.com/maps/@14.7,-17.4,15z')->assertUnprocessable();
        $this->resoudre('https://goo.gl/abc')->assertUnprocessable();
        $this->resoudre('https://user:pass@maps.app.goo.gl/x')->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_une_panne_reseau_rend_un_refus_lisible(): void
    {
        Http::fake(['maps.app.goo.gl/*' => fn () => throw new ConnectionException('délai dépassé')]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertUnprocessable()->assertJsonPath('code', 'geo.link_unresolved');
    }

    public function test_une_position_hors_du_senegal_est_signalee(): void
    {
        Http::fake(['maps.app.goo.gl/paris' => $this->redirection('https://www.google.com/maps/@48.8566,2.3522,15z')]);

        $this->resoudre('https://maps.app.goo.gl/paris')->assertOk()->assertJsonPath('data.outside_senegal', true);
    }

    public function test_sans_compte_le_point_d_acces_est_ferme(): void
    {
        $this->postJson('/api/geo/resolve-link', ['url' => self::FICHE])->assertUnauthorized();
        Http::assertNothingSent();
    }
}
```

**Step 3 : rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Unit/Services/Geo/GoogleMapsCoordinatesTest.php tests/Feature/Geo/GeoLinkResolverTest.php
```

Attendu : 11 erreurs `Class "App\Services\Geo\GoogleMapsCoordinates" not found` et 11 échecs `404`.

**Step 4 : la lecture des liens, et le cadre du Sénégal**

`app/Services/Geo/GoogleMapsCoordinates.php` :

```php
<?php

namespace App\Services\Geo;

/**
 * TCK-633 (AC9) — les coordonnées écrites dans un lien Google Maps, SANS réseau.
 *
 * Ordre : le repère de la fiche (`!3d…!4d…`) d'abord — le `@` n'est que le CENTRE de la carte
 * affichée, souvent décalé du lieu —, puis les paramètres `q`, `query`, `ll`, `center`,
 * `destination`, puis le `@lat,lng`.
 *
 * ⚠ Jumelle de `coordonneesDepuisLienGoogle` (`takussan-web/src/lib/geo/reconnaitre-position.ts`) :
 * les deux lisent `tests/fixtures/liens-google-maps.json`.
 */
final class GoogleMapsCoordinates
{
    private const LAT = '(-?\d{1,2}(?:\.\d+)?)';

    private const LNG = '(-?\d{1,3}(?:\.\d+)?)';

    /** @var list<string> */
    private const PARAMETRES = ['q', 'query', 'll', 'center', 'destination'];

    /** @return array{latitude: float, longitude: float}|null */
    public static function depuisUrl(string $url): ?array
    {
        $decode = rawurldecode($url);

        if (preg_match('/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/', $decode, $m) === 1) {
            return self::valider($m[1], $m[2]);
        }

        parse_str((string) parse_url($url, PHP_URL_QUERY), $parametres);
        foreach (self::PARAMETRES as $cle) {
            $valeur = $parametres[$cle] ?? null;
            if (is_string($valeur) && preg_match('/^\s*'.self::LAT.'\s*,\s*'.self::LNG.'\s*$/', $valeur, $m) === 1) {
                return self::valider($m[1], $m[2]);
            }
        }

        if (preg_match('#/@'.self::LAT.','.self::LNG.'(?:,|$|/|\?)#', $decode, $m) === 1) {
            return self::valider($m[1], $m[2]);
        }

        return null;
    }

    /** @return array{latitude: float, longitude: float}|null */
    private static function valider(string $lat, string $lng): ?array
    {
        if (! is_numeric($lat) || ! is_numeric($lng)) {
            return null;
        }
        $latitude = (float) $lat;
        $longitude = (float) $lng;
        if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
            return null;
        }

        return ['latitude' => $latitude, 'longitude' => $longitude];
    }
}
```

`app/Services/Geo/Senegal.php` :

```php
<?php

namespace App\Services\Geo;

/**
 * TCK-633 (ADR-0062 §5) — le cadre du Sénégal. Une position hors de lui est SIGNALÉE, jamais
 * refusée : un bien peut se trouver ailleurs, mais c'est le plus souvent une inversion
 * latitude/longitude. Le même cadre vit côté front (`CADRE_SENEGAL`).
 */
final class Senegal
{
    public const LAT_MIN = 12.2;

    public const LAT_MAX = 16.8;

    public const LNG_MIN = -17.6;

    public const LNG_MAX = -11.3;

    public static function contient(float $latitude, float $longitude): bool
    {
        return $latitude >= self::LAT_MIN && $latitude <= self::LAT_MAX
            && $longitude >= self::LNG_MIN && $longitude <= self::LNG_MAX;
    }
}
```

**Step 5 : le résolveur**

`app/Services/Geo/GeoLinkResolver.php` :

```php
<?php

namespace App\Services\Geo;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * TCK-633 (AC9) — suit un lien court Google Maps jusqu'à des coordonnées.
 *
 * Garde SSRF, à CHAQUE étape et pas seulement sur l'URL saisie :
 *   · https seulement, sans identifiants ni port ;
 *   · hôtes LUS : les domaines cartographiques de Google, chemins `/maps…` pour `google.com` et
 *     `google.sn`, `/maps/…` pour `goo.gl` ;
 *   · hôtes APPELÉS : les seuls hôtes de redirection (`maps.app.goo.gl`, `goo.gl`,
 *     `maps.google.com`, `maps.google.sn`) — une fiche `www.google.com` se lit, ne s'appelle pas ;
 *   · `consent.google.com` (serveurs en Europe) : on lit son paramètre `continue`, sans requête ;
 *   · aucune redirection suivie automatiquement, trois requêtes au plus, délais courts.
 */
final class GeoLinkResolver
{
    public const SAUTS_MAX = 3;

    /** @var list<string> */
    private const HOTES_LUS = [
        'maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'maps.google.sn',
        'www.google.com', 'google.com', 'www.google.sn', 'google.sn',
    ];

    /** @var list<string> */
    private const HOTES_APPELES = ['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'maps.google.sn'];

    private const CONSENTEMENT = 'consent.google.com';

    private const AGENT = 'Mozilla/5.0 (compatible; takussan-geo/1.0; +https://www.takussan.com)';

    /** @return array{latitude: float, longitude: float}|null */
    public function resoudre(string $url): ?array
    {
        $courante = $url;
        $requetes = 0;

        for ($tour = 0; $tour < 2 * self::SAUTS_MAX + 2; $tour++) {
            $hote = $this->hoteAdmis($courante);
            if ($hote === null) {
                return null;
            }

            if ($hote === self::CONSENTEMENT) {
                parse_str((string) parse_url($courante, PHP_URL_QUERY), $parametres);
                $suite = $parametres['continue'] ?? null;
                if (! is_string($suite) || $suite === '') {
                    return null;
                }
                $courante = $suite;

                continue;
            }

            $lu = GoogleMapsCoordinates::depuisUrl($courante);
            if ($lu !== null) {
                return $lu;
            }

            if ($requetes >= self::SAUTS_MAX || ! in_array($hote, self::HOTES_APPELES, true)) {
                return null;
            }
            $requetes++;

            try {
                $reponse = Http::withOptions(['allow_redirects' => false, 'stream' => true])
                    ->withUserAgent(self::AGENT)
                    ->connectTimeout(2)
                    ->timeout(4)
                    ->get($courante);
            } catch (ConnectionException) {
                return null;
            }

            $location = $reponse->redirect() ? $reponse->header('Location') : '';
            if ($location === '') {
                return null;
            }
            $suivante = $this->absolue($courante, $location);
            if ($suivante === null) {
                return null;
            }
            $courante = $suivante;
        }

        return null;
    }

    private function hoteAdmis(string $url): ?string
    {
        $parties = parse_url($url);
        if (! is_array($parties) || ($parties['scheme'] ?? '') !== 'https') {
            return null;
        }
        if (isset($parties['user']) || isset($parties['pass']) || isset($parties['port'])) {
            return null;
        }

        $hote = strtolower((string) ($parties['host'] ?? ''));
        $chemin = (string) ($parties['path'] ?? '/');

        if ($hote === self::CONSENTEMENT) {
            return $hote;
        }
        if (! in_array($hote, self::HOTES_LUS, true)) {
            return null;
        }
        if ($hote === 'goo.gl' && ! str_starts_with($chemin, '/maps/')) {
            return null;
        }
        if (in_array($hote, ['www.google.com', 'google.com', 'www.google.sn', 'google.sn'], true) && ! str_starts_with($chemin, '/maps')) {
            return null;
        }

        return $hote;
    }

    private function absolue(string $base, string $location): ?string
    {
        if (str_starts_with($location, 'https://') || str_starts_with($location, 'http://')) {
            return $location;
        }
        if (str_starts_with($location, '//')) {
            return 'https:'.$location;
        }
        if (str_starts_with($location, '/')) {
            return 'https://'.parse_url($base, PHP_URL_HOST).$location;
        }

        return null;
    }
}
```

**Step 6 : la requête, le contrôleur, la route**

`app/Http/Requests/Api/GeoResolveLinkRequest.php` :

```php
<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 (AC9) — un lien collé dans le formulaire du bien. */
class GeoResolveLinkRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['url' => ['required', 'string', 'max:2048', 'url:https']];
    }
}
```

`app/Http/Controllers/Api/GeoLinkController.php` :

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\GeoResolveLinkRequest;
use App\Services\Geo\GeoLinkResolver;
use App\Services\Geo\Senegal;
use Illuminate\Http\JsonResponse;

/** TCK-633 (AC9) — `POST /api/geo/resolve-link`. */
class GeoLinkController extends Controller
{
    public function __invoke(GeoResolveLinkRequest $request, GeoLinkResolver $resolveur): JsonResponse
    {
        $lu = $resolveur->resoudre((string) $request->validated('url'));
        abort_code_if($lu === null, 422, 'geo.link_unresolved');

        return $this->json(['data' => [
            'latitude' => $lu['latitude'],
            'longitude' => $lu['longitude'],
            'outside_senegal' => ! Senegal::contient($lu['latitude'], $lu['longitude']),
        ]]);
    }
}
```

`routes/api/geo.php`, Edit 1 — import :

```
old:use App\Http\Controllers\Api\Admin\GeoNeighborhoodAdminController;
new:use App\Http\Controllers\Api\Admin\GeoNeighborhoodAdminController;
use App\Http\Controllers\Api\GeoLinkController;
```

Edit 2 — avant le groupe d'administration :

```
old:// TCK-633 (AC5) — la file des quartiers proposés : super-admin seulement.
new:// TCK-633 (AC9) — un lien court collé : requête SORTANTE, d'où le compte exigé et le limiteur serré.
Route::middleware(['auth:sanctum', 'throttle:20,1'])->post('geo/resolve-link', GeoLinkController::class)->name('geo.resolve-link');

// TCK-633 (AC5) — la file des quartiers proposés : super-admin seulement.
```

**Step 7 : vert**

```bash
php artisan test tests/Unit/Services/Geo/GoogleMapsCoordinatesTest.php tests/Feature/Geo/GeoLinkResolverTest.php
```

Attendu : `22 passed`.

**Step 8 : ablations**

```bash
mkdir -p "$S/abl/t7" && F=app/Services/Geo/GeoLinkResolver.php && cp $F "$S/abl/t7/r.php"
# a) l'hôte n'est vérifié que sur l'URL saisie
perl -0pi -e 's/(\$suivante = \$this->absolue\(\$courante, \$location\);)/$1\n            if (\$suivante !== null) { return GoogleMapsCoordinates::depuisUrl(\$suivante); }/' $F
php artisan test tests/Feature/Geo/GeoLinkResolverTest.php --filter=etranger
cp "$S/abl/t7/r.php" $F && md5 -q $F "$S/abl/t7/r.php"
# b) redirections suivies par Guzzle
sed -i '' "s/'allow_redirects' => false/'allow_redirects' => true/" $F
php artisan test tests/Feature/Geo/GeoLinkResolverTest.php --filter=trois_requetes
cp "$S/abl/t7/r.php" $F && md5 -q $F "$S/abl/t7/r.php"
# c) le repère !3d!4d ignoré
G=app/Services/Geo/GoogleMapsCoordinates.php && cp $G "$S/abl/t7/g.php"
sed -i '' "s/if (preg_match('\/!3d/if (false \&\& preg_match('\/!3d/" $G
php artisan test tests/Unit/Services/Geo/GoogleMapsCoordinatesTest.php
cp "$S/abl/t7/g.php" $G && md5 -q $G "$S/abl/t7/g.php"
php artisan test tests/Unit/Services/Geo/GoogleMapsCoordinatesTest.php tests/Feature/Geo/GeoLinkResolverTest.php
```

Attendu : a) 1 échec (200 au lieu de 422 : les coordonnées de `evil.example` sont lues) ;
b) 1 échec (Guzzle suit les redirections du faux : `assertSentCount(3)` faux, ou 200) ;
c) 1 échec (`fiche : le repère !3d!4d l'emporte…` rend 14.69 au lieu de 14.6964782) ;
`md5` identiques ; `22 passed`.

**Step 9 : Pint, signaler**

```bash
./vendor/bin/pint app/Services/Geo/GoogleMapsCoordinates.php app/Services/Geo/GeoLinkResolver.php app/Services/Geo/Senegal.php app/Http/Controllers/Api/GeoLinkController.php app/Http/Requests/Api/GeoResolveLinkRequest.php routes/api/geo.php tests/Unit/Services/Geo/GoogleMapsCoordinatesTest.php tests/Feature/Geo/GeoLinkResolverTest.php
```

Signaler : ces 8 fichiers et `tests/fixtures/liens-google-maps.json`,
`feat(api): liens Google Maps courts résolus sous garde SSRF (TCK-633)`.

---

## Tâche 8 — Bornes numériques, devise XOF, frais d'agence d'un indépendant (20 min)

Trois corrections côté serveur, chacune de son côté du formulaire (tâches 20 et 21) : **un
contrôle d'écran ne protège pas l'API**.

- **Bornes.** `StorePropertyRequest` n'en pose aucune sur l'étage, le nombre d'étages et le
  stationnement (L65, L66, L70), ni de plage sur les coordonnées (L80-81). Les colonnes sont
  `unsignedSmallInteger`/`unsignedTinyInteger` (`2026_04_17_160005_create_properties_table.php`
  L28-34), soit un `smallint` **signé** sous PostgreSQL : `floor_number = -1` passe déjà (E-1), et
  `parking_spaces = 40000` déborde — **500**, pas 422.
- **Devise.** ADR-0061 : la plateforme publie en XOF. La devise n'est plus un choix du formulaire ;
  le serveur l'impose, à la création ET quand une modification l'envoie (E-19).
- **Frais d'agence.** Un indépendant (`AgencyKind::Individual`) ne facture pas de frais d'agence :
  `agency_fee_months` devient interdit (422) pour son agence, comme le reste du coût d'entrée l'est
  déjà hors location mensuelle.

**Fichiers**
- Modifier : `takussan-api/app/Http/Requests/Api/StorePropertyRequest.php` (L45-91) — ⚠ co-tenu
  avec le lot C (cf. « Collisions »)
- Modifier : `takussan-api/app/Http/Requests/UpdatePropertyRequest.php` (L36-83) — ⚠ co-tenu avec
  le lot F (`featured`, L58)
- Modifier : `takussan-api/app/Services/Property/CoutDEntree.php` (docblock L11-24, `regles` L80-91)
- Tests : `takussan-api/tests/Feature/Api/Property/PropertyNumericBoundsTest.php`,
  `PropertyCurrencyForcedTest.php`, `AgencyFeeIndividualTest.php`

**Step 1 : les tests**

`tests/Feature/Api/Property/PropertyNumericBoundsTest.php` :

```php
<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (AC3) — les bornes des champs numériques, des DEUX côtés (création et modification).
 *
 * Le défaut n'était pas l'étage négatif (accepté depuis toujours : un sous-sol existe) mais
 * l'absence de borne haute : `parking_spaces = 40000` débordait le `smallint` et rendait 500.
 */
class PropertyNumericBoundsTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $agence = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->actingAsRole('agent', ['agency_id' => $agence->id]);
    }

    /** @return array<string, mixed> */
    private function bien(array $plus = []): array
    {
        return $plus + ['title' => 'Appartement test', 'type' => 'apartment', 'contract_type' => 'rent', 'price' => 200_000];
    }

    public function test_un_sous_sol_reste_accepte(): void
    {
        $this->postJson('/api/properties', $this->bien(['floor_number' => -1, 'total_floors' => 4]))
            ->assertCreated()
            ->assertJsonPath('data.floor_number', -1);
    }

    public function test_un_nombre_qui_deborde_la_colonne_est_un_422_et_non_un_500(): void
    {
        $this->postJson('/api/properties', $this->bien(['parking_spaces' => 40_000]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('parking_spaces');
    }

    /** @return iterable<string, array{string, int|float}> */
    public static function horsBornes(): iterable
    {
        yield 'chambres' => ['bedrooms', 101];
        yield 'salles de bain' => ['bathrooms', 101];
        yield 'étage trop bas' => ['floor_number', -6];
        yield 'étage trop haut' => ['floor_number', 201];
        yield 'aucun étage' => ['total_floors', 0];
        yield 'stationnement' => ['parking_spaces', 501];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('horsBornes')]
    public function test_les_bornes_a_la_creation(string $champ, int|float $valeur): void
    {
        $this->postJson('/api/properties', $this->bien([$champ => $valeur]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors($champ);
    }

    public function test_les_coordonnees_hors_plage_sont_refusees_des_deux_cotes(): void
    {
        $this->postJson('/api/properties', $this->bien(['address' => ['city' => 'Dakar', 'latitude' => 95, 'longitude' => -17.4]]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('address.latitude');

        $bien = Property::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agent->agency_id]);
        $this->putJson("/api/properties/{$bien->id}", ['address' => ['longitude' => -190]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('address.longitude');
    }

    public function test_les_bornes_a_la_modification(): void
    {
        $bien = Property::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agent->agency_id]);

        $this->putJson("/api/properties/{$bien->id}", ['bedrooms' => 101, 'bathrooms' => 101, 'parking_spaces' => 501])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['bedrooms', 'bathrooms', 'parking_spaces']);
    }
}
```

`tests/Feature/Api/Property/PropertyCurrencyForcedTest.php` :

```php
<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Enums\Currency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0061) — un bien se publie en francs CFA. Le formulaire ne propose plus la devise,
 * et le serveur l'impose : un corps forgé qui l'envoie est ramené à XOF, sans 422 — la réponse ne
 * doit pas casser un client qui l'envoie encore.
 */
class PropertyCurrencyForcedTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $agence = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->actingAsRole('agent', ['agency_id' => $agence->id]);
    }

    public function test_la_creation_impose_le_franc_cfa(): void
    {
        $reponse = $this->postJson('/api/properties', [
            'title' => 'Villa', 'type' => 'villa', 'contract_type' => 'sale', 'price' => 90_000_000, 'currency' => 'EUR',
        ])->assertCreated();

        $this->assertSame(Currency::XOF, Property::query()->findOrFail($reponse->json('data.id'))->currency);
    }

    public function test_la_creation_sans_devise_donne_le_franc_cfa(): void
    {
        $reponse = $this->postJson('/api/properties', [
            'title' => 'Studio', 'type' => 'apartment', 'contract_type' => 'rent', 'price' => 150_000,
        ])->assertCreated();

        $this->assertSame(Currency::XOF, Property::query()->findOrFail($reponse->json('data.id'))->currency);
    }

    public function test_une_modification_qui_envoie_une_devise_est_ramenee_au_franc_cfa(): void
    {
        $bien = Property::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agent->agency_id, 'currency' => Currency::XOF]);

        $this->putJson("/api/properties/{$bien->id}", ['currency' => 'USD'])->assertOk();

        $this->assertSame(Currency::XOF, $bien->refresh()->currency);
    }
}
```

`tests/Feature/Api/Property/AgencyFeeIndividualTest.php` :

```php
<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (AC4) — un indépendant ne facture pas de frais d'agence. Le champ est retiré du
 * formulaire (tâche 21) ET refusé par l'API, à la création comme à la modification, que l'appel
 * vienne de l'agent ou d'un super-admin qui crée pour son compte.
 */
class AgencyFeeIndividualTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, mixed> */
    private function location(array $plus = []): array
    {
        return $plus + ['title' => 'F3 à Mermoz', 'type' => 'apartment', 'contract_type' => 'rent', 'rent_period' => 'monthly', 'price' => 300_000];
    }

    public function test_un_independant_ne_peut_pas_saisir_de_frais(): void
    {
        $this->actingAsRole('agent', ['agency_id' => Agency::factory()->individual()->create(['moderation_required' => false])->id]);

        $this->postJson('/api/properties', $this->location(['agency_fee_months' => 1]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('agency_fee_months');
    }

    public function test_un_independant_garde_le_reste_du_cout_d_entree(): void
    {
        $this->actingAsRole('agent', ['agency_id' => Agency::factory()->individual()->create(['moderation_required' => false])->id]);

        $id = $this->postJson('/api/properties', $this->location(['deposit_months' => 2, 'advance_months' => 1, 'agency_fee_months' => null]))
            ->assertCreated()
            ->json('data.id');

        $bien = Property::query()->findOrFail($id);
        $this->assertSame(2, $bien->deposit_months);
        $this->assertNull($bien->agency_fee_months);
    }

    public function test_une_agence_standard_saisit_ses_frais(): void
    {
        $this->actingAsRole('agent', ['agency_id' => Agency::factory()->create(['moderation_required' => false])->id]);

        $this->postJson('/api/properties', $this->location(['agency_fee_months' => 1]))->assertCreated();
    }

    public function test_le_super_admin_qui_cree_pour_un_independant_est_refuse_aussi(): void
    {
        $independant = Agency::factory()->individual()->create(['moderation_required' => false]);
        $this->actingAsRole('super_admin');

        $this->postJson('/api/properties', $this->location(['agency_id' => $independant->id, 'agency_fee_months' => 1]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('agency_fee_months');
    }

    public function test_la_modification_d_un_bien_d_independant_refuse_les_frais(): void
    {
        $independant = Agency::factory()->individual()->create(['moderation_required' => false]);
        $agent = $this->actingAsRole('agent', ['agency_id' => $independant->id]);
        $bien = Property::factory()->create([
            'user_id' => $agent->id, 'agency_id' => $independant->id,
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => 300_000,
        ]);

        $this->putJson("/api/properties/{$bien->id}", ['agency_fee_months' => 0.5])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('agency_fee_months');
    }
}
```

**Step 2 : rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Feature/Api/Property/PropertyNumericBoundsTest.php tests/Feature/Api/Property/PropertyCurrencyForcedTest.php tests/Feature/Api/Property/AgencyFeeIndividualTest.php
```

Attendu : `test_un_sous_sol_reste_accepte` **vert** (non-régression, E-1) ;
`test_un_nombre_qui_deborde…` rouge en **500** ; la plupart des bornes rouges en 201/200 ;
les deux tests de devise ramenée rouges (EUR, USD) ; trois tests de frais rouges (201/200). Le
test sans devise et celui de l'agence standard sont verts dès maintenant.

**Step 3 : `CoutDEntree` — le troisième paramètre**

Edit du docblock (L11-14) :

```
old: * TCK-598 (V9, contrainte 8) — ce qu'un locataire verse pour emménager : avance, caution, frais
 * d'agence, charges. **Une seule définition** : la ressource, les règles de validation et la
 * duplication la lisent ; aucun écran ne refait l'addition.
new: * TCK-598 (V9, contrainte 8) — ce qu'un locataire verse pour emménager : avance, caution, frais
 * d'agence, charges. **Une seule définition** : la ressource, les règles de validation et la
 * duplication la lisent.
 *
 * TCK-633 — l'aperçu du parcours de création refait l'addition AVANT l'enregistrement : il n'a
 * pas de ressource à lire. Sa jumelle (`takussan-web/src/lib/cout-d-entree.ts`) est tenue à cette
 * classe par une fixture commune, `tests/fixtures/cout-d-entree.json` : un écart d'un franc rougit
 * une des deux suites. Un indépendant (`AgencyKind::Individual`) ne facture pas de frais d'agence.
```

Edit de `regles` :

```
old:    public static function regles(bool $applicable, bool $partiel): array
    {
        $base = $partiel ? ['sometimes', 'nullable'] : ['nullable'];
        $interdit = Rule::prohibitedIf(! $applicable);

        return [
            'deposit_months' => [...$base, 'integer', 'min:0', 'max:'.self::MOIS_MAX, $interdit],
            'advance_months' => [...$base, 'integer', 'min:0', 'max:'.self::MOIS_MAX, $interdit],
            'agency_fee_months' => [...$base, 'numeric', 'decimal:0,2', 'min:0', 'max:'.self::MOIS_MAX, $interdit],
new:    public static function regles(bool $applicable, bool $partiel, bool $fraisAdmis = true): array
    {
        $base = $partiel ? ['sometimes', 'nullable'] : ['nullable'];
        $interdit = Rule::prohibitedIf(! $applicable);

        return [
            'deposit_months' => [...$base, 'integer', 'min:0', 'max:'.self::MOIS_MAX, $interdit],
            'advance_months' => [...$base, 'integer', 'min:0', 'max:'.self::MOIS_MAX, $interdit],
            'agency_fee_months' => [...$base, 'numeric', 'decimal:0,2', 'min:0', 'max:'.self::MOIS_MAX, $interdit, Rule::prohibitedIf(! $fraisAdmis)],
```

Et, à la suite de `regles` (avant l'accolade finale de la classe) :

```
old:            'monthly_charges' => [...$base, 'numeric', 'decimal:0,2', 'min:0', 'max:999999999999', $interdit],
        ];
    }
}
new:            'monthly_charges' => [...$base, 'numeric', 'decimal:0,2', 'min:0', 'max:999999999999', $interdit],
        ];
    }

    /** TCK-633 (AC4) — un indépendant ne facture pas de frais d'agence ; sans agence, rien n'est retiré. */
    public static function fraisDAgenceAdmis(?Agency $agence): bool
    {
        return $agence?->kind !== AgencyKind::Individual;
    }
}
```

Imports :

```
old:use App\Models\Enums\ContractType;
new:use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\ContractType;
```

**Step 4 : `StorePropertyRequest`**

Imports (L5-17) :

```
old:use App\Http\Requests\BaseFormRequest;
new:use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
```

Bornes :

```
old:            'bedrooms' => ['nullable', 'integer', 'min:0'],
            'bathrooms' => ['nullable', 'integer', 'min:0'],
new:            'bedrooms' => ['nullable', 'integer', 'min:0', 'max:100'],
            'bathrooms' => ['nullable', 'integer', 'min:0', 'max:100'],
```

```
old:            'floor_number' => ['nullable', 'integer'],
            'total_floors' => ['nullable', 'integer'],
new:            // TCK-633 — les bornes de `UpdatePropertyRequest` ; -5 : un sous-sol est un étage.
            'floor_number' => ['nullable', 'integer', 'min:-5', 'max:200'],
            'total_floors' => ['nullable', 'integer', 'min:1', 'max:200'],
```

```
old:            'parking_spaces' => ['nullable', 'integer'],
new:            'parking_spaces' => ['nullable', 'integer', 'min:0', 'max:500'],
```

```
old:            'address.latitude' => ['nullable', 'numeric'],
            'address.longitude' => ['nullable', 'numeric'],
new:            'address.latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'address.longitude' => ['nullable', 'numeric', 'between:-180,180'],
```

⚠ La tâche 3 a déjà inséré `...GeoAddressRules::...` APRÈS `address.longitude` : l'Edit
ci-dessus remplace les deux lignes seules, l'insertion suivante reste en place.

Le coût d'entrée et l'agence visée :

```
old:            ...CoutDEntree::regles(
                CoutDEntree::sApplique($this->input('contract_type'), $this->input('rent_period')),
                partiel: false,
            ),
        ];
    }
}
new:            ...CoutDEntree::regles(
                CoutDEntree::sApplique($this->input('contract_type'), $this->input('rent_period')),
                partiel: false,
                fraisAdmis: CoutDEntree::fraisDAgenceAdmis($this->agenceVisee()),
            ),
        ];
    }

    /**
     * TCK-633 (ADR-0061) — un bien se publie en francs CFA : la devise envoyée est IGNORÉE, pas
     * refusée (un client ancien qui l'envoie encore ne reçoit pas un 422 qu'il ne comprendrait pas).
     */
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        $this->merge(['currency' => Currency::XOF->value]);
    }

    /** L'agence où le bien sera créé — la règle de `PropertyController::store` (L102-105). */
    private function agenceVisee(): ?Agency
    {
        $user = $this->user();
        $id = $user?->isSuperAdmin() ? $this->input('agency_id') : $user?->agency_id;

        return is_numeric($id) ? Agency::query()->find((int) $id) : null;
    }
}
```

`BaseFormRequest::prepareForValidation` existe (L14) : l'appel au parent garde ce qu'il fait.

**Step 5 : `UpdatePropertyRequest`**

Imports (L5-20) :

```
old:use App\Models\Enums\ContractType;
new:use App\Models\Agency;
use App\Models\Enums\ContractType;
```

Bornes :

```
old:            'bedrooms' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'bathrooms' => ['sometimes', 'nullable', 'integer', 'min:0'],
new:            'bedrooms' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100'],
            'bathrooms' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100'],
```

```
old:            'parking_spaces' => ['sometimes', 'nullable', 'integer', 'min:0'],
new:            'parking_spaces' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:500'],
```

```
old:            'address.latitude' => ['sometimes', 'nullable', 'numeric'],
            'address.longitude' => ['sometimes', 'nullable', 'numeric'],
new:            'address.latitude' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'address.longitude' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
```

Coût d'entrée, devise :

```
old:            ...CoutDEntree::regles($this->coutDEntreeApplicable(), partiel: true),
        ];
    }
new:            ...CoutDEntree::regles(
                $this->coutDEntreeApplicable(),
                partiel: true,
                fraisAdmis: CoutDEntree::fraisDAgenceAdmis($this->agenceDuBien()),
            ),
        ];
    }

    /**
     * TCK-633 (ADR-0061) — la devise n'est réécrite QUE si le corps l'envoie : un PATCH sans elle
     * ne touche pas à un bien existant.
     */
    protected function prepareForValidation(): void
    {
        if ($this->exists('currency')) {
            $this->merge(['currency' => Currency::XOF->value]);
        }
    }

    private function agenceDuBien(): ?Agency
    {
        /** @var Property|null $bien */
        $bien = $this->route('property');

        return $bien?->agency;
    }
```

Avant cet Edit, confirmer que la classe ne porte aucun `prepareForValidation` (le lot F la
co-tient) :

```bash
grep -n "prepareForValidation" app/Http/Requests/UpdatePropertyRequest.php
```

Attendu : aucune ligne. Si F en a déjà ajouté un, y AJOUTER le bloc `if ($this->exists('currency'))`
au lieu d'en écrire un second (« Collisions »).

**Step 6 : vert**

```bash
php artisan test tests/Feature/Api/Property/PropertyNumericBoundsTest.php tests/Feature/Api/Property/PropertyCurrencyForcedTest.php tests/Feature/Api/Property/AgencyFeeIndividualTest.php tests/Feature/Api/Property/PropertyEntryCostAndTourTest.php tests/Feature/Api/Property/PropertyWritableFieldsTest.php tests/Feature/Api/PropertyCrudTest.php
```

Attendu : tout vert. Les trois classes existantes sont rejouées parce qu'elles écrivent les champs
touchés (coût d'entrée, étages, devise `XOF` de `PropertyCrudTest` L184).

**Step 7 : ablations**

```bash
mkdir -p "$S/abl/t8"
F=app/Http/Requests/Api/StorePropertyRequest.php && cp $F "$S/abl/t8/store.php"
# a) borne de stationnement retirée
sed -i '' "s/'parking_spaces' => \['nullable', 'integer', 'min:0', 'max:500'\]/'parking_spaces' => ['nullable', 'integer']/" $F
php artisan test tests/Feature/Api/Property/PropertyNumericBoundsTest.php --filter=deborde
cp "$S/abl/t8/store.php" $F && md5 -q $F "$S/abl/t8/store.php"
# b) devise non forcée à la création
sed -i '' "s/\$this->merge(\['currency' => Currency::XOF->value\]);/\/\/ ablation/" $F
php artisan test tests/Feature/Api/Property/PropertyCurrencyForcedTest.php
cp "$S/abl/t8/store.php" $F && md5 -q $F "$S/abl/t8/store.php"
# c) frais toujours admis
C=app/Services/Property/CoutDEntree.php && cp $C "$S/abl/t8/cout.php"
sed -i '' 's/return \$agence?->kind !== AgencyKind::Individual;/return true;/' $C
php artisan test tests/Feature/Api/Property/AgencyFeeIndividualTest.php
cp "$S/abl/t8/cout.php" $C && md5 -q $C "$S/abl/t8/cout.php"
php artisan test tests/Feature/Api/Property/PropertyNumericBoundsTest.php tests/Feature/Api/Property/PropertyCurrencyForcedTest.php tests/Feature/Api/Property/AgencyFeeIndividualTest.php
```

Attendu : a) 1 échec en **500** (la preuve que la borne sert à éviter le débordement) ;
b) 1 échec (`EUR`) — la modification garde son propre `merge` ; c) 3 échecs (201, 201, 200) ;
`md5` identiques ; tout vert.

**Step 8 : Pint, signaler**

```bash
./vendor/bin/pint app/Http/Requests/Api/StorePropertyRequest.php app/Http/Requests/UpdatePropertyRequest.php app/Services/Property/CoutDEntree.php tests/Feature/Api/Property/PropertyNumericBoundsTest.php tests/Feature/Api/Property/PropertyCurrencyForcedTest.php tests/Feature/Api/Property/AgencyFeeIndividualTest.php
```

Signaler : ces 6 fichiers, `fix(api): bornes des champs numériques, devise XOF imposée, frais
d'agence refusés à un indépendant (TCK-633)`.

---

## Tâche 9 — La fixture commune du coût d'entrée, côté API (10 min)

L'aperçu du parcours (tâche 22) affiche le total AVANT l'enregistrement : il le calcule. Deux
additions d'une même règle divergent tôt ou tard — sauf si un même fichier les juge toutes les
deux (patron de `tests/fixtures/booking-quote.json`, TCK-530).

**Fichiers**
- Créer : `takussan-api/tests/fixtures/cout-d-entree.json`
- Test : `takussan-api/tests/Unit/Services/Property/CoutDEntreeConcordanceTest.php`

**Step 1 : la fixture**

Les douze premiers totaux ont été calculés le 2026-10-12 par les DEUX implémentations
(l'expression de `CoutDEntree::pour` et l'addition en entiers de la tâche 17), hors dépôt, et
concordent au franc et au centime près.

`tests/fixtures/cout-d-entree.json` :

```json
{
    "_": "TCK-633 — le coût d'entrée d'une location mensuelle. Lu par tests/Unit/Services/Property/CoutDEntreeConcordanceTest.php (API) et par takussan-web/src/lib/__tests__/cout-d-entree.concordance.test.ts (front) : l'aperçu du parcours affiche, au franc près, le total que la fiche publiée affichera. total null = aucun bloc (vente, période non mensuelle, ou les quatre champs vides).",
    "cas": [
        { "nom": "AC8 de TCK-598 : 2 + 2 + 1, charges 10 000", "entree": { "price": "300000", "currency": "XOF", "contract_type": "rent", "rent_period": "monthly", "advance_months": 2, "deposit_months": 2, "agency_fee_months": "1", "monthly_charges": "10000" }, "total": "1520000" },
        { "nom": "un demi-mois de frais", "entree": { "price": "250000", "currency": "XOF", "contract_type": "rent", "rent_period": "monthly", "advance_months": 1, "deposit_months": 2, "agency_fee_months": "0.5", "monthly_charges": null }, "total": "875000" },
        { "nom": "frais à 0,33 mois", "entree": { "price": "175000", "currency": "XOF", "contract_type": "rent", "rent_period": "monthly", "advance_months": 3, "deposit_months": null, "agency_fee_months": "0.33", "monthly_charges": null }, "total": "582750" },
        { "nom": "demi-franc arrondi vers le haut", "entree": { "price": "333333", "currency": "XOF", "contract_type": "rent", "rent_period": "monthly", "advance_months": 1, "deposit_months": null, "agency_fee_months": "0.5", "monthly_charges": null }, "total": "500000" },
        { "nom": "loyer à centimes en XOF : arrondi à l'unité", "entree": { "price": "99999.99", "currency": "XOF", "contract_type": "rent", "rent_period": "monthly", "advance_months": 1, "deposit_months": null, "agency_fee_months": null, "monthly_charges": null }, "total": "100000" },
        { "nom": "euro : deux décimales", "entree": { "price": "1500.50", "currency": "EUR", "contract_type": "rent", "rent_period": "monthly", "advance_months": 2, "deposit_months": 1, "agency_fee_months": "0.75", "monthly_charges": "120.25" }, "total": "5867.38" },
        { "nom": "dollar, frais seuls", "entree": { "price": "1234.57", "currency": "USD", "contract_type": "rent", "rent_period": "monthly", "advance_months": null, "deposit_months": null, "agency_fee_months": "0.33", "monthly_charges": null }, "total": "407.41" },
        { "nom": "charges seules : un bloc à zéro, pas absent", "entree": { "price": "150000", "currency": "XOF", "contract_type": "rent", "rent_period": "monthly", "advance_months": null, "deposit_months": null, "agency_fee_months": null, "monthly_charges": "15000" }, "total": "0" },
        { "nom": "période absente : mensuelle par défaut", "entree": { "price": "450000", "currency": "XOF", "contract_type": "rent", "rent_period": null, "advance_months": 3, "deposit_months": 3, "agency_fee_months": "1.5", "monthly_charges": "25000" }, "total": "3450000" },
        { "nom": "les maxima", "entree": { "price": "2500000", "currency": "XOF", "contract_type": "rent", "rent_period": "monthly", "advance_months": 24, "deposit_months": 24, "agency_fee_months": "24", "monthly_charges": "999999" }, "total": "203999976" },
        { "nom": "0,15 mois d'un loyer à centimes", "entree": { "price": "333333.33", "currency": "XOF", "contract_type": "rent", "rent_period": "monthly", "advance_months": null, "deposit_months": null, "agency_fee_months": "0.15", "monthly_charges": null }, "total": "50000" },
        { "nom": "petits montants en euro", "entree": { "price": "19.99", "currency": "EUR", "contract_type": "rent", "rent_period": "monthly", "advance_months": 3, "deposit_months": null, "agency_fee_months": "0.29", "monthly_charges": "0.29" }, "total": "66.64" },
        { "nom": "une vente n'a pas de coût d'entrée", "entree": { "price": "90000000", "currency": "XOF", "contract_type": "sale", "rent_period": null, "advance_months": 2, "deposit_months": 2, "agency_fee_months": "1", "monthly_charges": null }, "total": null },
        { "nom": "à la semaine : pas de coût d'entrée", "entree": { "price": "70000", "currency": "XOF", "contract_type": "rent", "rent_period": "weekly", "advance_months": 1, "deposit_months": 1, "agency_fee_months": null, "monthly_charges": null }, "total": null },
        { "nom": "les quatre champs vides : absent, et non 0 F", "entree": { "price": "300000", "currency": "XOF", "contract_type": "rent", "rent_period": "monthly", "advance_months": null, "deposit_months": null, "agency_fee_months": null, "monthly_charges": null }, "total": null }
    ]
}
```

**Step 2 : le test**

`tests/Unit/Services/Property/CoutDEntreeConcordanceTest.php` :

```php
<?php

namespace Tests\Unit\Services\Property;

use App\Models\Enums\Currency;
use App\Models\Property;
use App\Services\Property\CoutDEntree;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-633 — `CoutDEntree::pour` contre la fixture commune. `Tests\TestCase` et non celui de
 * PHPUnit : instancier `Property` démarre ses traits (Scout lit sa configuration).
 */
class CoutDEntreeConcordanceTest extends TestCase
{
    /** @return iterable<string, array{array<string, mixed>, ?string}> */
    public static function cas(): iterable
    {
        $fixture = json_decode((string) file_get_contents(__DIR__.'/../../../fixtures/cout-d-entree.json'), true, flags: JSON_THROW_ON_ERROR);
        foreach ($fixture['cas'] as $cas) {
            yield $cas['nom'] => [$cas['entree'], $cas['total']];
        }
    }

    public function test_la_fixture_porte_des_cas_des_deux_sortes(): void
    {
        $totaux = array_column(iterator_to_array(self::cas()), 1);
        $this->assertGreaterThanOrEqual(15, count($totaux));
        $this->assertContains(null, $totaux);
    }

    /** @param array<string, mixed> $entree */
    #[DataProvider('cas')]
    public function test_le_total(array $entree, ?string $attendu): void
    {
        $bien = (new Property)->forceFill($entree);

        $cout = CoutDEntree::pour($bien);

        if ($attendu === null) {
            $this->assertNull($cout);

            return;
        }
        $this->assertNotNull($cout);
        $this->assertSame($attendu, number_format($cout['total'], Currency::decimalPlacesOf($entree['currency']), '.', ''));
    }
}
```

**Step 3 : vert d'emblée — c'est le test d'un comportement EXISTANT**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Unit/Services/Property/CoutDEntreeConcordanceTest.php
```

Attendu : `16 passed`. Un vert immédiat est ici le résultat attendu : la fixture FIGE la règle
existante pour que la jumelle de la tâche 17 s'y mesure.

**Step 4 : ablation — la fixture juge vraiment**

```bash
mkdir -p "$S/abl/t9" && C=app/Services/Property/CoutDEntree.php && cp $C "$S/abl/t9/cout.php"
sed -i '' 's/PHP_ROUND_HALF_UP)/PHP_ROUND_HALF_DOWN)/' $C
php artisan test tests/Unit/Services/Property/CoutDEntreeConcordanceTest.php
cp "$S/abl/t9/cout.php" $C && md5 -q $C "$S/abl/t9/cout.php"
php artisan test tests/Unit/Services/Property/CoutDEntreeConcordanceTest.php
```

Attendu : 1 échec (`demi-franc arrondi vers le haut` : 333 333 × 1,5 = 499 999,5, exact en
binaire, rend `499999`) ; `md5` identiques ; `16 passed`.

**Step 5 : Pint, signaler**

```bash
./vendor/bin/pint tests/Unit/Services/Property/CoutDEntreeConcordanceTest.php
```

Signaler : `tests/fixtures/cout-d-entree.json` et le test,
`test(api): fixture commune du coût d'entrée (TCK-633)`.

---

## Tâche 10 — Le statut des étiquettes, la fusion `feature` → `amenity`, le catalogue (20 min) — ⚠ HORS TERRITOIRE en partie

Deux types disaient la même chose : `feature` (Piscine, Climatisation…) et `amenity` (WiFi,
TV…). Le formulaire n'affichait que les `amenity` (`SyncPropertyTagRequest` n'accepte qu'eux), si
bien que Piscine et Climatisation — les deux équipements les plus recherchés — étaient
**impossibles à cocher** (E-10). ADR-0061 §9 : un seul type, `amenity`, un catalogue versionné,
et des propositions modérées comme les quartiers.

Index existant à connaître : `tags.name` est unique ET `tags_name_lower_unique` porte
`LOWER(name COLLATE "und-x-icu")` (`2026_08_22_100000_…`, L77) — un nom est unique **tous types
confondus** et à la casse près. `tags.slug` est unique aussi (`2026_04_17_160004_create_tags_table.php`).

**Fichiers**
- Créer : `takussan-api/database/migrations/2026_10_12_400200_add_status_to_tags_and_merge_features.php`
- Créer : `takussan-api/app/Services/Tags/TagCatalog.php`
- Créer : `takussan-api/app/Console/Commands/TagsSyncCatalog.php`
- Modifier : `takussan-api/database/seeders/System/TagSeeder.php` (entier, 26 lignes)
- Modifier ⚠ HORS TERRITOIRE : `takussan-api/app/Models/Tag.php`,
  `takussan-api/app/Http/Controllers/Api/TagController.php` (`index` L15-36, `format` L109-129),
  `takussan-api/app/Http/Requests/Api/StoreTagRequest.php` (L41),
  `takussan-api/app/Http/Requests/Api/UpdateTagRequest.php` (L41),
  `takussan-api/docker/release.sh`,
  `takussan-api/tests/Feature/Seeders/FilterCoverageTagsTest.php` (L153)
- Tests : `takussan-api/tests/Feature/Tags/TagCatalogTest.php`, `TagVisibilityTest.php`

**Step 1 : les tests**

`tests/Feature/Tags/TagCatalogTest.php` :

```php
<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Models\User;
use App\Services\Tags\TagCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0061 §9) — le catalogue des équipements, chargé à chaque déploiement
 * (`tags:sync-catalog`) : idempotent, il ne ressuscite pas un refus et ne double pas un nom à la
 * casse près.
 */
class TagCatalogTest extends TestCase
{
    use RefreshDatabase;

    private function synchroniser(): void
    {
        app(TagCatalog::class)->synchroniser();
    }

    public function test_le_catalogue_cree_les_equipements_et_les_etiquettes_crm(): void
    {
        $this->synchroniser();

        $this->assertSame(count(TagCatalog::EQUIPEMENTS), Tag::query()->where('type', TagType::Amenity->value)->where('status', ReferentialStatus::Approved->value)->count());
        $this->assertSame(35, count(TagCatalog::EQUIPEMENTS));
        $this->assertSame(count(TagCatalog::CRM), Tag::query()->where('type', TagType::Crm->value)->count());
        $this->assertTrue(Tag::query()->where('name', 'Groupe électrogène')->exists());
    }

    public function test_un_ancien_feature_devient_un_equipement_sous_le_meme_identifiant(): void
    {
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'slug' => 'piscine', 'type' => TagType::Feature]);

        $this->synchroniser();

        $this->assertSame(TagType::Amenity, $piscine->refresh()->type);
        $this->assertSame(0, Tag::query()->where('type', TagType::Feature->value)->count());
        $this->assertSame(1, Tag::query()->where('name', 'Piscine')->count());
    }

    public function test_une_proposition_reprise_par_le_catalogue_est_approuvee(): void
    {
        $forage = Tag::factory()->create(['name' => 'forage', 'slug' => 'forage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => User::factory()->create()->id]);

        $this->synchroniser();

        $this->assertSame(ReferentialStatus::Approved, $forage->refresh()->status);
        $this->assertSame(1, Tag::query()->whereRaw('LOWER(name) = ?', ['forage'])->count());
    }

    public function test_un_refus_reste_un_refus(): void
    {
        $garage = Tag::factory()->create(['name' => 'Garage', 'slug' => 'garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);

        $this->synchroniser();

        $this->assertSame(ReferentialStatus::Rejected, $garage->refresh()->status);
    }

    public function test_deux_passages_ne_changent_rien(): void
    {
        $this->synchroniser();
        $avant = Tag::query()->orderBy('id')->get(['id', 'name', 'type', 'status'])->toArray();

        $this->artisan('tags:sync-catalog')->assertSuccessful();

        $this->assertSame($avant, Tag::query()->orderBy('id')->get(['id', 'name', 'type', 'status'])->toArray());
    }
}
```

`tests/Feature/Tags/TagVisibilityTest.php` :

```php
<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 — la liste des étiquettes : un équipement proposé n'apparaît qu'à son auteur (et à la
 * console) ; un refusé, à la console seulement. Le type `feature` ne se crée plus.
 */
class TagVisibilityTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<string> */
    private function noms(): array
    {
        return collect($this->getJson('/api/tags?filter[type]=amenity&per_page=100')->assertOk()->json('data'))->pluck('name')->sort()->values()->all();
    }

    public function test_un_agent_voit_les_approuves_et_ses_propositions(): void
    {
        $moi = $this->actingAsRole('agent');
        $autre = $this->actingAsRole('agent');
        Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Tag::factory()->create(['name' => 'Puits', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $moi->id]);
        Tag::factory()->create(['name' => 'Hammam', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $autre->id]);
        Tag::factory()->create(['name' => 'Garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);

        $this->actingAs($moi);

        $this->assertSame(['Piscine', 'Puits'], $this->noms());
        $this->assertSame('pending', collect($this->getJson('/api/tags?filter[type]=amenity')->json('data'))->firstWhere('name', 'Puits')['status']);
    }

    public function test_la_console_voit_tout(): void
    {
        Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Tag::factory()->create(['name' => 'Garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);
        $this->actingAsRole('super_admin');

        $this->assertSame(['Garage', 'Piscine'], $this->noms());
    }

    public function test_le_type_feature_ne_se_cree_plus(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/tags', ['name' => 'Cheminée', 'type' => 'feature'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('type');
        $tag = Tag::factory()->create(['type' => TagType::Amenity]);
        $this->patchJson("/api/tags/{$tag->id}", ['type' => 'feature'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('type');
    }
}
```

**Step 2 : rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Feature/Tags
```

Attendu : 8 échecs (`Class "App\Services\Tags\TagCatalog" not found` ; colonne `status`
inconnue ; le POST `feature` rend 201).

**Step 3 : la migration**

`database/migrations/2026_10_12_400200_add_status_to_tags_and_merge_features.php` :

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 (ADR-0061 §9) — les étiquettes se proposent et se modèrent, comme les quartiers ; et
 * `feature` se fond dans `amenity` : deux types disaient la même chose, et le formulaire ne
 * laissait cocher que l'un des deux.
 *
 * `string(16)` et non `enum()` (ADR-0007). Les noms d'index et de clé sont explicites (piège n°3).
 * La clé étrangère est indexée à la main (piège n°8).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tags', function (Blueprint $table) {
            $table->string('status', 16)->default('approved');
            $table->foreignId('created_by_id')->nullable()->constrained('users', 'id', 'tags_created_by_id_fk')->nullOnDelete();
            $table->index('status', 'tags_status_idx');
            $table->index('created_by_id', 'tags_created_by_id_idx');
        });

        DB::table('tags')->where('type', 'feature')->update(['type' => 'amenity', 'updated_at' => now()]);
    }

    /**
     * ⚠ La fusion `feature` → `amenity` n'est PAS défaite : rien ne dit plus, après elle, quelles
     * lignes étaient des `feature`. Le retour retire les colonnes ; les anciens `feature` restent
     * des `amenity`, ce qui est l'état que le formulaire sait afficher.
     */
    public function down(): void
    {
        Schema::table('tags', function (Blueprint $table) {
            $table->dropIndex('tags_created_by_id_idx');
            $table->dropIndex('tags_status_idx');
            $table->dropForeign('tags_created_by_id_fk');
            $table->dropColumn(['status', 'created_by_id']);
        });
    }
};
```

**Step 4 : le modèle — ⚠ HORS TERRITOIRE (`app/Models/Tag.php`)**

```
old:use App\Models\Bases\AbstractModel;
use App\Models\Enums\TagType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
new:use App\Models\Bases\AbstractModel;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
```

```
old:    protected $fillable = ['name', 'slug', 'type', 'icon', 'color', 'description'];

    protected $casts = [
        'type' => TagType::class,
    ];

    protected static array $requestFilterable = ['type'];

    protected static array $requestSortable = ['id', 'name', 'type'];

    protected static array $requestSearchFields = ['name'];

    protected static array $queryFields = ['id', 'name', 'slug', 'type', 'icon', 'color', 'description', 'created_at', 'updated_at'];
new:    protected $fillable = ['name', 'slug', 'type', 'icon', 'color', 'description', 'status', 'created_by_id'];

    /** TCK-633 — le défaut de la colonne, lisible avant la relecture de la ligne. */
    protected $attributes = [
        'status' => 'approved',
    ];

    protected $casts = [
        'type' => TagType::class,
        'status' => ReferentialStatus::class,
    ];

    protected static array $requestFilterable = ['type', 'status'];

    protected static array $requestSortable = ['id', 'name', 'type', 'created_at'];

    protected static array $requestSearchFields = ['name'];

    protected static array $queryFields = ['id', 'name', 'slug', 'type', 'icon', 'color', 'description', 'status', 'created_by_id', 'created_at', 'updated_at'];
```

```
old:    public function customers(): MorphToMany
    {
        return $this->morphedByMany(Customer::class, 'taggable');
    }
}
new:    public function customers(): MorphToMany
    {
        return $this->morphedByMany(Customer::class, 'taggable');
    }

    /** TCK-633 — l'auteur d'une proposition d'équipement. */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
```

**Step 5 : la liste — ⚠ HORS TERRITOIRE (`TagController`)**

Import :

```
old:use App\Models\Enums\TagType;
new:use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
```

Dans `index`, après le bloc CRM (L20-27) :

```
old:        $paginator = Tag::buildQuery($base, $request)
            ->defaultSort('name')
            ->paginate();
new:        // TCK-633 — hors console : les approuvés, plus les propositions de l'appelant.
        $appelant = $request->user();
        if (! $appelant?->isSuperAdmin()) {
            $base->where(fn ($q) => $q
                ->where('tags.status', ReferentialStatus::Approved->value)
                ->orWhere(fn ($q) => $q->where('tags.status', ReferentialStatus::Pending->value)->where('tags.created_by_id', $appelant?->id)));
        }

        $paginator = Tag::buildQuery($base, $request)
            ->defaultSort('name')
            ->paginate();
```

Dans `format` :

```
old:            'type' => $tag->type?->value,
            'icon' => $tag->icon,
            'color' => $tag->color,
            'description' => $tag->description,
new:            'type' => $tag->type?->value,
            'status' => $tag->status?->value,
            'created_by_id' => $tag->created_by_id,
            'icon' => $tag->icon,
            'color' => $tag->color,
            'description' => $tag->description,
```

**Step 6 : `feature` ne se crée plus — ⚠ HORS TERRITOIRE**

`StoreTagRequest.php` L41 :

```
old:            'type' => ['required', Rule::enum(TagType::class)],
new:            // TCK-633 (ADR-0061 §9) — `feature` est fondu dans `amenity` ; le cas reste dans
            // l'enum pour lire une base qui n'aurait pas encore migré.
            'type' => ['required', Rule::enum(TagType::class)->except([TagType::Feature])],
```

`UpdateTagRequest.php` L41 :

```
old:            'type' => ['sometimes', Rule::enum(TagType::class)],
new:            'type' => ['sometimes', Rule::enum(TagType::class)->except([TagType::Feature])],
```

**Step 7 : le catalogue**

`app/Services/Tags/TagCatalog.php` :

```php
<?php

namespace App\Services\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * TCK-633 (ADR-0061 §9) — le catalogue des équipements et des étiquettes CRM, VERSIONNÉ ici et
 * chargé à chaque déploiement par `tags:sync-catalog` (la production ne lance aucun seeder, E-2).
 *
 * Règles, dans l'ordre :
 *   1. tout `feature` devient `amenity` (même identifiant : les liaisons tiennent) ;
 *   2. un nom absent est créé, approuvé ;
 *   3. un nom présent EN ATTENTE (une proposition que le catalogue reprend) est approuvé ;
 *   4. un nom présent REFUSÉ le reste : un refus de modération ne se défait pas par déploiement.
 * Le nom se compare comme l'index `tags_name_lower_unique` : casse repliée par ICU.
 */
final class TagCatalog
{
    /** @var list<string> */
    public const EQUIPEMENTS = [
        'Piscine', 'Climatisation', 'Ascenseur', 'Parking', 'Garage', 'Balcon', 'Terrasse',
        'Toit-terrasse', 'Jardin', 'Cuisine équipée', 'Gardien', 'Vue sur mer', 'WiFi',
        'Fibre optique', 'TV', 'Machine à laver', 'Sèche-linge', 'Micro-ondes', 'Lave-vaisselle',
        'Sécurité 24/7', 'Caméras de surveillance', 'Portail électrique', 'Interphone',
        'Groupe électrogène', 'Panneaux solaires', 'Forage', 'Surpresseur', 'Citerne d\'eau',
        'Chauffe-eau', 'Ventilateurs', 'Moustiquaires', 'Chambre de bonne', 'Dépendance',
        'Salle de sport', 'Aire de jeux',
    ];

    /** @var list<string> */
    public const CRM = ['VIP', 'Prospect chaud', 'Étranger', 'Famille', 'Étudiant'];

    public function synchroniser(): void
    {
        DB::transaction(function () {
            Tag::query()->where('type', TagType::Feature->value)->update(['type' => TagType::Amenity->value, 'updated_at' => now()]);

            foreach (self::EQUIPEMENTS as $nom) {
                $this->assurer($nom, TagType::Amenity);
            }
            foreach (self::CRM as $nom) {
                $this->assurer($nom, TagType::Crm);
            }
        });
    }

    /** Un slug libre : `tags.slug` est unique tous types confondus. */
    public static function slugLibre(string $nom): string
    {
        $base = Str::limit(Str::slug($nom), 90, '') ?: 'etiquette';
        $slug = $base;
        for ($n = 2; Tag::query()->where('slug', $slug)->exists(); $n++) {
            $slug = $base.'-'.$n;
        }

        return $slug;
    }

    private function assurer(string $nom, TagType $type): void
    {
        $tag = Tag::query()->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])->first();

        if ($tag === null) {
            Tag::query()->create([
                'name' => $nom,
                'slug' => self::slugLibre($nom),
                'type' => $type,
                'status' => ReferentialStatus::Approved,
            ]);

            return;
        }

        if ($tag->status === ReferentialStatus::Pending) {
            $tag->forceFill(['status' => ReferentialStatus::Approved])->save();
        }
    }
}
```

`app/Console/Commands/TagsSyncCatalog.php` :

```php
<?php

namespace App\Console\Commands;

use App\Services\Tags\TagCatalog;
use Illuminate\Console\Command;

/** TCK-633 (ADR-0061 §9) — joué par `docker/release.sh` à chaque déploiement. Idempotent. */
class TagsSyncCatalog extends Command
{
    protected $signature = 'tags:sync-catalog';

    protected $description = 'Charge le catalogue versionné des équipements et des étiquettes CRM (idempotent).';

    public function handle(TagCatalog $catalogue): int
    {
        $catalogue->synchroniser();
        $this->info('Catalogue des étiquettes synchronisé.');

        return self::SUCCESS;
    }
}
```

`database/seeders/System/TagSeeder.php` (remplacé entier ; `run()` reste SANS paramètre :
`FilterCoverageTagsTest` L70-72 l'appelle par `app($classe)->run()`, sans injection) :

```php
<?php

namespace Database\Seeders\System;

use App\Services\Tags\TagCatalog;
use Illuminate\Database\Seeder;

/**
 * TCK-633 — le catalogue ne vit plus ici mais dans `TagCatalog`, que le déploiement charge aussi
 * (`tags:sync-catalog`). Une liste dans le seeder et une autre au déploiement divergeraient.
 */
class TagSeeder extends Seeder
{
    public function run(): void
    {
        app(TagCatalog::class)->synchroniser();
    }
}
```

**Step 8 : le déploiement — ⚠ HORS TERRITOIRE (`docker/release.sh`)**

Après la ligne `geo:sync-referential` de la tâche 4 :

```
old:SCOUT_QUEUE=false php artisan geo:sync-referential \
  || echo "AVERTISSEMENT : geo:sync-referential a échoué — référentiel géographique inchangé jusqu'au prochain déploiement." >&2
new:SCOUT_QUEUE=false php artisan geo:sync-referential \
  || echo "AVERTISSEMENT : geo:sync-referential a échoué — référentiel géographique inchangé jusqu'au prochain déploiement." >&2
php artisan tags:sync-catalog \
  || echo "AVERTISSEMENT : tags:sync-catalog a échoué — catalogue des équipements inchangé jusqu'au prochain déploiement." >&2
```

**Step 9 : le test de couverture du seeder — ⚠ HORS TERRITOIRE**

`tests/Feature/Seeders/FilterCoverageTagsTest.php` L153 : le seeder ne produit plus de
`feature`. `FilterCoverageSeeder::PROPERTY_TAG_TYPES` (L78) garde `Feature` — inoffensif, il ne
trouve plus de ligne de ce type (E-22).

```
old:        $this->assertSame([TagType::Amenity->value, TagType::Feature->value], $types);
new:        // TCK-633 — `feature` est fondu dans `amenity` (ADR-0061 §9).
        $this->assertSame([TagType::Amenity->value], $types);
```

**Step 10 : vert**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan migrate
php artisan test tests/Feature/Tags tests/Feature/Api/TagTest.php tests/Feature/Api/TagWriteAuthorizationTest.php tests/Feature/Api/PropertyTagsTest.php tests/Feature/Seeders/FilterCoverageTagsTest.php
cd /Users/aminethiam/Documents/perso/takussan && sh scripts/test-release-reindex.sh && node scripts/check-command-prefixes.mjs
```

Attendu : tout vert. `TagTest`, `TagWriteAuthorizationTest` et `PropertyTagsTest` créent des
`feature` par la FABRIQUE (pas par l'API) : ils restent verts, la valeur reste lisible.

**Step 11 : ablations**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && mkdir -p "$S/abl/t10"
F=app/Services/Tags/TagCatalog.php && cp $F "$S/abl/t10/catalog.php"
# a) le catalogue ressuscite un refus
sed -i '' 's/if (\$tag->status === ReferentialStatus::Pending) {/if ($tag->status !== ReferentialStatus::Approved) {/' $F
php artisan test tests/Feature/Tags/TagCatalogTest.php --filter=refus
cp "$S/abl/t10/catalog.php" $F && md5 -q $F "$S/abl/t10/catalog.php"
# b) la liste montre les propositions de tout le monde
C=app/Http/Controllers/Api/TagController.php && cp $C "$S/abl/t10/ctrl.php"
sed -i '' "s/->where('tags.created_by_id', \$appelant?->id)//" $C
php artisan test tests/Feature/Tags/TagVisibilityTest.php
cp "$S/abl/t10/ctrl.php" $C && md5 -q $C "$S/abl/t10/ctrl.php"
php artisan test tests/Feature/Tags
```

Attendu : a) 1 échec (`Rejected` attendu, `Approved` obtenu) ; b) 1 échec (`Hammam` apparaît) ;
`md5` identiques ; `8 passed`.

**Step 12 : Pint, signaler**

```bash
./vendor/bin/pint database/migrations/2026_10_12_400200_add_status_to_tags_and_merge_features.php app/Services/Tags/TagCatalog.php app/Console/Commands/TagsSyncCatalog.php database/seeders/System/TagSeeder.php app/Models/Tag.php app/Http/Controllers/Api/TagController.php app/Http/Requests/Api/StoreTagRequest.php app/Http/Requests/Api/UpdateTagRequest.php tests/Feature/Seeders/FilterCoverageTagsTest.php tests/Feature/Tags
```

Signaler : ces fichiers et `docker/release.sh` — en séparant les six fichiers HORS TERRITOIRE —,
`feat(api): un seul type d'équipement, catalogue versionné et statut de modération (TCK-633)`.

---

## Tâche 11 — Proposer un équipement depuis le formulaire (15 min) — ⚠ HORS TERRITOIRE (`PropertyTagController`)

Le corps de `POST /api/properties/{id}/tags` gagne `tag_names` : les libellés tapés qui ne
correspondent à aucun équipement de la liste. Chacun devient une proposition (`pending`, auteur
noté), visible de son auteur seul jusqu'à la modération ; un nom déjà connu (à la casse près)
reprend l'existant.

**Fichiers**
- Créer : `takussan-api/app/Services/Tags/TagProposals.php`
- Modifier : `takussan-api/app/Http/Requests/Api/SyncPropertyTagRequest.php` (`rules` L35-44)
- Modifier ⚠ HORS TERRITOIRE : `takussan-api/app/Http/Controllers/Api/PropertyTagController.php` (`sync` L26-37)
- Test : `takussan-api/tests/Feature/Tags/TagProposalTest.php`

**Step 1 : le test**

```php
<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0061 §9) — « Ajouter "Puits" » dans le champ des équipements : la proposition se
 * crée, s'attache au bien, et attend la modération. Le patron d'appel est celui de
 * `PropertyTagsTest` (le propriétaire du bien).
 */
class TagProposalTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create();
        $this->bien = Property::factory()->create(['user_id' => $this->owner->id]);
        Sanctum::actingAs($this->owner);
    }

    private function sync(array $corps): \Illuminate\Testing\TestResponse
    {
        return $this->postJson("/api/properties/{$this->bien->id}/tags", $corps + ['tag_ids' => []]);
    }

    public function test_un_nom_nouveau_devient_une_proposition_attachee(): void
    {
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);

        $this->sync(['tag_ids' => [$piscine->id], 'tag_names' => ['  Puits  ']])->assertOk()->assertJsonCount(2, 'data');

        $puits = Tag::query()->where('name', 'Puits')->firstOrFail();
        $this->assertSame(ReferentialStatus::Pending, $puits->status);
        $this->assertSame(TagType::Amenity, $puits->type);
        $this->assertSame($this->owner->id, $puits->created_by_id);
        $this->assertEqualsCanonicalizing([$piscine->id, $puits->id], $this->bien->refresh()->tags->pluck('id')->all());
    }

    public function test_un_nom_connu_a_la_casse_pres_reprend_l_existant(): void
    {
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);

        $this->sync(['tag_names' => ['PISCINE']])->assertOk();

        $this->assertSame(1, Tag::query()->count());
        $this->assertSame([$piscine->id], $this->bien->refresh()->tags->pluck('id')->all());
    }

    public function test_deux_auteurs_qui_proposent_le_meme_nom_partagent_la_proposition(): void
    {
        $this->sync(['tag_names' => ['Puits']])->assertOk();
        $autre = User::factory()->create();
        $sienne = Property::factory()->create(['user_id' => $autre->id]);
        Sanctum::actingAs($autre);

        $this->postJson("/api/properties/{$sienne->id}/tags", ['tag_ids' => [], 'tag_names' => ['puits']])->assertOk();

        $this->assertSame(1, Tag::query()->whereRaw('LOWER(name) = ?', ['puits'])->count());
    }

    public function test_un_nom_refuse_n_est_ni_recree_ni_attache(): void
    {
        Tag::factory()->create(['name' => 'Garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);

        $this->sync(['tag_names' => ['Garage']])->assertOk()->assertJsonCount(0, 'data');

        $this->assertSame(1, Tag::query()->where('name', 'Garage')->count());
    }

    public function test_un_nom_pris_par_une_etiquette_crm_est_refuse(): void
    {
        Tag::factory()->create(['name' => 'VIP', 'type' => TagType::Crm]);

        $this->sync(['tag_names' => ['vip']])->assertUnprocessable()->assertJsonPath('code', 'tags.name_taken');
    }

    public function test_un_equipement_refuse_ne_s_attache_pas_par_son_identifiant(): void
    {
        $garage = Tag::factory()->create(['name' => 'Garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);

        $this->sync(['tag_ids' => [$garage->id]])->assertUnprocessable()->assertJsonValidationErrors('tag_ids.0');
    }

    public function test_les_bornes_des_noms(): void
    {
        $this->sync(['tag_names' => array_map(fn ($i) => "Équipement {$i}", range(1, 21))])->assertUnprocessable()->assertJsonValidationErrors('tag_names');
        $this->sync(['tag_names' => [str_repeat('a', 101)]])->assertUnprocessable()->assertJsonValidationErrors('tag_names.0');
        $this->sync(['tag_names' => ['', '   ']])->assertOk()->assertJsonCount(0, 'data');
    }
}
```

**Step 2 : rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Feature/Tags/TagProposalTest.php
```

Attendu : 6 échecs (`tag_names` ignoré : rien n'est créé ; le refusé s'attache par son id) ;
`test_un_nom_refuse_n_est_ni_recree_ni_attache` passe déjà (rien n'est créé — vert par vacuité,
c'est l'ablation b qui le juge).

**Step 3 : la requête**

`SyncPropertyTagRequest.php` — imports :

```
old:use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\TagType;
new:use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
```

```
old:            'tag_ids.*' => [
                'integer',
                Rule::exists('tags', 'id')->where(fn ($q) => $q->where('type', TagType::Amenity->value)),
            ],
        ];
new:            'tag_ids.*' => [
                'integer',
                // TCK-633 — un équipement refusé ne s'attache plus, même par son identifiant.
                Rule::exists('tags', 'id')->where(fn ($q) => $q
                    ->where('type', TagType::Amenity->value)
                    ->where('status', '<>', ReferentialStatus::Rejected->value)),
            ],
            // TCK-633 (ADR-0061 §9) — les équipements TAPÉS, absents de la liste : des propositions.
            'tag_names' => ['sometimes', 'array', 'max:20'],
            'tag_names.*' => ['nullable', 'string', 'max:100'],
        ];
```

**Step 4 : le service**

`app/Services/Tags/TagProposals.php` :

```php
<?php

namespace App\Services\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Models\User;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 (ADR-0061 §9) — des noms tapés aux identifiants d'équipements.
 *
 *   · un nom connu, à la casse près (index `tags_name_lower_unique`) : l'existant — sauf s'il est
 *     REFUSÉ (ignoré : la modération a tranché) ou d'un autre type (422 `tags.name_taken` : le nom
 *     est unique tous types confondus) ;
 *   · un nom nouveau : une proposition `pending`, auteur noté.
 *
 * L'insertion passe par `insertOrIgnore` et non `create()` + `catch` : deux propositions
 * simultanées du même nom se croisent sur l'index unique, et sous PostgreSQL l'exception
 * attrapée ABANDONNE la transaction de la requête (piège n°1). Le second relit la ligne du premier.
 */
final class TagProposals
{
    private const ESSAIS = 3;

    /**
     * @param  array<int, string|null>  $noms
     * @return list<int>
     */
    public function resoudre(array $noms, User $auteur): array
    {
        $ids = [];
        $vus = [];

        foreach ($noms as $brut) {
            $nom = trim((string) preg_replace('/\s+/u', ' ', (string) $brut));
            $cle = CaseInsensitive::fold($nom);
            if ($nom === '' || isset($vus[$cle])) {
                continue;
            }
            $vus[$cle] = true;

            $tag = $this->parNom($nom) ?? $this->proposer($nom, $auteur);
            abort_code_if($tag->type !== TagType::Amenity, 422, 'tags.name_taken');
            if ($tag->status !== ReferentialStatus::Rejected) {
                $ids[] = $tag->id;
            }
        }

        return $ids;
    }

    private function parNom(string $nom): ?Tag
    {
        return Tag::query()->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])->first();
    }

    private function proposer(string $nom, User $auteur): Tag
    {
        for ($essai = 0; $essai < self::ESSAIS; $essai++) {
            $maintenant = now();
            DB::table('tags')->insertOrIgnore([
                'name' => $nom,
                'slug' => TagCatalog::slugLibre($nom),
                'type' => TagType::Amenity->value,
                'status' => ReferentialStatus::Pending->value,
                'created_by_id' => $auteur->id,
                'created_at' => $maintenant,
                'updated_at' => $maintenant,
            ]);
            $tag = $this->parNom($nom);
            if ($tag !== null) {
                return $tag;
            }
            // Ignorée sur le SLUG (une autre proposition l'a pris entre-temps) : on recalcule.
        }

        abort_code(422, 'tags.name_taken');
    }
}
```

**Step 5 : le contrôleur — ⚠ HORS TERRITOIRE (`PropertyTagController`)**

```
old:use App\Models\Tag;
new:use App\Models\Tag;
use App\Services\Tags\TagProposals;
```

```
old:    public function sync(SyncPropertyTagRequest $request, Property $property): JsonResponse
    {
        $data = $request->validated();

        $horsPerimetre = $property->tags()
            ->where('tags.type', '!=', TagType::Amenity->value)
            ->pluck('tags.id')
            ->all();

        $property->tags()->sync([...$horsPerimetre, ...$data['tag_ids']]);
new:    public function sync(SyncPropertyTagRequest $request, Property $property, TagProposals $propositions): JsonResponse
    {
        $data = $request->validated();

        $horsPerimetre = $property->tags()
            ->where('tags.type', '!=', TagType::Amenity->value)
            ->pluck('tags.id')
            ->all();

        // TCK-633 (ADR-0061 §9) — les équipements tapés deviennent des propositions.
        $proposes = $propositions->resoudre($data['tag_names'] ?? [], $request->user());

        $property->tags()->sync(array_values(array_unique([...$horsPerimetre, ...$data['tag_ids'], ...$proposes])));
```

**Step 6 : vert**

```bash
php artisan test tests/Feature/Tags/TagProposalTest.php tests/Feature/Api/PropertyTagsTest.php
cd /Users/aminethiam/Documents/perso/takussan && node scripts/check-inline-validation.mjs
```

Attendu : `7 passed`, `PropertyTagsTest` vert, garde verte. ⚠ `abort_code(422, 'tags.name_taken')`
lit sa clé dans `lang/*/errors.php`, ajoutée en tâche 12 : d'ici là, le message est la clé brute
(`assertJsonPath('code', …)` reste vrai).

**Step 7 : ablations**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && mkdir -p "$S/abl/t11" && F=app/Services/Tags/TagProposals.php && cp $F "$S/abl/t11/p.php"
# a) un nom tapé crée toujours une ligne neuve (pas de recherche par nom)
sed -i '' 's/\$tag = \$this->parNom(\$nom) ?? \$this->proposer(\$nom, \$auteur);/$tag = $this->proposer($nom.random_int(1, 9999), $auteur);/' $F
php artisan test tests/Feature/Tags/TagProposalTest.php
cp "$S/abl/t11/p.php" $F && md5 -q $F "$S/abl/t11/p.php"
# b) un refusé s'attache quand même
sed -i '' 's/if (\$tag->status !== ReferentialStatus::Rejected) {/if (true) {/' $F
php artisan test tests/Feature/Tags/TagProposalTest.php --filter=refuse_n_est
cp "$S/abl/t11/p.php" $F && md5 -q $F "$S/abl/t11/p.php"
php artisan test tests/Feature/Tags/TagProposalTest.php
```

Attendu : a) 4 échecs au moins (`Puits` introuvable sous son nom, doublon de `Piscine`, deux
propositions, `vip` accepté) ; b) 1 échec (`assertJsonCount(0)` : 1) ; `md5` identiques ;
`7 passed`.

**Step 8 : Pint, signaler**

```bash
./vendor/bin/pint app/Services/Tags/TagProposals.php app/Http/Requests/Api/SyncPropertyTagRequest.php app/Http/Controllers/Api/PropertyTagController.php tests/Feature/Tags/TagProposalTest.php
```

Signaler : ces 4 fichiers (dont `PropertyTagController` HORS TERRITOIRE),
`feat(api): proposer un équipement depuis le formulaire du bien (TCK-633)`.

---

## Tâche 12 — La modération des équipements proposés (15 min)

**Fichiers**
- Créer : `takussan-api/app/Services/Tags/TagModeration.php`
- Créer : `takussan-api/app/Http/Controllers/Api/Admin/TagModerationAdminController.php`
- Créer : `takussan-api/app/Http/Requests/Admin/TagRenameRequest.php`, `TagMergeRequest.php`
- Modifier : `takussan-api/routes/api/tags.php` (13 lignes, lu en entier)
- Modifier : `takussan-api/lang/{fr,en,wo}/errors.php` — co-tenu, Edit avant `    'task' => [` (fr L496)
- Test : `takussan-api/tests/Feature/Tags/TagModerationTest.php`

Avant tout, vérifier qu'aucune route `admin/tags` n'existe :

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && grep -rn "admin/tags\|'tags'" routes/api/admin.php
```

Attendu : aucune ligne.

**Step 1 : le test**

```php
<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0061 §9) — la file des équipements proposés. Un refus DÉTACHE (la fiche ne doit
 * plus afficher un libellé que la modération a écarté) ; une fusion déplace les liaisons vers la
 * cible et supprime la source.
 */
class TagModerationTest extends TestCase
{
    use RefreshDatabase;

    private User $auteur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->auteur = User::factory()->create();
    }

    private function proposition(string $nom): Tag
    {
        return Tag::factory()->create(['name' => $nom, 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $this->auteur->id]);
    }

    public function test_un_agent_n_entre_pas_dans_la_file(): void
    {
        $this->actingAsRole('agent');
        $t = $this->proposition('Puits');

        $this->getJson('/api/admin/tags/proposals')->assertForbidden();
        $this->postJson("/api/admin/tags/{$t->id}/approve")->assertForbidden();
    }

    public function test_la_file_liste_les_propositions(): void
    {
        $this->actingAsRole('super_admin');
        $t = $this->proposition('Puits');
        Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Property::factory()->create()->tags()->attach($t);

        $this->getJson('/api/admin/tags/proposals?filter[status]=pending')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Puits')
            ->assertJsonPath('data.0.created_by.id', $this->auteur->id)
            ->assertJsonPath('data.0.properties_count', 1);
    }

    public function test_approuver_puis_reapprouver(): void
    {
        $this->actingAsRole('super_admin');
        $t = $this->proposition('Puits');

        $this->postJson("/api/admin/tags/{$t->id}/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        $this->postJson("/api/admin/tags/{$t->id}/approve")->assertStatus(409)->assertJsonPath('code', 'tags.not_pending');
    }

    public function test_refuser_detache_des_biens(): void
    {
        $this->actingAsRole('super_admin');
        $t = $this->proposition('Puits');
        $bien = Property::factory()->create();
        $bien->tags()->attach($t);

        $this->postJson("/api/admin/tags/{$t->id}/reject")->assertOk()->assertJsonPath('data.status', 'rejected');

        $this->assertCount(0, $bien->refresh()->tags);
        $this->assertTrue(Tag::query()->whereKey($t->id)->exists());
    }

    public function test_renommer_et_le_nom_pris(): void
    {
        $this->actingAsRole('super_admin');
        Tag::factory()->create(['name' => 'VIP', 'type' => TagType::Crm]);
        $t = $this->proposition('puit');

        $this->patchJson("/api/admin/tags/{$t->id}", ['name' => 'Puits'])->assertOk()->assertJsonPath('data.name', 'Puits');
        $this->patchJson("/api/admin/tags/{$t->id}", ['name' => 'vip'])->assertStatus(409)->assertJsonPath('code', 'tags.name_taken');
    }

    public function test_fusionner_deplace_les_liaisons_sans_doublon(): void
    {
        $this->actingAsRole('super_admin');
        $cible = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        $source = $this->proposition('Piscine privée');
        $a = Property::factory()->create();
        $b = Property::factory()->create();
        $a->tags()->attach($source);
        $b->tags()->attach([$source->id, $cible->id]);

        $this->postJson("/api/admin/tags/{$source->id}/merge", ['into_id' => $cible->id])->assertOk()->assertJsonPath('data.id', $cible->id);

        $this->assertFalse(Tag::query()->whereKey($source->id)->exists());
        $this->assertSame([$cible->id], $a->refresh()->tags->pluck('id')->all());
        $this->assertSame([$cible->id], $b->refresh()->tags->pluck('id')->all());
    }

    public function test_les_fusions_impossibles(): void
    {
        $this->actingAsRole('super_admin');
        $t = $this->proposition('Puits');
        $crm = Tag::factory()->create(['name' => 'VIP', 'type' => TagType::Crm]);
        $refuse = Tag::factory()->create(['name' => 'Garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);

        $this->postJson("/api/admin/tags/{$t->id}/merge", ['into_id' => $t->id])->assertUnprocessable()->assertJsonPath('code', 'tags.merge_into_self');
        $this->postJson("/api/admin/tags/{$t->id}/merge", ['into_id' => $crm->id])->assertUnprocessable()->assertJsonPath('code', 'tags.merge_target_invalid');
        $this->postJson("/api/admin/tags/{$t->id}/merge", ['into_id' => $refuse->id])->assertUnprocessable()->assertJsonPath('code', 'tags.merge_target_invalid');
        $this->assertTrue(Tag::query()->whereKey($t->id)->exists());
    }
}
```

**Step 2 : rouge**

```bash
php artisan test tests/Feature/Tags/TagModerationTest.php
```

Attendu : 7 échecs (`404`).

**Step 3 : les messages — co-tenu, Edit seulement**

`lang/fr/errors.php` :

```
old:    'task' => [
new:    'tags' => [
        'merge_into_self' => 'Un équipement ne se fusionne pas avec lui-même.',
        'merge_target_invalid' => 'La cible doit être un équipement approuvé ou en attente.',
        'name_taken' => 'Ce nom est déjà utilisé par une autre étiquette.',
        'not_pending' => 'Cet équipement n\'est plus en attente de modération.',
    ],
    'task' => [
```

`lang/en/errors.php` :

```
old:    'task' => [
new:    'tags' => [
        'merge_into_self' => 'An amenity cannot be merged into itself.',
        'merge_target_invalid' => 'The target must be an approved or pending amenity.',
        'name_taken' => 'This name is already used by another tag.',
        'not_pending' => 'This amenity is no longer awaiting moderation.',
    ],
    'task' => [
```

`lang/wo/errors.php` (⚠ brouillon à faire relire) :

```
old:    'task' => [
new:    'tags' => [
        'merge_into_self' => 'Benn jumtukaay du boole ak boppam.',
        'merge_target_invalid' => 'Li ñu jëm war na doon jumtukaay bu ñu nangu walla buy xaar.',
        'name_taken' => 'Tur wii, beneen etiket jël na ko ba noppi.',
        'not_pending' => 'Jumtukaay bii nekkatul di xaar ñu saytu ko.',
    ],
    'task' => [
```

**Step 4 : le service**

`app/Services/Tags/TagModeration.php` :

```php
<?php

namespace App\Services\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use App\Services\Geo\GeoReindexation;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 (ADR-0061 §9) — les décisions de la file des équipements. La recherche indexe les NOMS
 * des étiquettes d'un bien (`Property::toSearchableArray`) : un refus, un renommage et une fusion
 * réindexent les biens touchés, APRÈS la transaction.
 */
final class TagModeration
{
    public function __construct(private readonly GeoReindexation $reindexation) {}

    public function approuver(Tag $tag, User $par): Tag
    {
        DB::transaction(function () use ($tag) {
            $ligne = $this->verrouiller($tag);
            $this->exigerEnAttente($ligne);
            $ligne->forceFill(['status' => ReferentialStatus::Approved])->save();
        });
        $this->journaliser($tag, $par, 'super_admin_tag_approved', [], 'Équipement approuvé');

        return $tag->refresh();
    }

    public function rejeter(Tag $tag, User $par): Tag
    {
        $biens = DB::transaction(function () use ($tag) {
            $ligne = $this->verrouiller($tag);
            $this->exigerEnAttente($ligne);
            $ligne->forceFill(['status' => ReferentialStatus::Rejected])->save();
            $biens = $this->biensDe($ligne);
            DB::table('taggables')->where('tag_id', $ligne->getKey())->delete();

            return $biens;
        });
        $this->reindexation->biens($biens);
        $this->journaliser($tag, $par, 'super_admin_tag_rejected', [], 'Équipement refusé');

        return $tag->refresh();
    }

    public function renommer(Tag $tag, string $nom, User $par): Tag
    {
        $nom = trim((string) preg_replace('/\s+/u', ' ', $nom));
        $ancien = $tag->name;

        $biens = DB::transaction(function () use ($tag, $nom) {
            $ligne = $this->verrouiller($tag);
            $pris = Tag::query()->whereKeyNot($ligne->getKey())
                ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])
                ->exists();
            abort_code_if($pris, 409, 'tags.name_taken');
            $ligne->forceFill(['name' => $nom])->save();

            return $this->biensDe($ligne);
        });
        $this->reindexation->biens($biens);
        $this->journaliser($tag, $par, 'super_admin_tag_renamed', ['from' => $ancien, 'to' => $nom], 'Équipement renommé');

        return $tag->refresh();
    }

    public function fusionner(Tag $source, Tag $cible, User $par): Tag
    {
        abort_code_if($source->is($cible), 422, 'tags.merge_into_self');

        $biens = DB::transaction(function () use ($source, $cible) {
            foreach ($source->getKey() < $cible->getKey() ? [$source, $cible] : [$cible, $source] as $ligne) {
                $this->verrouiller($ligne);
            }
            $cbl = Tag::query()->findOrFail($cible->getKey());
            abort_code_if(
                $cbl->type !== TagType::Amenity || $cbl->status === ReferentialStatus::Rejected,
                422,
                'tags.merge_target_invalid',
            );

            $biens = $this->biensDe($source);
            DB::table('taggables')->insertOrIgnoreUsing(
                ['tag_id', 'taggable_id', 'taggable_type', 'created_at', 'updated_at'],
                DB::table('taggables')
                    ->selectRaw('?, taggable_id, taggable_type, now(), now()', [$cbl->getKey()])
                    ->where('tag_id', $source->getKey()),
            );
            // La suppression emporte les liaisons de la source (`cascadeOnDelete`).
            Tag::query()->whereKey($source->getKey())->delete();

            return $biens;
        });
        $this->reindexation->biens($biens);
        $this->journaliser($cible, $par, 'super_admin_tag_merged', ['from_id' => $source->getKey(), 'from_name' => $source->name], 'Équipement fusionné');

        return $cible->refresh();
    }

    private function verrouiller(Tag $tag): Tag
    {
        return Tag::query()->whereKey($tag->getKey())->lockForUpdate()->firstOrFail();
    }

    private function exigerEnAttente(Tag $ligne): void
    {
        abort_code_if($ligne->status !== ReferentialStatus::Pending, 409, 'tags.not_pending');
    }

    /** @return list<int> */
    private function biensDe(Tag $tag): array
    {
        return DB::table('taggables')
            ->where('tag_id', $tag->getKey())
            ->where('taggable_type', Property::class)
            ->pluck('taggable_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /** @param  array<string, mixed>  $details */
    private function journaliser(Tag $tag, User $par, string $evenement, array $details, string $libelle): void
    {
        activity('Admin')
            ->performedOn($tag)
            ->causedBy($par)
            ->withProperties(['tag_id' => $tag->getKey(), 'name' => $tag->name] + $details)
            ->event($evenement)
            ->log($libelle);
    }
}
```

**Step 5 : les requêtes et le contrôleur**

`app/Http/Requests/Admin/TagRenameRequest.php` :

```php
<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 — renommer un équipement (console super-admin). */
class TagRenameRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['name' => ['required', 'string', 'max:100']];
    }
}
```

`app/Http/Requests/Admin/TagMergeRequest.php` :

```php
<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 — fusionner un équipement proposé dans un autre. */
class TagMergeRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['into_id' => ['required', 'integer', 'exists:tags,id']];
    }
}
```

`app/Http/Controllers/Api/Admin/TagModerationAdminController.php` :

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Admin\TagMergeRequest;
use App\Http\Requests\Admin\TagRenameRequest;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Services\Tags\TagModeration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** TCK-633 (ADR-0061 §9) — la file des équipements proposés, sous `super-admin`. */
class TagModerationAdminController extends Controller
{
    public function __construct(private readonly TagModeration $moderation) {}

    public function proposals(Request $request): JsonResponse
    {
        $base = Tag::query()
            ->where('type', TagType::Amenity->value)
            ->with('createdBy')
            ->withCount('properties');

        $paginator = Tag::buildQuery($base, $request)->defaultSort('-created_at')->paginate();

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (Tag $t) => $this->format($t))->values());
    }

    public function approve(Request $request, Tag $tag): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->approuver($tag, $request->user()))]);
    }

    public function reject(Request $request, Tag $tag): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->rejeter($tag, $request->user()))]);
    }

    public function rename(TagRenameRequest $request, Tag $tag): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->renommer($tag, (string) $request->validated('name'), $request->user()))]);
    }

    public function merge(TagMergeRequest $request, Tag $tag): JsonResponse
    {
        $cible = Tag::query()->findOrFail((int) $request->validated('into_id'));

        return $this->json(['data' => $this->format($this->moderation->fusionner($tag, $cible, $request->user()))]);
    }

    /** @return array<string, mixed> */
    private function format(Tag $t): array
    {
        $t->loadMissing('createdBy');

        return [
            'id' => $t->id,
            'name' => $t->name,
            'slug' => $t->slug,
            'type' => $t->type?->value,
            'status' => $t->status?->value,
            'created_by' => $t->createdBy !== null ? ['id' => $t->createdBy->id, 'name' => trim($t->createdBy->first_name.' '.$t->createdBy->last_name)] : null,
            'properties_count' => (int) ($t->properties_count ?? $t->properties()->count()),
            'created_at' => $t->created_at?->toIso8601String(),
        ];
    }
}
```

**Step 6 : les routes — `routes/api/tags.php`**

```
old:use App\Http\Controllers\Api\TagController;
use Illuminate\Support\Facades\Route;
new:use App\Http\Controllers\Api\Admin\TagModerationAdminController;
use App\Http\Controllers\Api\TagController;
use Illuminate\Support\Facades\Route;
```

```
old:    Route::delete('tags/{tag}', [TagController::class, 'destroy'])->name('tags.destroy');
});
new:    Route::delete('tags/{tag}', [TagController::class, 'destroy'])->name('tags.destroy');
});

// TCK-633 (ADR-0061 §9) — la file des équipements proposés : super-admin seulement.
Route::middleware(['auth:sanctum', 'super-admin'])->prefix('admin/tags')->name('admin.tags.')->group(function () {
    Route::get('proposals', [TagModerationAdminController::class, 'proposals'])->name('proposals');
    Route::post('{tag}/approve', [TagModerationAdminController::class, 'approve'])->name('approve');
    Route::post('{tag}/reject', [TagModerationAdminController::class, 'reject'])->name('reject');
    Route::patch('{tag}', [TagModerationAdminController::class, 'rename'])->name('rename');
    Route::post('{tag}/merge', [TagModerationAdminController::class, 'merge'])->name('merge');
});
```

**Step 7 : vert**

```bash
php artisan test tests/Feature/Tags tests/Feature/Admin/Platform/PlatformRoutesDefaultDenyTest.php tests/Unit/Lang/LangGroupParityTest.php
```

Attendu : tout vert.

**Step 8 : ablations**

```bash
mkdir -p "$S/abl/t12" && F=app/Services/Tags/TagModeration.php && cp $F "$S/abl/t12/m.php"
# a) un refus ne détache pas
sed -i '' "s/DB::table('taggables')->where('tag_id', \$ligne->getKey())->delete();//" $F
php artisan test tests/Feature/Tags/TagModerationTest.php --filter=detache
cp "$S/abl/t12/m.php" $F && md5 -q $F "$S/abl/t12/m.php"
# b) une fusion qui ne recopie pas les liaisons
perl -0pi -e 's/DB::table\(.taggables.\)->insertOrIgnoreUsing\(.*?\n            \);\n//s' $F
php artisan test tests/Feature/Tags/TagModerationTest.php --filter=sans_doublon
cp "$S/abl/t12/m.php" $F && md5 -q $F "$S/abl/t12/m.php"
php artisan test tests/Feature/Tags/TagModerationTest.php
```

Attendu : a) 1 échec (1 tag au lieu de 0) ; b) 1 échec (`$a` n'a plus aucun tag) ; `md5`
identiques ; `7 passed`.

**Step 9 : Pint, signaler**

```bash
./vendor/bin/pint app/Services/Tags/TagModeration.php app/Http/Controllers/Api/Admin/TagModerationAdminController.php app/Http/Requests/Admin/TagRenameRequest.php app/Http/Requests/Admin/TagMergeRequest.php routes/api/tags.php lang/fr/errors.php lang/en/errors.php lang/wo/errors.php tests/Feature/Tags/TagModerationTest.php
```

Signaler : ces 9 fichiers, `feat(api): modération des équipements proposés (TCK-633)`.

---

## Tâche 13 — Ce que la ressource du bien expose au formulaire (10 min) — ⚠ HORS TERRITOIRE (`PropertyResource`)

Le formulaire de modification (tâche 23) doit retrouver les identifiants du référentiel ; il doit
savoir si l'agence du bien est un indépendant (frais d'agence masqués) ; la liste des
équipements du bien doit dire lesquels sont encore des propositions.

**Fichiers**
- Modifier ⚠ HORS TERRITOIRE : `takussan-api/app/Http/Resources/PropertyResource.php` —
  `tags` (L170-177), `buildLocation` (L279-296), `buildAgency` (L409-432)
- Test : `takussan-api/tests/Feature/Geo/PropertyResourceGeoTest.php`

**Step 1 : le test**

```php
<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\Tag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 — les champs de `PropertyResource` dont le formulaire du bien a besoin. */
class PropertyResourceGeoTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_fiche_porte_les_identifiants_du_referentiel_le_type_d_agence_et_le_statut_des_equipements(): void
    {
        $agence = Agency::factory()->individual()->create();
        $ville = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $quartier = GeoNeighborhood::factory()->for($ville, 'city')->create(['slug' => 'mermoz', 'name' => 'Mermoz']);
        $bien = Property::factory()->published()->create(['agency_id' => $agence->id]);
        Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => $bien->id,
            'geo_city_id' => $ville->id, 'geo_neighborhood_id' => $quartier->id,
            'city' => 'Dakar', 'neighborhood' => 'Mermoz',
        ]);
        $bien->tags()->attach(Tag::factory()->create(['name' => 'Puits', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending]));

        $this->getJson("/api/public/properties/{$bien->slug}")
            ->assertOk()
            ->assertJsonPath('data.location.geo_city_id', $ville->id)
            ->assertJsonPath('data.location.geo_neighborhood_id', $quartier->id)
            ->assertJsonPath('data.location.quarter', 'Mermoz')
            ->assertJsonPath('data.agency.kind', 'individual')
            ->assertJsonPath('data.tags.0.status', 'pending');
    }
}
```

**Step 2 : rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && php artisan test tests/Feature/Geo/PropertyResourceGeoTest.php
```

Attendu : 1 échec (`data.location.geo_city_id` absent → `null`).

**Step 3 : la ressource**

```
old:                'type' => $tag->type?->value,
                'icon' => $tag->icon,
                'color' => $tag->color,
            ])->values()->all()),
new:                'type' => $tag->type?->value,
                // TCK-633 — une proposition d'équipement s'affiche « en attente » dans le formulaire.
                'status' => $tag->status?->value,
                'icon' => $tag->icon,
                'color' => $tag->color,
            ])->values()->all()),
```

```
old:            'latitude' => $address?->latitude !== null ? (float) $address->latitude : null,
            'longitude' => $address?->longitude !== null ? (float) $address->longitude : null,
        ];
    }

    private function computeAverageRating(): ?float
new:            'latitude' => $address?->latitude !== null ? (float) $address->latitude : null,
            'longitude' => $address?->longitude !== null ? (float) $address->longitude : null,
            // TCK-633 (ADR-0062) — le rattachement au référentiel, relu par le formulaire.
            'geo_city_id' => $address?->geo_city_id,
            'geo_neighborhood_id' => $address?->geo_neighborhood_id,
        ];
    }

    private function computeAverageRating(): ?float
```

```
old:            'verified' => (bool) $agency->is_verified,
            'rating' => $agencyRating !== null ? round((float) $agencyRating, 2) : null,
        ];
new:            'verified' => (bool) $agency->is_verified,
            'rating' => $agencyRating !== null ? round((float) $agencyRating, 2) : null,
            // TCK-633 (AC4) — un indépendant ne facture pas de frais d'agence : le formulaire masque le champ.
            'kind' => $agency->kind?->value,
        ];
```

**Step 4 : vert, et les tests de forme de la ressource**

```bash
php artisan test tests/Feature/Geo/PropertyResourceGeoTest.php tests/Feature/Public/PropertyResourceSparseFieldsTest.php tests/Feature/Api/Property/PropertyEntryCostAndTourTest.php
cd /Users/aminethiam/Documents/perso/takussan && node scripts/check-resource-date-format.mjs
```

Attendu : tout vert (aucune date ajoutée).

**Step 5 : ablation**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api && mkdir -p "$S/abl/t13" && F=app/Http/Resources/PropertyResource.php && cp $F "$S/abl/t13/r.php"
sed -i '' "s/'kind' => \$agency->kind?->value,//" $F
php artisan test tests/Feature/Geo/PropertyResourceGeoTest.php
cp "$S/abl/t13/r.php" $F && md5 -q $F "$S/abl/t13/r.php" && php artisan test tests/Feature/Geo/PropertyResourceGeoTest.php
```

Attendu : 1 échec (`data.agency.kind`) ; `md5` identiques ; `1 passed`.

**Step 6 : Pint, signaler**

```bash
./vendor/bin/pint app/Http/Resources/PropertyResource.php tests/Feature/Geo/PropertyResourceGeoTest.php
```

Signaler : ces 2 fichiers (`PropertyResource` HORS TERRITOIRE),
`feat(api): la fiche expose le rattachement géographique, le type d'agence et le statut des équipements (TCK-633)`.

---

## Tâche 14 — Les libellés (fr, en, wo) (15 min) — ⚠ clés HORS de l'espace de D signalées

Les trois dictionnaires sont co-tenus par tous les lots. On n'y écrit pas à la main : un script
hors dépôt **insère** des clés à un chemin donné, **refuse** d'écraser une clé existante qui
diffère (sauf les deux remplacements listés), et vérifie que le fichier ressort avec la même mise
en forme. Mesuré le 2026-10-12 : `JSON.stringify(JSON.parse(f), null, 2) + '\n'` rend
**exactement** chacun des trois fichiers (431 170, 409 822 et 402 544 octets) — l'insertion ne
touche donc que les lignes ajoutées.

Espaces touchés :

| Chemin | Nature | Territoire |
|---|---|---|
| `property.form.features.{notSpecified,floorBasement,floorGround}` | ajout | D |
| `property.form.address.*` (nouveau, après `features`) | ajout | D (E-15) |
| `property.form.amenities.{placeholder,create,empty,pending,remove}` | ajout | D |
| `superAdmin.propositions.*` (nouveau, en fin d'objet) | ajout | D |
| `nav.superAdmin.items.{geoProposals,tagProposals}` (après `tags`) | ajout | ⚠ hors espace |
| `property.wizard.preview.entryTotal` (après `entryNote`) | ajout | ⚠ hors espace |
| `property.wizard.preview.entryNote` | **remplacement** | ⚠ hors espace |
| `property.wizard.geoDefaultsNote` | **remplacement** | ⚠ hors espace (E-16) |

Il n'existe pas d'espace `amenities` de premier niveau : « `amenities.*` » du plan maître est lu
comme `property.form.amenities`. Les valeurs wolof sont des **brouillons** (cf. « Écarts »,
E-23) ; elles évitent le repli silencieux sur le français que `check-i18n` existe pour empêcher.

**Fichiers**
- Modifier : `takussan-web/src/messages/fr.json`, `en.json`, `wo.json` — co-tenus
- Modifier : `takussan-web/src/i18n/namespaces.json` — régénéré par sa garde (⚠ hors territoire)

**Step 1 : le script d'insertion (hors dépôt)**

`$S/i18n-lot-d.mjs` :

```js
// TCK-633 lot D — insère les libellés du lot dans les trois dictionnaires. Hors dépôt.
// Usage : node i18n-lot-d.mjs <dossier src/messages> [--verifier]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , dossier, option] = process.argv;
const verifierSeulement = option === '--verifier';

/** [chemin du parent, clé, clé après laquelle insérer (null = en fin d'objet), { fr, en, wo }] */
const AJOUTS = [
  ['property.form.features', 'notSpecified', 'hintFull', { fr: 'Non précisé', en: 'Not specified', wo: 'Wàxuñu ko' }],
  ['property.form.features', 'floorBasement', 'notSpecified', { fr: 'Sous-sol', en: 'Basement', wo: 'Suuf-kër' }],
  ['property.form.features', 'floorGround', 'floorBasement', { fr: 'Rez-de-chaussée', en: 'Ground floor', wo: 'Rez-de-chaussée' }],
  ['property.form', 'address', 'features', {
    fr: {
      region: 'Région', city: 'Ville', quarter: 'Quartier',
      regionPlaceholder: 'Choisir une région', cityPlaceholder: 'Rechercher une ville',
      quarterPlaceholder: 'Rechercher ou saisir un quartier', noResults: 'Aucun résultat',
      create: 'Ajouter « {name} »',
      newNeighborhoodHint: 'Nouveau quartier : notre équipe le vérifiera. Votre annonce l’affiche dès maintenant.',
      pasteLabel: 'Coller un lien ou une position',
      pastePlaceholder: 'Lien Google Maps, position WhatsApp, Plus Code ou coordonnées',
      pasteButton: 'Placer sur la carte',
      pasteApplied: 'Position placée sur la carte. Ajustez le marqueur si besoin.',
      pasteOutsideSenegal: 'Cette position est hors du Sénégal. Vérifiez-la : la latitude et la longitude sont peut-être inversées.',
      pasteResolving: 'Lecture du lien…',
      pasteLinkFailed: 'Ce lien ne mène à aucune position lisible.',
      pasteNeedsCity: 'Choisissez d’abord la ville : un Plus Code court se lit à partir d’elle.',
      pasteUnknown: 'Format non reconnu. Collez un lien Google Maps, un Plus Code ou des coordonnées.',
      latitude: 'Latitude', longitude: 'Longitude',
    },
    en: {
      region: 'Region', city: 'City', quarter: 'Neighbourhood',
      regionPlaceholder: 'Choose a region', cityPlaceholder: 'Search for a city',
      quarterPlaceholder: 'Search or type a neighbourhood', noResults: 'No results',
      create: 'Add “{name}”',
      newNeighborhoodHint: 'New neighbourhood: our team will review it. Your listing shows it right away.',
      pasteLabel: 'Paste a link or a location',
      pastePlaceholder: 'Google Maps link, WhatsApp location, Plus Code or coordinates',
      pasteButton: 'Place on the map',
      pasteApplied: 'Location placed on the map. Adjust the marker if needed.',
      pasteOutsideSenegal: 'This location is outside Senegal. Check it: latitude and longitude may be swapped.',
      pasteResolving: 'Reading the link…',
      pasteLinkFailed: 'This link does not lead to a readable location.',
      pasteNeedsCity: 'Choose the city first: a short Plus Code is read from it.',
      pasteUnknown: 'Unrecognised format. Paste a Google Maps link, a Plus Code or coordinates.',
      latitude: 'Latitude', longitude: 'Longitude',
    },
    wo: {
      region: 'Diiwaan', city: 'Dëkk', quarter: 'Gox',
      regionPlaceholder: 'Tànnal benn diiwaan', cityPlaceholder: 'Seet benn dëkk',
      quarterPlaceholder: 'Seet walla bind benn gox', noResults: 'Dara amul',
      create: 'Yokk « {name} »',
      newNeighborhoodHint: 'Gox bu bees : sunu ekip dina ko seet. Sa anons dina ko wone léegi.',
      pasteLabel: 'Taqal benn lien walla benn bérab',
      pastePlaceholder: 'Lien Google Maps, bérab WhatsApp, Plus Code walla koordone',
      pasteButton: 'Teg ko ci kart bi',
      pasteApplied: 'Bérab bi teg nañu ko ci kart bi. Soppil markëru bi su soxlaa.',
      pasteOutsideSenegal: 'Bérab bii nekkul ci Senegaal. Seetal ko : latitude ak longitude mën nañu wëlbatiku.',
      pasteResolving: 'Ñu ngi jàng lien bi…',
      pasteLinkFailed: 'Lien bii jëmul ci benn bérab bu ñu man a jàng.',
      pasteNeedsCity: 'Tànnal dëkk bi njëkk : Plus Code bu gàtt, ci moom lañu koy jànge.',
      pasteUnknown: 'Xamuñu format bii. Taqal lien Google Maps, Plus Code walla koordone.',
      latitude: 'Latitude', longitude: 'Longitude',
    },
  }],
  ['property.form.amenities', 'placeholder', 'saveFailed', { fr: 'Rechercher ou ajouter un équipement', en: 'Search or add an amenity', wo: 'Seet walla yokk benn jumtukaay' }],
  ['property.form.amenities', 'create', 'placeholder', { fr: 'Ajouter « {name} »', en: 'Add “{name}”', wo: 'Yokk « {name} »' }],
  ['property.form.amenities', 'empty', 'create', { fr: 'Aucun équipement ne correspond.', en: 'No matching amenity.', wo: 'Amul jumtukaay bu ànd.' }],
  ['property.form.amenities', 'pending', 'empty', { fr: 'en attente de vérification', en: 'awaiting review', wo: 'mungiy xaar ñu seet ko' }],
  ['property.form.amenities', 'remove', 'pending', { fr: 'Retirer {name}', en: 'Remove {name}', wo: 'Dindi {name}' }],
  ['nav.superAdmin.items', 'geoProposals', 'tags', { fr: 'Quartiers proposés', en: 'Proposed neighbourhoods', wo: 'Gox yi ñu digle' }],
  ['nav.superAdmin.items', 'tagProposals', 'geoProposals', { fr: 'Équipements proposés', en: 'Proposed amenities', wo: 'Jumtukaay yi ñu digle' }],
  ['property.wizard.preview', 'entryTotal', 'entryNote', { fr: 'Total à l’entrée : {amount}', en: 'Total on move-in: {amount}', wo: 'Mbooloo ci dugg gi : {amount}' }],
  ['superAdmin', 'propositions', null, {
    fr: {
      geoTitle: 'Quartiers proposés',
      geoDescription: 'Quartiers saisis dans les annonces et absents du référentiel. Approuvez, renommez, fusionnez ou refusez.',
      tagsTitle: 'Équipements proposés',
      tagsDescription: 'Équipements saisis dans les annonces et absents du catalogue. Approuvez, renommez, fusionnez ou refusez.',
      approve: 'Approuver', reject: 'Refuser', rename: 'Renommer', merge: 'Fusionner',
      newName: 'Nouveau nom', mergeInto: 'Fusionner dans', confirm: 'Valider', cancel: 'Annuler',
      author: 'Proposé par {name}', authorUnknown: 'Auteur inconnu',
      usage: '{count, plural, =0 {Aucune annonce} =1 {# annonce} other {# annonces}}',
      emptyTitle: 'Aucune proposition en attente',
      emptyDescription: 'Les propositions apparaîtront ici dès qu’une annonce en contiendra.',
      error: 'Erreur de chargement des propositions.', retry: 'Réessayer',
      done: 'Décision enregistrée.', failed: 'La décision n’a pas pu être enregistrée.',
      noTarget: 'Aucun résultat dans la liste des approuvés.',
    },
    en: {
      geoTitle: 'Proposed neighbourhoods',
      geoDescription: 'Neighbourhoods typed in listings and missing from the referential. Approve, rename, merge or reject.',
      tagsTitle: 'Proposed amenities',
      tagsDescription: 'Amenities typed in listings and missing from the catalogue. Approve, rename, merge or reject.',
      approve: 'Approve', reject: 'Reject', rename: 'Rename', merge: 'Merge',
      newName: 'New name', mergeInto: 'Merge into', confirm: 'Confirm', cancel: 'Cancel',
      author: 'Proposed by {name}', authorUnknown: 'Unknown author',
      usage: '{count, plural, =0 {No listing} =1 {# listing} other {# listings}}',
      emptyTitle: 'No pending proposal',
      emptyDescription: 'Proposals will appear here as soon as a listing contains one.',
      error: 'Could not load the proposals.', retry: 'Retry',
      done: 'Decision saved.', failed: 'The decision could not be saved.',
      noTarget: 'No match among the approved entries.',
    },
    wo: {
      geoTitle: 'Gox yi ñu digle',
      geoDescription: 'Gox yi ñu bind ci anons yi te nekkuñu ci référentiel bi. Nangul, soppil tur, booleel walla bañ.',
      tagsTitle: 'Jumtukaay yi ñu digle',
      tagsDescription: 'Jumtukaay yi ñu bind ci anons yi te nekkuñu ci katalog bi. Nangul, soppil tur, booleel walla bañ.',
      approve: 'Nangu', reject: 'Bañ', rename: 'Soppi tur', merge: 'Boole',
      newName: 'Tur wu bees', mergeInto: 'Boole ak', confirm: 'Dëggal', cancel: 'Neenal',
      author: '{name} moo ko digle', authorUnknown: 'Bindkat bi xameesu ko',
      usage: '{count, plural, =0 {Amul benn anons} =1 {# anons} other {# anons}}',
      emptyTitle: 'Amul benn ndigal buy xaar',
      emptyDescription: 'Ndigal yi dinañu feeñ fii bu benn anons am ko.',
      error: 'Njuumte ci yeb ndigal yi.', retry: 'Jéemaat',
      done: 'Dogal bi denc nañu ko.', failed: 'Mënuñu denc dogal bi.',
      noTarget: 'Amul dara bu ànd ci yi ñu nangu.',
    },
  }],
];

/** [chemin de la clé, ancienne valeur attendue, nouvelle valeur] — par langue. */
const REMPLACEMENTS = {
  fr: [
    ['property.wizard.preview.entryNote', 'Le total s’affiche sur l’annonce publiée.', 'Montant indicatif, calculé d’après vos réponses ; l’annonce publiée fait foi.'],
    ['property.wizard.geoDefaultsNote', "Le pays et la devise sont déjà renseignés d'après votre connexion. Vous pourrez les corriger.", "Le pays est déjà renseigné d'après votre connexion. Vous pourrez le corriger. Les prix sont en francs CFA."],
  ],
  en: [
    ['property.wizard.preview.entryNote', 'The total is shown on the published listing.', 'Indicative amount based on your answers; the published listing is authoritative.'],
    ['property.wizard.geoDefaultsNote', 'Country and currency are already filled in from your connection. You can correct them.', 'The country is already filled in from your connection. You can correct it. Prices are in CFA francs.'],
  ],
  wo: [
    ['property.wizard.preview.entryNote', 'Mbooloo mi dina feeñ ci anons bi ñu teg.', 'Xaalis bu ñu xayma ci say tontu ; anons bi ñu teg moo wóor.'],
    ['property.wizard.geoDefaultsNote', 'Réew mi ak xaalis bi ñu leen dugal na ci sa koneksiyon. Man nga leen a soppi.', 'Réew mi, ñu dugal na ko ci sa koneksiyon. Man nga koo soppi. Njëg yi ci franc CFA lañu.'],
  ],
};

const lire = (o, chemin) => chemin.split('.').reduce((n, k) => (n == null ? undefined : n[k]), o);

function inserer(parent, cle, apres, valeur) {
  const entrees = Object.entries(parent);
  const deja = Object.prototype.hasOwnProperty.call(parent, cle);
  if (deja) {
    if (JSON.stringify(parent[cle]) !== JSON.stringify(valeur)) throw new Error(`« ${cle} » existe avec une autre valeur : refus d'écraser`);
    return false;
  }
  const rang = apres === null ? entrees.length : entrees.findIndex(([k]) => k === apres) + 1;
  if (rang === 0) throw new Error(`ancre « ${apres} » introuvable`);
  entrees.splice(rang, 0, [cle, valeur]);
  for (const k of Object.keys(parent)) delete parent[k];
  for (const [k, v] of entrees) parent[k] = v;
  return true;
}

let echecs = 0;
for (const langue of ['fr', 'en', 'wo']) {
  const fichier = join(dossier, `${langue}.json`);
  const source = readFileSync(fichier, 'utf8');
  const racine = JSON.parse(source);
  if (JSON.stringify(racine, null, 2) + '\n' !== source) throw new Error(`${fichier} : mise en forme inattendue`);

  let ajouts = 0;
  for (const [cheminParent, cle, apres, valeurs] of AJOUTS) {
    const parent = lire(racine, cheminParent);
    if (parent === undefined || typeof parent !== 'object') throw new Error(`${langue} : parent ${cheminParent} absent`);
    if (inserer(parent, cle, apres, valeurs[langue])) ajouts++;
  }
  let remplaces = 0;
  for (const [chemin, ancienne, nouvelle] of REMPLACEMENTS[langue]) {
    const morceaux = chemin.split('.');
    const parent = lire(racine, morceaux.slice(0, -1).join('.'));
    const cle = morceaux.at(-1);
    if (parent[cle] === nouvelle) continue;
    if (parent[cle] !== ancienne) throw new Error(`${langue} : ${chemin} a changé depuis la rédaction du plan — relire avant de remplacer`);
    parent[cle] = nouvelle;
    remplaces++;
  }

  if (verifierSeulement) {
    if (ajouts + remplaces > 0) { console.error(`✗ ${langue} : ${ajouts} ajouts et ${remplaces} remplacements manquent`); echecs++; }
    else console.log(`✓ ${langue} : à jour`);
  } else {
    writeFileSync(fichier, JSON.stringify(racine, null, 2) + '\n');
    console.log(`${langue} : ${ajouts} ajouts, ${remplaces} remplacements`);
  }
}
process.exit(echecs > 0 ? 1 : 0);
```

**Step 2 : le rouge — les clés manquent**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web && node "$S/i18n-lot-d.mjs" src/messages --verifier
```

Attendu : sortie 1, `✗ fr : 13 ajouts et 2 remplacements manquent` (idem `en`, `wo`).

**Step 3 : insérer, puis constater l'idempotence**

```bash
node "$S/i18n-lot-d.mjs" src/messages
node "$S/i18n-lot-d.mjs" src/messages --verifier
git diff --stat -- src/messages
```

Attendu : `fr : 13 ajouts, 2 remplacements` (× 3) ; puis `✓ fr : à jour` (× 3). Dans le diff de
chaque langue, ne bougent que : les lignes insérées, la virgule ajoutée en fin des lignes qui
précèdent une insertion en fin d'objet (`hintFull` des caractéristiques, `saveFailed` des
équipements, dernière clé de `superAdmin`), et les deux remplacements. Essayé le 2026-10-12 sur
des copies des trois fichiers : 4 lignes retirées par langue, aucune autre.

**Step 4 : la parité et le découpage**

```bash
npm run check:i18n
node scripts/check-i18n-namespaces.mjs
```

Attendu : `check:i18n` vert (les trois dictionnaires portent les mêmes clés). La garde des espaces
peut déjà être verte — aucun espace NOUVEAU de premier niveau n'est créé (`property`, `nav`,
`superAdmin` existent) ; elle se rejoue après les tâches 19, 20 et 25 qui en ajoutent des
lecteurs.

**Step 4 bis : les deux tests qui citent un libellé remplacé**

Les deux remplacements changent un texte que deux tests lisent mot pour mot (lus :
`__tests__/ApercuAnnonce.test.tsx` L84, `__tests__/StepBien.test.tsx` L123-126) — ⚠ hors
territoire (E-12).

`__tests__/ApercuAnnonce.test.tsx` (L84 ; la tâche 22 réécrit ensuite ce test en entier) :

```
old:    expect(c.getByText(/total s’affiche sur l’annonce publiée/i)).toBeInTheDocument();
new:    expect(c.getByText(/montant indicatif, calculé d’après vos réponses/i)).toBeInTheDocument();
```

`__tests__/StepBien.test.tsx` (L123-126) :

```
old:  it('affiche la note sur le pays et la devise déjà renseignés', () => {
    render(withIntl(<Harnais />));
    expect(screen.getByText(/pays et la devise sont déjà renseignés/i)).toBeInTheDocument();
  });
new:  it('affiche la note sur le pays déjà renseigné — et les prix en francs CFA (TCK-633)', () => {
    render(withIntl(<Harnais />));
    expect(screen.getByText(/pays est déjà renseigné.*les prix sont en francs cfa/i)).toBeInTheDocument();
  });
```

```bash
npx vitest run src/components/property-form/__tests__/ApercuAnnonce.test.tsx src/components/property-form/__tests__/StepBien.test.tsx
```

Attendu : vert. Sans ces deux Edits, chacun rougit sur `Unable to find an element with the text`.

**Step 5 : ablation — la parité juge vraiment**

```bash
cp src/messages/wo.json "$S/abl/wo.json"
node -e 'const fs=require("fs");const f="src/messages/wo.json";const o=JSON.parse(fs.readFileSync(f,"utf8"));delete o.property.form.address.pasteUnknown;fs.writeFileSync(f,JSON.stringify(o,null,2)+"\n")'
npm run check:i18n
cp "$S/abl/wo.json" src/messages/wo.json && md5 -q src/messages/wo.json "$S/abl/wo.json" && npm run check:i18n
```

Attendu : rouge, la clé `property.form.address.pasteUnknown` nommée comme manquante en `wo` ;
`md5` identiques ; vert.

**Step 6 : signaler**

Signaler : les trois dictionnaires (co-tenus — préciser à la session que les clés `nav.*` et
`property.wizard.*` sont hors de l'espace du lot), `ApercuAnnonce.test.tsx` et `StepBien.test.tsx`
(⚠ hors territoire),
`feat(web): libellés du lieu, des listes, des équipements et des propositions (TCK-633)`.

---

## Tâche 15 — La liste à recherche (`Combobox`) (25 min)

Une primitive, deux formes : une valeur (région, ville, quartier) et plusieurs (équipements).
Patron de classes et de portail repris d'`AgencyCombobox` (`components/admin/super/AgencyCombobox.tsx`,
lu en entier) ; deux différences voulues :

- le filtrage est LOCAL (`filter={null}` + `optionsAffichees`) : les listes du référentiel sont
  courtes (≤ 150 quartiers pour une ville) et chargées en une fois ; il replie les ACCENTS
  (« medina » trouve « Médina ») — ce que la recherche de Base UI ne fait pas ;
- une ligne « Ajouter « … » » (`VALEUR_CREER`) en DERNIER, absente quand un libellé est identique
  **à la casse près** (`replierPourIdentite` : la règle de l'index serveur, qui ne replie pas les
  accents). « Liberte 4 » propose donc de créer ET liste « Liberté 4 » — en premier : avec
  `autoHighlight`, Entrée choisit l'existant, pas la création.

Base UI 1.7.0 (`node_modules/@base-ui/react/combobox`, lu) : `onInputValueChange` reçoit aussi les
remises à zéro internes (`input-clear` à la fermeture, `none` après une sélection —
`AriaCombobox.js` L620-650). Seule la raison `input-change` (la FRAPPE) écrit le texte : sinon, un
quartier tapé hors liste s'effacerait en quittant le champ.

Deux autres comportements de Base UI, mesurés et neutralisés :

- **Échap, liste fermée, VIDE la sélection** (`input/ComboboxInput.js` L312-321 :
  `setSelectedValue(selectionMode === 'multiple' ? [] : null)` avec la raison `escape-key`). Un
  geste pour fermer retirait toutes les puces d'équipements d'un coup : `onValueChange` ignore
  cette raison.
- **Ouverte, la liste rend le reste de la page `aria-hidden`** (`popup/ComboboxPopup.js` L111 :
  `const focusManagerModal = !inputInsidePopup || modal;`). Une liste VIDE ne s'ouvre donc pas
  (`open={ouvert && (options.length > 0 || items.length > 0)}`) : le référentiel indisponible
  laisse un champ texte ordinaire, et le reste de l'écran atteignable (tâche 19, où l'absence de
  cette règle faisait perdre le bouton « Continuer » à 24 tests du parcours).

**Fichiers**
- Créer : `takussan-web/src/components/ui/combobox.tsx`
- Test : `takussan-web/src/components/ui/__tests__/combobox.test.tsx`

**Step 1 : le test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Combobox,
  ComboboxMultiple,
  replierPourIdentite,
  replierPourRecherche,
  type OptionDeListe,
} from '../combobox';

/**
 * TCK-633 — la liste à recherche du formulaire du bien. Ce qu'on éprouve est ce que la
 * recherche de Base UI ne fait pas : l'accent replié pour TROUVER, la casse seule pour décider
 * qu'un nom EXISTE déjà, et Entrée qui choisit l'existant avant de créer.
 */
const QUARTIERS: OptionDeListe[] = [
  { value: '1', label: 'Liberté 4' },
  { value: '2', label: 'Mermoz' },
  { value: '3', label: 'Médina' },
];

function Simple({ surChoix, surCreation }: { surChoix: (o: OptionDeListe | null) => void; surCreation: (t: string) => void }) {
  const [valeur, setValeur] = useState<string | null>(null);
  return (
    <Combobox
      label="Quartier"
      options={QUARTIERS}
      value={valeur}
      onChange={(o) => {
        setValeur(o?.value ?? null);
        surChoix(o);
      }}
      aucunResultat="Aucun résultat"
      creation={{ libelle: (t) => `Ajouter « ${t} »`, surCreation }}
    />
  );
}

function Libre() {
  const [texte, setTexte] = useState('');
  const [valeur, setValeur] = useState<string | null>(null);
  return (
    <Combobox
      label="Quartier"
      options={QUARTIERS}
      value={valeur}
      onChange={(o) => setValeur(o?.value ?? null)}
      aucunResultat="Aucun résultat"
      saisieLibre={{ texte, surSaisie: setTexte }}
    />
  );
}

function Multiple({ surCreation }: { surCreation: (t: string) => void }) {
  const [valeurs, setValeurs] = useState<OptionDeListe[]>([]);
  return (
    <ComboboxMultiple
      label="Équipements"
      options={[{ value: '10', label: 'Piscine' }, { value: '11', label: 'Climatisation' }]}
      valeurs={valeurs}
      onChange={setValeurs}
      aucunResultat="Aucun équipement"
      retirer={(nom) => `Retirer ${nom}`}
      creation={{ libelle: (t) => `Ajouter « ${t} »`, surCreation }}
    />
  );
}

describe('replis', () => {
  it('la recherche replie les accents, les espaces et la casse', () => {
    expect(replierPourRecherche('  Liberté   4 ')).toBe('liberte 4');
  });

  it("l'identité ne replie QUE la casse et les espaces — comme l'index du serveur", () => {
    expect(replierPourIdentite('LIBERTÉ  4')).toBe('liberté 4');
    expect(replierPourIdentite('Liberte 4')).not.toBe(replierPourIdentite('Liberté 4'));
  });
});

describe('<Combobox>', () => {
  it('une recherche sans accent trouve le nom accentué', async () => {
    const user = userEvent.setup();
    render(<Simple surChoix={vi.fn()} surCreation={vi.fn()} />);

    await user.type(screen.getByLabelText('Quartier'), 'medina');

    expect(await screen.findByRole('option', { name: 'Médina' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Mermoz' })).not.toBeInTheDocument();
  });

  it('un clic choisit, et le champ affiche le choix', async () => {
    const user = userEvent.setup();
    const surChoix = vi.fn();
    render(<Simple surChoix={surChoix} surCreation={vi.fn()} />);

    await user.type(screen.getByLabelText('Quartier'), 'merm');
    await user.click(await screen.findByRole('option', { name: 'Mermoz' }));

    expect(surChoix).toHaveBeenLastCalledWith({ value: '2', label: 'Mermoz' });
    expect(screen.getByLabelText('Quartier')).toHaveValue('Mermoz');
  });

  it('Entrée sur un nom absent CRÉE', async () => {
    const user = userEvent.setup();
    const surCreation = vi.fn();
    render(<Simple surChoix={vi.fn()} surCreation={surCreation} />);

    await user.type(screen.getByLabelText('Quartier'), 'Cité Keur Gorgui');
    expect(await screen.findByRole('option', { name: 'Ajouter « Cité Keur Gorgui »' })).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(surCreation).toHaveBeenCalledWith('Cité Keur Gorgui');
  });

  it('aucune création pour un nom identique à la casse près', async () => {
    const user = userEvent.setup();
    render(<Simple surChoix={vi.fn()} surCreation={vi.fn()} />);

    await user.type(screen.getByLabelText('Quartier'), 'MERMOZ');

    expect(await screen.findByRole('option', { name: 'Mermoz' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Ajouter/ })).not.toBeInTheDocument();
  });

  it('« Liberte 4 » liste « Liberté 4 » EN PREMIER et propose de créer ; Entrée choisit l’existant', async () => {
    const user = userEvent.setup();
    const surChoix = vi.fn();
    const surCreation = vi.fn();
    render(<Simple surChoix={surChoix} surCreation={surCreation} />);

    await user.type(screen.getByLabelText('Quartier'), 'Liberte 4');
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Liberté 4', 'Ajouter « Liberte 4 »']);
    await user.keyboard('{Enter}');

    expect(surChoix).toHaveBeenLastCalledWith({ value: '1', label: 'Liberté 4' });
    expect(surCreation).not.toHaveBeenCalled();
  });

  it('un quartier tapé HORS liste survit à Échap et à la sortie du champ', async () => {
    const user = userEvent.setup();
    render(<Libre />);

    await user.type(screen.getByLabelText('Quartier'), 'Cité Keur Gorgui');
    await user.keyboard('{Escape}');
    await user.tab();

    expect(screen.getByLabelText('Quartier')).toHaveValue('Cité Keur Gorgui');
  });
});

describe('<ComboboxMultiple>', () => {
  it('ajoute en puce, retire, et crée par Entrée', async () => {
    const user = userEvent.setup();
    const surCreation = vi.fn();
    render(<Multiple surCreation={surCreation} />);
    const champ = screen.getByLabelText('Équipements');

    await user.type(champ, 'pisc');
    await user.click(await screen.findByRole('option', { name: 'Piscine' }));
    expect(screen.getByRole('button', { name: 'Retirer Piscine' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retirer Piscine' }));
    expect(screen.queryByRole('button', { name: 'Retirer Piscine' })).not.toBeInTheDocument();

    await user.type(champ, 'Puits');
    await screen.findByRole('option', { name: 'Ajouter « Puits »' });
    await user.keyboard('{Enter}');
    expect(surCreation).toHaveBeenCalledWith('Puits');
  });

  it('Échap ferme la liste, et liste fermée n’efface AUCUNE puce', async () => {
    const user = userEvent.setup();
    render(<Multiple surCreation={vi.fn()} />);

    await user.type(screen.getByLabelText('Équipements'), 'pisc');
    await user.click(await screen.findByRole('option', { name: 'Piscine' }));
    await user.keyboard('{Escape}{Escape}');

    expect(screen.getByRole('button', { name: 'Retirer Piscine' })).toBeInTheDocument();
  });
});
```

**Step 2 : rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web && npx vitest run src/components/ui/__tests__/combobox.test.tsx
```

Attendu : échec de l'import (`Failed to resolve import "../combobox"`).

**Step 3 : la primitive**

`src/components/ui/combobox.tsx` :

```tsx
'use client';

import { useState, type Ref } from 'react';
import { Combobox as Base } from '@base-ui/react/combobox';
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * TCK-633 — la liste à recherche du formulaire du bien (région, ville, quartier, équipements).
 *
 * Trois règles, et chacune a son test :
 *  1. on TROUVE sans les accents (`replierPourRecherche`) : « medina » trouve « Médina » ;
 *  2. un nom EXISTE à la casse près seulement (`replierPourIdentite`) — la règle de l'index du
 *     serveur, qui ne replie pas les accents (ADR-0025) ; « Liberte 4 » n'est donc pas un doublon
 *     de « Liberté 4 », mais l'existant est listé AVANT la ligne « Ajouter », et Entrée le choisit ;
 *  3. seule la FRAPPE écrit le texte : Base UI remet le champ à zéro en interne (fermeture,
 *     sélection), et un quartier tapé hors liste disparaissait en quittant le champ.
 *
 * ⚠ Aucun `useMemo` / `useCallback` : le React Compiler s'en charge (ADR-0015).
 */
export interface OptionDeListe {
  readonly value: string;
  readonly label: string;
  /** Une précision affichée APRÈS le libellé (« en attente de vérification »). */
  readonly indice?: string;
}

/** La valeur réservée à la ligne « Ajouter « … » » — jamais une valeur métier. */
export const VALEUR_CREER = '__creer__';

const DIACRITIQUES = /[̀-ͯ]/g;

export function replierPourRecherche(texte: string): string {
  return texte.normalize('NFD').replace(DIACRITIQUES, '').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
}

export function replierPourIdentite(texte: string): string {
  return texte.normalize('NFC').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
}

export interface CreationDansLaListe {
  readonly libelle: (texte: string) => string;
  readonly surCreation: (texte: string) => void;
}

function optionsAffichees(
  options: readonly OptionDeListe[],
  requete: string,
  texte: string,
  creation: CreationDansLaListe | undefined,
  connues: readonly OptionDeListe[],
): OptionDeListe[] {
  const r = replierPourRecherche(requete);
  const trouvees = r === '' ? [...options] : options.filter((o) => replierPourRecherche(o.label).includes(r));
  const saisi = texte.trim();
  const existe = connues.some((o) => replierPourIdentite(o.label) === replierPourIdentite(saisi));
  if (creation && saisi !== '' && !existe) trouvees.push({ value: VALEUR_CREER, label: creation.libelle(saisi) });
  return trouvees;
}

const CLASSE_SAISIE =
  'h-11 min-h-11 w-full rounded-lg border border-input bg-transparent py-2 pr-11 pl-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm';
const CLASSE_POPUP =
  'max-h-[min(var(--available-height),20rem)] w-(--anchor-width) min-w-56 overflow-y-auto rounded-lg bg-popover py-1 text-popover-foreground shadow-md ring-1 ring-border';
const CLASSE_ITEM =
  'relative flex min-h-11 w-full cursor-default items-center gap-2 py-1.5 pr-3 pl-8 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground';

function Deroulant({ aucunResultat, chargement }: { readonly aucunResultat: string; readonly chargement?: boolean }) {
  return (
    <Base.Portal>
      <Base.Positioner sideOffset={4} className="isolate z-[1100] outline-none">
        <Base.Popup className={CLASSE_POPUP}>
          <Base.Empty>
            {chargement ? null : <p className="px-3 py-2 text-sm text-muted-foreground">{aucunResultat}</p>}
          </Base.Empty>
          <Base.List>
            {(option: OptionDeListe) => (
              <Base.Item key={option.value} value={option} className={CLASSE_ITEM}>
                {option.value === VALEUR_CREER ? (
                  <Plus aria-hidden className="absolute left-2 size-4" />
                ) : (
                  <Base.ItemIndicator className="absolute left-2 flex size-4 items-center justify-center">
                    <Check aria-hidden className="size-4" />
                  </Base.ItemIndicator>
                )}
                {option.label}
                {option.indice ? <span className="text-xs text-muted-foreground"> · {option.indice}</span> : null}
              </Base.Item>
            )}
          </Base.List>
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}

interface ProprietesCommunes {
  readonly options: readonly OptionDeListe[];
  readonly id?: string;
  /** Rendu en `aria-label` SEULEMENT s'il est fourni : un `<label htmlFor>` externe nomme déjà le champ. */
  readonly label?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly chargement?: boolean;
  readonly aucunResultat: string;
  readonly creation?: CreationDansLaListe;
  readonly invalide?: boolean;
  readonly decritPar?: string;
  readonly required?: boolean;
  readonly className?: string;
}

export interface ComboboxProps extends ProprietesCommunes {
  readonly value: string | null;
  readonly onChange: (option: OptionDeListe | null) => void;
  /** Le texte EST une valeur (un quartier hors liste) : il vit dans le formulaire, pas ici. */
  readonly saisieLibre?: { readonly texte: string; readonly surSaisie: (texte: string) => void };
  /** Le `ref` de react-hook-form (`field.ref`) : c'est lui que `setFocus` et le focus d'erreur visent. */
  readonly inputRef?: Ref<HTMLInputElement>;
}

export function Combobox({
  options, value, onChange, id, label, placeholder, disabled, chargement, aucunResultat,
  creation, saisieLibre, inputRef, invalide, decritPar, required, className,
}: ComboboxProps) {
  const [ouvert, setOuvert] = useState(false);
  const [frappe, setFrappe] = useState<string | null>(null);
  const choisie = options.find((o) => o.value === value) ?? null;
  const texte = saisieLibre ? saisieLibre.texte : (frappe ?? choisie?.label ?? '');
  // Le libellé du choix courant n'est pas une recherche : à l'ouverture, toute la liste.
  const requete = choisie !== null && texte === choisie.label ? '' : texte;
  const items = optionsAffichees(options, requete, texte, creation, options);

  return (
    <Base.Root<OptionDeListe>
      items={items}
      filter={null}
      autoHighlight
      disabled={disabled}
      value={choisie}
      isItemEqualToValue={(a, b) => a.value === b.value}
      // Une liste VIDE ne s'ouvre pas : ouverte, la liste rend le reste de la page `aria-hidden`
      // (gestion du focus modale de Base UI quand la saisie est hors du popup) — pour n'y montrer
      // rien. Le référentiel indisponible laisse ainsi un champ texte ordinaire.
      open={ouvert && (options.length > 0 || items.length > 0)}
      onOpenChange={(suivant) => {
        setOuvert(suivant);
        if (!suivant) setFrappe(null);
      }}
      inputValue={texte}
      onInputValueChange={(suivant, { reason }) => {
        if (reason !== 'input-change') return;
        if (saisieLibre) saisieLibre.surSaisie(suivant);
        else setFrappe(suivant);
      }}
      onValueChange={(option, { reason }) => {
        // Échap, liste FERMÉE : Base UI vide la sélection (`input/ComboboxInput.js` L312-321).
        // Un geste pour fermer n'efface jamais un choix.
        if (reason === 'escape-key') return;
        setFrappe(null);
        if (option?.value === VALEUR_CREER) {
          creation?.surCreation(texte.trim());
          return;
        }
        // Le texte AVANT l'identifiant : `surSaisie` remet l'identifiant à null (taper efface le
        // choix), et l'appeler après `onChange` effacerait le choix qu'on vient de poser.
        if (saisieLibre && option) saisieLibre.surSaisie(option.label);
        onChange(option);
      }}
    >
      <Base.InputGroup className={cn('relative flex items-center', className)}>
        <Base.Input
          ref={inputRef}
          id={id}
          aria-label={label}
          aria-invalid={invalide || undefined}
          aria-describedby={decritPar}
          aria-required={required || undefined}
          placeholder={placeholder}
          className={CLASSE_SAISIE}
        />
        {/*
          Un chevron DÉCORATIF et non un `Combobox.Trigger` : la saisie ouvre déjà la liste au clic
          (`openOnInputClick`, vrai par défaut), et un bouton de plus par champ portait un
          `aria-expanded` que les tests du parcours prennent pour la bascule des détails d'adresse.
        */}
        <div className="pointer-events-none absolute right-3 flex h-full items-center gap-1 text-muted-foreground">
          {chargement ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          <ChevronDown aria-hidden className="size-4" />
        </div>
      </Base.InputGroup>
      <Deroulant aucunResultat={aucunResultat} chargement={chargement} />
    </Base.Root>
  );
}

export interface ComboboxMultipleProps extends ProprietesCommunes {
  readonly valeurs: readonly OptionDeListe[];
  readonly onChange: (valeurs: OptionDeListe[]) => void;
  /** Le nom accessible du bouton qui retire une puce. */
  readonly retirer: (libelle: string) => string;
}

export function ComboboxMultiple({
  options, valeurs, onChange, id, label, placeholder, disabled, chargement, aucunResultat,
  creation, retirer, invalide, decritPar, className,
}: ComboboxMultipleProps) {
  const [ouvert, setOuvert] = useState(false);
  const [frappe, setFrappe] = useState('');
  const items = optionsAffichees(options, frappe, frappe, creation, [...options, ...valeurs]);

  return (
    <Base.Root<OptionDeListe, true>
      multiple
      items={items}
      filter={null}
      autoHighlight
      disabled={disabled}
      value={[...valeurs]}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={ouvert && (options.length > 0 || items.length > 0)}
      onOpenChange={(suivant) => {
        setOuvert(suivant);
        if (!suivant) setFrappe('');
      }}
      inputValue={frappe}
      onInputValueChange={(suivant, { reason }) => {
        if (reason === 'input-change') setFrappe(suivant);
      }}
      onValueChange={(suivantes, { reason }) => {
        // Même garde : sans elle, Échap liste fermée retirait TOUTES les puces d'un coup.
        if (reason === 'escape-key') return;
        const texte = frappe.trim();
        setFrappe('');
        if (suivantes.some((o) => o.value === VALEUR_CREER)) {
          creation?.surCreation(texte);
          return;
        }
        onChange(suivantes);
      }}
    >
      <Base.Chips
        className={cn(
          'flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
          invalide && 'border-destructive',
          className,
        )}
      >
        <Base.Value>
          {(choisies: OptionDeListe[]) =>
            choisies.map((option) => (
              <Base.Chip
                key={option.value}
                className="flex min-h-11 items-center gap-1 rounded-full bg-secondary pl-3 text-sm text-secondary-foreground"
              >
                {option.label}
                {option.indice ? <span className="text-xs text-muted-foreground">· {option.indice}</span> : null}
                <Base.ChipRemove
                  aria-label={retirer(option.label)}
                  className="flex size-11 min-h-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X aria-hidden className="size-3.5" />
                </Base.ChipRemove>
              </Base.Chip>
            ))
          }
        </Base.Value>
        <Base.Input
          id={id}
          aria-label={label}
          aria-invalid={invalide || undefined}
          aria-describedby={decritPar}
          placeholder={valeurs.length === 0 ? placeholder : undefined}
          className="h-11 min-h-11 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        {chargement ? <Loader2 aria-hidden className="mr-1 size-4 animate-spin text-muted-foreground" /> : null}
      </Base.Chips>
      <Deroulant aucunResultat={aucunResultat} chargement={chargement} />
    </Base.Root>
  );
}
```

**Step 4 : vert, types, lint**

```bash
npx vitest run src/components/ui/__tests__/combobox.test.tsx
npx tsc --noEmit
npx eslint src/components/ui/combobox.tsx src/components/ui/__tests__/combobox.test.tsx
```

Attendu : `10 passed` ; `tsc` muet ; ESLint 0 erreur. Si `tsc` refuse `Base.Root<OptionDeListe, true>`
ou le type de `Base.Value` (`children` est typé `(selectedValue: any) => ReactNode` dans
`value/ComboboxValue.d.ts` L11), retirer le paramètre de type explicite — la valeur se déduit de
`items` — sans toucher au comportement.

**Step 5 : ablations**

```bash
mkdir -p "$S/abl/t15" && F=src/components/ui/combobox.tsx && cp $F "$S/abl/t15/c.tsx"
# a) toute raison écrit le texte
sed -i '' "s/if (reason !== 'input-change') return;//" $F
npx vitest run src/components/ui/__tests__/combobox.test.tsx
cp "$S/abl/t15/c.tsx" $F && md5 -q $F "$S/abl/t15/c.tsx"
# b) la création ignore les doublons de casse
sed -i '' 's/if (creation \&\& saisi !== .. \&\& !existe)/if (creation \&\& saisi !== "")/' $F
npx vitest run src/components/ui/__tests__/combobox.test.tsx
cp "$S/abl/t15/c.tsx" $F && md5 -q $F "$S/abl/t15/c.tsx"
# c) la recherche ne replie plus les accents
sed -i '' "s/texte.normalize('NFD').replace(DIACRITIQUES, '')/texte/" $F
npx vitest run src/components/ui/__tests__/combobox.test.tsx
cp "$S/abl/t15/c.tsx" $F && md5 -q $F "$S/abl/t15/c.tsx"
# d) Échap, liste fermée, vide de nouveau les puces
perl -0pi -e "s/(        \/\/ Même garde : sans elle, Échap liste fermée retirait TOUTES les puces d'un coup\.\n)        if \(reason === 'escape-key'\) return;\n/\$1/" $F
npx vitest run src/components/ui/__tests__/combobox.test.tsx
cp "$S/abl/t15/c.tsx" $F && md5 -q $F "$S/abl/t15/c.tsx" && npx vitest run src/components/ui/__tests__/combobox.test.tsx
```

Attendu : a) 1 échec (« survit à Échap » : Base UI remet le champ à `''` avec la raison
`input-clear`, et le quartier tapé disparaît) ; b) 1 échec (`Ajouter « MERMOZ »` présent) ;
c) 3 échecs (`replis`, `medina` ne trouve rien, « Liberte 4 » ne liste plus « Liberté 4 ») ;
d) 1 échec (« Échap ferme la liste, et liste fermée n'efface AUCUNE puce ») ;
`md5` identiques ; `10 passed`. Les cinq passages ont été joués le 2026-10-12 dans un harnais
hors dépôt (mêmes `node_modules`, même `vitest.setup.ts`) : ces nombres sont mesurés.

⚠ Échap est nécessaire au test : sous jsdom, la seule sortie du champ (`user.tab()`) ne déclenche
pas la remise à zéro — mesuré, le test restait vert sous l'ablation a) sans elle.

**Step 6 : signaler**

Signaler : `src/components/ui/combobox.tsx` et son test,
`feat(web): liste à recherche avec création, repli des accents (TCK-633)`.

---

## Tâche 16 — Reconnaître une position collée, sans réseau (15 min)

Le lien LONG, le message de position WhatsApp, l'URI `geo:`, les degrés décimaux, les
degrés-minutes-secondes et les Plus Codes se lisent dans le navigateur. Le lien COURT se résout
par le serveur (tâche 7) ; le résultat le dit (`lien-a-resoudre`) au lieu de rendre « inconnu ».

Le paquet `open-location-code` est écarté (E-7 : 1.0.3, CommonJS, sans types, inchangé depuis
2022) ; le décodage tient en 85 lignes, éprouvées contre l'implémentation de référence.

Une référence est nécessaire pour un Plus Code COURT : c'est le **centre de la ville choisie**,
jamais Dakar par défaut — `HPMH+86` rapporté à Dakar tombe en mer, à 14,58° N, au lieu de
Ziguinchor (test « la référence DÉCIDE »).

**Fichiers**
- Créer : `takussan-web/src/lib/geo/plus-code.ts`, `takussan-web/src/lib/geo/reconnaitre-position.ts`
- Tests : `takussan-web/src/lib/geo/__tests__/plus-code.test.ts`, `reconnaitre-position.test.ts`
- Lit : `takussan-api/tests/fixtures/liens-google-maps.json` (tâche 7)

**Step 1 : les tests**

`src/lib/geo/__tests__/plus-code.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { decoderPlusCode, recupererPlusCodeCourt } from '@/lib/geo/plus-code';

/**
 * TCK-633 (AC9) — les Plus Codes, décodés sans le paquet `open-location-code` (E-7). Les vecteurs
 * ont été vérifiés contre l'implémentation de référence de Google le 2026-10-12.
 */
const DAKAR = { latitude: 14.6928, longitude: -17.4467 };

describe('decoderPlusCode', () => {
  it.each([
    ['7C64PG8J+MW', 14.7166875, -17.4676875],
    ['7C64MHV3+48', 14.6928125, -17.4466875],
    ['7c64pg8j+mw', 14.7166875, -17.4676875],
  ])('%s', (code, latitude, longitude) => {
    const point = decoderPlusCode(code);
    expect(point?.latitude).toBeCloseTo(latitude, 6);
    expect(point?.longitude).toBeCloseTo(longitude, 6);
  });

  it('refuse un code court, un code hors alphabet et une première paire impossible', () => {
    expect(decoderPlusCode('PG8J+MW')).toBeNull();
    expect(decoderPlusCode('7C64PG8J+MA')).toBeNull();
    expect(decoderPlusCode('XC64PG8J+MW')).toBeNull();
  });
});

describe('recupererPlusCodeCourt', () => {
  it('rapporte un code court à la cellule de la référence', () => {
    const point = recupererPlusCodeCourt('PG8J+MW', DAKAR);
    expect(point?.latitude).toBeCloseTo(14.7166875, 6);
    expect(point?.longitude).toBeCloseTo(-17.4676875, 6);
  });

  it('un code de quatre caractères avant le « + » aussi', () => {
    const point = recupererPlusCodeCourt('8J+MW', { latitude: 14.7, longitude: -17.45 });
    expect(point?.latitude).toBeCloseTo(14.7166875, 6);
    expect(point?.longitude).toBeCloseTo(-17.4676875, 6);
  });

  it('la référence DÉCIDE : HPMH+86 est à Ziguinchor rapporté à Ziguinchor, en mer rapporté à Dakar', () => {
    const ziguinchor = recupererPlusCodeCourt('HPMH+86', { latitude: 12.56, longitude: -16.27 });
    expect(ziguinchor?.latitude).toBeCloseTo(12.5833125, 6);
    expect(ziguinchor?.longitude).toBeCloseTo(-16.2719375, 6);
    expect(recupererPlusCodeCourt('HPMH+86', DAKAR)?.latitude).toBeCloseTo(14.5833125, 6);
  });
});
```

`src/lib/geo/__tests__/reconnaitre-position.test.ts` (`ROOT` : cinq niveaux au-dessus de
`src/lib/geo/__tests__`, soit la racine du dépôt — le patron de
`src/lib/__tests__/booking-quote.concordance.test.ts`, qui en remonte quatre depuis un niveau de
moins) :

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { coordonneesDepuisLienGoogle, horsDuSenegal, reconnaitrePosition } from '@/lib/geo/reconnaitre-position';

/**
 * TCK-633 (AC9) — « Collez un lien ou une position ». Les liens se jugent sur la fixture que
 * l'API lit aussi (`GoogleMapsCoordinatesTest`) : un format lu d'un seul côté rougit l'autre.
 */
interface Lien {
  readonly cas: string;
  readonly url: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const { liens } = JSON.parse(
  readFileSync(join(ROOT, 'takussan-api', 'tests', 'fixtures', 'liens-google-maps.json'), 'utf8'),
) as { liens: readonly Lien[] };

const DAKAR = { latitude: 14.6928, longitude: -17.4467 };

function coordonnees(saisie: string, reference: typeof DAKAR | null = DAKAR) {
  const r = reconnaitrePosition(saisie, reference);
  if (r.kind !== 'coordonnees') throw new Error(`${saisie} → ${r.kind}`);
  return r;
}

describe('coordonneesDepuisLienGoogle — concordance avec GoogleMapsCoordinates (API)', () => {
  it('la fixture partagée porte des cas', () => {
    expect(liens.length).toBeGreaterThanOrEqual(10);
  });

  it.each(liens.map((l) => [l.cas, l] as const))('%s', (_, l) => {
    const lu = coordonneesDepuisLienGoogle(l.url);
    if (l.latitude === null) {
      expect(lu).toBeNull();
      return;
    }
    expect(lu?.latitude).toBe(l.latitude);
    expect(lu?.longitude).toBe(l.longitude);
  });
});

describe('reconnaitrePosition', () => {
  it.each([
    ['7C64PG8J+MW', 'plus-code', 14.7166875, -17.4676875],
    ['PG8J+MW', 'plus-code-court', 14.7166875, -17.4676875],
    ['PG8J+MW Dakar, Sénégal', 'plus-code-court', 14.7166875, -17.4676875],
    ['8J+MW', 'plus-code-court', 14.7166875, -17.4676875],
    ['14.7166875, -17.4676875', 'decimal', 14.7166875, -17.4676875],
    ['14,7166875; -17,4676875', 'decimal', 14.7166875, -17.4676875],
    ['geo:14.7166,-17.4677?z=17', 'geo', 14.7166, -17.4677],
    [`14°43'00.1"N 17°28'03.6"W`, 'dms', 14.7166944, -17.4676667],
    [`N 14° 43' 0.1" W 17° 28' 3.6"`, 'dms', 14.7166944, -17.4676667],
    ['14°43′00,1″N 17°28′03,6″W', 'dms', 14.7166944, -17.4676667],
    [`14° 43.002' N, 17° 28.06' W`, 'dms', 14.7167, -17.4676667],
    ['Ma position : https://maps.google.com/maps?q=14.72046%2C-17.46744&z=17&hl=fr', 'lien', 14.72046, -17.46744],
  ])('%s', (saisie, source, latitude, longitude) => {
    const r = coordonnees(saisie);
    expect(r.source).toBe(source);
    expect(r.latitude).toBeCloseTo(latitude, 6);
    expect(r.longitude).toBeCloseTo(longitude, 6);
  });

  it('un code court se rapporte à la VILLE choisie, pas à Dakar', () => {
    const r = coordonnees('HPMH+86', { latitude: 12.5833125, longitude: -16.2719375 });
    expect(r.latitude).toBeCloseTo(12.5833125, 6);
    expect(r.longitude).toBeCloseTo(-16.2719375, 6);
  });

  it('un code court SANS ville choisie ne se devine pas', () => {
    expect(reconnaitrePosition('PG8J+MW', null)).toEqual({ kind: 'plus-code-court-sans-reference', code: 'PG8J+MW' });
  });

  it('un lien court se résout par le serveur', () => {
    expect(reconnaitrePosition('https://maps.app.goo.gl/x7Jk2mN9pQ', DAKAR)).toEqual({
      kind: 'lien-a-resoudre',
      url: 'https://maps.app.goo.gl/x7Jk2mN9pQ',
    });
  });

  it.each([
    'https://www.openstreetmap.org/#map=17/14.7/-17.4',
    'bonjour',
    '91.0, 10.0',
    '',
  ])('« %s » n’est pas une position', (saisie) => {
    expect(reconnaitrePosition(saisie, DAKAR)).toEqual({ kind: 'inconnu' });
  });

  it('hors du Sénégal est SIGNALÉ, pas refusé', () => {
    expect(horsDuSenegal({ latitude: 48.8566, longitude: 2.3522 })).toBe(true);
    expect(horsDuSenegal({ latitude: 14.7, longitude: -17.4 })).toBe(false);
  });
});
```

**Step 2 : rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web && npx vitest run src/lib/geo
```

Attendu : deux suites en échec d'import (`Failed to resolve import "@/lib/geo/plus-code"`).

**Step 3 : le décodage des Plus Codes**

`src/lib/geo/plus-code.ts` :

```ts
/**
 * TCK-633 (AC9) — les Plus Codes (Open Location Code), décodés ICI plutôt que par le paquet
 * `open-location-code` : 1.0.3, CommonJS, API par prototype, sans types, inchangé depuis 2022.
 *
 * Deux formes :
 *   · COMPLET (`7C64PG8J+MW`) — se décode seul ;
 *   · COURT (`PG8J+MW`, `8J+MW`) — il manque le préfixe ; on le récupère depuis un point de
 *     RÉFÉRENCE proche (le centre de la ville choisie), comme `recoverNearest` de la référence.
 *     ⚠ Une mauvaise référence ne lève rien : `HPMH+86` rapporté à Dakar tombe à 14,58° N, en mer,
 *     au lieu de Ziguinchor. C'est pourquoi la référence est la VILLE choisie, jamais Dakar par défaut.
 *
 * Vecteurs validés contre l'implémentation de référence (Google) le 2026-10-12.
 */
export const ALPHABET_PLUS_CODE = '23456789CFGHJMPQRVWX';
const RESOLUTIONS_DES_PAIRES = [20, 1, 0.05, 0.0025, 0.000125] as const;

export const PLUS_CODE_COMPLET = /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,7}$/;
export const PLUS_CODE_COURT = /^(?:[23456789CFGHJMPQRVWX]{2}){1,3}\+[23456789CFGHJMPQRVWX]{2,7}$/;

export interface PointPlusCode {
  readonly latitude: number;
  readonly longitude: number;
}

/** Le centre de la cellule d'un code COMPLET ; `null` pour toute autre forme. */
export function decoderPlusCode(code: string): PointPlusCode | null {
  const c = code.trim().toUpperCase();
  if (!PLUS_CODE_COMPLET.test(c)) return null;
  const nu = c.replace('+', '');
  // Le premier caractère borne la latitude (≤ 9 → 180°), le second la longitude (≤ 17 → 360°).
  if (ALPHABET_PLUS_CODE.indexOf(nu[0]) > 8 || ALPHABET_PLUS_CODE.indexOf(nu[1]) > 17) return null;

  let latitude = -90;
  let longitude = -180;
  let pasLat = 0;
  let pasLng = 0;
  for (let i = 0; i < Math.min(nu.length, 10); i += 2) {
    const resolution = RESOLUTIONS_DES_PAIRES[i / 2];
    latitude += ALPHABET_PLUS_CODE.indexOf(nu[i]) * resolution;
    longitude += ALPHABET_PLUS_CODE.indexOf(nu[i + 1]) * resolution;
    pasLat = resolution;
    pasLng = resolution;
  }
  // Au-delà de dix caractères : une grille de 5 lignes × 4 colonnes par caractère.
  for (let i = 10; i < nu.length; i++) {
    pasLat /= 5;
    pasLng /= 4;
    const chiffre = ALPHABET_PLUS_CODE.indexOf(nu[i]);
    latitude += Math.floor(chiffre / 4) * pasLat;
    longitude += (chiffre % 4) * pasLng;
  }
  return { latitude: latitude + pasLat / 2, longitude: longitude + pasLng / 2 };
}

/** Les `n` premiers caractères du code complet d'un point (au plus huit). */
function prefixeDe(latitude: number, longitude: number, n: number): string {
  let resteLat = Math.min(Math.max(latitude, -90), 90) + 90;
  let resteLng = (((longitude + 180) % 360) + 360) % 360;
  let code = '';
  for (const resolution of RESOLUTIONS_DES_PAIRES.slice(0, 4)) {
    const a = Math.min(Math.floor(resteLat / resolution), 19);
    const b = Math.min(Math.floor(resteLng / resolution), 19);
    code += ALPHABET_PLUS_CODE[a] + ALPHABET_PLUS_CODE[b];
    resteLat -= a * resolution;
    resteLng -= b * resolution;
  }
  return code.slice(0, n);
}

/** Un code COURT rapporté à la cellule la plus proche de la référence ; `null` sinon. */
export function recupererPlusCodeCourt(code: string, reference: PointPlusCode): PointPlusCode | null {
  const c = code.trim().toUpperCase();
  if (!PLUS_CODE_COURT.test(c)) return null;
  const manquants = 8 - c.indexOf('+');
  const resolution = Math.pow(20, 2 - manquants / 2);
  const demi = resolution / 2;
  const centre = decoderPlusCode(prefixeDe(reference.latitude, reference.longitude, manquants) + c);
  if (!centre) return null;

  let { latitude, longitude } = centre;
  if (reference.latitude + demi < latitude && latitude - resolution >= -90) latitude -= resolution;
  else if (reference.latitude - demi > latitude && latitude + resolution <= 90) latitude += resolution;
  if (reference.longitude + demi < longitude) longitude -= resolution;
  else if (reference.longitude - demi > longitude) longitude += resolution;
  return { latitude, longitude };
}
```

**Step 4 : la reconnaissance**

`src/lib/geo/reconnaitre-position.ts` :

```ts
import {
  decoderPlusCode,
  recupererPlusCodeCourt,
  type PointPlusCode,
} from '@/lib/geo/plus-code';

/**
 * TCK-633 (AC9) — « Collez un lien ou une position » : ce que la personne colle, reconnu SANS
 * réseau quand c'est possible.
 *
 * Ce qui se lit ici : un lien Google Maps LONG (`!3d…!4d…`, `?q=`, `query=`, `ll=`, `@lat,lng`),
 * le message de position de WhatsApp (`https://maps.google.com/maps?q=lat%2Clng`), une URI
 * `geo:`, des degrés décimaux, des degrés-minutes-secondes, un Plus Code complet ou court.
 *
 * Ce qui ne se lit PAS ici : un lien COURT (`maps.app.goo.gl/…`) ne porte aucune coordonnée — il
 * faut suivre sa redirection, ce que seul le serveur fait (`POST /api/geo/resolve-link`, garde
 * SSRF). Le résultat le dit (`lien-a-resoudre`) au lieu de renvoyer « inconnu ».
 *
 * ⚠ `coordonneesDepuisLienGoogle` a une JUMELLE côté API (`GoogleMapsCoordinates::depuisUrl`) :
 * les deux lisent `takussan-api/tests/fixtures/liens-google-maps.json`. Un format ajouté d'un
 * seul côté rougit l'autre suite.
 */
export interface Coordonnees {
  readonly latitude: number;
  readonly longitude: number;
}

export type SourcePosition = 'lien' | 'geo' | 'decimal' | 'dms' | 'plus-code' | 'plus-code-court';

export type PositionReconnue =
  | ({ readonly kind: 'coordonnees'; readonly source: SourcePosition } & Coordonnees)
  | { readonly kind: 'lien-a-resoudre'; readonly url: string }
  | { readonly kind: 'plus-code-court-sans-reference'; readonly code: string }
  | { readonly kind: 'inconnu' };

/** Le cadre du Sénégal (ADR-0062 §5) : hors de lui, la position est SIGNALÉE, jamais refusée. */
export const CADRE_SENEGAL = { latMin: 12.2, latMax: 16.8, lngMin: -17.6, lngMax: -11.3 } as const;

export function horsDuSenegal({ latitude, longitude }: Coordonnees): boolean {
  return (
    latitude < CADRE_SENEGAL.latMin ||
    latitude > CADRE_SENEGAL.latMax ||
    longitude < CADRE_SENEGAL.lngMin ||
    longitude > CADRE_SENEGAL.lngMax
  );
}

/** Les hôtes Google dont un lien se lit ou se résout. La liste de l'API est la même. */
const HOTES_GOOGLE = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'maps.google.sn',
  'www.google.com',
  'google.com',
  'www.google.sn',
  'google.sn',
]);

const NOMBRE_LAT = '(-?\\d{1,2}(?:\\.\\d+)?)';
const NOMBRE_LNG = '(-?\\d{1,3}(?:\\.\\d+)?)';
const PAIRE_EN_PARAMETRE = new RegExp(`^\\s*${NOMBRE_LAT}\\s*,\\s*${NOMBRE_LNG}\\s*$`);
const PAIRE_APRES_AROBASE = new RegExp(`/@${NOMBRE_LAT},${NOMBRE_LNG}(?:,|$|/|\\?)`);
const REPERE_DE_FICHE = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;

function valider(lat: string | number, lng: string | number): Coordonnees | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/**
 * Les coordonnées écrites dans un lien Google Maps, dans l'ordre de l'API : le repère de la fiche
 * (`!3d!4d`) d'abord — le `@` n'est que le CENTRE de la carte affichée, souvent décalé du lieu —,
 * puis les paramètres, puis le `@`.
 */
export function coordonneesDepuisLienGoogle(url: string): Coordonnees | null {
  let decode = url;
  try {
    decode = decodeURIComponent(url);
  } catch {
    // Un `%` isolé : on lit le lien tel quel.
  }

  const repere = REPERE_DE_FICHE.exec(decode);
  if (repere) return valider(repere[1], repere[2]);

  let parametres: URLSearchParams | null = null;
  try {
    parametres = new URL(url).searchParams;
  } catch {
    parametres = null;
  }
  for (const cle of ['q', 'query', 'll', 'center', 'destination']) {
    const valeur = parametres?.get(cle);
    const paire = valeur ? PAIRE_EN_PARAMETRE.exec(valeur) : null;
    if (paire) return valider(paire[1], paire[2]);
  }

  const arobase = PAIRE_APRES_AROBASE.exec(decode);
  if (arobase) return valider(arobase[1], arobase[2]);
  return null;
}

const URL_DANS_LE_TEXTE = /https?:\/\/[^\s<>"]+/i;
const URI_GEO = /^geo:\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i;
const DECIMAL_POINT = /^(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/;
const DECIMAL_VIRGULE = /^(-?\d{1,2},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)$/;
const CODE_COMPLET_DANS_LE_TEXTE = /(?:^|\s)([23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,7})(?=\s|,|$)/i;
const CODE_COURT_DANS_LE_TEXTE = /(?:^|\s)((?:[23456789CFGHJMPQRVWX]{2}){1,3}\+[23456789CFGHJMPQRVWX]{2,7})(?=\s|,|$)/i;

/**
 * Une composante en degrés-minutes-secondes : `14°43'00.1"N`, `17°28′03,6″ W`, `14° 43.002' N`.
 * L'hémisphère se lit APRÈS (forme de Google) ou AVANT (`N 14° 43' 0.1"`) — jamais les deux à la
 * fois : lue d'un seul motif, la lettre d'une composante était prise pour la suite de la précédente.
 */
const DEGRES = "(\\d{1,3})\\s*°\\s*(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*['′’])?\\s*(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*(?:[\"″”]|''))?";
const DMS_HEMISPHERE_APRES = new RegExp(`${DEGRES}\\s*([NSEWO])?`, 'gi');
const DMS_HEMISPHERE_AVANT = new RegExp(`([NSEWO])\\s*${DEGRES}`, 'gi');

function lireDms(saisie: string): Coordonnees | null {
  const avant = /^[NSEWO]\s*\d/i.test(saisie);
  const composantes = [...saisie.matchAll(avant ? DMS_HEMISPHERE_AVANT : DMS_HEMISPHERE_APRES)].map((m) =>
    avant
      ? { hemisphere: m[1], degres: m[2], minutes: m[3], secondes: m[4] }
      : { hemisphere: m[4], degres: m[1], minutes: m[2], secondes: m[3] },
  );
  if (composantes.length !== 2) return null;

  const valeurs = composantes.map((c) => {
    const hemisphere = (c.hemisphere ?? '').toUpperCase();
    const minutes = c.minutes ? Number(c.minutes.replace(',', '.')) : 0;
    const secondes = c.secondes ? Number(c.secondes.replace(',', '.')) : 0;
    if (minutes >= 60 || secondes >= 60) return null;
    const valeur = Number(c.degres) + minutes / 60 + secondes / 3600;
    return { hemisphere, valeur: ['S', 'W', 'O'].includes(hemisphere) ? -valeur : valeur };
  });
  if (valeurs.some((v) => v === null)) return null;
  const [a, b] = valeurs as { hemisphere: string; valeur: number }[];
  // L'ordre usuel est latitude puis longitude ; une longitude (E/W/O) en tête l'inverse.
  const inverse = ['E', 'W', 'O'].includes(a.hemisphere) || ['N', 'S'].includes(b.hemisphere);
  const [lat, lng] = inverse ? [b.valeur, a.valeur] : [a.valeur, b.valeur];
  return valider(Number(lat.toFixed(7)), Number(lng.toFixed(7)));
}

/**
 * @param reference le centre de la ville choisie — il rapporte un Plus Code COURT à sa cellule.
 *                  Sans elle, un code court est rendu tel quel (`plus-code-court-sans-reference`).
 */
export function reconnaitrePosition(saisie: string, reference?: PointPlusCode | null): PositionReconnue {
  const texte = saisie.trim();
  if (texte === '') return { kind: 'inconnu' };

  const lien = URL_DANS_LE_TEXTE.exec(texte);
  if (lien) {
    const url = lien[0].replace(/[).,;]+$/, '');
    let hote = '';
    try {
      hote = new URL(url).hostname.toLowerCase();
    } catch {
      return { kind: 'inconnu' };
    }
    if (!HOTES_GOOGLE.has(hote)) return { kind: 'inconnu' };
    const lu = coordonneesDepuisLienGoogle(url);
    if (lu) return { kind: 'coordonnees', source: 'lien', ...lu };
    return { kind: 'lien-a-resoudre', url };
  }

  const geo = URI_GEO.exec(texte);
  if (geo) {
    const lu = valider(geo[1], geo[2]);
    return lu ? { kind: 'coordonnees', source: 'geo', ...lu } : { kind: 'inconnu' };
  }

  const complet = CODE_COMPLET_DANS_LE_TEXTE.exec(texte);
  if (complet) {
    const lu = decoderPlusCode(complet[1]);
    return lu ? { kind: 'coordonnees', source: 'plus-code', ...lu } : { kind: 'inconnu' };
  }
  const court = CODE_COURT_DANS_LE_TEXTE.exec(texte);
  if (court) {
    const code = court[1].toUpperCase();
    if (!reference) return { kind: 'plus-code-court-sans-reference', code };
    const lu = recupererPlusCodeCourt(code, reference);
    return lu ? { kind: 'coordonnees', source: 'plus-code-court', ...lu } : { kind: 'inconnu' };
  }

  const point = DECIMAL_POINT.exec(texte);
  if (point) {
    const lu = valider(point[1], point[2]);
    if (lu) return { kind: 'coordonnees', source: 'decimal', ...lu };
  }
  const virgule = DECIMAL_VIRGULE.exec(texte);
  if (virgule) {
    const lu = valider(virgule[1].replace(',', '.'), virgule[2].replace(',', '.'));
    if (lu) return { kind: 'coordonnees', source: 'decimal', ...lu };
  }

  const dms = lireDms(texte);
  if (dms) return { kind: 'coordonnees', source: 'dms', ...dms };

  return { kind: 'inconnu' };
}
```

**Step 5 : vert, types**

```bash
npx vitest run src/lib/geo
npx tsc --noEmit
npx eslint src/lib/geo
```

Attendu : `39 passed` (7 + 32) ; `tsc` muet ; ESLint 0 erreur. Mesuré le 2026-10-12 dans un
harnais hors dépôt (mêmes `node_modules`, même configuration vitest, la fixture de la tâche 7 à
son chemin) : `39 passed`.

**Step 6 : ablations**

```bash
mkdir -p "$S/abl/t16" && R=src/lib/geo/reconnaitre-position.ts && P=src/lib/geo/plus-code.ts
cp $R "$S/abl/t16/r.ts" && cp $P "$S/abl/t16/p.ts"
# a) le repère de la fiche ignoré : le centre « @ » l'emporte
sed -i '' 's/  if (repere) return valider(repere\[1\], repere\[2\]);/  if (repere \&\& false) return valider(repere[1], repere[2]);/' $R
npx vitest run src/lib/geo
cp "$S/abl/t16/r.ts" $R && md5 -q $R "$S/abl/t16/r.ts"
# b) un code court toujours rapporté à Dakar
sed -i '' 's/prefixeDe(reference.latitude, reference.longitude, manquants)/prefixeDe(14.6928, -17.4467, manquants)/' $P
npx vitest run src/lib/geo
cp "$S/abl/t16/p.ts" $P && md5 -q $P "$S/abl/t16/p.ts"
# c) l'hémisphère écrit AVANT le nombre n'est plus lu
sed -i '' "s/const avant = \/\^\[NSEWO\]\\\\s\*\\\\d\/i.test(saisie);/const avant = false;/" $R
grep -n "const avant" $R
npx vitest run src/lib/geo
cp "$S/abl/t16/r.ts" $R && md5 -q $R "$S/abl/t16/r.ts" && npx vitest run src/lib/geo
```

Attendu (mesuré dans le harnais) : a) 1 échec — « fiche : le repère !3d!4d l'emporte sur le centre
@ » ; b) 2 échecs — « la référence DÉCIDE » et « un code court se rapporte à la VILLE choisie » ;
c) `grep` montre `const avant = false;`, puis 1 échec — `N 14° 43' 0.1" W 17° 28' 3.6"` ;
`md5` identiques ; `39 passed`.

**Step 7 : signaler**

Signaler : les deux modules et leurs deux tests,
`feat(web): reconnaître un lien, un Plus Code ou des coordonnées collés (TCK-633)`.

---

## Tâche 17 — Le coût d'entrée de l'aperçu, jumeau de l'API (10 min)

**Fichiers**
- Créer : `takussan-web/src/lib/cout-d-entree.ts`
- Test : `takussan-web/src/lib/__tests__/cout-d-entree.concordance.test.ts`
- Lit : `takussan-api/tests/fixtures/cout-d-entree.json` (tâche 9)

**Step 1 : le test**

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { coutDEntreeTotal, type EntreeCoutDEntree } from '@/lib/cout-d-entree';

/**
 * TCK-633 — concordance avec l'API : `takussan-api/tests/fixtures/cout-d-entree.json` est lu par
 * CE test et par `tests/Unit/Services/Property/CoutDEntreeConcordanceTest.php`. Le total que
 * l'aperçu affiche est, au franc près, celui que la fiche publiée affichera.
 */
interface Cas {
  readonly nom: string;
  readonly entree: EntreeCoutDEntree;
  readonly total: string | null;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const { cas } = JSON.parse(
  readFileSync(join(ROOT, 'takussan-api', 'tests', 'fixtures', 'cout-d-entree.json'), 'utf8'),
) as { cas: readonly Cas[] };

/** Le formulaire tient des NOMBRES (`FormAmountInput`, `z.coerce`) ; la fixture, des chaînes. */
function enNombres(e: EntreeCoutDEntree): EntreeCoutDEntree {
  const n = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? v : Number(v));
  return {
    ...e,
    price: n(e.price),
    agency_fee_months: n(e.agency_fee_months),
    monthly_charges: n(e.monthly_charges),
  };
}

describe('coutDEntreeTotal — concordance avec CoutDEntree (API)', () => {
  it('la fixture porte des cas des deux sortes', () => {
    expect(cas.length).toBeGreaterThanOrEqual(15);
    expect(cas.some((c) => c.total === null)).toBe(true);
  });

  it.each(cas.map((c) => [c.nom, c] as const))('%s', (_, c) => {
    const attendu = c.total === null ? null : Number(c.total);
    expect(coutDEntreeTotal(c.entree)).toBe(attendu);
    expect(coutDEntreeTotal(enNombres(c.entree))).toBe(attendu);
  });
});
```

**Step 2 : rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web && npx vitest run src/lib/__tests__/cout-d-entree.concordance.test.ts
```

Attendu : échec d'import (`Failed to resolve import "@/lib/cout-d-entree"`).

**Step 3 : la fonction**

`src/lib/cout-d-entree.ts` :

```ts
/**
 * TCK-633 — le coût d'entrée d'une location mensuelle, pour l'APERÇU du parcours de création, qui
 * l'affiche avant que le bien existe.
 *
 *     total = (loyer + charges) × mois d'avance + loyer × mois de caution + loyer × mois de frais
 *
 * ⚠ Jumelle de `CoutDEntree::pour` (API). Les deux sont jugées par la MÊME fixture,
 * `takussan-api/tests/fixtures/cout-d-entree.json` : un écart d'un franc rougit une des deux
 * suites. La fiche publiée lit le total de l'API, jamais celui-ci.
 *
 * Le calcul est fait en ENTIERS (centièmes × centièmes = dix-millièmes) : en flottants,
 * `333 333 × 1,5` vaut `499 999,49999…` sur certaines entrées, et l'arrondi « demi vers le haut »
 * tombe du mauvais côté. `BigInt(…)` et non `10000n` : la cible TypeScript est ES2017.
 */
export interface EntreeCoutDEntree {
  readonly price: number | string | null | undefined;
  readonly currency: string | null | undefined;
  readonly contract_type: string | null | undefined;
  readonly rent_period: string | null | undefined;
  readonly advance_months: number | string | null | undefined;
  readonly deposit_months: number | string | null | undefined;
  readonly agency_fee_months: number | string | null | undefined;
  readonly monthly_charges: number | string | null | undefined;
}

/** Les devises sans sous-unité : le total s'arrondit au franc (principe n°3). */
const SANS_DECIMALES = new Set(['XOF', 'XAF']);

const ZERO = BigInt(0);
const DEUX = BigInt(2);
const CENT = BigInt(100);
const DIX_MILLE = BigInt(10000);

type Valeur = number | string | null | undefined;

function vide(v: Valeur): v is null | undefined | '' {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));
}

/** « 1500.5 », 1500.5, « 0.33 » → un entier de centièmes, sans multiplier un flottant. */
function centiemes(v: Valeur): bigint {
  if (vide(v)) return ZERO;
  const texte = typeof v === 'number' ? v.toFixed(2) : String(v).trim();
  const m = /^(\d+)(?:\.(\d{1,2})\d*)?$/.exec(texte);
  if (!m) return ZERO;
  return BigInt(m[1]) * CENT + BigInt((m[2] ?? '').padEnd(2, '0'));
}

function mois(v: Valeur): bigint {
  return vide(v) ? ZERO : BigInt(Math.trunc(Number(v)) || 0);
}

/** Le total, arrondi à l'unité de la devise (la moitié vers le haut) ; `null` = aucun bloc. */
export function coutDEntreeTotal(e: EntreeCoutDEntree): number | null {
  // Une location sans période EST mensuelle (`Property::booted()`, côté API).
  if (e.contract_type !== 'rent' || (e.rent_period || 'monthly') !== 'monthly') return null;
  if ([e.advance_months, e.deposit_months, e.agency_fee_months, e.monthly_charges].every(vide)) return null;

  const loyer = centiemes(e.price);
  const charges = centiemes(e.monthly_charges);
  const frais = centiemes(e.agency_fee_months);
  const dixMilliemes = ((loyer + charges) * mois(e.advance_months) + loyer * mois(e.deposit_months)) * CENT + loyer * frais;

  const pas = SANS_DECIMALES.has(e.currency || 'XOF') ? DIX_MILLE : CENT;
  const arrondi = (DEUX * dixMilliemes + pas) / (DEUX * pas);
  return Number(arrondi * (pas / CENT)) / 100;
}
```

**Step 4 : vert, types**

```bash
npx vitest run src/lib/__tests__/cout-d-entree.concordance.test.ts
npx tsc --noEmit
```

Attendu : `16 passed` (mesuré dans le harnais) ; `tsc` muet.

**Step 5 : ablations**

```bash
mkdir -p "$S/abl/t17" && F=src/lib/cout-d-entree.ts && cp $F "$S/abl/t17/c.ts"
# a) troncature au lieu de l'arrondi
sed -i '' 's/const arrondi = (DEUX \* dixMilliemes + pas) \/ (DEUX \* pas);/const arrondi = dixMilliemes \/ pas;/' $F
npx vitest run src/lib/__tests__/cout-d-entree.concordance.test.ts
cp "$S/abl/t17/c.ts" $F && md5 -q $F "$S/abl/t17/c.ts"
# b) une période absente n'est plus mensuelle
sed -i '' "s/(e.rent_period || 'monthly') !== 'monthly'/e.rent_period !== 'monthly'/" $F
npx vitest run src/lib/__tests__/cout-d-entree.concordance.test.ts
cp "$S/abl/t17/c.ts" $F && md5 -q $F "$S/abl/t17/c.ts" && npx vitest run src/lib/__tests__/cout-d-entree.concordance.test.ts
```

Attendu (mesuré dans le harnais) : a) 6 échecs ; b) 1 échec — « période absente : mensuelle par
défaut » ; `md5` identiques ; `16 passed`.

**Step 6 : signaler**

Signaler : les deux fichiers, `feat(web): coût d'entrée de l'aperçu, tenu à l'API par une fixture commune (TCK-633)`.

---

---

## Tâche 18 — Le schéma et le corps de requête (10 min)

Le formulaire porte trois identifiants de plus (`geo_region_id`, `geo_city_id`,
`geo_neighborhood_id`) et les noms d'équipements proposés (`tag_names`). Deux règles :
l'identifiant d'une ville ou d'un quartier CHOISI part **dans le bloc adresse**, à côté du texte
(`address.geo_city_id`, `address.geo_neighborhood_id` : contrat de la tâche 3) ; la région du
référentiel et `tag_names` ne partent **jamais** au premier niveau — la première n'a pas de
colonne, le second a son endpoint (tâche 11).

Un identifiant nul est **omis**, pas envoyé : `blocAdresse` saute déjà `null`, et le serveur
rapproche alors le nom lui-même (`AddressCanonicalizer`, tâche 3, branche
`isDirty('city') && geo_city_id === null`).

Les bornes numériques du schéma front sont DÉJÀ celles de la tâche 8 (lu : `bedrooms`/`bathrooms`
`max(100)` L213-224, `parking_spaces` `max(500)` L232-237, `floor_number` `min(-5)` `max(200)`
L238-243, `total_floors` `min(1)` `max(200)` L244-249) : aucune modification.

**Fichiers**
- Modifier : `takussan-web/src/lib/schemas/property.ts` (L170-175, L256)
- Modifier : `takussan-web/src/components/property-form/payload.ts` (L24-37, L53-60, L122-123)
- Test : `takussan-web/src/components/property-form/__tests__/payload.referentiel.test.ts` (nouveau)

**Step 1 : le test**

`src/components/property-form/__tests__/payload.referentiel.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { toCreatePayload, toUpdatePayload, type PropertyUpdatePayload } from '../payload';
import { propertyFormSchema } from '@/lib/schemas/property';

/**
 * TCK-633 (lot D) — les identifiants du référentiel et les équipements proposés dans le corps.
 *
 * Deux règles : l'identifiant d'une ville ou d'un quartier CHOISI part DANS le bloc adresse, à
 * côté du texte (`StorePropertyRequest` déclare `address.geo_city_id`) ; la région du référentiel
 * et les noms d'équipements ne partent JAMAIS au premier niveau — le premier n'a pas de colonne,
 * le second a son endpoint (`PUT …/tags`).
 */
const saisie = { title: 'Villa', type: 'villa', contract_type: 'sale', price: 1000, city: 'Dakar' };

describe('le référentiel dans le corps de requête', () => {
  it('l’identifiant de la ville et du quartier choisis part dans le bloc adresse', () => {
    const valeurs = propertyFormSchema.parse({
      ...saisie, quarter: 'Liberté 4', geo_region_id: 1, geo_city_id: 10, geo_neighborhood_id: 100,
    });
    expect(toCreatePayload(valeurs).address).toEqual({
      city: 'Dakar', neighborhood: 'Liberté 4', geo_city_id: 10, geo_neighborhood_id: 100,
    });
  });

  it('un identifiant nul (texte retapé) est omis : le serveur rapproche alors le nom lui-même', () => {
    const valeurs = propertyFormSchema.parse({ ...saisie, quarter: 'Keur Gorgui Nord', geo_city_id: 10, geo_neighborhood_id: null });
    expect(toUpdatePayload(valeurs).address).toEqual({ city: 'Dakar', neighborhood: 'Keur Gorgui Nord', geo_city_id: 10 });
  });

  it('ni la région du référentiel ni les identifiants ne restent au premier niveau', () => {
    const valeurs = propertyFormSchema.parse({ ...saisie, geo_region_id: 1, geo_city_id: 10, geo_neighborhood_id: 100 });
    for (const corps of [toCreatePayload(valeurs), toUpdatePayload(valeurs)]) {
      for (const cle of ['geo_region_id', 'geo_city_id', 'geo_neighborhood_id']) {
        expect(corps, `${cle} ne doit pas rester au premier niveau`).not.toHaveProperty(cle);
      }
    }
  });

  it('un identifiant nul ou négatif est refusé dès le formulaire', () => {
    expect(propertyFormSchema.safeParse({ ...saisie, geo_city_id: 0 }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...saisie, geo_neighborhood_id: -3 }).success).toBe(false);
  });
});

describe('les équipements proposés', () => {
  it('`tag_names` vaut [] par défaut et ses noms sont épurés', () => {
    expect(propertyFormSchema.parse(saisie).tag_names).toEqual([]);
    expect(propertyFormSchema.parse({ ...saisie, tag_names: ['  Forage  '] }).tag_names).toEqual(['Forage']);
  });

  it('un nom vide ou de plus de 100 caractères est refusé', () => {
    expect(propertyFormSchema.safeParse({ ...saisie, tag_names: ['   '] }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...saisie, tag_names: ['x'.repeat(101)] }).success).toBe(false);
  });

  it('`tag_names` ne part jamais dans le corps du bien', () => {
    const valeurs = propertyFormSchema.parse({ ...saisie, tag_ids: [3], tag_names: ['Forage'] });
    expect(toCreatePayload(valeurs)).not.toHaveProperty('tag_names');
    expect(toUpdatePayload(valeurs)).not.toHaveProperty('tag_ids');
  });
});

/** Vérifié par `npx tsc --noEmit`, pas par vitest : la directive devient INUTILISÉE si l'interdit tombe. */
export const interditsDeTypage: Pick<PropertyUpdatePayload, 'tag_names' | 'geo_region_id'>[] = [
  // @ts-expect-error — `tag_names` au premier niveau ne compile pas.
  { tag_names: ['Forage'] },
  // @ts-expect-error — `geo_region_id` non plus.
  { geo_region_id: 1 },
];
```

**Step 2 : rouge**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/components/property-form/__tests__/payload.referentiel.test.ts
```

Attendu : `5 failed | 2 passed (7)`. Les cinq rouges : le schéma d'avant JETTE les clés qu'il ne
déclare pas (`z.object` les retire), donc ni identifiant dans l'adresse, ni `tag_names` épuré, ni
refus d'un identifiant nul. Les deux verts — « ni la région ni les identifiants ne restent au
premier niveau » et « `tag_names` ne part jamais dans le corps » — le sont pour cette même raison
et deviennent de vraies gardes une fois les clés déclarées : ils rougissent par ablation (Step 6).
Mesuré dans le harnais : `5 failed | 2 passed`.

**Step 3 : le schéma**

`src/lib/schemas/property.ts`, Edit 1 (L170-175, après `region`) :

```
old:    .max(120, msgValidation('property.regionTooLong'))
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  street: z
new:    .max(120, msgValidation('property.regionTooLong'))
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  // TCK-633 — les identifiants du référentiel (ADR-0062). Le TEXTE reste la valeur affichée et
  // envoyée ; l'identifiant le PRÉCISE quand la saisie est un choix de la liste, et vaut `null`
  // dès qu'on retape. La région ne part pas (l'adresse n'a pas de colonne pour elle) : elle ne
  // sert qu'à restreindre la liste des villes.
  geo_region_id: z.number().int().positive().nullable().optional(),
  geo_city_id: z.number().int().positive().nullable().optional(),
  geo_neighborhood_id: z.number().int().positive().nullable().optional(),
  street: z
```

Edit 2 (L256) :

```
old:  tag_ids: z.array(z.number().int().positive()).default([]),
new:  tag_ids: z.array(z.number().int().positive()).default([]),
  // TCK-633 — les équipements saisis hors du catalogue : des PROPOSITIONS, créées en attente
  // (`TagProposals`). Même chemin que `tag_ids` : `PUT …/tags`, jamais le corps du bien.
  tag_names: z.array(z.string().trim().min(1).max(100)).default([]),
```

`max(100)` est la règle de `SyncPropertyTagRequest` (tâche 11, `tag_names.*`).

**Step 4 : le corps**

`src/components/property-form/payload.ts`, Edit 1 (L24-37) :

```
old:  latitude?: number | null;
  longitude?: number | null;
};

const CLES_ADRESSE = [
  'street', 'quarter', 'city', 'region', 'country', 'postal_code', 'latitude', 'longitude',
] as const;
new:  latitude?: number | null;
  longitude?: number | null;
  /** TCK-633 — l'identifiant du référentiel, quand la ville ou le quartier a été CHOISI. */
  geo_city_id?: number | null;
  geo_neighborhood_id?: number | null;
};

const CLES_ADRESSE = [
  'street', 'quarter', 'city', 'region', 'country', 'postal_code', 'latitude', 'longitude',
  'geo_city_id', 'geo_neighborhood_id',
] as const;

/**
 * TCK-633 — ce que le formulaire porte et que le corps du bien ne porte JAMAIS : la région du
 * référentiel (un filtre de la liste des villes, sans colonne) et les équipements proposés (même
 * endpoint que `tag_ids`).
 */
const CLES_HORS_CORPS = ['tag_ids', 'tag_names', 'geo_region_id'] as const;

type CleHorsCorps = (typeof CLES_HORS_CORPS)[number];
```

Edit 2 (L53-60) :

```
old:type ClesInterditesAuPremierNiveau = {
  [K in CleAdresseFormulaire | 'tag_ids']?: never;
};

type ChampsDuFormulaireHorsAdresse = Omit<
  PropertyFormPayload,
  CleAdresseFormulaire | 'tag_ids'
>;
new:type ClesInterditesAuPremierNiveau = {
  [K in CleAdresseFormulaire | CleHorsCorps]?: never;
};

type ChampsDuFormulaireHorsAdresse = Omit<
  PropertyFormPayload,
  CleAdresseFormulaire | CleHorsCorps
>;
```

Edit 3 (L122-123) :

```
old:  for (const cle of CLES_ADRESSE) delete corps[cle];
  delete corps.tag_ids;
new:  for (const cle of CLES_ADRESSE) delete corps[cle];
  for (const cle of CLES_HORS_CORPS) delete corps[cle];
```

**Step 5 : vert, types**

```bash
npx vitest run src/components/property-form/__tests__/payload
npx tsc --noEmit
```

Attendu : `25 passed` (18 existants + 7) ; `tsc` muet — les deux `@ts-expect-error` du test sont
UTILISÉS. Mesuré dans le harnais : `25 passed`, `tsc` muet.

**Step 6 : ablations**

```bash
mkdir -p "$S/abl/t18" && P=src/components/property-form/payload.ts && cp $P "$S/abl/t18/payload.ts"
# a) les identifiants ne partent plus dans l'adresse
sed -i '' "/^  'geo_city_id', 'geo_neighborhood_id',$/d" $P
npx vitest run src/components/property-form/__tests__/payload.referentiel.test.ts
cp "$S/abl/t18/payload.ts" $P
# b) `tag_names` et la région restent dans le corps
sed -i '' 's/^  for (const cle of CLES_HORS_CORPS) delete corps\[cle\];$/  delete corps.tag_ids;/' $P
npx vitest run src/components/property-form/__tests__/payload.referentiel.test.ts
cp "$S/abl/t18/payload.ts" $P
# c) l'interdit de TYPAGE tombe pour `tag_names`
sed -i '' "s/const CLES_HORS_CORPS = \['tag_ids', 'tag_names', 'geo_region_id'\]/const CLES_HORS_CORPS = ['tag_ids', 'geo_region_id']/" $P
npx tsc --noEmit
cp "$S/abl/t18/payload.ts" $P && md5 -q $P "$S/abl/t18/payload.ts" && npx vitest run src/components/property-form/__tests__/payload
```

Attendu (mesuré dans le harnais) : a) 3 échecs (les deux tests du bloc adresse et « ni la région
ni les identifiants ne restent au premier niveau ») ; b) 2 échecs (« ni la région… » et
« `tag_names` ne part jamais dans le corps ») ; c) `error TS2578: Unused '@ts-expect-error'
directive` sur la ligne `{ tag_names: ['Forage'] }` ; `md5` identiques ; `25 passed`.

**Step 7 : signaler**

Signaler : `property.ts`, `payload.ts`, le test,
`feat(web): identifiants du référentiel et équipements proposés dans le formulaire (TCK-633)`.

---

## Tâche 19 — Le lieu : région, ville, quartier, position collée (25 min)

Trois composants, un hook, une doublure :

- `useReferentielGeo` — les trois listes (`/api/public/geo/regions`, `cities[?region=]`,
  `neighborhoods?city=`, tâche 5) ; `useResolutionDeLien` — `POST /api/geo/resolve-link` (tâche 7).
- `ChampsLieu` — région → ville → quartier en `Combobox` à saisie libre (tâche 15). Le TEXTE reste
  la valeur du formulaire ; l'identifiant le précise, et retombe à `null` dès qu'on retape.
- `ChampsPosition` — « Collez un lien ou une position » (tâche 16), latitude et longitude
  **visibles et modifiables** (ticket, lot D : « latitude / longitude visibles et modifiables »),
  et la carte, recentrée sur la ville choisie.
- `LocationPickerMap` — le recentrage : `center` de `MapContainer` n'est lu qu'au MONTAGE (lu,
  L38-46), une position collée tombait hors de la vue.
- `src/test/doublure-referentiel-geo.ts` — les tests du parcours qui ne mettent PAS le
  référentiel à l'épreuve le remplacent par des listes vides : sans elle, `useApiQuery` exige un
  `QueryClientProvider` et `useAuth` un `AuthProvider`, et **40 tests** du parcours rougissent
  (mesuré dans le harnais, avant la doublure).

Deux décisions mesurées, à ne pas défaire :

1. **Une liste vide ne s'ouvre pas** (tâche 15, `open={ouvert && (options.length > 0 ||
   items.length > 0)}`). Ouverte, la liste de Base UI rend le reste de la page `aria-hidden` —
   `FloatingFocusManager` est modal dès que la saisie est hors du popup
   (`node_modules/@base-ui/react/combobox/popup/ComboboxPopup.js` L111 :
   `const focusManagerModal = !inputInsidePopup || modal;`). Mesuré : avant cette règle, **24 tests**
   de `PropertyWizard.test.tsx` ne trouvaient plus le bouton « Continuer » après avoir tapé la
   ville (`Unable to find an accessible element with the role "button" and name /^continuer$/i`).
2. **Choisir une option écrit le texte AVANT l'identifiant** (tâche 15, `onValueChange`) :
   `surSaisie` remet l'identifiant à `null`, et l'appeler après `onChange` effaçait le choix.

**Fichiers**
- Créer : `takussan-web/src/types/geo.ts`
- Créer : `takussan-web/src/components/property-form/useReferentielGeo.ts`
- Créer : `takussan-web/src/components/property-form/ChampsLieu.tsx`
- Créer : `takussan-web/src/components/property-form/ChampsPosition.tsx`
- Créer : `takussan-web/src/test/doublure-referentiel-geo.ts`
- Modifier : `takussan-web/src/components/map/LocationPickerMap.tsx` (L5-6, L9-15, L26, L38-39, L52)
- Modifier : `takussan-web/src/components/property-form/wizard/steps/StepLieu.tsx` (L6-14, L90-94, L98-105, L155-175, L240-248)
- Modifier (une ligne chacun) : `__tests__/wizard-steps.test.tsx` (L9), `__tests__/PropertyWizard.test.tsx` (L22),
  `__tests__/abonnement-des-etapes.test.tsx` (L14, L174-185), `__tests__/cibles-tactiles.test.tsx` (L10) — ⚠ hors territoire (E-12)
- Tests : `__tests__/ChampsLieu.test.tsx`, `__tests__/ChampsPosition.test.tsx`,
  `src/components/map/__tests__/LocationPickerMap.recentrage.test.tsx` (nouveaux)

**Step 1 : les tests**

`src/components/property-form/__tests__/ChampsLieu.test.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';

/**
 * TCK-633 (AC9) — région, ville et quartier choisis dans le référentiel.
 *
 * Le référentiel est une doublure REMPLIE (deux régions, trois villes, trois quartiers de Dakar dont
 * une proposition en attente) : c'est elle qui fait la différence avec la doublure vide des tests
 * du parcours, où les mêmes champs restent du texte libre.
 */
vi.mock('@/components/property-form/useReferentielGeo', () => {
  const regions = [
    { id: 1, name: 'Dakar', slug: 'dakar' },
    { id: 2, name: 'Thiès', slug: 'thies' },
  ];
  const villes = [
    { id: 10, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: 14.7215, longitude: -17.4728 },
    { id: 11, region_id: 1, name: 'Guédiawaye', slug: 'guediawaye', latitude: 14.7731, longitude: -17.3943 },
    { id: 20, region_id: 2, name: 'Thiès', slug: 'thies', latitude: 14.791, longitude: -16.9359 },
  ];
  const quartiers = [
    { id: 100, city_id: 10, name: 'Liberté 4', slug: 'liberte-4', latitude: null, longitude: null, status: 'approved' },
    { id: 101, city_id: 10, name: 'Mermoz', slug: 'mermoz', latitude: null, longitude: null, status: 'approved' },
    { id: 102, city_id: 10, name: 'Cité Moi', slug: 'cite-moi', latitude: null, longitude: null, status: 'pending' },
  ];
  return {
    useReferentielGeo: (regionId: number | null, villeId: number | null) => ({
      regions,
      villes: regionId === null ? villes : villes.filter((v) => v.region_id === regionId),
      quartiers: villeId === 10 ? quartiers : [],
      chargement: { villes: false, quartiers: false },
    }),
    useResolutionDeLien: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

import { ChampsLieu } from '../ChampsLieu';

function harnais(defauts: Partial<PropertyFormValues> = {}) {
  const sortie: { form?: UseFormReturn<PropertyFormValues> } = {};
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: {
        title: '', type: 'apartment', contract_type: 'rent', city: '', furnished: false, tag_ids: [],
        ...defauts,
      } as PropertyFormValues,
    });
    sortie.form = form;
    return <ChampsLieu form={form} />;
  }
  render(withIntl(<Harnais />));
  return () => sortie.form!.getValues();
}

describe('ChampsLieu — le référentiel', () => {
  it('choisir une ville pose son identifiant ET sa région', async () => {
    const user = userEvent.setup();
    const valeurs = harnais();

    await user.type(screen.getByLabelText(/ville/i), 'Guéd');
    await user.click(await screen.findByRole('option', { name: 'Guédiawaye' }));

    expect(screen.getByLabelText(/ville/i)).toHaveValue('Guédiawaye');
    expect(screen.getByLabelText(/région/i)).toHaveValue('Dakar');
    expect(valeurs()).toMatchObject({ city: 'Guédiawaye', geo_city_id: 11, region: 'Dakar', geo_region_id: 1 });
  });

  it('une recherche sans accent trouve le nom accentué', async () => {
    const user = userEvent.setup();
    harnais();

    await user.type(screen.getByLabelText(/ville/i), 'guediawaye');

    expect(await screen.findByRole('option', { name: 'Guédiawaye' })).toBeInTheDocument();
  });

  it('un texte déjà là (brouillon, géo-IP) reçoit l’identifiant de la SEULE ville qu’il nomme', async () => {
    const valeurs = harnais({ city: 'DAKAR' });

    await waitFor(() => expect(valeurs().geo_city_id).toBe(10));
    // La région, que personne n'avait écrite, suit la ville.
    expect(valeurs()).toMatchObject({ region: 'Dakar', geo_region_id: 1 });
  });

  it('retaper efface l’identifiant : un texte corrigé ne part pas avec l’ancien choix', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({ city: 'Dakar', geo_city_id: 10, region: 'Dakar', geo_region_id: 1 });

    await user.type(screen.getByLabelText(/ville/i), ' Plateau');

    expect(valeurs()).toMatchObject({ city: 'Dakar Plateau', geo_city_id: null });
  });

  it('un quartier inconnu s’ajoute DEPUIS la liste et part en texte seul, avec son indice', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({ city: 'Dakar', geo_city_id: 10 });

    await user.type(screen.getByLabelText(/quartier/i), 'Keur Gorgui Nord');
    await user.click(await screen.findByRole('option', { name: /ajouter « keur gorgui nord »/i }));

    expect(screen.getByLabelText(/quartier/i)).toHaveValue('Keur Gorgui Nord');
    expect(valeurs()).toMatchObject({ quarter: 'Keur Gorgui Nord', geo_neighborhood_id: null });
    expect(screen.getByText(/nouveau quartier : notre équipe le vérifiera/i)).toBeInTheDocument();
  });

  it('un quartier de la liste se choisit, sans indice de nouveauté', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({ city: 'Dakar', geo_city_id: 10 });

    await user.type(screen.getByLabelText(/quartier/i), 'liberte');
    await user.click(await screen.findByRole('option', { name: 'Liberté 4' }));

    expect(valeurs()).toMatchObject({ quarter: 'Liberté 4', geo_neighborhood_id: 100 });
    expect(screen.queryByText(/nouveau quartier/i)).not.toBeInTheDocument();
  });

  it('une proposition en attente est listée avec son indice', async () => {
    const user = userEvent.setup();
    harnais({ city: 'Dakar', geo_city_id: 10 });

    await user.type(screen.getByLabelText(/quartier/i), 'cite');

    expect(await screen.findByRole('option', { name: /cité moi/i })).toHaveTextContent('en attente de vérification');
  });

  it('une région qui n’est pas celle de la ville vide la ville et le quartier', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({
      region: 'Dakar', geo_region_id: 1, city: 'Dakar', geo_city_id: 10, quarter: 'Mermoz', geo_neighborhood_id: 101,
    });

    await user.clear(screen.getByLabelText(/région/i));
    await user.type(screen.getByLabelText(/région/i), 'Thi');
    await user.click(await screen.findByRole('option', { name: 'Thiès' }));

    expect(valeurs()).toMatchObject({
      region: 'Thiès', geo_region_id: 2, city: '', geo_city_id: null, quarter: '', geo_neighborhood_id: null,
    });
  });

  it('une AUTRE ville vide le quartier', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({ city: 'Dakar', geo_city_id: 10, quarter: 'Mermoz', geo_neighborhood_id: 101 });

    await user.clear(screen.getByLabelText(/ville/i));
    await user.type(screen.getByLabelText(/ville/i), 'Guéd');
    await user.click(await screen.findByRole('option', { name: 'Guédiawaye' }));

    expect(valeurs()).toMatchObject({ city: 'Guédiawaye', geo_city_id: 11, quarter: '', geo_neighborhood_id: null });
  });
});
```

`src/components/property-form/__tests__/ChampsPosition.test.tsx` :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';

/**
 * TCK-633 (AC9) — « Collez un lien ou une position », latitude et longitude visibles, carte
 * recentrée sur la ville choisie.
 */
const doublure = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('@/components/property-form/useReferentielGeo', () => ({
  useReferentielGeo: () => ({
    regions: [{ id: 1, name: 'Dakar', slug: 'dakar' }],
    villes: [{ id: 10, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: 14.7215, longitude: -17.4728 }],
    quartiers: [],
    chargement: { villes: false, quartiers: false },
  }),
  useResolutionDeLien: () => ({ mutate: doublure.mutate, isPending: false }),
}));

// La carte réelle (Leaflet) n'a rien à prouver ici : on lit ce qu'elle RECEVRAIT.
vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: (p: { lat?: number | null; lng?: number | null; centre?: { latitude: number; longitude: number } | null }) => (
    <div
      data-testid="carte"
      data-centre={p.centre ? `${p.centre.latitude},${p.centre.longitude}` : ''}
      data-position={p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : ''}
    />
  ),
}));

import { ChampsPosition } from '../ChampsPosition';

const soumis = vi.fn();

function harnais(defauts: Partial<PropertyFormValues> = {}) {
  const sortie: { form?: UseFormReturn<PropertyFormValues> } = {};
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: {
        title: '', type: 'apartment', contract_type: 'rent', city: '', furnished: false, tag_ids: [],
        ...defauts,
      } as PropertyFormValues,
    });
    sortie.form = form;
    return (
      <form onSubmit={(e) => { e.preventDefault(); soumis(); }}>
        <ChampsPosition form={form} indiceCarte="Touchez la carte." />
      </form>
    );
  }
  render(withIntl(<Harnais />));
  return () => sortie.form!.getValues();
}

function coller(texte: string) {
  fireEvent.paste(screen.getByLabelText(/coller un lien ou une position/i), {
    clipboardData: { getData: () => texte },
  });
}

beforeEach(() => {
  doublure.mutate.mockReset();
  soumis.mockReset();
});

describe('ChampsPosition', () => {
  it('des coordonnées collées remplissent latitude et longitude, et le disent', () => {
    const valeurs = harnais();

    coller('14.6937, -17.4441');

    expect(valeurs()).toMatchObject({ latitude: 14.6937, longitude: -17.4441 });
    expect(screen.getByLabelText(/^latitude$/i)).toHaveValue(14.6937);
    expect(screen.getByLabelText(/^longitude$/i)).toHaveValue(-17.4441);
    expect(screen.getByRole('status')).toHaveTextContent(/position placée sur la carte/i);
    expect(screen.getByTestId('carte')).toHaveAttribute('data-position', '14.6937,-17.4441');
  });

  it('un Plus Code COURT se lit à partir de la ville choisie', () => {
    const valeurs = harnais({ city: 'Dakar', geo_city_id: 10 });

    coller('8J+MW');

    expect(valeurs().latitude).toBeCloseTo(14.7166875, 6);
    expect(valeurs().longitude).toBeCloseTo(-17.4676875, 6);
  });

  it('sans ville, un Plus Code court demande la ville d’abord — et ne pose rien', () => {
    const valeurs = harnais();

    coller('8J+MW');

    expect(screen.getByRole('alert')).toHaveTextContent(/choisissez d’abord la ville/i);
    expect(valeurs().latitude).toBeUndefined();
  });

  it('une position hors du Sénégal est placée, puis signalée', () => {
    const valeurs = harnais();

    coller('48.8584, 2.2945');

    expect(valeurs()).toMatchObject({ latitude: 48.8584, longitude: 2.2945 });
    expect(screen.getByRole('alert')).toHaveTextContent(/hors du sénégal/i);
  });

  it('un lien court part au serveur, et sa réponse est placée', () => {
    doublure.mutate.mockImplementation((_v: unknown, o: { onSuccess: (r: unknown) => void }) =>
      o.onSuccess({ data: { latitude: 14.68, longitude: -17.46, outside_senegal: false } }),
    );
    const valeurs = harnais();

    coller('https://maps.app.goo.gl/abc123');

    expect(doublure.mutate).toHaveBeenCalledWith({ url: 'https://maps.app.goo.gl/abc123' }, expect.any(Object));
    expect(valeurs()).toMatchObject({ latitude: 14.68, longitude: -17.46 });
  });

  it('un lien que le serveur ne lit pas le dit', () => {
    doublure.mutate.mockImplementation((_v: unknown, o: { onError: () => void }) => o.onError());
    harnais();

    coller('https://maps.app.goo.gl/introuvable');

    expect(screen.getByRole('alert')).toHaveTextContent(/ne mène à aucune position lisible/i);
  });

  it('un texte quelconque est refusé avec la liste des formats', () => {
    harnais();

    coller('chez tonton, derrière la boutique');

    expect(screen.getByRole('alert')).toHaveTextContent(/format non reconnu/i);
  });

  it('Entrée lit le champ et ne soumet PAS le formulaire', async () => {
    const user = userEvent.setup();
    const valeurs = harnais();

    await user.type(screen.getByLabelText(/coller un lien ou une position/i), '14.7, -17.45{Enter}');

    expect(valeurs()).toMatchObject({ latitude: 14.7, longitude: -17.45 });
    expect(soumis).not.toHaveBeenCalled();
  });

  it('une latitude vidée vaut null, pas 0 (le golfe de Guinée)', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({ latitude: 14.7, longitude: -17.45 });

    await user.clear(screen.getByLabelText(/^latitude$/i));

    expect(valeurs().latitude).toBeNull();
  });

  it('la carte se centre sur la ville choisie', () => {
    harnais({ city: 'Dakar', geo_city_id: 10 });

    expect(screen.getByTestId('carte')).toHaveAttribute('data-centre', '14.7215,-17.4728');
  });
});
```

`src/components/map/__tests__/LocationPickerMap.recentrage.test.tsx` :

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import L from 'leaflet';

import { LocationPickerMap } from '../LocationPickerMap';

/**
 * TCK-633 — `center` de `MapContainer` n'est lu qu'au montage. Une position collée, ou une ville
 * choisie après coup, doit DÉPLACER la carte : sinon le marqueur se pose hors de la vue, et
 * l'utilisateur croit que rien ne s'est passé.
 */
afterEach(() => vi.restoreAllMocks());

function centres(espion: { readonly mock: { readonly calls: readonly unknown[][] } }): string[] {
  return espion.mock.calls.map((appel) => {
    const c = L.latLng(appel[0] as L.LatLngExpression);
    return `${c.lat},${c.lng}`;
  });
}

describe('LocationPickerMap — le recentrage', () => {
  it('se centre sur la ville choisie APRÈS le montage', () => {
    const espion = vi.spyOn(L.Map.prototype, 'setView');
    const { rerender } = render(<LocationPickerMap lat={null} lng={null} onChange={() => {}} />);
    espion.mockClear();

    rerender(<LocationPickerMap lat={null} lng={null} centre={{ latitude: 14.7915, longitude: -16.9359 }} onChange={() => {}} />);

    expect(centres(espion)).toContain('14.7915,-16.9359');
  });

  it('suit une position posée hors de la vue', () => {
    const espion = vi.spyOn(L.Map.prototype, 'setView');
    const { rerender } = render(<LocationPickerMap lat={14.69} lng={-17.44} onChange={() => {}} />);
    espion.mockClear();

    rerender(<LocationPickerMap lat={12.56} lng={-16.27} onChange={() => {}} />);

    expect(centres(espion)).toContain('12.56,-16.27');
  });
});
```

Les valeurs du Plus Code court sont celles que rend `reconnaitrePosition('8J+MW', { latitude:
14.7215, longitude: -17.4728 })` (tâche 16), mesurées : `14.7166875`, `-17.4676875`.

**Step 2 : rouge**

```bash
npx vitest run src/components/property-form/__tests__/ChampsLieu.test.tsx src/components/property-form/__tests__/ChampsPosition.test.tsx src/components/map/__tests__/LocationPickerMap.recentrage.test.tsx
```

Attendu : les deux premières suites en échec d'import (`Failed to resolve import "../ChampsLieu"`,
`"../ChampsPosition"`) ; la troisième `2 failed` (aucun `setView` vers la nouvelle position).

**Step 3 : les types et le hook**

`src/types/geo.ts` :

```ts
/**
 * TCK-633 — le référentiel géographique tel que le rendent `/api/public/geo/*` (ADR-0062).
 * Les listes arrivent dans l'enveloppe `{ data: [...] }` du contrôleur.
 */
export interface GeoRegion {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
}

export interface GeoCity {
  readonly id: number;
  readonly region_id: number;
  readonly name: string;
  readonly slug: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/** `pending` : une proposition, servie à son seul auteur tant qu'elle n'est pas vérifiée. */
export type GeoNeighborhoodStatus = 'approved' | 'pending' | 'rejected';

export interface GeoNeighborhood {
  readonly id: number;
  readonly city_id: number;
  readonly name: string;
  readonly slug: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly status: GeoNeighborhoodStatus;
}

/** `POST /api/geo/resolve-link` — un lien court suivi côté serveur (E-13). */
export interface ResolutionDeLien {
  readonly latitude: number;
  readonly longitude: number;
  readonly outside_senegal: boolean;
}
```

`src/components/property-form/useReferentielGeo.ts` :

```ts
'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { GeoCity, GeoNeighborhood, GeoRegion, ResolutionDeLien } from '@/types/geo';

const UNE_HEURE = 60 * 60 * 1000;
const CINQ_MINUTES = 5 * 60 * 1000;

interface Enveloppe<T> {
  readonly data: T;
}

const AUCUNE_REGION: readonly GeoRegion[] = [];
const AUCUNE_VILLE: readonly GeoCity[] = [];
const AUCUN_QUARTIER: readonly GeoNeighborhood[] = [];

export interface ReferentielGeo {
  readonly regions: readonly GeoRegion[];
  /** Les villes de la région choisie, ou toutes tant qu'aucune région ne l'est. */
  readonly villes: readonly GeoCity[];
  /** Les quartiers de la ville choisie — dont les propositions de l'utilisateur courant. */
  readonly quartiers: readonly GeoNeighborhood[];
  readonly chargement: { readonly villes: boolean; readonly quartiers: boolean };
}

/**
 * TCK-633 (AC9) — les trois listes du lieu.
 *
 * ⚠ Des tableaux CONSTANTS quand rien n'est chargé, jamais un `[]` neuf à chaque rendu : les
 * effets de rapprochement de `ChampsLieu` en dépendent et se rejoueraient à chaque rendu.
 *
 * ⚠ `?region=` et `?city=` ne sont pas des filtres spatie (E-14) : les endpoints publics du
 * référentiel sont des listes fermées, sans `fields[]` ni `include=` à négocier.
 */
export function useReferentielGeo(regionId: number | null, villeId: number | null): ReferentielGeo {
  const regions = useApiQuery<Enveloppe<GeoRegion[]>>(['geo', 'regions'], '/api/public/geo/regions', {
    staleTime: UNE_HEURE,
  });
  const villes = useApiQuery<Enveloppe<GeoCity[]>>(
    ['geo', 'cities', regionId],
    regionId === null ? '/api/public/geo/cities' : `/api/public/geo/cities?region=${regionId}`,
    { staleTime: UNE_HEURE },
  );
  const quartiers = useApiQuery<Enveloppe<GeoNeighborhood[]>>(
    ['geo', 'neighborhoods', villeId],
    `/api/public/geo/neighborhoods?city=${villeId ?? 0}`,
    { enabled: villeId !== null, staleTime: CINQ_MINUTES },
  );

  return {
    regions: regions.data?.data ?? AUCUNE_REGION,
    villes: villes.data?.data ?? AUCUNE_VILLE,
    quartiers: villeId === null ? AUCUN_QUARTIER : (quartiers.data?.data ?? AUCUN_QUARTIER),
    chargement: { villes: villes.isLoading, quartiers: villeId !== null && quartiers.isLoading },
  };
}

/** TCK-633 (AC9) — un lien court (`maps.app.goo.gl`, `goo.gl/maps`) se suit côté serveur. */
export function useResolutionDeLien() {
  return useApiMutation<Enveloppe<ResolutionDeLien>, { url: string }>({
    path: '/api/geo/resolve-link',
    method: 'POST',
  });
}
```

Les chemins portent `/api` : `useApiQuery` et `useApiMutation` passent par `apiRequest`, qui ne
l'ajoute PAS (CLAUDE.md racine, « Le préfixe `/api` n'est pas symétrique » ; lu :
`src/hooks/useApiQuery.ts` L64, L149).

**Step 4 : les champs du lieu**

`src/components/property-form/ChampsLieu.tsx` :

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useController, useWatch, type UseFormReturn } from 'react-hook-form';

import { FormError } from '@/components/forms';
import { Combobox, replierPourIdentite, type OptionDeListe } from '@/components/ui/combobox';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { cn } from '@/lib/utils';
import { useReferentielGeo } from './useReferentielGeo';

type Identifiant = number | null | undefined;

/** Le seul élément de `liste` dont le nom vaut `texte` à la casse près — aucun s'il y en a deux. */
function seulHomonyme<T extends { readonly name: string }>(liste: readonly T[], texte: string | undefined): T | null {
  const cle = replierPourIdentite(texte ?? '');
  if (cle === '') return null;
  const trouves = liste.filter((e) => replierPourIdentite(e.name) === cle);
  return trouves.length === 1 ? trouves[0] : null;
}

const CLASSE_FLASH = cn('wizard-flash', 'rounded-lg');

/**
 * TCK-633 (AC9) — région, ville et quartier choisis dans le référentiel (ADR-0062).
 *
 * Le TEXTE reste la valeur du formulaire (`region`, `city`, `quarter`) : c'est lui qu'on affiche,
 * qu'on envoie et que le serveur canonise. L'identifiant (`geo_*_id`) le PRÉCISE quand la saisie
 * est un choix de la liste — et retombe à `null` dès qu'on retape, faute de quoi un texte corrigé
 * partirait avec l'identifiant de l'ancien choix.
 *
 * Trois chemins posent un identifiant, et un seul en efface :
 *  - choisir dans la liste ;
 *  - un texte déjà là (brouillon repris, suggestion de la géo-IP, bien existant) qui est le nom
 *    EXACT, à la casse près, d'une seule entrée chargée — le rapprochement ci-dessous ;
 *  - choisir une ville pose aussi sa région (texte et identifiant).
 *  Retaper efface. Un quartier inconnu s'ajoute depuis la liste et part en texte seul : c'est le
 *  serveur qui en fait une proposition (`GeoNeighborhood::proposer`).
 *
 * ⚠ La structure DOM (enveloppe > `<label>` + groupe > saisie) est celle de `FormInput` : le test
 * du flash de `StepLieu` remonte de la saisie à l'enveloppe par `closest('div').parentElement`.
 */
export function ChampsLieu({
  form,
  flash = [],
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  /** Les champs que la suggestion de la géo-IP vient de remplir (`StepLieu`). */
  readonly flash?: readonly ('city' | 'region')[];
}) {
  const t = useTranslations('property.form');
  const { control, setValue } = form;
  const region = useController({ control, name: 'region' });
  const ville = useController({ control, name: 'city' });
  const quartier = useController({ control, name: 'quarter' });
  const [regionIdSuivi, villeIdSuivi, quartierIdSuivi] = useWatch({
    control,
    name: ['geo_region_id', 'geo_city_id', 'geo_neighborhood_id'],
  });
  const regionId = (regionIdSuivi as Identifiant) ?? null;
  const villeId = (villeIdSuivi as Identifiant) ?? null;
  const quartierId = (quartierIdSuivi as Identifiant) ?? null;
  const texteRegion = (region.field.value as string | undefined) ?? '';
  const texteVille = (ville.field.value as string | undefined) ?? '';
  const texteQuartier = (quartier.field.value as string | undefined) ?? '';

  const { regions, villes, quartiers, chargement } = useReferentielGeo(regionId, villeId);

  // La dernière ville IDENTIFIÉE : la frappe efface `geo_city_id` avant qu'on choisisse, et c'est
  // pourtant à elle qu'appartient le quartier déjà saisi.
  const derniereVille = useRef<number | null>(villeId);
  useEffect(() => {
    if (villeId !== null) derniereVille.current = villeId;
  }, [villeId]);

  // Le rapprochement : un texte venu d'ailleurs que la liste reçoit son identifiant s'il nomme
  // exactement une entrée. Sans `shouldDirty` : ce n'est pas une saisie.
  useEffect(() => {
    if (regionId !== null) return;
    const trouvee = seulHomonyme(regions, texteRegion);
    if (trouvee) setValue('geo_region_id', trouvee.id);
  }, [regionId, regions, texteRegion, setValue]);

  useEffect(() => {
    if (villeId !== null) return;
    const trouvee = seulHomonyme(villes, texteVille);
    if (!trouvee) return;
    setValue('geo_city_id', trouvee.id);
    // La région suit la ville au moment où celle-ci est IDENTIFIÉE, et seulement si personne n'en
    // a écrit : pas en continu, sinon vider la région pour en choisir une autre la ferait revenir.
    if (regionId !== null || texteRegion.trim() !== '') return;
    const sienne = regions.find((r) => r.id === trouvee.region_id);
    if (!sienne) return;
    setValue('region', sienne.name);
    setValue('geo_region_id', sienne.id);
  }, [villeId, villes, texteVille, regionId, texteRegion, regions, setValue]);

  useEffect(() => {
    if (quartierId !== null || villeId === null) return;
    const trouve = seulHomonyme(quartiers, texteQuartier);
    if (trouve) setValue('geo_neighborhood_id', trouve.id);
  }, [quartierId, villeId, quartiers, texteQuartier, setValue]);

  const optionsRegions: OptionDeListe[] = regions.map((r) => ({ value: String(r.id), label: r.name }));
  const optionsVilles: OptionDeListe[] = villes.map((v) => ({ value: String(v.id), label: v.name }));
  const optionsQuartiers: OptionDeListe[] = quartiers.map((q) => ({
    value: String(q.id),
    label: q.name,
    indice: q.status === 'pending' ? t('amenities.pending') : undefined,
  }));

  const viderQuartier = () => {
    quartier.field.onChange('');
    setValue('geo_neighborhood_id', null, { shouldDirty: true });
  };

  const choisirRegion = (option: OptionDeListe | null) => {
    const id = option ? Number(option.value) : null;
    setValue('geo_region_id', id, { shouldDirty: true });
    // Une ville choisie HORS de la nouvelle région n'y est plus : elle part, son quartier aussi.
    const villeActuelle = villes.find((v) => v.id === villeId);
    if (id !== null && villeActuelle && villeActuelle.region_id !== id) {
      ville.field.onChange('');
      setValue('geo_city_id', null, { shouldDirty: true });
      viderQuartier();
    }
  };

  const choisirVille = (option: OptionDeListe | null) => {
    const choisie = option ? villes.find((v) => String(v.id) === option.value) ?? null : null;
    if (!choisie) return;
    // Une AUTRE ville que la dernière identifiée vide le quartier ; la même le garde.
    if (derniereVille.current !== null && derniereVille.current !== choisie.id) viderQuartier();
    setValue('geo_city_id', choisie.id, { shouldDirty: true });
    const sienne = regions.find((r) => r.id === choisie.region_id);
    if (sienne) {
      region.field.onChange(sienne.name);
      setValue('geo_region_id', sienne.id, { shouldDirty: true });
    }
  };

  const quartierNouveau =
    villeId !== null &&
    texteQuartier.trim() !== '' &&
    quartierId === null &&
    !chargement.quartiers &&
    seulHomonyme(quartiers, texteQuartier) === null;

  return (
    <>
      <div className={cn('w-full', flash.includes('region') && CLASSE_FLASH)}>
        <label htmlFor="champ-region" className="mb-1.5 block text-sm font-medium">
          {t('address.region')}
        </label>
        <Combobox
          id="champ-region"
          options={optionsRegions}
          value={regionId === null ? null : String(regionId)}
          onChange={choisirRegion}
          saisieLibre={{
            texte: texteRegion,
            surSaisie: (texte) => {
              region.field.onChange(texte);
              setValue('geo_region_id', null, { shouldDirty: true });
            },
          }}
          inputRef={region.field.ref}
          placeholder={t('address.regionPlaceholder')}
          aucunResultat={t('address.noResults')}
          invalide={Boolean(region.fieldState.error)}
          decritPar={region.fieldState.error ? 'champ-region-error' : undefined}
        />
        <FormError id="champ-region-error">{region.fieldState.error?.message}</FormError>
      </div>

      <div className={cn('w-full', flash.includes('city') && CLASSE_FLASH)}>
        <label htmlFor="champ-ville" className="mb-1.5 block text-sm font-medium">
          {t('address.city')}
          <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
        </label>
        <Combobox
          id="champ-ville"
          options={optionsVilles}
          value={villeId === null ? null : String(villeId)}
          onChange={choisirVille}
          saisieLibre={{
            texte: texteVille,
            surSaisie: (texte) => {
              ville.field.onChange(texte);
              setValue('geo_city_id', null, { shouldDirty: true });
              // Le quartier identifié appartenait à l'ancienne ville ; son TEXTE reste, et se
              // rapprochera dans la nouvelle s'il y existe.
              setValue('geo_neighborhood_id', null, { shouldDirty: true });
            },
          }}
          inputRef={ville.field.ref}
          placeholder={t('address.cityPlaceholder')}
          aucunResultat={t('address.noResults')}
          chargement={chargement.villes}
          required
          invalide={Boolean(ville.fieldState.error)}
          decritPar={ville.fieldState.error ? 'champ-ville-error' : undefined}
        />
        <FormError id="champ-ville-error">{ville.fieldState.error?.message}</FormError>
      </div>

      <div className="w-full">
        <label htmlFor="champ-quartier" className="mb-1.5 block text-sm font-medium">
          {t('address.quarter')}
        </label>
        <Combobox
          id="champ-quartier"
          options={optionsQuartiers}
          value={quartierId === null ? null : String(quartierId)}
          onChange={(option) =>
            setValue('geo_neighborhood_id', option ? Number(option.value) : null, { shouldDirty: true })
          }
          saisieLibre={{
            texte: texteQuartier,
            surSaisie: (texte) => {
              quartier.field.onChange(texte);
              setValue('geo_neighborhood_id', null, { shouldDirty: true });
            },
          }}
          creation={
            villeId === null
              ? undefined
              : {
                  libelle: (nom) => t('address.create', { name: nom }),
                  surCreation: (nom) => {
                    quartier.field.onChange(nom);
                    setValue('geo_neighborhood_id', null, { shouldDirty: true });
                  },
                }
          }
          inputRef={quartier.field.ref}
          placeholder={t('address.quarterPlaceholder')}
          aucunResultat={t('address.noResults')}
          chargement={chargement.quartiers}
          invalide={Boolean(quartier.fieldState.error)}
          decritPar={quartierNouveau ? 'champ-quartier-indice' : quartier.fieldState.error ? 'champ-quartier-error' : undefined}
        />
        {quartierNouveau ? (
          <p id="champ-quartier-indice" className="mt-1 text-xs text-muted-foreground">
            {t('address.newNeighborhoodHint')}
          </p>
        ) : null}
        <FormError id="champ-quartier-error">{quartier.fieldState.error?.message}</FormError>
      </div>
    </>
  );
}
```

`src/components/property-form/ChampsPosition.tsx` :

```tsx
'use client';

import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { MapPin } from 'lucide-react';

import { FormError } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocationPickerMapLoader } from '@/components/map/LocationPickerMapLoader';
import { horsDuSenegal, reconnaitrePosition, type Coordonnees } from '@/lib/geo/reconnaitre-position';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { useReferentielGeo, useResolutionDeLien } from './useReferentielGeo';

type Identifiant = number | null | undefined;
type Retour = { readonly ton: 'info' | 'alerte'; readonly texte: string } | null;

/** Une saisie numérique vidée part en `null` : `z.coerce.number()` lirait `''` comme 0 — l'océan. */
function nombreOuNul(brut: string): number | string | null {
  if (brut.trim() === '') return null;
  const n = Number(brut.replace(',', '.'));
  return Number.isFinite(n) ? n : brut;
}

/**
 * TCK-633 (AC9) — la position : le champ « Collez un lien ou une position », la latitude et la
 * longitude visibles et modifiables, et la carte, recentrée sur la ville choisie.
 *
 * Ce qui se colle (`reconnaitrePosition`, tâche 16) : un lien Google Maps long, un lien court —
 * suivi par le serveur (`POST /api/geo/resolve-link`), le navigateur ne le peut pas —, une
 * position WhatsApp, des degrés décimaux ou sexagésimaux, un Plus Code complet, ou court — lu à
 * partir du centre de la ville choisie, d'où le message qui demande la ville d'abord.
 *
 * Une position hors du Sénégal est PLACÉE puis signalée, jamais refusée : latitude et longitude
 * inversées sont l'erreur la plus courante, et la voir sur la carte est la façon de la corriger.
 */
export function ChampsPosition({
  form,
  indiceCarte,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  /** La consigne affichée sous la carte — propre à chaque écran. */
  readonly indiceCarte: string;
}) {
  const t = useTranslations('property.form.address');
  const { control, setValue } = form;
  const [regionIdSuivi, villeIdSuivi, latSuivie, lngSuivie] = useWatch({
    control,
    name: ['geo_region_id', 'geo_city_id', 'latitude', 'longitude'],
  });
  const villeId = (villeIdSuivi as Identifiant) ?? null;
  const lat = latSuivie as number | null | undefined;
  const lng = lngSuivie as number | null | undefined;
  // Mêmes clés de requête que `ChampsLieu` : aucune requête de plus, le cache est partagé.
  const { villes } = useReferentielGeo((regionIdSuivi as Identifiant) ?? null, villeId);
  const ville = villes.find((v) => v.id === villeId);
  const centre: Coordonnees | null =
    ville && ville.latitude !== null && ville.longitude !== null
      ? { latitude: ville.latitude, longitude: ville.longitude }
      : null;

  const [collage, setCollage] = useState('');
  const [retour, setRetour] = useState<Retour>(null);
  const resolution = useResolutionDeLien();

  const placer = (c: Coordonnees, hors: boolean) => {
    setValue('latitude', c.latitude, { shouldDirty: true, shouldValidate: true });
    setValue('longitude', c.longitude, { shouldDirty: true, shouldValidate: true });
    setRetour(hors ? { ton: 'alerte', texte: t('pasteOutsideSenegal') } : { ton: 'info', texte: t('pasteApplied') });
  };

  const lire = (brut: string) => {
    const saisie = brut.trim();
    if (saisie === '') return;
    const lu = reconnaitrePosition(saisie, centre);
    switch (lu.kind) {
      case 'coordonnees':
        placer(lu, horsDuSenegal(lu));
        return;
      case 'lien-a-resoudre':
        setRetour({ ton: 'info', texte: t('pasteResolving') });
        resolution.mutate(
          { url: lu.url },
          {
            onSuccess: ({ data }) => placer(data, data.outside_senegal),
            onError: () => setRetour({ ton: 'alerte', texte: t('pasteLinkFailed') }),
          },
        );
        return;
      case 'plus-code-court-sans-reference':
        setRetour({ ton: 'alerte', texte: t('pasteNeedsCity') });
        return;
      default:
        setRetour({ ton: 'alerte', texte: t('pasteUnknown') });
    }
  };

  const surCollage = (e: ClipboardEvent<HTMLInputElement>) => {
    const texte = e.clipboardData.getData('text');
    if (texte.trim() === '') return;
    e.preventDefault();
    setCollage(texte);
    lire(texte);
  };

  // Entrée lit le champ — et ne soumet PAS le formulaire qui l'entoure.
  const surTouche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    lire(collage);
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="champ-collage" className="mb-1.5 block text-sm font-medium">
          {t('pasteLabel')}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="champ-collage"
            value={collage}
            onChange={(e) => setCollage(e.target.value)}
            onPaste={surCollage}
            onKeyDown={surTouche}
            placeholder={t('pastePlaceholder')}
            autoComplete="off"
            aria-describedby={retour ? 'champ-collage-retour' : undefined}
            className="h-11 min-h-11"
          />
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0"
            onClick={() => lire(collage)}
            disabled={resolution.isPending}
          >
            <MapPin aria-hidden="true" />
            {t('pasteButton')}
          </Button>
        </div>
        {retour ? (
          <p
            id="champ-collage-retour"
            role={retour.ton === 'alerte' ? 'alert' : 'status'}
            className={retour.ton === 'alerte' ? 'mt-1 text-xs text-destructive' : 'mt-1 text-xs text-muted-foreground'}
          >
            {retour.texte}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['latitude', 'longitude'] as const).map((nom) => (
          <Controller
            key={nom}
            control={control}
            name={nom}
            render={({ field, fieldState }) => (
              <div>
                <label htmlFor={`champ-${nom}`} className="mb-1.5 block text-sm font-medium">
                  {t(nom)}
                </label>
                <Input
                  id={`champ-${nom}`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  ref={field.ref}
                  name={field.name}
                  value={(field.value as number | string | null | undefined) ?? ''}
                  onChange={(e) => field.onChange(nombreOuNul(e.target.value))}
                  onBlur={field.onBlur}
                  aria-invalid={fieldState.error ? true : undefined}
                  aria-describedby={fieldState.error ? `champ-${nom}-error` : undefined}
                  className="h-11 min-h-11"
                />
                <FormError id={`champ-${nom}-error`}>{fieldState.error?.message}</FormError>
              </div>
            )}
          />
        ))}
      </div>

      <LocationPickerMapLoader
        lat={lat}
        lng={lng}
        centre={centre}
        onChange={(nLat, nLng) => {
          setValue('latitude', nLat, { shouldDirty: true });
          setValue('longitude', nLng, { shouldDirty: true });
        }}
      />
      <p className="text-xs text-muted-foreground">{indiceCarte}</p>
    </div>
  );
}
```

Pourquoi un `Controller` à la main pour la latitude et non `FormInput type="number"` : vidé,
`FormInput` transmet `''` (lu : `FormInput.tsx` L83), que `z.coerce.number()` lit **0** — un bien
posé au large du Gabon. Le test « une latitude vidée vaut null, pas 0 » le garde.

**Step 5 : la carte**

`src/components/map/LocationPickerMap.tsx`, Edit 1 (L5-6) :

```
old:import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { useMemo } from 'react';
new:import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useEffect, useMemo } from 'react';
```

Edit 2 (L9-15) :

```
old:const DEFAULT_ZOOM = 13;

interface LocationPickerMapProps {
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly onChange: (lat: number, lng: number) => void;
}
new:const DEFAULT_ZOOM = 13;
/** TCK-633 — assez près pour poser le marqueur sur la bonne rue. */
const ZOOM_POSITION = 16;

interface LocationPickerMapProps {
  readonly lat?: number | null;
  readonly lng?: number | null;
  /** TCK-633 — le centre de la ville choisie, tant qu'aucune position n'est posée. */
  readonly centre?: { readonly latitude: number; readonly longitude: number } | null;
  readonly onChange: (lat: number, lng: number) => void;
}

/**
 * TCK-633 — `center` de `MapContainer` n'est lu qu'au MONTAGE : une position collée, ou une ville
 * choisie après coup, ne déplaçait pas la carte, et le marqueur se posait hors de la vue.
 */
function Recentrer({
  lat,
  lng,
  centre,
}: {
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly centre?: { readonly latitude: number; readonly longitude: number } | null;
}) {
  const map = useMap();
  const cLat = centre?.latitude ?? null;
  const cLng = centre?.longitude ?? null;
  useEffect(() => {
    if (lat != null && lng != null) {
      if (!map.getBounds().contains([lat, lng])) map.setView([lat, lng], Math.max(map.getZoom(), ZOOM_POSITION));
      return;
    }
    if (cLat !== null && cLng !== null) map.setView([cLat, cLng], DEFAULT_ZOOM);
  }, [map, lat, lng, cLat, cLng]);
  return null;
}
```

Edit 3 (L26) :

```
old:export function LocationPickerMap({ lat, lng, onChange }: LocationPickerMapProps) {
new:export function LocationPickerMap({ lat, lng, centre, onChange }: LocationPickerMapProps) {
```

Edit 4 (L38-39) :

```
old:  const center: [number, number] =
    lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;
new:  const center: [number, number] =
    lat != null && lng != null ? [lat, lng] : centre ? [centre.latitude, centre.longitude] : DEFAULT_CENTER;
```

Edit 5 (L52) :

```
old:      <ClickHandler onChange={onChange} />
new:      <ClickHandler onChange={onChange} />
      <Recentrer lat={lat} lng={lng} centre={centre} />
```

`LocationPickerMapLoader.tsx` ne change pas : `dynamic()` transmet la nouvelle prop telle quelle.
Le `useMemo` existant (L27) reste : ADR-0015 interdit d'en AJOUTER, pas d'en retirer en passant.

**Step 6 : l'étape du lieu**

`src/components/property-form/wizard/steps/StepLieu.tsx`, Edit 1 (L6-14) :

```
old:import { useFormState, useWatch, type UseFormReturn } from 'react-hook-form';

import { FormInput } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { LocationPickerMapLoader } from '@/components/map/LocationPickerMapLoader';
import { cn } from '@/lib/utils';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { useGeoSuggestion } from '@/hooks/useGeoSuggestion';
import { GeoSuggestionChip } from '../GeoSuggestionChip';
new:import { useFormState, type UseFormReturn } from 'react-hook-form';

import { FormInput } from '@/components/forms';
import { Button } from '@/components/ui/button';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { useGeoSuggestion } from '@/hooks/useGeoSuggestion';
import { ChampsLieu } from '../../ChampsLieu';
import { ChampsPosition } from '../../ChampsPosition';
import { GeoSuggestionChip } from '../GeoSuggestionChip';
```

Edit 2 (L90-94, la lecture de la position passe dans `ChampsPosition`, qui la lit par `useWatch`
— la règle de TCK-564 suit le code) :

```
old:  // TCK-564 — `useWatch`, jamais `watch()` lu pendant le rendu (cf. `StepBien`) : compilée, la
  // position posée par « Utiliser ma position » n'atteignait jamais la carte.
  const [latSuivie, lngSuivie] = useWatch({ control, name: ['latitude', 'longitude'] });
  const lat = latSuivie as number | null | undefined;
  const lng = lngSuivie as number | null | undefined;

new:
```

(`new:` vide : les cinq lignes et la ligne vide qui suit disparaissent.)

Edit 3 (L98-99) :

```
old:    setValue('city', suggestion.city, { shouldDirty: true, shouldValidate: true });
    const remplis: ('city' | 'region')[] = ['city'];
new:    setValue('city', suggestion.city, { shouldDirty: true, shouldValidate: true });
    // TCK-633 — le texte change : l'identifiant de l'ancien choix ne le décrit plus. `ChampsLieu`
    // rapproche le nouveau texte du référentiel s'il y nomme une ville.
    setValue('geo_city_id', null, { shouldDirty: true });
    setValue('geo_neighborhood_id', null, { shouldDirty: true });
    const remplis: ('city' | 'region')[] = ['city'];
```

Edit 4 (L103-104) :

```
old:      setValue('region', suggestion.region, { shouldDirty: true });
      remplis.push('region');
new:      setValue('region', suggestion.region, { shouldDirty: true });
      setValue('geo_region_id', null, { shouldDirty: true });
      remplis.push('region');
```

Edit 5 (L155-175) :

```
old:      <FormInput
        control={control}
        name="city"
        label={t('fields.city')}
        required
        placeholder={t('placeholders.city')}
        containerClassName={champsRemplis.includes('city') ? cn('wizard-flash', 'rounded-lg') : undefined}
      />
      <FormInput
        control={control}
        name="quarter"
        label={t('fields.quarter')}
        placeholder={t('placeholders.quarter')}
      />
      <FormInput
        control={control}
        name="region"
        label={t('fields.region')}
        placeholder={t('placeholders.region')}
        containerClassName={champsRemplis.includes('region') ? cn('wizard-flash', 'rounded-lg') : undefined}
      />
new:      <ChampsLieu form={form} flash={champsRemplis} />
```

Edit 6 (L240-248) :

```
old:        <LocationPickerMapLoader
          lat={lat}
          lng={lng}
          onChange={(nLat, nLng) => {
            setValue('latitude', nLat, { shouldDirty: true });
            setValue('longitude', nLng, { shouldDirty: true });
          }}
        />
        <p className="text-xs text-muted-foreground">{t('mapHint')}</p>
new:        <ChampsPosition form={form} indiceCarte={t('mapHint')} />
```

Les clés `property.wizard.fields.{city,quarter,region}` et `placeholders.{city,quarter,region}`
n'ont plus de lecteur dans `StepLieu` ; elles en gardent un dans `PropertyForm` jusqu'à la
tâche 23 (« Écarts relevés », E-24 : non supprimées, dictionnaires co-tenus).

**Step 7 : la doublure et les quatre tests du parcours**

`src/test/doublure-referentiel-geo.ts` :

```ts
import { vi } from 'vitest';
import type { ReferentielGeo } from '@/components/property-form/useReferentielGeo';

/**
 * TCK-633 — la doublure du référentiel géographique pour les tests du parcours qui ne le
 * mettent PAS à l'épreuve : listes vides, aucun appel réseau, aucun `QueryClientProvider` requis.
 * Les villes et quartiers tapés y restent du texte libre, ce qui est le comportement d'avant le
 * lot — ces tests-là continuent donc d'affirmer ce qu'ils affirmaient.
 *
 * Usage : `vi.mock('@/components/property-form/useReferentielGeo', () => import('@/test/doublure-referentiel-geo'));`
 * Le référentiel lui-même est éprouvé par `ChampsLieu.test.tsx`, avec des listes remplies.
 */
const VIDE: ReferentielGeo = {
  regions: [],
  villes: [],
  quartiers: [],
  chargement: { villes: false, quartiers: false },
};

export function useReferentielGeo(): ReferentielGeo {
  return VIDE;
}

export function useResolutionDeLien() {
  return { mutate: vi.fn(), isPending: false };
}
```

Dans CHACUN des quatre fichiers — `wizard-steps.test.tsx` (L9), `PropertyWizard.test.tsx` (L22),
`abonnement-des-etapes.test.tsx` (L14), `cibles-tactiles.test.tsx` (L10) — la même ancre existe une
seule fois (vérifié) ; Edit :

```
old:vi.mock('@/components/map/LocationPickerMapLoader', () => ({
new:// TCK-633 — le référentiel géographique, hors de ce que ce fichier éprouve.
vi.mock('@/components/property-form/useReferentielGeo', () => import('@/test/doublure-referentiel-geo'));
vi.mock('@/components/map/LocationPickerMapLoader', () => ({
```

Et dans `abonnement-des-etapes.test.tsx`, la garde de source doit LIRE les deux nouveaux
composants — sans quoi un `watch('city')` écrit dans `ChampsLieu` passerait (L174-185) :

```
old:    'PropertyForm.tsx',
    ...readdirSync(path.join(racine, 'wizard'))
new:    'PropertyForm.tsx',
    // TCK-633 — les champs partagés par le parcours et l'édition.
    'ChampsLieu.tsx',
    'ChampsPosition.tsx',
    ...readdirSync(path.join(racine, 'wizard'))
```

(`ChampEquipements.tsx` s'y ajoute à la tâche 20.)

**Step 8 : vert, types, lint**

```bash
npx vitest run src/components/property-form src/components/map src/components/ui
npx tsc --noEmit
npx eslint src/components/property-form src/components/map src/types/geo.ts src/test/doublure-referentiel-geo.ts
```

Attendu : vert. Mesuré dans le harnais (copies des quatre tests du parcours, `payload*.test.ts`, les
trois nouveaux tests, la combobox) : `9 passed` (`ChampsLieu`), `10 passed` (`ChampsPosition`),
`2 passed` (recentrage), `wizard-steps` / `PropertyWizard` / `abonnement-des-etapes` /
`cibles-tactiles` verts — dont le test du flash (`conteneur(/ville/i)` remonte de la saisie à
l'enveloppe par `closest('div').parentElement`, structure reproduite par `ChampsLieu`) ; `tsc`
muet. ⚠ Le test « pose le pays et la devise » de `PropertyWizard.test.tsx` change à la tâche 21,
pas ici.

**Step 9 : ablations**

```bash
mkdir -p "$S/abl/t19" && C=src/components/property-form && M=src/components/map/LocationPickerMap.tsx
cp $C/ChampsLieu.tsx $C/ChampsPosition.tsx $M "$S/abl/t19/"
# a) la carte ne se recentre plus
sed -i '' '/      <Recentrer lat={lat} lng={lng} centre={centre} \/>/d' $M
npx vitest run src/components/map/__tests__/LocationPickerMap.recentrage.test.tsx
cp "$S/abl/t19/LocationPickerMap.tsx" $M
# b) retaper la ville garde l'identifiant de l'ancien choix
perl -0pi -e "s/              ville\.field\.onChange\(texte\);\n              setValue\('geo_city_id', null, \{ shouldDirty: true \}\);/              ville.field.onChange(texte);/" $C/ChampsLieu.tsx
npx vitest run $C/__tests__/ChampsLieu.test.tsx
cp "$S/abl/t19/ChampsLieu.tsx" $C/
# c) plus de ligne « Ajouter » dans la liste des quartiers
sed -i '' 's/            villeId === null$/            villeId !== null/' $C/ChampsLieu.tsx
npx vitest run $C/__tests__/ChampsLieu.test.tsx
cp "$S/abl/t19/ChampsLieu.tsx" $C/
# d) une latitude vidée repart en chaîne vide
sed -i '' 's/onChange={(e) => field.onChange(nombreOuNul(e.target.value))}/onChange={(e) => field.onChange(e.target.value)}/' $C/ChampsPosition.tsx
npx vitest run $C/__tests__/ChampsPosition.test.tsx
cp "$S/abl/t19/ChampsPosition.tsx" $C/
md5 -q $M "$S/abl/t19/LocationPickerMap.tsx" $C/ChampsLieu.tsx "$S/abl/t19/ChampsLieu.tsx" $C/ChampsPosition.tsx "$S/abl/t19/ChampsPosition.tsx"
```

Attendu (mesuré dans le harnais) : a) `2 failed` ; b) 1 échec — « retaper efface l'identifiant » ;
c) 1 échec — « un quartier inconnu s'ajoute DEPUIS la liste » ; d) 1 échec — « une latitude vidée
vaut null, pas 0 » ; les trois paires de `md5` identiques.

**Step 10 : signaler**

Signaler : les cinq fichiers créés, `LocationPickerMap.tsx`, `StepLieu.tsx`, les trois tests créés,
les quatre tests du parcours (⚠ hors territoire),
`feat(web): région, ville et quartier du référentiel, position collée (TCK-633)`.

---

## Tâche 20 — Les nombres en liste, les équipements à puces (20 min)

Le ticket (lot D, AC10) : « nombres en listes déroulantes (chambres 0-20, salles de bain 0-10,
parking 0-20, étage sous-sol → 40, niveaux 1-40, année de l'an prochain → 1900) » et « équipements
en multi-sélection avec puces ; un équipement inconnu se propose ».

- `NombreEnListe` — un `Select` (Base UI, `components/ui/select.tsx`, déjà utilisé par `FormSelect`)
  dans un `Controller`. « Non précisé » rend `undefined` : le champ sort du corps, comme un champ
  vide de l'ancienne saisie libre. **Une valeur hors de la liste est AJOUTÉE à la liste** : l'API
  garde des bornes plus larges (tâche 8) et un bien existant à 25 chambres, repris en édition
  (tâche 23), perdrait sa valeur en silence sinon.
- `ChampEquipements` — à la racine de `property-form/` et non dans `wizard/` : l'édition s'en sert
  aussi (tâche 23). Un équipement du catalogue part dans `tag_ids`, un nom tapé que le catalogue
  ne connaît pas part dans `tag_names` (préfixe interne `nom:`), et le serveur en fait une
  proposition (tâche 11). **Le champ est rendu même sans catalogue** : la condition
  `tags.length > 0` (L172) cachait le seul moyen d'en proposer un.
- `types/tag.ts` — `status` et `created_by_id`, que `TagController::format()` sert depuis la
  tâche 10. Placé ici et non en tâche 24 : `ChampEquipements` lit `tag.status` (E-30).

Les clés `property.form.features.{notSpecified,floorBasement,floorGround}` et
`property.form.amenities.*` sont posées en tâche 14.

**Fichiers**
- Créer : `takussan-web/src/components/property-form/wizard/NombreEnListe.tsx`
- Créer : `takussan-web/src/components/property-form/ChampEquipements.tsx`
- Modifier : `takussan-web/src/types/tag.ts` (L9-21) — ⚠ HORS TERRITOIRE (E-12)
- Modifier : `takussan-web/src/components/property-form/wizard/steps/StepCaracteristiques.tsx` (L7-12, L47-53, L86-119, L172-198)
- Remplacer : `takussan-web/src/components/property-form/__tests__/StepCaracteristiques.test.tsx` (test de l'étape D)
- Modifier : `__tests__/abonnement-des-etapes.test.tsx` (L125-138, L179) — ⚠ HORS TERRITOIRE (E-12, E-28)
- Modifier : `__tests__/PropertyWizard.test.tsx` (L277-284, L531) — co-tenu (C, D)

**Step 1 : sauvegardes**

```bash
cd "$WEB"
mkdir -p "$S/abl/t20"
cp src/components/property-form/wizard/steps/StepCaracteristiques.tsx src/types/tag.ts "$S/abl/t20/"
cp src/components/property-form/__tests__/StepCaracteristiques.test.tsx "$S/abl/t20/SC.test.orig.tsx"
```

**Step 2 : le test de l'étape**

`src/components/property-form/__tests__/StepCaracteristiques.test.tsx`, contenu entier (les onze
tests de matrice existants sont repris tels quels ; « les équipements déjà retenus » passe des
`aria-pressed` aux puces ; quatre tests d'équipements et quatre de nombres sont ajoutés) :

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, useWatch, type Control } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import type { Tag } from '@/types/tag';
import { StepCaracteristiques } from '../wizard/steps/StepCaracteristiques';

/**
 * TCK-464 — AC2 / AC3 : l'étape des caractéristiques ne DÉCIDE rien, elle interroge la matrice.
 *
 * Ces tests portent sur la conséquence visible de cette délégation, pas sur son mécanisme : ce
 * qui compte est qu'un terrain n'affiche pas de champ « Chambres », quelle que soit la façon dont
 * la règle est écrite. Si un jour quelqu'un réécrit la condition en clair dans le composant, ces
 * tests restent verts — c'est le rôle de la relecture, pas du test — mais si la règle DIVERGE de
 * `field-matrix.ts`, ils rougissent.
 */
const TAGS: Tag[] = [
  { id: 1, name: 'WiFi', slug: 'wifi', type: 'amenity', icon: null, color: null, description: null },
  { id: 2, name: 'Piscine', slug: 'piscine', type: 'amenity', icon: null, color: null, description: null },
];

/** Ce que le formulaire retient — lu par `useWatch`, rendu pour être asserté. */
function Sonde({ control }: { control: Control<PropertyFormValues> }) {
  const [ids, noms, etage] = useWatch({ control, name: ['tag_ids', 'tag_names', 'floor_number'] });
  return <output data-testid="sonde">{JSON.stringify({ tag_ids: ids, tag_names: noms ?? [], floor_number: etage ?? null })}</output>;
}

function Harnais({
  type,
  contrat = 'sale',
  tagIds = [],
  tags = TAGS,
  etage,
}: {
  type: PropertyFormValues['type'];
  contrat?: PropertyFormValues['contract_type'];
  tagIds?: number[];
  tags?: Tag[];
  etage?: number;
}) {
  const form = useForm<PropertyFormValues>({
    defaultValues: {
      title: '',
      type,
      contract_type: contrat,
      currency: 'XOF',
      city: '',
      furnished: false,
      tag_ids: tagIds,
      tag_names: [] as string[],
      floor_number: etage,
    } as PropertyFormValues,
  });
  return (
    <>
      <StepCaracteristiques form={form} tags={tags} />
      <Sonde control={form.control} />
    </>
  );
}

const sonde = () => JSON.parse(screen.getByTestId('sonde').textContent ?? '{}') as {
  tag_ids: number[]; tag_names: string[]; floor_number: number | null;
};

/** `useWatch` publie APRÈS le rendu qui a écrit : on attend la sonde, on ne la lit pas tout de suite. */
const attendre = (attendu: Partial<ReturnType<typeof sonde>>) =>
  waitFor(() => expect(sonde()).toMatchObject(attendu));

function monter(props: Parameters<typeof Harnais>[0]) {
  return render(withIntl(<Harnais {...props} />));
}

describe('StepCaracteristiques', () => {
  it('AC2 — un TERRAIN ne demande ni chambres, ni salles de bain, ni meublé, ni année', () => {
    monter({ type: 'land' });

    expect(screen.queryByLabelText(/chambres/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/salles de bain/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/meublé/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/année de construction/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/places de parking/i)).not.toBeInTheDocument();
  });

  it('AC2 — un TERRAIN demande en revanche son statut foncier', () => {
    monter({ type: 'land' });
    expect(screen.getByRole('group', { name: /statut foncier/i })).toBeInTheDocument();
  });

  it('AC2 — un TERRAIN ne propose aucun équipement domestique', () => {
    monter({ type: 'land' });
    expect(screen.queryByLabelText(/équipements/i)).not.toBeInTheDocument();
  });

  it('AC3 — un APPARTEMENT demande chambres, salles de bain et étage', () => {
    monter({ type: 'apartment' });

    expect(screen.getByLabelText(/chambres/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/salles de bain/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^étage/i)).toBeInTheDocument();
  });

  it('AC3 — un APPARTEMENT ne demande pas son nombre de niveaux', () => {
    monter({ type: 'apartment' });
    expect(screen.queryByLabelText(/nombre de niveaux/i)).not.toBeInTheDocument();
  });

  it('une VILLA demande meublé, année de construction et places de parking — les trois champs qu’un TERRAIN n’a pas', () => {
    // Contrepartie POSITIVE du test « un TERRAIN ne demande ni… » ci-dessus : sans elle, une clé
    // renommée, un `<label>` désassocié ou les trois champs purement et simplement supprimés
    // laisseraient les assertions négatives sur `land` vertes.
    monter({ type: 'villa' });

    expect(screen.getByLabelText(/meublé/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/année de construction/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/places de parking/i)).toBeInTheDocument();
  });

  it('une MAISON demande son nombre de niveaux, pas son étage', () => {
    monter({ type: 'house' });

    expect(screen.getByLabelText(/nombre de niveaux/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^étage/i)).not.toBeInTheDocument();
  });

  it('un STUDIO ne demande pas ses chambres — le type les implique', () => {
    monter({ type: 'studio' });

    expect(screen.queryByLabelText(/chambres/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/salles de bain/i)).toBeInTheDocument();
  });

  it('un PARKING ne demande pas combien il a de places de parking', () => {
    monter({ type: 'parking' });
    expect(screen.queryByLabelText(/places de parking/i)).not.toBeInTheDocument();
  });

  it('le LIBELLÉ de la surface change avec le type — parcelle ou surface habitable', () => {
    const { unmount } = monter({ type: 'land' });
    expect(screen.getByLabelText(/surface du terrain/i)).toBeInTheDocument();
    unmount();

    monter({ type: 'villa' });
    expect(screen.getByLabelText(/surface habitable/i)).toBeInTheDocument();
  });

  it('la surface est demandée pour TOUS les types — seul son libellé varie', () => {
    monter({ type: 'parking' });
    expect(screen.getByLabelText(/surface/i)).toBeInTheDocument();
  });

  it('les équipements déjà retenus sont VISIBLEMENT retenus — une puce, qu’on peut retirer', () => {
    monter({ type: 'villa', tagIds: [2] });

    expect(screen.getByRole('button', { name: 'Retirer Piscine' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer WiFi' })).not.toBeInTheDocument();
  });

  it('TCK-633 (AC10) — un équipement se CHERCHE, se choisit, puis se retire', async () => {
    const user = userEvent.setup();
    monter({ type: 'villa' });

    await user.type(screen.getByLabelText(/équipements/i), 'pisc');
    await user.click(await screen.findByRole('option', { name: 'Piscine' }));
    await user.keyboard('{Escape}');
    await attendre({ tag_ids: [2] });

    await user.click(screen.getByRole('button', { name: 'Retirer Piscine' }));
    await attendre({ tag_ids: [] });
  });

  it('TCK-633 (AC10) — un équipement NOUVEAU s’ajoute par Entrée, tel que saisi, en attente', async () => {
    const user = userEvent.setup();
    monter({ type: 'villa' });

    await user.type(screen.getByLabelText(/équipements/i), 'Groupe électrogène{Enter}');
    await user.keyboard('{Escape}');

    await attendre({ tag_ids: [], tag_names: ['Groupe électrogène'] });
    expect(screen.getByRole('button', { name: 'Retirer Groupe électrogène' }).parentElement)
      .toHaveTextContent(/groupe électrogène.*en attente de vérification/i);
  });

  it('TCK-633 — le champ est rendu même SANS catalogue : on peut toujours ajouter', async () => {
    const user = userEvent.setup();
    monter({ type: 'villa', tags: [] });

    await user.type(screen.getByLabelText(/équipements/i), 'Forage{Enter}');

    await attendre({ tag_names: ['Forage'] });
  });

  it('le statut foncier se désélectionne — il est facultatif', async () => {
    const user = userEvent.setup();
    monter({ type: 'land' });

    const bail = screen.getByRole('button', { name: 'Bail' });
    await user.click(bail);
    expect(bail).toHaveAttribute('aria-pressed', 'true');

    await user.click(bail);
    expect(bail).toHaveAttribute('aria-pressed', 'false');
  });

  it('TCK-508 / AC7 — ni un TERRAIN ni une FERME ne demandent l’état du bien', () => {
    const { unmount } = monter({ type: 'land' });
    expect(screen.queryByRole('group', { name: /état du bien/i })).not.toBeInTheDocument();
    unmount();

    monter({ type: 'farm' });
    expect(screen.queryByRole('group', { name: /état du bien/i })).not.toBeInTheDocument();
  });

  it('TCK-508 — une VILLA demande son état, et il se désélectionne : il est facultatif', async () => {
    // Contrepartie positive du test précédent : sans elle, un groupe supprimé ou renommé
    // laisserait les assertions négatives vertes.
    const user = userEvent.setup();
    monter({ type: 'villa' });

    expect(screen.getByRole('group', { name: /état du bien/i })).toBeInTheDocument();
    const neuf = screen.getByRole('button', { name: 'Neuf' });
    await user.click(neuf);
    expect(neuf).toHaveAttribute('aria-pressed', 'true');

    await user.click(neuf);
    expect(neuf).toHaveAttribute('aria-pressed', 'false');
  });

  it('re-revue M-12 — le statut foncier reste en `aria-pressed`, jamais en radiogroup', () => {
    // La frontière est VOULUE, pas un oubli : le statut foncier est désélectionnable, et un groupe
    // de radios ne se désélectionne pas (cf. le docblock de `ChoiceChips`). Nommer l'invariant ici
    // évite qu'une future retouche le fasse basculer en `radioGroup` par mimétisme avec
    // `StepBien`. (TCK-633 : les équipements sont passés en liste à puces.)
    monter({ type: 'land' });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /statut foncier/i })).toBeInTheDocument();
  });

  describe('TCK-633 (AC10) — les nombres se choisissent dans une liste', () => {
    it('les chambres vont de « Non précisé » à 20', async () => {
      const user = userEvent.setup();
      monter({ type: 'apartment' });

      await user.click(screen.getByLabelText(/chambres/i));
      const liste = await screen.findByRole('listbox');
      const libelles = within(liste).getAllByRole('option').map((o) => o.textContent);
      expect(libelles[0]).toBe('Non précisé');
      expect(libelles.slice(1)).toEqual(Array.from({ length: 21 }, (_, i) => String(i)));
    });

    it('l’étage propose le sous-sol et le rez-de-chaussée, et un sous-sol s’enregistre à −1', async () => {
      const user = userEvent.setup();
      monter({ type: 'apartment' });

      await user.click(screen.getByLabelText(/^étage/i));
      await user.click(await screen.findByRole('option', { name: 'Sous-sol' }));

      await attendre({ floor_number: -1 });
      expect(screen.getByLabelText(/^étage/i)).toHaveTextContent('Sous-sol');
    });

    it('une valeur hors de la liste (un bien existant) est GARDÉE, et proposée dans la liste', async () => {
      const user = userEvent.setup();
      monter({ type: 'apartment', etage: 55 });

      expect(screen.getByLabelText(/^étage/i)).toHaveTextContent('55');
      await user.click(screen.getByLabelText(/^étage/i));
      expect(await screen.findByRole('option', { name: '55' })).toBeInTheDocument();
      await attendre({ floor_number: 55 });
    });

    it('« Non précisé » retire la valeur', async () => {
      const user = userEvent.setup();
      monter({ type: 'apartment', etage: 3 });

      await user.click(screen.getByLabelText(/^étage/i));
      await user.click(await screen.findByRole('option', { name: 'Non précisé' }));

      await attendre({ floor_number: null });
    });
  });
});
```

Pourquoi la `Sonde` et `attendre` : `useWatch` publie APRÈS le rendu qui a écrit. Lire
`form.getValues()` juste après un clic rendait la bonne valeur, mais ne prouvait pas que l'écran la
voyait ; la sonde lit ce que voit un abonné, comme `StepCaracteristiques` lui-même.

**Step 3 : les deux tests du parcours**

`src/components/property-form/__tests__/abonnement-des-etapes.test.tsx` — ⚠ HORS TERRITOIRE.
Edit 1 (L125-138) :

```
old:  it('les équipements s’additionnent : le second clic ne PERD pas le premier', async () => {
    const user = userEvent.setup();
    function AvecTags({ form }: { form: UseFormReturn<PropertyFormValues> }) {
      return <StepCaracteristiques form={form} tags={[WIFI, PISCINE]} />;
    }
    const sonde = monter(AvecTags, { type: 'villa', contract_type: 'sale' });

    await user.click(screen.getByRole('button', { name: 'WiFi' }));
    await user.click(screen.getByRole('button', { name: 'Piscine' }));

    expect(sonde.form?.getValues('tag_ids')).toEqual([7, 8]);
    expect(screen.getByRole('button', { name: 'WiFi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Piscine' })).toHaveAttribute('aria-pressed', 'true');
  });
new:  it('les équipements s’additionnent : le second choix ne PERD pas le premier', async () => {
    const user = userEvent.setup();
    function AvecTags({ form }: { form: UseFormReturn<PropertyFormValues> }) {
      return <StepCaracteristiques form={form} tags={[WIFI, PISCINE]} />;
    }
    const sonde = monter(AvecTags, { type: 'villa', contract_type: 'sale' });

    // TCK-633 — une liste à puces : on cherche, on choisit, deux fois.
    const champ = screen.getByLabelText(/équipements/i);
    await user.type(champ, 'wif');
    await user.click(await screen.findByRole('option', { name: 'WiFi' }));
    await user.type(champ, 'pisc');
    await user.click(await screen.findByRole('option', { name: 'Piscine' }));

    expect(sonde.form?.getValues('tag_ids')).toEqual([7, 8]);
    expect(screen.getByRole('button', { name: 'Retirer WiFi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer Piscine' })).toBeInTheDocument();
  });
```

Edit 2 (garde d'abonnement, la liste étendue en tâche 19) :

```
old:    'ChampsPosition.tsx',
new:    'ChampsPosition.tsx',
    'ChampEquipements.tsx',
```

`src/components/property-form/__tests__/PropertyWizard.test.tsx` — co-tenu (C, D). Edit 1
(L277-284) — l'étage se CHOISIT désormais dans une liste bornée (−1 à 40) ; la valeur hors
bornes n'arrive plus que par un brouillon repris :

```
old:  it('ne déclenche à l’étape 3 que les champs que la MATRICE juge pertinents pour le type', async () => {
    const user = userEvent.setup();
    monter();

    // Un appartement a un étage : la valeur hors bornes bloque, ce qui prouve que l'étape
    // déclenche bien ses propres clés.
    await allerAuxCaracteristiques(user, /^appartement$/i);
    await user.type(screen.getByLabelText(/^étage/i), '500');
new:  it('ne déclenche à l’étape 3 que les champs que la MATRICE juge pertinents pour le type', async () => {
    const user = userEvent.setup();

    // Un appartement a un étage : la valeur hors bornes bloque, ce qui prouve que l'étape
    // déclenche bien ses propres clés. TCK-633 — l'étage se CHOISIT désormais dans une liste
    // bornée : la valeur hors bornes arrive par un brouillon repris, seul chemin qui le permet.
    brouillon.etat.draft = {
      step: 2,
      data: {
        title: null, type: 'apartment', contract_type: 'sale', currency: 'XOF', city: 'Dakar',
        furnished: false, tag_ids: [], floor_number: 500,
      },
    };
    monter();
    await screen.findByRole('progressbar', { value: { text: 'Étape 3 sur 6' } });
```

`brouillon` est la doublure hoistée de `useWizardDraft` (lu : L47-58, remise à `null` en
`beforeEach` L123). La suite du test (retour à l'étape 1, bascule sur un terrain) est inchangée.

Edit 2 (L531, dans `allerJusquAuBout`) :

```
old:  if (options.equipement) await user.click(screen.getByRole('button', { name: /wifi/i }));
new:  if (options.equipement) {
    // TCK-633 — les équipements se cherchent dans une liste à puces ; Échap la referme.
    await user.type(screen.getByLabelText(/équipements/i), 'wif');
    await user.click(await screen.findByRole('option', { name: 'WiFi' }));
    await user.keyboard('{Escape}');
  }
```

L'Échap n'efface aucune puce : c'est la garde `reason === 'escape-key'` de la tâche 15 (E-26).

**Step 4 : rouge**

```bash
npx vitest run src/components/property-form/__tests__/StepCaracteristiques.test.tsx src/components/property-form/__tests__/abonnement-des-etapes.test.tsx src/components/property-form/__tests__/PropertyWizard.test.tsx < /dev/null
```

Attendu : `10 failed | 100 passed (110)` — l'étape n'importe encore rien de neuf, les échecs sont
des assertions. Les dix : les quatre de nombres, les
quatre d'équipements de `StepCaracteristiques.test.tsx` (dont « déjà retenus », qui cherche une
puce), « les équipements s'additionnent » (`abonnement-des-etapes`), « AC7 — une seconde tentative
NE RENVOIE PAS les photos » (`PropertyWizard`, seul appelant d'`allerJusquAuBout` avec
`equipement: true`, L698). Le test de l'étage à 500 est vert des deux côtés : il éprouve la
validation de l'étape, pas la saisie. Mesuré dans le harnais : `10 failed | 100 passed (110)`.

**Step 5 : le type**

`src/types/tag.ts`, Edit (L9-21) :

```
old:export type TagType = 'amenity' | 'feature' | 'label' | 'crm';

export interface Tag {
new:export type TagType = 'amenity' | 'feature' | 'label' | 'crm';

/** TCK-633 — un équipement saisi par un utilisateur naît `pending` ; le super-admin le tranche. */
export type TagStatus = 'approved' | 'pending' | 'rejected';

export interface Tag {
```

```
old:  description: string | null;
  properties_count?: number;
new:  description: string | null;
  status?: TagStatus;
  created_by_id?: number | null;
  properties_count?: number;
```

`TagType` garde `'feature'` : les étiquettes existantes en portent jusqu'à la migration de la
tâche 10, et l'écran d'administration les liste. Seul le formulaire de création le retire (tâche 24).

**Step 6 : les deux composants**

`src/components/property-form/wizard/NombreEnListe.tsx` :

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { FormError } from '@/components/forms';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PropertyFormValues } from '@/lib/schemas/property';

/** Les champs comptés du bien, et l'étendue que propose leur liste (ticket, lot D). */
export type ChampNombre = 'bedrooms' | 'bathrooms' | 'parking_spaces' | 'floor_number' | 'total_floors' | 'year_built';

function suite(de: number, a: number): number[] {
  const pas = de <= a ? 1 : -1;
  return Array.from({ length: Math.abs(a - de) + 1 }, (_, i) => de + i * pas);
}

/**
 * TCK-633 (AC10) — les nombres se CHOISISSENT : chambres 0-20, salles de bain 0-10, parking 0-20,
 * étage du sous-sol au 40e, niveaux 1-40, année de l'an prochain à 1900 (la plus récente en tête).
 * L'API garde des bornes plus larges (tâche 8) : un bien existant à 25 chambres reste éditable,
 * sa valeur est AJOUTÉE à la liste au lieu d'être effacée en silence.
 */
export function valeursProposees(champ: ChampNombre, annee: number = new Date().getFullYear()): number[] {
  switch (champ) {
    case 'bedrooms':
    case 'parking_spaces':
      return suite(0, 20);
    case 'bathrooms':
      return suite(0, 10);
    case 'floor_number':
      return suite(-1, 40);
    case 'total_floors':
      return suite(1, 40);
    case 'year_built':
      return suite(annee + 1, 1900);
  }
}

const AUCUNE = '';

export function NombreEnListe({
  form,
  name,
  label,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly name: ChampNombre;
  readonly label: string;
}) {
  const t = useTranslations('property.form.features');
  const id = `field-${name}`;
  const libelle = (n: number) =>
    name === 'floor_number' && n === -1 ? t('floorBasement')
    : name === 'floor_number' && n === 0 ? t('floorGround')
    : String(n);

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const brute = field.value as number | string | null | undefined;
        const actuelle = brute === null || brute === undefined || brute === '' ? null : Number(brute);
        const nombres = valeursProposees(name);
        if (actuelle !== null && !Number.isNaN(actuelle) && !nombres.includes(actuelle)) nombres.push(actuelle);
        const options = [
          { value: AUCUNE, label: t('notSpecified') },
          ...nombres.map((n) => ({ value: String(n), label: libelle(n) })),
        ];
        const erreur = fieldState.error?.message;
        return (
          <div className="w-full">
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
              {label}
            </label>
            <Select
              value={actuelle === null ? AUCUNE : String(actuelle)}
              // « Non précisé » rend `undefined` : le champ sort du corps, comme un champ vide
              // de l'ancienne saisie libre.
              onValueChange={(v) => field.onChange(v === AUCUNE || v === null ? undefined : Number(v))}
              items={options}
            >
              <SelectTrigger
                id={id}
                ref={field.ref}
                className="w-full"
                aria-invalid={erreur ? true : undefined}
                aria-describedby={erreur ? `${id}-error` : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormError id={`${id}-error`}>{erreur}</FormError>
          </div>
        );
      }}
    />
  );
}
```

`src/components/property-form/ChampEquipements.tsx` :

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { ComboboxMultiple, replierPourIdentite, type OptionDeListe } from '@/components/ui/combobox';
import type { PropertyFormValues } from '@/lib/schemas/property';
import type { Tag } from '@/types/tag';

/** Le préfixe d'une valeur qui n'est PAS un identifiant : un nom saisi, à proposer (`tag_names`). */
const NOM = 'nom:';

/**
 * TCK-633 (AC10) — les équipements en multi-sélection avec puces.
 *
 * Deux sources de valeurs, deux clés du formulaire : un équipement du catalogue part dans
 * `tag_ids` ; un nom tapé que le catalogue ne connaît pas part dans `tag_names`, et le serveur en
 * fait une proposition (`TagProposals`, tâche 11) — affichée telle que saisie, « en attente ».
 *
 * Le catalogue est celui que l'API sert à l'utilisateur : les équipements approuvés, plus SES
 * propositions en attente (`TagController::index`, tâche 10). `attaches` complète les libellés
 * des équipements déjà portés par le bien et absents du catalogue (proposés par quelqu'un d'autre).
 *
 * Le champ est rendu même sans catalogue : on peut toujours ajouter.
 */
export function ChampEquipements({
  form,
  tags,
  attaches = [],
  label,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly tags: readonly Tag[];
  readonly attaches?: readonly Tag[];
  readonly label: string;
}) {
  const t = useTranslations('property.form.amenities');
  const { control, setValue } = form;
  const [idsSuivis, nomsSuivis] = useWatch({ control, name: ['tag_ids', 'tag_names'] });
  const ids = (idsSuivis ?? []) as number[];
  const noms = (nomsSuivis ?? []) as string[];

  const enOption = (tag: Tag): OptionDeListe => ({
    value: String(tag.id),
    label: tag.name,
    indice: tag.status === 'pending' ? t('pending') : undefined,
  });
  const connus = new Map<number, Tag>();
  for (const tag of [...attaches, ...tags]) connus.set(tag.id, tag);

  const options = tags.filter((tag) => tag.status !== 'rejected').map(enOption);
  const valeurs: OptionDeListe[] = [
    ...ids.flatMap((id) => {
      const tag = connus.get(id);
      return tag ? [enOption(tag)] : [];
    }),
    ...noms.map((nom) => ({ value: `${NOM}${nom}`, label: nom, indice: t('pending') })),
  ];

  const ecrire = (suivantes: readonly OptionDeListe[]) => {
    setValue(
      'tag_ids',
      suivantes.filter((o) => !o.value.startsWith(NOM)).map((o) => Number(o.value)),
      { shouldDirty: true },
    );
    setValue(
      'tag_names',
      suivantes.filter((o) => o.value.startsWith(NOM)).map((o) => o.label),
      { shouldDirty: true },
    );
  };

  return (
    <div className="w-full">
      <label htmlFor="champ-equipements" className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <ComboboxMultiple
        id="champ-equipements"
        options={options}
        valeurs={valeurs}
        onChange={ecrire}
        creation={{
          libelle: (nom) => t('create', { name: nom }),
          surCreation: (nom) => {
            // Un nom déjà retenu (à la casse près) ne se double pas.
            if (noms.some((n) => replierPourIdentite(n) === replierPourIdentite(nom))) return;
            setValue('tag_names', [...noms, nom], { shouldDirty: true });
          },
        }}
        retirer={(nom) => t('remove', { name: nom })}
        placeholder={t('placeholder')}
        aucunResultat={t('empty')}
      />
    </div>
  );
}
```

**Step 7 : l'étape**

`src/components/property-form/wizard/steps/StepCaracteristiques.tsx`, Edit 1 (L9-12) :

```
old:import type { Tag } from '@/types/tag';
import { areaLabelKey, isFieldRelevant, type ConditionalFieldKey } from '../../field-matrix';
import { PROPERTY_ENUM_NAMESPACES } from '../../options';
import { ChoiceChips } from '../ChoiceChips';
new:import type { Tag } from '@/types/tag';
import { ChampEquipements } from '../../ChampEquipements';
import { areaLabelKey, isFieldRelevant, type ConditionalFieldKey } from '../../field-matrix';
import { PROPERTY_ENUM_NAMESPACES } from '../../options';
import { ChoiceChips } from '../ChoiceChips';
import { NombreEnListe } from '../NombreEnListe';
```

Edit 2 (L47-53) — `tag_ids` n'est plus lu ici, `ChampEquipements` l'observe lui-même :

```
old:  const [type, contrat, tagIdsSuivis, titreActuel, etatSuivi] = useWatch({
    control,
    name: ['type', 'contract_type', 'tag_ids', 'title_type', 'condition'],
  });
  const ctx = { type, contract: contrat } as const;
  const pertinent = (cle: ConditionalFieldKey) => isFieldRelevant(cle, ctx);
  const tagIds = (tagIdsSuivis ?? []) as number[];
new:  const [type, contrat, titreActuel, etatSuivi] = useWatch({
    control,
    name: ['type', 'contract_type', 'title_type', 'condition'],
  });
  const ctx = { type, contract: contrat } as const;
  const pertinent = (cle: ConditionalFieldKey) => isFieldRelevant(cle, ctx);
```

Edit 3 (L86-96) :

```
old:      {pertinent('bedrooms') || pertinent('bathrooms') ? (
        <div className="wizard-field-rise grid gap-4 sm:grid-cols-2">
          {pertinent('bedrooms') ? (
            <FormInput control={control} name="bedrooms" label={t('fields.bedrooms')}
              type="number" inputMode="numeric" min={0} />
          ) : null}
          {pertinent('bathrooms') ? (
            <FormInput control={control} name="bathrooms" label={t('fields.bathrooms')}
              type="number" inputMode="numeric" min={0} />
          ) : null}
new:      {pertinent('bedrooms') || pertinent('bathrooms') ? (
        <div className="wizard-field-rise grid gap-4 sm:grid-cols-2">
          {/* TCK-633 (AC10) — les nombres se choisissent dans une liste. */}
          {pertinent('bedrooms') ? (
            <NombreEnListe form={form} name="bedrooms" label={t('fields.bedrooms')} />
          ) : null}
          {pertinent('bathrooms') ? (
            <NombreEnListe form={form} name="bathrooms" label={t('fields.bathrooms')} />
          ) : null}
```

Edit 4 (L101-117) :

```
old:          {pertinent('floor_number') ? (
            <FormInput control={control} name="floor_number" label={t('fields.floorNumber')}
              type="number" inputMode="numeric" min={-5} max={200} />
          ) : null}
          {pertinent('total_floors') ? (
            <FormInput control={control} name="total_floors" label={t('fields.totalFloors')}
              type="number" inputMode="numeric" min={1} max={200} />
          ) : null}
          {pertinent('year_built') ? (
            <FormInput control={control} name="year_built" label={t('fields.yearBuilt')}
              type="number" inputMode="numeric" min={1800} max={2100}
              placeholder={t('placeholders.yearBuilt')} />
          ) : null}
          {pertinent('parking_spaces') ? (
            <FormInput control={control} name="parking_spaces" label={t('fields.parking')}
              type="number" inputMode="numeric" min={0} placeholder={t('placeholders.parking')} />
          ) : null}
new:          {pertinent('floor_number') ? (
            <NombreEnListe form={form} name="floor_number" label={t('fields.floorNumber')} />
          ) : null}
          {pertinent('total_floors') ? (
            <NombreEnListe form={form} name="total_floors" label={t('fields.totalFloors')} />
          ) : null}
          {pertinent('year_built') ? (
            <NombreEnListe form={form} name="year_built" label={t('fields.yearBuilt')} />
          ) : null}
          {pertinent('parking_spaces') ? (
            <NombreEnListe form={form} name="parking_spaces" label={t('fields.parking')} />
          ) : null}
```

Edit 5 (L172-198) :

```
old:      {pertinent('tag_ids') && tags.length > 0 ? (
        <div className="wizard-field-rise" style={{ animationDelay: '240ms' }}>
          <ChoiceChips
            id="wizard-tags"
            label={t('fields.amenities')}
            // Sélection MULTIPLE : c'est `selected` qui montre ce qui est déjà retenu. Sans elle,
            // rien à l'écran ne distinguait un équipement coché d'un équipement disponible. Le
            // type de `ChoiceChips` interdit désormais de fournir `value` en même temps.
            selected={tagIds.map(String)}
            // Relue au clic : une liste lue dans une fermeture figée PERDAIT les équipements
            // déjà cochés (le second clic réécrivait `[second]` par-dessus `[premier]`).
            onChange={(v) => {
              const id = Number(v);
              const retenus = (getValues('tag_ids') ?? []) as number[];
              setValue(
                'tag_ids',
                retenus.includes(id) ? retenus.filter((x) => x !== id) : [...retenus, id],
                { shouldDirty: true },
              );
            }}
            options={tags.map((tag) => ({
              value: String(tag.id),
              label: tag.name,
              icon: tag.icon ?? undefined,
            }))}
          />
        </div>
new:      {/* TCK-633 (AC10) — rendu même sans catalogue : un équipement se propose par Entrée. */}
      {pertinent('tag_ids') ? (
        <div className="wizard-field-rise" style={{ animationDelay: '240ms' }}>
          <ChampEquipements form={form} tags={tags} label={t('fields.amenities')} />
        </div>
```

`FormInput`, `ChoiceChips`, `setValue` et `getValues` restent importés et lus : la surface (L76),
le statut foncier et l'état du bien s'en servent toujours (L124-160). Les clés
`property.wizard.placeholders.{yearBuilt,parking}` n'ont plus de lecteur (E-24).

**Step 8 : vert, types, lint**

```bash
npx vitest run src/components/property-form/__tests__/StepCaracteristiques.test.tsx src/components/property-form/__tests__/abonnement-des-etapes.test.tsx src/components/property-form/__tests__/PropertyWizard.test.tsx < /dev/null
npx vitest run src/components/property-form < /dev/null
npx tsc --noEmit
npx eslint src/components/property-form src/types/tag.ts
```

Attendu : `110 passed (110)` ; tout `property-form` vert ; `tsc` muet ; ESLint 0 erreur. Mesuré
dans le harnais : `110 passed (110)` puis `182 passed` sur `property-form` (avec les tests des
tâches 18 et 19).

**Step 9 : ablations**

```bash
N=src/components/property-form/wizard/NombreEnListe.tsx
E=src/components/property-form/ChampEquipements.tsx
C=src/components/property-form/wizard/steps/StepCaracteristiques.tsx
T=src/components/property-form/__tests__/StepCaracteristiques.test.tsx
cp $N $E "$S/abl/t20/" && cp $C "$S/abl/t20/SC.nouveau.tsx"
# a) une valeur hors de la liste n'y est plus ajoutée
sed -i '' '/nombres.push(actuelle)/d' $N
npx vitest run $T < /dev/null
cp "$S/abl/t20/NombreEnListe.tsx" $N
# b) le sous-sol s'affiche « -1 »
sed -i '' "s/n === -1 ? t('floorBasement')/n === -1 ? String(n)/" $N
npx vitest run $T < /dev/null
cp "$S/abl/t20/NombreEnListe.tsx" $N
# c) un équipement nouveau n'est plus retenu
sed -i '' "s/setValue('tag_names', \[...noms, nom\], { shouldDirty: true });/return;/" $E
npx vitest run $T < /dev/null
cp "$S/abl/t20/ChampEquipements.tsx" $E
# d) le champ disparaît de nouveau sans catalogue
sed -i '' "s/{pertinent('tag_ids') ? (/{pertinent('tag_ids') \&\& tags.length > 0 ? (/" $C
npx vitest run $T < /dev/null
cp "$S/abl/t20/SC.nouveau.tsx" $C
md5 -q $N "$S/abl/t20/NombreEnListe.tsx" $E "$S/abl/t20/ChampEquipements.tsx" $C "$S/abl/t20/SC.nouveau.tsx"
```

Attendu (mesuré dans le harnais) : a) 1 échec — « une valeur hors de la liste (un bien existant)
est GARDÉE » ; b) 1 échec — « l'étage propose le sous-sol et le rez-de-chaussée » ; c) 2 échecs —
« un équipement NOUVEAU s'ajoute par Entrée » et « le champ est rendu même SANS catalogue » ;
d) 1 échec — « le champ est rendu même SANS catalogue » ; les trois paires de `md5` identiques.

**Step 10 : signaler**

Signaler : `NombreEnListe.tsx`, `ChampEquipements.tsx`, `types/tag.ts`,
`StepCaracteristiques.tsx`, `StepCaracteristiques.test.tsx`, `PropertyWizard.test.tsx` (co-tenu),
`abonnement-des-etapes.test.tsx` (⚠ hors territoire),
`feat(web): nombres en liste et équipements à puces dans l'assistant (TCK-633)`.

---

## Tâche 21 — Le prix en francs CFA, les frais d'agence d'un indépendant, les équipements proposés (25 min)

Trois retours du porteur, un seul écran :

- **La devise ne se choisit plus** (ADR-0061 ; le serveur l'impose depuis la tâche 8). Le
  `FormSelect` de la devise sort de `StepPrix` ; `currency` reste dans le formulaire, à `'XOF'`
  (lu : `valeursInitiales()`, `PropertyWizard.tsx` L167), parce que c'est elle qui fixe les
  décimales du montant (`FormAmountInput`, `decimalesDeDevise`, lu L114 et L194). Deux sources
  pouvaient encore y écrire une autre devise, et les deux sont fermées : la géo-IP (effet L425-431,
  qui posait `defaults.currency`) et un brouillon d'avant ADR-0061 repris tel quel (L409).
- **Un indépendant ne facture pas de frais d'agence** (tâche 8 : `prohibited` pour une agence
  `individual`, `null` admis). `EntryCostFields` reçoit `fraisDAgence` : le champ n'est pas rendu,
  et une valeur déjà là est retirée **avec `shouldDirty`** — `withClearedFields` (`payload.ts`)
  n'envoie `null` à l'édition que pour un champ modifié. La page `new` lit le type de l'agence par
  `resolveAgencyOrNull(…, 'affichage')`, comme `overview/page.tsx` (lu L15-35) : une agence
  illisible GARDE le champ — ne pas savoir dégrade, n'interrompt pas — et l'API reste juge.
- **Les équipements proposés partent** : `setPropertyTagsAction(id, tagIds, tagNames)` →
  `setPropertyTags` → `POST /api/properties/{id}/tags` avec `tag_names` (lu :
  `routes/api/properties.php` L70, **POST** et non PUT — E-3).

**Fichiers**
- Remplacer : `takussan-web/src/components/property-form/wizard/steps/StepPrix.tsx` (118 lignes lues)
- Modifier : `takussan-web/src/components/property-form/PropertyWizard.tsx` (L206-210, L302-303, L409, L413-431, L527) — co-tenu (C, D)
- Modifier : `takussan-web/src/app/(dashboard)/app/properties/new/page.tsx` (L13-14, L78, L83, L120) — ⚠ HORS TERRITOIRE
- Modifier : `takussan-web/src/app/actions/dashboard-properties.ts` (L263-273) — ⚠ HORS TERRITOIRE
- Modifier : `takussan-web/src/lib/queries/properties-server.ts` (L385-395) — ⚠ HORS TERRITOIRE
- Tests créés : `__tests__/StepPrix.test.tsx`, `app/(dashboard)/app/properties/new/__tests__/page.frais-d-agence.test.tsx`,
  `lib/queries/__tests__/property-tags.tck-633.test.ts`
- Tests modifiés : `__tests__/wizard-steps.test.tsx` (L76-81, ⚠ HORS TERRITOIRE),
  `__tests__/PropertyWizard.test.tsx` (L93, L225-246, L600-626, L628 — co-tenu (C, D) ; numéros
  d'avant les tâches 19-20, chercher l'ancre)

**Step 1 : sauvegardes**

```bash
cd "$WEB"
mkdir -p "$S/abl/t21"
cp src/components/property-form/wizard/steps/StepPrix.tsx src/components/property-form/PropertyWizard.tsx \
   "src/app/(dashboard)/app/properties/new/page.tsx" src/app/actions/dashboard-properties.ts \
   src/lib/queries/properties-server.ts "$S/abl/t21/"
```

**Step 2 : les tests créés**

`src/components/property-form/__tests__/StepPrix.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { StepPrix } from '../wizard/steps/StepPrix';

/**
 * TCK-633 — le prix se publie en francs CFA (ADR-0061) : la devise ne se choisit plus. Et un
 * indépendant (agence `individual`) ne facture pas de frais d'agence : le champ n'est pas rendu, et
 * une valeur déjà là est retirée — l'API la refuse pour lui (tâche 8).
 */
function monter(defauts: Partial<PropertyFormValues>, fraisDAgence?: boolean) {
  const sortie: { form?: UseFormReturn<PropertyFormValues> } = {};
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: {
        title: '', type: 'apartment', contract_type: 'rent', rent_period: 'monthly', currency: 'XOF',
        city: 'Dakar', furnished: false, tag_ids: [],
        ...defauts,
      } as PropertyFormValues,
    });
    sortie.form = form;
    return <StepPrix form={form} fraisDAgence={fraisDAgence} />;
  }
  render(withIntl(<Harnais />));
  return () => sortie.form!;
}

describe('StepPrix — TCK-633', () => {
  it('ne demande plus la devise : le prix seul, saisi en francs CFA (sans décimales)', () => {
    monter({ contract_type: 'sale', rent_period: undefined });

    expect(screen.queryByRole('combobox', { name: /devise/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/devise/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^prix/i)).toHaveAttribute('inputmode', 'numeric');
  });

  it('une agence standard garde ses frais d’agence', () => {
    monter({});

    expect(screen.getByLabelText(/frais d.agence/i)).toBeInTheDocument();
  });

  it('un indépendant ne voit pas les frais d’agence — avance et caution restent', () => {
    monter({}, false);

    expect(screen.queryByLabelText(/frais d.agence/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/avance/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/caution/i)).toBeInTheDocument();
  });

  it('chez un indépendant, des frais déjà saisis sont RETIRÉS, et le retrait compte comme une modification', async () => {
    const form = monter({ agency_fee_months: 1 }, false);

    await waitFor(() => expect(form().getValues('agency_fee_months')).toBeUndefined());
    // `withClearedFields` (payload.ts) n'envoie `null` à l'édition que pour un champ MODIFIÉ :
    // sans `shouldDirty`, la valeur en base survivrait au retrait.
    expect(form().getFieldState('agency_fee_months').isDirty).toBe(true);
  });
});
```

`src/app/(dashboard)/app/properties/new/__tests__/page.frais-d-agence.test.tsx` (mêmes doublures
que `page.quota.test.tsx`, lu L12-23, plus `@/lib/session` et `@/lib/access/server-guards`) :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-633 — un indépendant (agence `individual`) ne facture pas de frais d'agence : la page lit le
 * type de l'agence et le dit à l'assistant. Lecture d'AFFICHAGE : une agence illisible ne bloque
 * rien, elle garde le champ (l'API reste juge, tâche 8).
 */
const mockGetMe = vi.fn();
const mockAgence = vi.fn();

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => mockGetMe() }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  fetchListingQuotaAction: async () => ({ limit: null, used: 0, can_create: true }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...args: unknown[]) => mockAgence(...args),
}));
vi.mock('@/components/property-form', () => ({
  PropertyWizard: ({ fraisDAgence }: { fraisDAgence?: boolean }) => (
    <div data-testid="assistant" data-frais={String(fraisDAgence)} />
  ),
}));

import Page from '../page';

describe('/app/properties/new — les frais d’agence selon le type d’agence (TCK-633)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('un indépendant : pas de frais d’agence', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agency_admin'], agency_id: 9 });
    mockAgence.mockResolvedValue({ id: 9, kind: 'individual' });

    render(withIntl(await Page()));

    expect(screen.getByTestId('assistant')).toHaveAttribute('data-frais', 'false');
    expect(mockAgence).toHaveBeenCalledWith('jeton', 9, expect.any(String), 'affichage');
  });

  it('une agence standard : les frais d’agence', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agent'], agency_id: 9 });
    mockAgence.mockResolvedValue({ id: 9, kind: 'standard' });

    render(withIntl(await Page()));

    expect(screen.getByTestId('assistant')).toHaveAttribute('data-frais', 'true');
  });

  it('une agence illisible garde le champ : l’affichage dégrade, il ne bloque pas', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agent'], agency_id: 9 });
    mockAgence.mockResolvedValue(null);

    render(withIntl(await Page()));

    expect(screen.getByTestId('assistant')).toHaveAttribute('data-frais', 'true');
  });

  it('sans agence, aucune lecture', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['owner'] });

    render(withIntl(await Page()));

    expect(mockAgence).not.toHaveBeenCalled();
    expect(screen.getByTestId('assistant')).toHaveAttribute('data-frais', 'true');
  });
});
```

`src/lib/queries/__tests__/property-tags.tck-633.test.ts` :

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-633 — les équipements proposés hors catalogue (`tag_names`) partent par le MÊME appel que
 * les autres : `POST /api/properties/{id}/tags` (lu : `routes/api/properties.php`, POST et non PUT).
 */
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: api.apiRequest,
}));

import { setPropertyTags } from '../properties-server';

beforeEach(() => {
  api.apiRequest.mockReset();
  api.apiRequest.mockResolvedValue(undefined);
});

describe('setPropertyTags', () => {
  it('envoie les noms proposés à côté des identifiants', async () => {
    await setPropertyTags('jeton', 7, [1, 2], ['Forage']);

    expect(api.apiRequest).toHaveBeenCalledWith('/api/properties/7/tags', {
      method: 'POST',
      body: { tag_ids: [1, 2], tag_names: ['Forage'] },
      token: 'jeton',
    });
  });

  it('sans nom proposé, le corps reste celui d’avant', async () => {
    await setPropertyTags('jeton', 7, [1]);

    expect(api.apiRequest).toHaveBeenCalledWith('/api/properties/7/tags', {
      method: 'POST',
      body: { tag_ids: [1] },
      token: 'jeton',
    });
  });
});
```

**Step 3 : les tests modifiés**

`src/components/property-form/__tests__/wizard-steps.test.tsx` — ⚠ HORS TERRITOIRE. Edit (L76-81) :

```
old:  it('demande toujours le prix et la devise, quel que soit le contrat', () => {
    harnais({ contract_type: 'sale' }, (form) => <StepPrix form={form} />);

    expect(screen.getByLabelText(/^prix/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/devise/i)).toBeInTheDocument();
  });
new:  it('demande toujours le prix, quel que soit le contrat — et plus la devise (TCK-633)', () => {
    harnais({ contract_type: 'sale' }, (form) => <StepPrix form={form} />);

    expect(screen.getByLabelText(/^prix/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/devise/i)).not.toBeInTheDocument();
  });
```

`src/components/property-form/__tests__/PropertyWizard.test.tsx` — co-tenu (C, D). Edit 1 (`monter`) :

```
old:function monter(tags: Tag[] = []) {
  return render(withIntl(<PropertyWizard tags={tags} />));
}
new:function monter(tags: Tag[] = [], props: { readonly fraisDAgence?: boolean } = {}) {
  return render(withIntl(<PropertyWizard tags={tags} {...props} />));
}
```

Edit 2 (titre du test de la géo-IP) :

```
old:  it('pose le pays et la devise que la note de l’étape 1 promet à l’utilisateur', async () => {
new:  it('pose le pays que la note de l’étape 1 promet — et JAMAIS la devise de la connexion (TCK-633)', async () => {
```

Edit 3 (son assertion finale) :

```
old:    expect(screen.getByRole('combobox', { name: /devise/i })).toHaveTextContent('EUR');
  });
new:    // ADR-0061 — le prix se publie en francs CFA : pas de choix, et pas de décimales d'euro.
    expect(screen.queryByRole('combobox', { name: /devise/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^prix/i)).toHaveAttribute('inputmode', 'numeric');
  });
```

La géo-IP reste à Paris / EUR : sans l'effet corrigé, `currency` vaudrait `EUR` et la saisie du
prix serait `decimal`.

Edit 4 — le test W10 de la devise CHOISIE n'a plus d'objet ; il devient deux tests. `old` (le test
entier) :

```
  it('W10 — le prix suit la devise CHOISIE : en euros, « 1500,50 » part 1500,5, pas 150 050', async () => {
    // Revue adverse : remplacer la devise suivie par la constante 'XOF' laissait toute la suite
    // verte. Seul un changement de devise DANS l'étape éprouve que le champ la suit.
    const user = userEvent.setup();
    monter();
    await allerAuxCaracteristiques(user, /^terrain$/i);
    await user.click(suivant()); //                          → prix

    await user.click(screen.getByRole('combobox', { name: /devise/i }));
    await user.click(await screen.findByRole('option', { name: /euro/i }));

    const prix = screen.getByLabelText(/^prix/i) as HTMLInputElement;
    expect(prix).toHaveAttribute('inputmode', 'decimal');
    await user.type(prix, '1500,50');
    expect(prix.value).toBe('1\u202f500,50');

    await user.click(suivant()); //                          → photos
    await user.click(suivant()); //                          → finition
    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(createPropertyAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPropertyAction).mock.calls[0][0]).toMatchObject({
      price: 1500.5,
      currency: 'EUR',
    });
  });
```

`new` :

```
  it('W10 — la devise ne se choisit plus (TCK-633) : un brouillon en euros repart en francs CFA', async () => {
    // Un brouillon d'avant ADR-0061 peut porter l'euro. Repris tel quel, le prix se lirait avec
    // deux décimales, et le corps partirait en EUR — que le serveur ramènerait à XOF sans le dire.
    brouillon.etat.draft = {
      step: 3,
      data: {
        title: null, type: 'land', contract_type: 'sale', currency: 'EUR', city: 'Dakar',
        furnished: false, tag_ids: [],
      },
    };
    const user = userEvent.setup();
    monter();
    await screen.findByRole('progressbar', { value: { text: 'Étape 4 sur 6' } });

    expect(screen.queryByRole('combobox', { name: /devise/i })).not.toBeInTheDocument();
    const prix = screen.getByLabelText(/^prix/i) as HTMLInputElement;
    expect(prix).toHaveAttribute('inputmode', 'numeric');
    await user.type(prix, '1500');

    await user.click(suivant()); //                          → photos
    await user.click(suivant()); //                          → finition
    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(createPropertyAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPropertyAction).mock.calls[0][0]).toMatchObject({ price: 1500, currency: 'XOF' });
  });

  it('TCK-633 — un indépendant ne voit pas les frais d’agence, et un brouillon qui en portait ne les envoie pas', async () => {
    brouillon.etat.draft = {
      step: 3,
      data: {
        title: null, type: 'apartment', contract_type: 'rent', rent_period: 'monthly', currency: 'XOF',
        city: 'Dakar', furnished: false, tag_ids: [], price: 350_000, agency_fee_months: 1,
      },
    };
    const user = userEvent.setup();
    monter([], { fraisDAgence: false });
    await screen.findByRole('progressbar', { value: { text: 'Étape 4 sur 6' } });

    expect(screen.getByLabelText(/caution/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/frais d.agence/i)).not.toBeInTheDocument();

    await user.click(suivant()); //                          → photos
    await user.click(suivant()); //                          → finition
    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(createPropertyAction).toHaveBeenCalledTimes(1));
    const corps = vi.mocked(createPropertyAction).mock.calls[0][0] as Record<string, unknown>;
    expect(corps.agency_fee_months ?? null).toBeNull();
  });
```

Edit 5 — en tête du `describe('PropertyWizard — la soumission'`, un test de plus :

```
old:describe('PropertyWizard — la soumission', () => {
new:describe('PropertyWizard — la soumission', () => {
  it('TCK-633 — un équipement PROPOSÉ part avec les autres, en nom, par le même appel', async () => {
    const user = userEvent.setup();
    monter();
    await allerAuxCaracteristiques(user, /^villa$/i);
    await user.type(screen.getByLabelText(/équipements/i), 'Forage{Enter}');
    await user.keyboard('{Escape}');
    await user.click(suivant()); //                          → prix
    await user.type(screen.getByLabelText(/^prix/i), '25000000');
    await user.click(suivant()); //                          → photos
    await user.click(suivant()); //                          → finition
    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(setPropertyTagsAction).toHaveBeenCalledTimes(1));
    expect(setPropertyTagsAction).toHaveBeenCalledWith(42, [], ['Forage']);
  });

```

(`new` = la ligne du `describe`, le test ci-dessus, puis une ligne vide.)

**Step 4 : rouge**

```bash
npx vitest run src/components/property-form/__tests__/PropertyWizard.test.tsx src/components/property-form/__tests__/wizard-steps.test.tsx src/components/property-form/__tests__/StepPrix.test.tsx < /dev/null
npx vitest run "src/app/(dashboard)/app/properties/new/__tests__" src/lib/queries/__tests__/property-tags.tck-633.test.ts < /dev/null
```

Attendu (mesuré dans le harnais) : `8 failed | 55 passed (63)` — les quatre tests TCK-633 de
`PropertyWizard` (géo-IP, brouillon en euros, indépendant, équipement proposé), trois de
`StepPrix.test.tsx` (« une agence standard garde ses frais » est vert des deux côtés), celui de
`wizard-steps`. Puis `5 failed | 4 passed (9)` : les quatre tests de la page (`data-frais` vaut
`undefined`), « envoie les noms proposés » ; `page.quota.test.tsx` (3) et « sans nom proposé »
restent verts.

**Step 5 : `StepPrix`**

`src/components/property-form/wizard/steps/StepPrix.tsx`, contenu entier :

```tsx
'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { FormAmountInput, FormDatePicker, FormInput, FormSelect } from '@/components/forms';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { PROPERTY_ENUM_NAMESPACES, rentPeriodOptions as fabriqueRentPeriodOptions } from '../../options';
import { isFieldRelevant } from '../../field-matrix';
import { WizardCollapsibleSection } from '../WizardCollapsibleSection';

/**
 * TCK-464 — le prix, et les deux champs qui n'existent qu'en location.
 *
 * La pertinence de `rent_period` vient de la matrice, jamais d'un `contract === 'rent'` écrit
 * ici : c'est la même règle qui purge le payload au moment de l'envoi, et deux écritures de la
 * même règle finissent toujours par diverger.
 */
/**
 * TCK-598 (V9) — les quatre champs du coût d'entrée, partagés par le parcours de création et la
 * page d'édition : une seule mise en page, un seul jeu de libellés.
 *
 * TCK-633 — `fraisDAgence` : un indépendant (agence `individual`) ne facture pas de frais
 * d'agence, et l'API les refuse pour lui (`StorePropertyRequest`, tâche 8). Le champ n'est pas
 * rendu, et une valeur déjà là (brouillon, bien existant) est RETIRÉE — marquée modifiée, pour que
 * l'édition envoie `null` (`withClearedFields`) au lieu de laisser l'ancienne valeur en base.
 */
export function EntryCostFields({
  form,
  devise,
  fraisDAgence = true,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly devise: PropertyFormValues['currency'];
  readonly fraisDAgence?: boolean;
}) {
  const t = useTranslations('property.wizard.entryCost');
  const { control, setValue } = form;
  const frais = useWatch({ control, name: 'agency_fee_months' });

  useEffect(() => {
    if (fraisDAgence || frais === undefined || frais === null) return;
    setValue('agency_fee_months', undefined, { shouldDirty: true });
  }, [fraisDAgence, frais, setValue]);

  return (
    <fieldset className="space-y-3 pt-1">
      <legend className="text-sm font-medium text-foreground">{t('legend')}</legend>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      <div className={fraisDAgence ? 'grid gap-4 sm:grid-cols-3' : 'grid gap-4 sm:grid-cols-2'}>
        <FormInput control={control} name="advance_months" label={t('advance')} type="number" min={0} max={24} step={1} inputMode="numeric" />
        <FormInput control={control} name="deposit_months" label={t('deposit')} type="number" min={0} max={24} step={1} inputMode="numeric" />
        {fraisDAgence ? (
          <FormInput control={control} name="agency_fee_months" label={t('agencyFee')} type="number" min={0} max={24} step={0.5} inputMode="decimal" />
        ) : null}
      </div>
      <FormAmountInput
        control={control}
        name="monthly_charges"
        label={t('monthlyCharges')}
        currency={devise}
        example={10_000}
      />
    </fieldset>
  );
}

export function StepPrix({
  form,
  fraisDAgence = true,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  /** TCK-633 — faux pour un indépendant : cf. `EntryCostFields`. */
  readonly fraisDAgence?: boolean;
}) {
  const t = useTranslations('property.wizard');
  const tPeriode = useTranslations(PROPERTY_ENUM_NAMESPACES.rentPeriod);
  const { control } = form;
  // TCK-564 — `useWatch`, jamais `watch()` lu pendant le rendu (cf. `StepBien`). La devise n'est
  // plus un choix (TCK-633, ADR-0061) mais reste lue : elle décide des décimales du montant.
  const [type, contrat, devise, periode] = useWatch({
    control,
    name: ['type', 'contract_type', 'currency', 'rent_period'],
  });
  const ctx = { type, contract: contrat, rentPeriod: periode } as const;
  const location = isFieldRelevant('rent_period', ctx);
  // TCK-598 (V9) — le coût d'entrée, d'une location MENSUELLE seulement : la même règle qui retire
  // ces champs du corps à l'envoi, sans quoi l'API rendrait 422.
  const coutDEntree = isFieldRelevant('deposit_months', ctx);

  return (
    <>
      {/*
        TCK-564 — le montant se relit pendant la frappe (« 49 000 000 »), et le formulaire reçoit
        toujours un NOMBRE. La devise décide des décimales : aucune en franc CFA. TCK-633 — la
        devise ne se choisit plus : le prix se publie en francs CFA (ADR-0061), le serveur l'impose.
      */}
      <FormAmountInput
        control={control}
        name="price"
        label={t('fields.price')}
        required
        currency={devise}
        example={location ? 350_000 : 25_000_000}
      />

      <WizardCollapsibleSection open={location} testId="bloc-location">
        <div className="space-y-5 pt-1">
          <FormSelect
            control={control}
            name="rent_period"
            label={t('fields.period')}
            options={fabriqueRentPeriodOptions(tPeriode)}
            placeholder={t('placeholders.period')}
          />
          <FormDatePicker
            control={control}
            name="available_from"
            label={t('fields.availableFrom')}
          />
        </div>
      </WizardCollapsibleSection>

      <WizardCollapsibleSection open={coutDEntree} testId="bloc-cout-d-entree">
        <EntryCostFields form={form} devise={devise} fraisDAgence={fraisDAgence} />
      </WizardCollapsibleSection>
    </>
  );
}
```

Ce qui change par rapport aux 118 lignes lues : l'import `useEffect` ; `currencyOptions` et
`tDevise` retirés (L10, L59) ; `EntryCostFields` prend `fraisDAgence` (grille à deux colonnes sans
le champ, effet de retrait) ; `StepPrix` prend `fraisDAgence` et le transmet ; la grille
`sm:grid-cols-[2fr_1fr]` (L75) et le `FormSelect` de la devise (L88-93) disparaissent.
`property.wizard.fields.currency` n'a plus de lecteur dans le parcours (E-24) ; `PropertyForm` le
lit encore jusqu'à la tâche 23.

**Step 6 : l'assistant** — `src/components/property-form/PropertyWizard.tsx`, co-tenu (C, D) : Edit
seulement, relire avant chaque bloc si C est passé.

Edit 1 (L206-210) :

```
old:  tags = [],
  proposition = false,
  quotaNote,
}: {
  readonly tags?: Tag[];
new:  tags = [],
  proposition = false,
  quotaNote,
  fraisDAgence = true,
}: {
  readonly tags?: Tag[];
  /**
   * TCK-633 — faux quand l'agence de l'auteur est un indépendant (`kind: 'individual'`) : il ne
   * facture pas de frais d'agence, et l'API les refuse pour lui. La page le lit (`new/page.tsx`).
   */
  readonly fraisDAgence?: boolean;
```

Edit 2 (L302-303) :

```
old:      if (valeurs.tag_ids?.length && !tagsEnvoyes) {
        const r = await setPropertyTagsAction(bien.id, valeurs.tag_ids);
new:      // TCK-633 — un équipement PROPOSÉ (nom hors catalogue) part par le même appel que les autres.
      if ((valeurs.tag_ids?.length || valeurs.tag_names?.length) && !tagsEnvoyes) {
        const r = await setPropertyTagsAction(bien.id, valeurs.tag_ids ?? [], valeurs.tag_names ?? []);
```

Edit 3 (L409) :

```
old:    if (donnees) reset({ ...valeursInitiales(), ...sansNulls(donnees) } as PropertyFormValues);
new:    // TCK-633 — `currency` est ré-imposée : un brouillon d'avant ADR-0061 peut porter l'euro, et
    // le prix se lirait avec des décimales que la publication en francs CFA n'admet pas.
    if (donnees) reset({ ...valeursInitiales(), ...sansNulls(donnees), currency: 'XOF' } as PropertyFormValues);
```

Edit 4 (L413, docblock) :

```
old:   * Le CERTAIN de la géo-IP, posé d'office et UNE SEULE FOIS : le pays et la devise. La ville et
new:   * Le CERTAIN de la géo-IP, posé d'office et UNE SEULE FOIS : le pays. La ville et
```

Edit 5 (L420-422, docblock) :

```
old:   * le premier rendu : sans lui, une devise arrivée en retard écraserait celle que l'utilisateur
   * vient de choisir à l'étape du prix. Et sur un brouillon repris, on ne pose plus rien du tout —
   * ses valeurs sont celles d'une session où l'utilisateur avait déjà la main.
new:   * le premier rendu : sans lui, un pays arrivé en retard écraserait celui que l'utilisateur
   * vient de corriger. Et sur un brouillon repris, on ne pose plus rien du tout — ses valeurs sont
   * celles d'une session où l'utilisateur avait déjà la main.
   *
   * TCK-633 — la devise n'est plus devinée : le prix se publie en francs CFA (ADR-0061), quel que
   * soit le pays de connexion. Un visiteur connecté depuis Paris publie un bien à Dakar.
```

Edit 6 (L429-431) :

```
old:    if (defaults.country) setValue('country', defaults.country, { shouldDirty: true });
    if (defaults.currency) setValue('currency', defaults.currency, { shouldDirty: true });
  }, [defaults.country, defaults.currency, geoEnCours, etatBrouillon, setValue]);
new:    if (defaults.country) setValue('country', defaults.country, { shouldDirty: true });
  }, [defaults.country, geoEnCours, etatBrouillon, setValue]);
```

Edit 7 (L527) :

```
old:      body: <StepPrix form={form} />,
new:      body: <StepPrix form={form} fraisDAgence={fraisDAgence} />,
```

`useGeoSuggestion` produit toujours `defaults.currency` (lu : `hooks/useGeoSuggestion.ts` L49-50) ;
après cet Edit, plus aucun fichier ne le lit (lu : ses seuls importeurs sont `PropertyWizard`,
`StepLieu`, `GeoSuggestionChip`, qui ne lisent que `suggestion` et `defaults.country`). Le hook est
hors territoire : laissé tel quel, noté en E-24.

**Step 7 : la page** — `src/app/(dashboard)/app/properties/new/page.tsx`, ⚠ HORS TERRITOIRE.

Edit 1 (L13-14) :

```
old:import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent } from '@/lib/roles';
new:import { getMeAction } from '@/app/actions/auth';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { isAdmin, isAgent } from '@/lib/roles';
import { getToken } from '@/lib/session';
```

Edit 2 (L78-79) :

```
old:  const { roles } = await getMeAction();
  const proposition = !isAgent(roles) && !isAdmin(roles);
new:  const { roles, agency_id: agencyId } = await getMeAction();
  const proposition = !isAgent(roles) && !isAdmin(roles);
```

Edit 3 (L83) :

```
old:  const titre = proposition ? t('proposalTitle') : t('title');
new:  const titre = proposition ? t('proposalTitle') : t('title');

  // TCK-633 — un indépendant (agence `individual`) ne facture pas de frais d'agence. Lecture
  // d'AFFICHAGE (cf. `overview/page.tsx`) : une agence illisible garde le champ, et l'API reste
  // juge (`StorePropertyRequest`, tâche 8) — ne pas savoir dégrade, n'interrompt pas.
  const token = agencyId ? await getToken() : undefined;
  const agence = token && agencyId
    ? await resolveAgencyOrNull(token, agencyId, 'nouveau bien (frais d’agence)', 'affichage')
    : null;
  const fraisDAgence = agence?.kind !== 'individual';
```

Edit 4 (L120) :

```
old:        proposition={proposition}
        quotaNote={
new:        proposition={proposition}
        fraisDAgence={fraisDAgence}
        quotaNote={
```

Signatures lues : `getToken(): Promise<string | undefined>` (`lib/session.ts` L12) ;
`resolveAgencyOrNull(token, agencyId, ou, usage = 'affichage')` (`lib/access/server-guards.ts`
L124-135) ; `User.agency_id?: number | null` (`types/user.ts` L100) ; `Agency.kind?: AgencyKind`,
`AgencyKind = 'standard' | 'individual'` (`types/agency.ts` L13, L76). `agenceDuRendu` est sous
`cache()` (L101-104) : la barre latérale qui lit la même agence ne coûte pas une requête de plus.

**Step 8 : l'action et la requête** — ⚠ HORS TERRITOIRE.

`src/app/actions/dashboard-properties.ts`, Edit (L263-273) :

```
old:/**
 * TCK-120 — sync the amenity tags of a property (full replace).
 */
export async function setPropertyTagsAction(
  propertyId: number,
  tagIds: number[],
): Promise<ActionResult> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    await setPropertyTags(auth.token, propertyId, tagIds);
new:/**
 * TCK-120 — sync the amenity tags of a property (full replace).
 *
 * TCK-633 — `tagNames` : les équipements saisis hors du catalogue, que l'API crée en PROPOSITION
 * (`pending`) et attache au bien (`SyncPropertyTagRequest`, tâche 11).
 */
export async function setPropertyTagsAction(
  propertyId: number,
  tagIds: number[],
  tagNames: string[] = [],
): Promise<ActionResult> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    await setPropertyTags(auth.token, propertyId, tagIds, tagNames);
```

`src/lib/queries/properties-server.ts`, Edit (L385-395) :

```
old:export async function setPropertyTags(
  token: string,
  propertyId: number,
  tagIds: number[],
): Promise<void> {
  await apiRequest<unknown>(cheminApi`/api/properties/${propertyId}/tags`, {
    method: 'POST',
    body: { tag_ids: tagIds },
new:export async function setPropertyTags(
  token: string,
  propertyId: number,
  tagIds: number[],
  /** TCK-633 — les noms proposés hors catalogue ; omis du corps quand il n'y en a pas. */
  tagNames: string[] = [],
): Promise<void> {
  await apiRequest<unknown>(cheminApi`/api/properties/${propertyId}/tags`, {
    method: 'POST',
    body: tagNames.length > 0 ? { tag_ids: tagIds, tag_names: tagNames } : { tag_ids: tagIds },
```

Le troisième paramètre a une valeur par défaut : `PropertyForm.tsx` L263 (`setPropertyTagsAction(pid,
values.tag_ids ?? [])`) compile et se comporte comme avant jusqu'à la tâche 23.

**Step 9 : vert, types, lint**

```bash
npx vitest run src/components/property-form/__tests__/PropertyWizard.test.tsx src/components/property-form/__tests__/wizard-steps.test.tsx src/components/property-form/__tests__/StepPrix.test.tsx < /dev/null
npx vitest run "src/app/(dashboard)/app/properties/new/__tests__" src/lib/queries/__tests__/property-tags.tck-633.test.ts < /dev/null
npx vitest run src/components/property-form < /dev/null
npx tsc --noEmit
npx eslint src/components/property-form "src/app/(dashboard)/app/properties/new" src/app/actions/dashboard-properties.ts src/lib/queries/properties-server.ts
```

Attendu (mesuré dans le harnais) : `63 passed (63)` ; `9 passed (9)` ; `property-form` vert ;
`tsc` muet ; ESLint 0 erreur.

**Step 10 : ablations**

```bash
P=src/components/property-form
PG="src/app/(dashboard)/app/properties/new/page.tsx"
Q=src/lib/queries/properties-server.ts
B="$S/abl/t21/nouveau" && mkdir -p "$B"
cp $P/wizard/steps/StepPrix.tsx $P/PropertyWizard.tsx "$PG" $Q "$B/"
T="$P/__tests__/PropertyWizard.test.tsx $P/__tests__/StepPrix.test.tsx"
# a) l'assistant ne transmet plus `fraisDAgence`
sed -i '' 's/<StepPrix form={form} fraisDAgence={fraisDAgence} \/>/<StepPrix form={form} \/>/' $P/PropertyWizard.tsx
npx vitest run $P/__tests__/PropertyWizard.test.tsx $P/__tests__/StepPrix.test.tsx < /dev/null
cp "$B/PropertyWizard.tsx" $P/
# b) des frais déjà saisis restent chez un indépendant
sed -i '' "/    setValue('agency_fee_months', undefined, { shouldDirty: true });/d" $P/wizard/steps/StepPrix.tsx
npx vitest run $P/__tests__/PropertyWizard.test.tsx $P/__tests__/StepPrix.test.tsx < /dev/null
cp "$B/StepPrix.tsx" $P/wizard/steps/
# c) un brouillon en euros garde l'euro
sed -i '' "s/...sansNulls(donnees), currency: 'XOF' }/...sansNulls(donnees) }/" $P/PropertyWizard.tsx
npx vitest run $P/__tests__/PropertyWizard.test.tsx $P/__tests__/StepPrix.test.tsx < /dev/null
cp "$B/PropertyWizard.tsx" $P/
# d) les équipements proposés ne partent pas
sed -i '' 's/, valeurs.tag_names ?? \[\]);/);/' $P/PropertyWizard.tsx
npx vitest run $P/__tests__/PropertyWizard.test.tsx $P/__tests__/StepPrix.test.tsx < /dev/null
cp "$B/PropertyWizard.tsx" $P/
# e) la page ne transmet plus le type d'agence
sed -i '' '/        fraisDAgence={fraisDAgence}/d' "$PG"
npx vitest run "src/app/(dashboard)/app/properties/new/__tests__" < /dev/null
cp "$B/page.tsx" "$PG"
# f) la requête n'envoie plus `tag_names`
sed -i '' 's/    body: tagNames.length > 0 ? { tag_ids: tagIds, tag_names: tagNames } : { tag_ids: tagIds },/    body: { tag_ids: tagIds },/' $Q
npx vitest run src/lib/queries/__tests__/property-tags.tck-633.test.ts < /dev/null
cp "$B/properties-server.ts" $Q
md5 -q $P/wizard/steps/StepPrix.tsx "$B/StepPrix.tsx" $P/PropertyWizard.tsx "$B/PropertyWizard.tsx" "$PG" "$B/page.tsx" $Q "$B/properties-server.ts"
```

Attendu (mesuré dans le harnais) : a) 1 échec — « un indépendant ne voit pas les frais d'agence,
et un brouillon qui en portait ne les envoie pas » ; b) 2 échecs — le même, et « des frais déjà
saisis sont RETIRÉS » (`StepPrix`) ; c) 1 échec — « un brouillon en euros repart en francs CFA » ;
d) 1 échec — « un équipement PROPOSÉ part avec les autres » ; e) 4 échecs (`data-frais` vaut
`undefined`) ; f) 1 échec — « envoie les noms proposés » ; les quatre paires de `md5` identiques.

**Step 11 : signaler**

Signaler : `StepPrix.tsx`, `StepPrix.test.tsx`, `PropertyWizard.tsx` et `PropertyWizard.test.tsx`
(co-tenus), `page.tsx`, `page.frais-d-agence.test.tsx`, `dashboard-properties.ts`,
`properties-server.ts`, `property-tags.tck-633.test.ts`, `wizard-steps.test.tsx` (⚠ hors
territoire pour les cinq derniers fichiers existants),
`feat(web): prix en francs CFA, frais d'agence selon l'agence, équipements proposés (TCK-633)`.

---

## Tâche 22 — Le total à l'entrée dans l'aperçu (10 min)

Le porteur veut voir le total que le locataire versera. `coutDEntreeTotal` (tâche 17) le calcule,
jugé par la même fixture que `CoutDEntree` côté API : un écart d'un franc rougit une des deux
suites. Le docblock de `ApercuAnnonce` (L28-31) et un test (L75-85) interdisaient explicitement ce
total (TCK-598 : « aucun écran ne refait l'addition ») — la règle est levée pour l'aperçu SEUL, et
la note le dit (« l'annonce publiée fait foi », tâche 14). Écart E-6.

`contract_type` et `rent_period` sont déjà lus par le `useWatch` (L56-66) : aucune lecture de plus.

**Fichiers**
- Modifier : `takussan-web/src/components/property-form/wizard/ApercuAnnonce.tsx` (L9-10, L28-31, L39-48, L103-111, L113-122, L203-204)
- Modifier : `takussan-web/src/components/property-form/__tests__/ApercuAnnonce.test.tsx` (L19, L75-85, après la tâche 14) — ⚠ HORS TERRITOIRE (E-29)

**Step 1 : le test**

```bash
mkdir -p "$S/abl/t22" && cp src/components/property-form/wizard/ApercuAnnonce.tsx "$S/abl/t22/"
```

`src/components/property-form/__tests__/ApercuAnnonce.test.tsx`, Edit 1 (L19, tableau du docblock) :

```
old: * | coût d'entrée SANS total | un second calcul de la formule de `CoutDEntree` (TCK-598), qui finirait par contredire la fiche |
new: * | coût d'entrée ET son total | TCK-633 — le total que le porteur attend, calculé par `coutDEntreeTotal`, jumelle de `CoutDEntree` jugée par la même fixture (tâche 17) |
 * | total avec charges et demi-mois | une formule qui oublie les charges de l'avance, ou qui tronque le demi-mois de frais |
```

Edit 2 (L75-85, dans l'état laissé par la tâche 14) :

```
old:  it('liste les composantes du coût d’entrée, SANS en refaire le total (TCK-598)', () => {
    const c = carte({
      type: 'apartment', contract_type: 'rent', rent_period: 'monthly', price: 450_000,
      advance_months: 2, deposit_months: 1, agency_fee_months: 1,
    });
    expect(c.getByText('2 mois d’avance, 1 mois de caution, 1 mois de frais d’agence')).toBeInTheDocument();
    // 4 × 450 000 = 1 800 000 : le montant que la formule de l'API rendrait. Il ne doit PAS
    // apparaître — seule l'API l'additionne, avec son arrondi.
    expect(c.queryByText(/1\s800\s000/)).not.toBeInTheDocument();
    expect(c.getByText(/montant indicatif, calculé d’après vos réponses/i)).toBeInTheDocument();
  });
new:  it('liste les composantes du coût d’entrée, ET son total indicatif (TCK-633)', () => {
    const c = carte({
      type: 'apartment', contract_type: 'rent', rent_period: 'monthly', price: 450_000,
      advance_months: 2, deposit_months: 1, agency_fee_months: 1,
    });
    expect(c.getByText('2 mois d’avance, 1 mois de caution, 1 mois de frais d’agence')).toBeInTheDocument();
    // 4 × 450 000 = 1 800 000 : le montant que `CoutDEntree` (API) rend pour la même entrée.
    expect(c.getByTestId('apercu-total-entree')).toHaveTextContent(/^Total à l’entrée : 1\s800\s000\sF CFA$/);
    expect(c.getByText(/montant indicatif, calculé d’après vos réponses/i)).toBeInTheDocument();
  });

  it('le total compte les charges de l’avance et le demi-mois de frais (TCK-633)', () => {
    const c = carte({
      type: 'apartment', contract_type: 'rent', rent_period: 'monthly', price: 450_000,
      advance_months: 1, deposit_months: 1, agency_fee_months: 1.5, monthly_charges: 10_000,
    });
    // (450 000 + 10 000) × 1 + 450 000 × 1 + 450 000 × 1,5 = 1 585 000
    expect(c.getByTestId('apercu-total-entree')).toHaveTextContent(/1\s585\s000\sF CFA/);
  });
```

**Step 2 : rouge**

```bash
npx vitest run src/components/property-form/__tests__/ApercuAnnonce.test.tsx < /dev/null
```

Attendu : `2 failed | 8 passed (10)` (`Unable to find an element by: [data-testid="apercu-total-entree"]`).
Mesuré dans le harnais : `2 failed | 8 passed (10)`.

**Step 3 : l'aperçu** — `src/components/property-form/wizard/ApercuAnnonce.tsx`.

Edit 1 (L9) :

```
old:import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
new:import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { coutDEntreeTotal } from '@/lib/cout-d-entree';
```

Edit 2 (L28-31) :

```
old: * ⚠ **Le coût d'entrée n'est PAS additionné ici.** La formule et son arrondi n'existent qu'à un
 * endroit, côté API (`CoutDEntree`, TCK-598 : « aucun écran ne refait l'addition ») ; l'aperçu en
 * liste les composantes et renvoie le total à l'annonce publiée. Un second calcul finirait par
 * afficher un montant que la fiche contredit.
new: * Le coût d'entrée : ses composantes, et son TOTAL indicatif (TCK-633, retour du porteur). Le
 * total vient de `coutDEntreeTotal` (`lib/cout-d-entree.ts`), jumelle de `CoutDEntree` côté API :
 * les deux sont jugées par la même fixture (tâche 17), de sorte qu'un écart d'un franc rougit une
 * suite. La règle de TCK-598 (« aucun écran ne refait l'addition ») est levée pour l'aperçu SEUL,
 * qui l'affiche avant que le bien existe ; la fiche publiée lit toujours le total de l'API, et la
 * note le dit (« l'annonce publiée fait foi »).
```

Edit 3 (L47-48) :

```
old:  readonly coutDEntree: readonly string[];
}
new:  readonly coutDEntree: readonly string[];
  /** TCK-633 — le total à l'entrée, mis en forme ; `null` sans composante ou à zéro. */
  readonly totalDEntree: string | null;
}
```

Edit 4 (L103-104) :

```
old:  const coutDEntree: string[] = [];
  if (isFieldRelevant('deposit_months', ctx)) {
new:  const coutDEntree: string[] = [];
  let totalDEntree: string | null = null;
  if (isFieldRelevant('deposit_months', ctx)) {
```

Edit 5 (L109-111) :

```
old:      coutDEntree.push(t('preview.entryCharges', { amount: fmt.montant(nombre(charges)!, devise) }));
    }
  }
new:      coutDEntree.push(t('preview.entryCharges', { amount: fmt.montant(nombre(charges)!, devise) }));
    }
    // `nombre()` : `useWatch` rend ces champs en `unknown` (schéma à coercition) ; zéro et vide
    // valent « absent », ce que `coutDEntreeTotal` lit de même.
    const total = coutDEntreeTotal({
      price: nombre(prix), currency: devise, contract_type: contrat, rent_period: periode,
      advance_months: nombre(avance), deposit_months: nombre(caution),
      agency_fee_months: nombre(frais), monthly_charges: nombre(charges),
    });
    if (total !== null && total > 0) totalDEntree = fmt.montant(total, devise);
  }
```

Sans `nombre()`, `tsc` refuse : `error TS2322: Type 'unknown' is not assignable to type 'string |
number | null | undefined'` (mesuré).

Edit 6 (L121-122) :

```
old:    coutDEntree,
  };
}
new:    coutDEntree,
    totalDEntree,
  };
}
```

Edit 7 (L203-204) :

```
old:          <p className="text-muted-foreground">{d.coutDEntree.join(', ')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('entryNote')}</p>
new:          <p className="text-muted-foreground">{d.coutDEntree.join(', ')}</p>
          {d.totalDEntree ? (
            <p className="mt-1 font-medium text-foreground tabular-nums" data-testid="apercu-total-entree">
              {t('entryTotal', { amount: d.totalDEntree })}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">{t('entryNote')}</p>
```

`property.wizard.preview.entryTotal` (« Total à l'entrée : {amount} ») est posée en tâche 14.

**Step 4 : vert, types**

```bash
npx vitest run src/components/property-form/__tests__/ApercuAnnonce.test.tsx < /dev/null
npx tsc --noEmit
```

Attendu : `10 passed (10)` ; `tsc` muet. Mesuré dans le harnais.

**Step 5 : ablations**

```bash
A=src/components/property-form/wizard/ApercuAnnonce.tsx; T=src/components/property-form/__tests__/ApercuAnnonce.test.tsx
cp $A "$S/abl/t22/ApercuAnnonce.nouveau.tsx"
# a) le total n'est plus affiché
sed -i '' 's/    if (total !== null \&\& total > 0) totalDEntree = fmt.montant(total, devise);//' $A
npx vitest run $T < /dev/null
cp "$S/abl/t22/ApercuAnnonce.nouveau.tsx" $A
# b) les charges sont oubliées
sed -i '' 's/agency_fee_months: nombre(frais), monthly_charges: nombre(charges),/agency_fee_months: nombre(frais), monthly_charges: undefined,/' $A
npx vitest run $T < /dev/null
cp "$S/abl/t22/ApercuAnnonce.nouveau.tsx" $A
# c) le demi-mois de frais est tronqué
sed -i '' 's/agency_fee_months: nombre(frais), monthly_charges/agency_fee_months: Math.trunc(nombre(frais) ?? 0), monthly_charges/' $A
npx vitest run $T < /dev/null
cp "$S/abl/t22/ApercuAnnonce.nouveau.tsx" $A
md5 -q $A "$S/abl/t22/ApercuAnnonce.nouveau.tsx"
```

Attendu (mesuré dans le harnais) : a) 2 échecs ; b) 1 échec — « le total compte les charges » ;
c) 1 échec — le même ; `md5` identiques.

**Step 6 : signaler**

Signaler : `ApercuAnnonce.tsx`, `ApercuAnnonce.test.tsx` (⚠ hors territoire),
`feat(web): total à l'entrée dans l'aperçu de l'annonce (TCK-633)`.

---

## Tâche 23 — L'édition du bien reçoit les mêmes champs (25 min) — ⚠ HORS TERRITOIRE

`PropertyForm.tsx` est l'écran d'édition ; le ticket vaut « à la création ET à l'édition » (AC9,
AC10), et le plan maître ne l'attribue à aucun lot (E-11). **Avant d'exécuter : demander à la
session l'extension du territoire** à `PropertyForm.tsx`, `types/property.ts`,
`PropertyForm.test.tsx`, `cibles-tactiles.test.tsx` (contrainte 4).

Ce qui change, et ce qui ne change pas :

- Région / ville / quartier → `ChampsLieu` ; le bloc GPS → `ChampsPosition` (tâche 19). Les
  identifiants lus sur le bien (`location.geo_city_id`, `geo_neighborhood_id` : tâche 13) entrent
  dans les valeurs par défaut et repartent avec l'adresse ; la région se rapproche de son nom.
  `CHAMPS_ADRESSE_EFFACABLES` (L133-142) **ne change pas** : un quartier vidé part déjà en
  `neighborhood: null`, et le serveur détache alors l'identifiant de lui-même (tâche 3, règle 2 de
  `GeoAddressCanonicalizer` : texte modifié sans nouvel identifiant → l'ancien tombe).
- La devise sort (L403-408, L53, L184, L191) ; `currency` reste dans les valeurs par défaut (L78-79)
  pour les décimales du prix. Le serveur ramène toute devise envoyée à XOF (tâche 8).
- `EntryCostFields` reçoit `fraisDAgence={property.agency?.kind !== 'individual'}` (`agency.kind` :
  tâche 13 ; `buildAgency()` est émis sur la forme détail, lu `PropertyResource.php` L234-236).
- Les six nombres → `NombreEnListe` (tâche 20). Un bien existant hors de la liste garde sa valeur :
  c'est le cas que `NombreEnListe` ajoute à la liste.
- Les pastilles d'équipements (L629-666) → `ChampEquipements`, rendu même sans catalogue.
  `attaches` reprend les équipements DU BIEN (avec leur `status`, tâche 13) : un équipement proposé
  par un autre utilisateur, que le catalogue ne sert pas, garde son nom à l'écran au lieu de
  disparaître — et d'être détaché au prochain enregistrement.
- `setPropertyTagsAction(pid, tag_ids, tag_names)` (tâche 21).
- Les puces d'équipements sont à 44 px (`min-h-11`, tâche 15) : c'est ce que la garde
  `cibles-tactiles` mesure sur l'édition depuis TCK-468.

Deux gestionnaires (`handleLocationChange`, `toggleTag`, L298-317) et trois lectures `useWatch`
(`latitude`, `longitude`, `tag_ids`) n'ont plus de lecteur et partent ; `setValue` aussi (L278).

**Fichiers**
- Modifier : `takussan-web/src/components/property-form/PropertyForm.tsx` (698 lignes lues ; blocs ci-dessous)
- Modifier : `takussan-web/src/types/property.ts` (L1, L117-133, L247-258)
- Modifier : `takussan-web/src/components/property-form/__tests__/PropertyForm.test.tsx` (L32-33, L111-124, L160-176, L361-399)
- Modifier : `takussan-web/src/components/property-form/__tests__/cibles-tactiles.test.tsx` (L238-245, après la tâche 19)

**Step 1 : sauvegardes**

```bash
cd "$WEB"
mkdir -p "$S/abl/t23"
cp src/components/property-form/PropertyForm.tsx src/types/property.ts "$S/abl/t23/"
```

**Step 2 : les tests** — `src/components/property-form/__tests__/PropertyForm.test.tsx` :

Edit 1 (L32-33) :

```
old:
// LocationPickerMapLoader is a dynamic import that touches Leaflet/window — stub it
new:
// TCK-633 — le référentiel géographique, hors de ce que ce fichier éprouve (cf. `ChampsLieu.test.tsx`).
vi.mock('@/components/property-form/useReferentielGeo', () => import('@/test/doublure-referentiel-geo'));
// LocationPickerMapLoader is a dynamic import that touches Leaflet/window — stub it
```

Edit 2 (L111-111) :

```
old:  it('shows tags section when tags are provided', () => {
new:  it('shows tags section when tags are provided — the catalogue is searched (TCK-633)', async () => {
    const user = userEvent.setup();
```

Edit 3 (L118-124) :

```
old:    expect(screen.getByText('Piscine')).toBeDefined();
    expect(screen.getByText('Parking')).toBeDefined();
  });

  it('does not show tags section when no tags provided', () => {
    renderForm(maison(), []);
    expect(screen.queryByText('Équipements')).toBeNull();
new:    await user.type(screen.getByLabelText(/équipements/i), 'p');
    expect(await screen.findByRole('option', { name: 'Piscine' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Parking' })).toBeDefined();
  });

  it('TCK-633 — le champ des équipements est rendu même sans catalogue : on peut toujours en proposer', () => {
    renderForm(maison(), []);
    expect(screen.getByText('Équipements')).toBeDefined();
    expect(screen.getByLabelText(/équipements/i)).toBeDefined();
```

Edit 4 (L160-176) :

```
old:  it('TCK-564 — le prix suit la devise CHOISIE : en euros, « 1500,5 » repart 1500,5, pas 15 005', async () => {
    // Revue adverse : `currency={devise}` n'était gardé par aucun test de l'édition.
    const user = userEvent.setup();
    renderForm(maison());

    await user.click(screen.getByRole('combobox', { name: /devise/i }));
    await user.click(await screen.findByRole('option', { name: /euro/i }));

    const prix = screen.getByLabelText(/^prix/i) as HTMLInputElement;
    await user.clear(prix);
    await user.type(prix, '1500,5');
    expect(prix.value).toBe('1\u202f500,5');

    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));
    await waitFor(() => expect(updatePropertyAction).toHaveBeenCalledOnce());
    const [, payload] = vi.mocked(updatePropertyAction).mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).toMatchObject({ price: 1500.5, currency: 'EUR' });
new:  it('TCK-633 — la devise ne se choisit plus à l’édition : le prix se saisit en francs CFA', () => {
    // ADR-0061 ; le serveur ramène toute devise envoyée à XOF (tâche 8).
    renderForm(maison());

    expect(screen.queryByRole('combobox', { name: /devise/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^prix/i)).toHaveAttribute('inputmode', 'numeric');
  });

  it('TCK-633 — l’identifiant du référentiel lu sur le bien repart avec l’adresse', async () => {
    const user = userEvent.setup();
    renderForm(maison({ location: { city: 'Dakar', quarter: 'Mermoz', geo_city_id: 10, geo_neighborhood_id: 101 } }));

    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => expect(updatePropertyAction).toHaveBeenCalledOnce());
    const [, payload] = vi.mocked(updatePropertyAction).mock.calls[0] as [number, { address?: Record<string, unknown> }];
    expect(payload.address).toMatchObject({ city: 'Dakar', neighborhood: 'Mermoz', geo_city_id: 10, geo_neighborhood_id: 101 });
  });

  it('TCK-633 — latitude et longitude se lisent et se corrigent à l’édition', () => {
    renderForm(maison({ location: { city: 'Dakar', latitude: 14.6937, longitude: -17.4441 } }));

    expect(screen.getByLabelText(/^latitude$/i)).toHaveValue(14.6937);
    expect(screen.getByLabelText(/^longitude$/i)).toHaveValue(-17.4441);
    expect(screen.getByLabelText(/coller un lien ou une position/i)).toBeInTheDocument();
  });

  it('TCK-633 — un bien d’indépendant n’a pas de frais d’agence', () => {
    renderForm(maison({
      type: 'apartment', contract_type: 'rent', rent_period: 'monthly',
      agency: { id: 3, name: 'Moussa Diop', slug: 'moussa-diop', kind: 'individual' },
    }));

    expect(screen.getByLabelText(/caution/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/frais d.agence/i)).not.toBeInTheDocument();
  });

  it('TCK-633 — une agence standard garde les frais d’agence', () => {
    renderForm(maison({
      type: 'apartment', contract_type: 'rent', rent_period: 'monthly',
      agency: { id: 4, name: 'Teranga Immo', slug: 'teranga-immo', kind: 'standard' },
    }));

    expect(screen.getByLabelText(/frais d.agence/i)).toBeInTheDocument();
```

Edit 5 (L361-370) :

```
old:  it('AC4 — décocher le dernier équipement envoie bien la liste VIDE', async () => {
    const user = userEvent.setup();
    renderForm(maison({ tags: [{ id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' }] }), AMENITES);

    await user.click(screen.getByRole('button', { name: /piscine/i }));
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => {
      expect(setPropertyTagsAction).toHaveBeenCalledWith(7, []);
    });
new:  it('AC4 — retirer le dernier équipement envoie bien la liste VIDE', async () => {
    const user = userEvent.setup();
    renderForm(maison({ tags: [{ id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' }] }), AMENITES);

    // TCK-633 — l'équipement retenu est une puce, qui se retire.
    await user.click(screen.getByRole('button', { name: 'Retirer Piscine' }));
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => {
      expect(setPropertyTagsAction).toHaveBeenCalledWith(7, [], []);
    });
  });

  it('TCK-633 — un équipement PROPOSÉ à l’édition part en nom, à côté des autres', async () => {
    const user = userEvent.setup();
    renderForm(maison({ tags: [{ id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' }] }), AMENITES);

    await user.type(screen.getByLabelText(/équipements/i), 'Forage{Enter}');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => {
      expect(setPropertyTagsAction).toHaveBeenCalledWith(7, [1], ['Forage']);
    });
  });

  it('TCK-633 — un équipement du bien absent du catalogue garde son nom, et son attente (proposé par un autre)', () => {
    renderForm(
      maison({ tags: [{ id: 50, name: 'Forage', slug: 'forage', type: 'amenity', status: 'pending' }] }),
      AMENITES,
    );

    expect(screen.getByRole('button', { name: 'Retirer Forage' }).parentElement)
      .toHaveTextContent(/forage.*en attente de vérification/i);
```

Edit 6 (L388-388) :

```
old:      expect(setPropertyTagsAction).toHaveBeenCalledWith(7, [1]);
new:      expect(setPropertyTagsAction).toHaveBeenCalledWith(7, [1], []);
```

Edit 7 (L395-399) :

```
old:    renderForm(maison(), AMENITES);

    await user.click(screen.getByRole('button', { name: /piscine/i }));
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));
new:    renderForm(maison(), AMENITES);

    // TCK-633 — l'équipement se cherche, se choisit ; Échap referme la liste.
    await user.type(screen.getByLabelText(/équipements/i), 'pisc');
    await user.click(await screen.findByRole('option', { name: 'Piscine' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));
```

`AC5` (« un tag qui n'est pas un équipement ne part jamais ») garde son objet : le bien porte un
tag `feature` (id 99) que `toDefaults` filtre ; seul le troisième argument change.

`src/components/property-form/__tests__/cibles-tactiles.test.tsx` — la garde des pastilles mesure
désormais la puce d'un équipement RETENU (il en faut une pour qu'il y ait une pastille) :

Edit 1 (L238-245) :

```
old:    const { container } = render(
      withIntl(
        <PropertyForm
          mode="edit"
          property={maison()}
          tags={[{ id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' } as never]}
        />,
      ),
new:    // TCK-633 — l'équipement retenu est une PUCE de la liste à puces : il en faut un pour qu'il y
    // ait une pastille à mesurer, et sa croix « Retirer » est la cible.
    const piscine = { id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' } as never;
    const { container } = render(
      withIntl(<PropertyForm mode="edit" property={maison({ tags: [piscine] })} tags={[piscine]} />),
```

**Step 3 : rouge**

```bash
npx vitest run src/components/property-form/__tests__/PropertyForm.test.tsx src/components/property-form/__tests__/cibles-tactiles.test.tsx < /dev/null
```

Attendu (mesuré dans le harnais) : `11 failed | 35 passed (46)` — huit tests TCK-633 de
`PropertyForm.test.tsx` (catalogue cherché, champ sans catalogue, devise, identifiants, latitude /
longitude, indépendant, équipement proposé, équipement d'un autre ; « une agence standard garde
les frais » est vert des deux côtés), plus `AC4`, `AC5`, `AC6` (troisième argument, puce). La garde des pastilles est
verte avant (les anciennes pastilles sont à 44 px) : c'est l'ablation e) qui la met à l'épreuve.

**Step 4 : les types** — `src/types/property.ts` :

Edit 1 (L1-1) :

```
old:export type PropertyType =
new:import type { AgencyKind } from './agency';
import type { TagStatus } from './tag';

export type PropertyType =
```

Edit 2 (L123-124) :

```
old:  rating: number | null;
}
new:  rating: number | null;
  /** TCK-633 — un indépendant (`individual`) ne facture pas de frais d'agence (`PropertyResource`, tâche 13). */
  kind?: AgencyKind;
}
```

Edit 3 (L132-133) :

```
old:  color: string | null;
}
new:  color: string | null;
  /** TCK-633 — une proposition d'équipement attachée au bien est `pending` (`PropertyResource`, tâche 13). */
  status?: TagStatus;
}
```

Edit 4 (L255-258) :

```
old:    latitude: number | null;
    longitude: number | null;
  };
  /**
new:    latitude: number | null;
    longitude: number | null;
    /** TCK-633 — les identifiants du référentiel (ADR-0062), `null` hors référentiel. */
    geo_city_id?: number | null;
    geo_neighborhood_id?: number | null;
  };
  /**
```

`types/agency.ts` et `types/tag.ts` n'importent rien (lu) : aucun cycle.

**Step 5 : l'écran** — `src/components/property-form/PropertyForm.tsx`, 23 blocs, dans l'ordre
(numéros des lignes lues, avant tout bloc) :

Edit 1 (L21-22) :

```
old:import { fieldDensityScope } from '@/components/ui/field-density';
import { LocationPickerMapLoader } from '@/components/map/LocationPickerMapLoader';
new:import { fieldDensityScope } from '@/components/ui/field-density';
```

Edit 2 (L52-54) :

```
old:  contractTypeOptions as fabriqueContractTypeOptions,
  currencyOptions as fabriqueCurrencyOptions,
  propertyTypeOptions
new:  contractTypeOptions as fabriqueContractTypeOptions,
  propertyTypeOptions
```

Edit 3 (L63-64) :

```
old:import { EntryCostFields } from './wizard/steps/StepPrix';
import { VirtualTourField } from './wizard/steps/StepFinition';
new:import { EntryCostFields } from './wizard/steps/StepPrix';
import { VirtualTourField } from './wizard/steps/StepFinition';
import { NombreEnListe } from './wizard/NombreEnListe';
import { ChampEquipements } from './ChampEquipements';
import { ChampsLieu } from './ChampsLieu';
import { ChampsPosition } from './ChampsPosition';
```

Edit 4 (L96-97) :

```
old:    latitude: property.location?.latitude ?? undefined,
    longitude: property.location?.longitude ?? undefined,
new:    latitude: property.location?.latitude ?? undefined,
    longitude: property.location?.longitude ?? undefined,
    // TCK-633 — les identifiants du référentiel lus sur le bien (`PropertyResource`, tâche 13). La
    // région n'en a pas côté bien : `ChampsLieu` la rapproche de son nom.
    geo_region_id: null,
    geo_city_id: property.location?.geo_city_id ?? null,
    geo_neighborhood_id: property.location?.geo_neighborhood_id ?? null,
```

Edit 5 (L112-113) :

```
old:      ? property.tags.filter((t) => t.type === 'amenity').map((t) => t.id)
      : [],
new:      ? property.tags.filter((t) => t.type === 'amenity').map((t) => t.id)
      : [],
    // TCK-633 — les équipements proposés pendant CETTE édition ; ceux du bien sont dans `tag_ids`.
    tag_names: [],
```

Edit 6 (L173) :

```
old:const SM_BREAKPOINT_PX = 640;
new:/**
 * TCK-633 — les équipements du bien, en `Tag` : ceux que le catalogue ne sert pas (une proposition
 * d'un autre utilisateur, en attente) gardent ainsi leur NOM dans la liste à puces au lieu de
 * disparaître de l'écran — et d'être détachés au prochain enregistrement.
 */
function equipementsDuBien(property: PropertyDetail): Tag[] {
  return (Array.isArray(property.tags) ? property.tags : [])
    .filter((t) => t.type === 'amenity')
    .map((t) => ({
      id: t.id, name: t.name, slug: t.slug, type: 'amenity', icon: t.icon ?? null, color: t.color ?? null,
      description: null, status: t.status,
    }));
}

const SM_BREAKPOINT_PX = 640;
```

Edit 7 (L184) :

```
old:  const tContractType = useTranslations(PROPERTY_ENUM_NAMESPACES.contractType);
  const tCurrency = useTranslations(PROPERTY_ENUM_NAMESPACES.currency);
new:  const tContractType = useTranslations(PROPERTY_ENUM_NAMESPACES.contractType);
```

Edit 8 (L191) :

```
old:  const contractTypeOptions = fabriqueContractTypeOptions(tContractType);
  const currencyOptions = fabriqueCurrencyOptions(tCurrency);
new:  const contractTypeOptions = fabriqueContractTypeOptions(tContractType);
```

Edit 9 (L263) :

```
old:          const resultatTags = await setPropertyTagsAction(pid, values.tag_ids ?? []);
new:          const resultatTags = await setPropertyTagsAction(pid, values.tag_ids ?? [], values.tag_names ?? []);
```

Edit 10 (L278) :

```
old:  const { control, setValue, formState } = form;
new:  const { control, formState } = form;
```

Edit 11 (L286-296) :

```
old:  // 2026-09-23). La devise, elle, décide des décimales du prix.
  const [typeDuBien, contractType, descriptionSaisie, latSaisie, lngSaisie, tagIdsSaisis, devise, periode] =
    useWatch({
      control,
      name: ['type', 'contract_type', 'description', 'latitude', 'longitude', 'tag_ids', 'currency', 'rent_period'],
    });
  const lat = latSaisie as number | null | undefined;
  const lng = lngSaisie as number | null | undefined;
  const description = descriptionSaisie ?? '';
  const tagIds = (tagIdsSaisis ?? []) as number[];
  const ctx: RelevanceContext = { type: typeDuBien, contract: contractType, rentPeriod: periode };
new:  // 2026-09-23). La devise, elle, décide des décimales du prix. TCK-633 — la position et les
  // équipements sont lus par leurs propres champs (`ChampsPosition`, `ChampEquipements`).
  const [typeDuBien, contractType, descriptionSaisie, devise, periode] = useWatch({
    control,
    name: ['type', 'contract_type', 'description', 'currency', 'rent_period'],
  });
  const description = descriptionSaisie ?? '';
  const ctx: RelevanceContext = { type: typeDuBien, contract: contractType, rentPeriod: periode };
```

Edit 12 (L298-319 : les deux gestionnaires, devenus sans lecteur) :

```
old:  // Ces deux gestionnaires sont passés en props à des enfants, et ils ne sont PAS enveloppés dans
  // un `useCallback` : le React Compiler s'en charge (ADR-0015). Les `useCallback` qui s'y
  // trouvaient faisaient ABANDONNER la compilation de tout ce composant —
  // `react-hooks/preserve-manual-memoization` les signalait, et son correctif est de retirer la
  // mémoïsation manuelle, pas de l'ajuster.
  const handleLocationChange = (newLat: number, newLng: number) => {
    setValue('latitude', newLat, { shouldDirty: true });
    setValue('longitude', newLng, { shouldDirty: true });
  };

  const toggleTag = (tagId: number) => {
    const current = (form.getValues('tag_ids') ?? []) as number[];
    setValue(
      'tag_ids',
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId],
      { shouldDirty: true },
    );
  };

  return (
new:  return (
```

Edit 13 (L394-408) :

```
old:        <div className="grid gap-4 md:grid-cols-3">
          <FormAmountInput
            control={control}
            name="price"
            label={t('fields.price')}
            required
            currency={devise}
            example={150_000}
          />
          <FormSelect
            control={control}
            name="currency"
            label={t('fields.currency')}
            options={currencyOptions}
          />
          {contractType
new:        {/* TCK-633 — la devise ne se choisit plus : le prix se publie en francs CFA (ADR-0061). */}
        <div className="grid gap-4 md:grid-cols-2">
          <FormAmountInput
            control={control}
            name="price"
            label={t('fields.price')}
            required
            currency={devise}
            example={150_000}
          />
          {contractType
```

Edit 14 (L423) :

```
old:        {isFieldRelevant('deposit_months', ctx) ? <EntryCostFields form={form} devise={devise} /> : null}
new:        {isFieldRelevant('deposit_months', ctx) ? (
          <EntryCostFields form={form} devise={devise} fraisDAgence={property.agency?.kind !== 'individual'} />
        ) : null}
```

Edit 15 (L432-451) :

```
old:        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="city"
            label={t('fields.city')}
            required
            placeholder={t('fields.cityPlaceholder')}
          />
          <FormInput
            control={control}
            name="quarter"
            label={t('fields.quarter')}
            placeholder={t('fields.quarterPlaceholder')}
          />
          <FormInput
            control={control}
            name="region"
            label={t('fields.region')}
            placeholder={t('fields.regionPlaceholder')}
          />
        </div>
new:        {/* TCK-633 (AC9) — région, ville et quartier choisis dans le référentiel, comme au parcours. */}
        <div className="grid gap-4 md:grid-cols-3">
          <ChampsLieu form={form} />
        </div>
```

Edit 16 (L474-485) :

```
old:        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t('location.gps')}{' '}
            {lat != null && lng != null && (
              <span className="text-foreground">
                ({lat.toFixed(5)}, {lng.toFixed(5)})
              </span>
            )}
          </p>
          <LocationPickerMapLoader lat={lat} lng={lng} onChange={handleLocationChange} />
          <p className="text-xs text-muted-foreground">{t('location.mapHint')}</p>
        </div>
new:        {/* TCK-633 (AC9) — position collée, latitude et longitude visibles et modifiables. */}
        <ChampsPosition form={form} indiceCarte={t('location.mapHint')} />
```

Edit 17 (L516-523) :

```
old:            <FormInput
              control={control}
              name="bedrooms"
              label={t('fields.bedrooms')}
              type="number"
              inputMode="numeric"
              min={0}
            />
new:            <NombreEnListe form={form} name="bedrooms" label={t('fields.bedrooms')} />
```

Edit 18 (L526-533) :

```
old:            <FormInput
              control={control}
              name="bathrooms"
              label={t('fields.bathrooms')}
              type="number"
              inputMode="numeric"
              min={0}
            />
new:            <NombreEnListe form={form} name="bathrooms" label={t('fields.bathrooms')} />
```

Edit 19 (L537-545) :

```
old:            <FormInput
              control={control}
              name="floor_number"
              label={t('fields.floorNumber')}
              type="number"
              inputMode="numeric"
              min={-5}
              max={200}
            />
new:            <NombreEnListe form={form} name="floor_number" label={t('fields.floorNumber')} />
```

Edit 20 (L548-556) :

```
old:            <FormInput
              control={control}
              name="total_floors"
              label={t('fields.totalFloors')}
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
            />
new:            <NombreEnListe form={form} name="total_floors" label={t('fields.totalFloors')} />
```

Edit 21 (L559-568) :

```
old:            <FormInput
              control={control}
              name="year_built"
              label={t('fields.yearBuilt')}
              type="number"
              inputMode="numeric"
              min={1800}
              max={2100}
              placeholder="2010"
            />
new:            <NombreEnListe form={form} name="year_built" label={t('fields.yearBuilt')} />
```

Edit 22 (L571-579) :

```
old:            <FormInput
              control={control}
              name="parking_spaces"
              label={t('fields.parking')}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="2"
            />
new:            <NombreEnListe form={form} name="parking_spaces" label={t('fields.parking')} />
```

Edit 23 (L629-666 : la section des équipements) :

```
old:      {/* ── Section 6 : Équipements / Tags ──
        TCK-488 — les équipements seedés sont domestiques : les proposer sur un terrain, un garage
        ou un parking n'offre aucun choix pertinent. Le parcours de publication le gardait déjà
        (`StepCaracteristiques`), l'édition ne le gardait pas — alors que l'AC2 de TCK-464 exigeait
        la vérification « à la création ET à l'édition ». */}
      {isFieldRelevant('tag_ids', ctx) && tags.length > 0 && (
        <section className="rounded-xl bg-card p-6 space-y-4">
          <header>
            <h2 className="text-base font-semibold text-foreground">{t('amenities.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('amenities.hint')}</p>
          </header>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const checked = tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  aria-pressed={checked}
                  // TCK-468 — `min-h-11` = 44 px, comme les pastilles de `ChoiceChips` dans le
                  // parcours de publication. Sans ça, l'édition alignait ses CHAMPS sur 44 px et
                  // gardait ses pastilles à 28 : l'écart changeait de camp au lieu de disparaître.
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${
                    checked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-transparent text-foreground hover:bg-muted'
                  }`}
                >
                  {tag.icon && <span aria-hidden="true">{tag.icon}</span>}
                  {tag.name}
                </button>
              );
            })}
          </div>
        </section>
      )}
new:      {/* ── Section 6 : Équipements / Tags ──
        TCK-488 — les équipements seedés sont domestiques : les proposer sur un terrain, un garage
        ou un parking n'offre aucun choix pertinent. Le parcours de publication le gardait déjà
        (`StepCaracteristiques`), l'édition ne le gardait pas — alors que l'AC2 de TCK-464 exigeait
        la vérification « à la création ET à l'édition ».
        TCK-633 (AC10) — une liste à puces, rendue même sans catalogue : un équipement inconnu se
        propose (`tag_names`). Le libellé du champ est la consigne : le titre de section le nomme. */}
      {isFieldRelevant('tag_ids', ctx) ? (
        <section className="rounded-xl bg-card p-6 space-y-4">
          <header>
            <h2 className="text-base font-semibold text-foreground">{t('amenities.title')}</h2>
          </header>
          <ChampEquipements
            form={form}
            tags={tags}
            attaches={equipementsDuBien(property)}
            label={t('amenities.hint')}
          />
        </section>
      ) : null}
```

**Step 6 : vert, types, lint**

```bash
npx vitest run src/components/property-form/__tests__/PropertyForm.test.tsx src/components/property-form/__tests__/cibles-tactiles.test.tsx < /dev/null
npx vitest run src/components/property-form src/components/property-dashboard < /dev/null
npx tsc --noEmit
npx eslint src/components/property-form src/types/property.ts
```

Attendu : `46 passed (46)` ; le reste vert ; `tsc` muet ; ESLint 0 erreur (aucune importation
orpheline : `LocationPickerMapLoader`, `currencyOptions`, `setValue` sont retirés avec leurs
lecteurs). Mesuré dans le harnais : `46 passed`, puis `property-form` + `ui` : `243 passed`.

**Step 7 : ablations**

```bash
F=src/components/property-form/PropertyForm.tsx; C=src/components/ui/combobox.tsx
T="src/components/property-form/__tests__/PropertyForm.test.tsx src/components/property-form/__tests__/cibles-tactiles.test.tsx"
B="$S/abl/t23/nouveau" && mkdir -p "$B" && cp $F $C "$B/"
# a) l'identifiant de la ville n'est plus relu
sed -i '' 's/    geo_city_id: property.location?.geo_city_id ?? null,/    geo_city_id: null,/' $F
npx vitest run src/components/property-form/__tests__/PropertyForm.test.tsx src/components/property-form/__tests__/cibles-tactiles.test.tsx < /dev/null
cp "$B/PropertyForm.tsx" $F
# b) les équipements du bien hors catalogue disparaissent
sed -i '' '/            attaches={equipementsDuBien(property)}/d' $F
npx vitest run src/components/property-form/__tests__/PropertyForm.test.tsx src/components/property-form/__tests__/cibles-tactiles.test.tsx < /dev/null
cp "$B/PropertyForm.tsx" $F
# c) les équipements proposés ne partent pas
sed -i '' 's/setPropertyTagsAction(pid, values.tag_ids ?? \[\], values.tag_names ?? \[\])/setPropertyTagsAction(pid, values.tag_ids ?? [])/' $F
npx vitest run src/components/property-form/__tests__/PropertyForm.test.tsx src/components/property-form/__tests__/cibles-tactiles.test.tsx < /dev/null
cp "$B/PropertyForm.tsx" $F
# d) le type d'agence n'est plus lu
sed -i '' "s/ fraisDAgence={property.agency?.kind !== 'individual'}//" $F
npx vitest run src/components/property-form/__tests__/PropertyForm.test.tsx src/components/property-form/__tests__/cibles-tactiles.test.tsx < /dev/null
cp "$B/PropertyForm.tsx" $F
# e) la croix « Retirer » d'une puce redescend à 32 px
sed -i '' 's/className="flex size-11 min-h-11 items-center justify-center rounded-full/className="flex size-8 items-center justify-center rounded-full/' $C
npx vitest run src/components/property-form/__tests__/PropertyForm.test.tsx src/components/property-form/__tests__/cibles-tactiles.test.tsx < /dev/null
cp "$B/combobox.tsx" $C
# f) le statut d'un équipement du bien n'est plus repris
sed -i '' 's/      description: null, status: t.status,/      description: null,/' $F
npx vitest run src/components/property-form/__tests__/PropertyForm.test.tsx src/components/property-form/__tests__/cibles-tactiles.test.tsx < /dev/null
cp "$B/PropertyForm.tsx" $F
md5 -q $F "$B/PropertyForm.tsx" $C "$B/combobox.tsx"
```

Attendu (mesuré dans le harnais) : a) 1 échec — « l'identifiant du référentiel lu sur le bien
repart avec l'adresse » ; b) 1 échec — « un équipement du bien absent du catalogue » ; c) 3 échecs
— `AC4`, `AC5`, « un équipement PROPOSÉ à l'édition » ; d) 1 échec — « un bien d'indépendant » ;
e) 1 échec — « les pastilles d'équipements aussi » (`pastille sous 44 px`) ; f) 1 échec — « un
équipement du bien absent du catalogue garde son nom, et son attente » ; `md5` identiques.

**Step 8 : signaler**

Signaler (⚠ hors territoire, après accord de la session) : `PropertyForm.tsx`, `types/property.ts`,
`PropertyForm.test.tsx`, `cibles-tactiles.test.tsx`,
`feat(web): l'édition du bien reçoit le référentiel, la position collée et les équipements à puces (TCK-633)`.

---

## Tâche 24 — La console des tags ne crée plus de `feature` (10 min) — ⚠ HORS TERRITOIRE

La tâche 10 fusionne les étiquettes `feature` dans `amenity`, et `StoreTagRequest` refuse désormais
`feature` (tâche 10, L41). La console des tags (`/super-admin/tags`, `TagsManager`) l'offre encore : un
onglet « Caractéristiques » toujours vide (L188 itère `tagTypeValues`) et une option de création
que l'API rejette en 422. `TagType` (`types/tag.ts`) **garde** `feature` : un tag déjà là se lit
encore, et la tâche 20 l'a seulement documenté.

**Fichiers**
- Modifier : `takussan-web/src/lib/schemas/tag.ts` (L12)
- Modifier : `takussan-web/src/components/admin-tags/TagsManager.tsx` (L365, L426)
- Modifier : `takussan-web/src/components/admin-tags/__tests__/TagsManager.test.tsx` (L63-65)

Les trois sont hors du territoire du lot D (E-12) : **demander l'extension avant d'exécuter.**

**Step 1 : sauvegardes**

```bash
cd "$WEB"
mkdir -p "$S/abl/t24"
cp src/lib/schemas/tag.ts src/components/admin-tags/TagsManager.tsx "$S/abl/t24/"
```

**Step 2 : le test** — `src/components/admin-tags/__tests__/TagsManager.test.tsx`. Le test existant
qui filtrait sur « Caractéristiques » filtre désormais sur « Commodités », et un test neuf affirme
l'absence de l'onglet et de l'option :

Edit 1 (L63-65) :

```
old:    await user.click(screen.getByRole('tab', { name: 'Caractéristiques' }));
    expect(screen.queryByText('Piscine')).not.toBeInTheDocument();
    expect(screen.getByText('Meublé')).toBeInTheDocument();
new:    await user.click(screen.getByRole('tab', { name: 'Commodités' }));
    expect(screen.getByText('Piscine')).toBeInTheDocument();
    expect(screen.queryByText('Meublé')).not.toBeInTheDocument();
  });

  it('TCK-633 — « Caractéristiques » n’est plus un type : ni onglet, ni option de création', async () => {
    const user = userEvent.setup();
    renderTagsManager();
    expect(screen.queryByRole('tab', { name: 'Caractéristiques' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nouveau tag' }));
    await user.click(await screen.findByLabelText(/^Type/));

    expect(await screen.findByRole('option', { name: 'Commodités' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Caractéristiques' })).not.toBeInTheDocument();
```

**Step 3 : rouge**

```bash
npx vitest run src/components/admin-tags < /dev/null
```

Attendu (mesuré dans le harnais) : `1 failed | 5 passed (6)` — le test neuf (« Caractéristiques »
est encore un onglet). Le test réécrit est vert des deux côtés : « Commodités » existe déjà.

**Step 4 : le schéma** — `src/lib/schemas/tag.ts` :

Edit 1 (L12-12) :

```
old:export const tagTypeValues = ['amenity', 'feature', 'label', 'crm'] as const;
new:/**
 * TCK-633 (ADR-0061 §9) — les types qu'un formulaire peut CRÉER. `feature` en sort : la migration
 * de la tâche 10 a fusionné ses étiquettes dans `amenity`, et `StoreTagRequest` le refuse. Il reste
 * dans `TagType` (`types/tag.ts`) : un tag déjà là se lit encore.
 */
export const tagTypeValues = ['amenity', 'label', 'crm'] as const;
```

**Step 5 : la console** — `src/components/admin-tags/TagsManager.tsx`. Sans ces deux blocs, `tsc`
lève `TS2345` en L427 : `setValues` reçoit un `TagType` (qui contient encore `feature`) là où le
formulaire n'accepte plus que les trois types créables.

Edit 1 (L365-365) :

```
old:  const typeOptions: { value: TagType; label: string }[] = tagTypeValues.map(
new:  // TCK-633 (ADR-0061 §9) — les types qu'on peut CRÉER : `feature` n'en est plus un.
  const typeOptions: { value: TagFormValues['type']; label: string }[] = tagTypeValues.map(
```

Edit 2 (L426-426) :

```
old:              onValueChange={(value) => setValues((current) => ({ ...current, type: (value ?? 'amenity') as TagType }))}
new:              onValueChange={(value) => setValues((current) => ({ ...current, type: (value ?? 'amenity') as TagFormValues['type'] }))}
```

**Step 6 : vert, types, lint**

```bash
npx vitest run src/components/admin-tags < /dev/null
npx tsc --noEmit
npx eslint src/lib/schemas/tag.ts src/components/admin-tags
```

Attendu : `6 passed (6)` ; `tsc` muet ; ESLint 0 erreur (`TagType` reste lu en L72, par le filtre
d'onglet). Mesuré dans le harnais.

**Step 7 : ablations**

```bash
F=src/lib/schemas/tag.ts; M=src/components/admin-tags/TagsManager.tsx
B="$S/abl/t24/nouveau" && mkdir -p "$B" && cp $F $M "$B/"
# a) `feature` redevient un type créable
sed -i '' "s/export const tagTypeValues = \['amenity', 'label', 'crm'\] as const;/export const tagTypeValues = ['amenity', 'feature', 'label', 'crm'] as const;/" $F
npx vitest run src/components/admin-tags < /dev/null
cp "$B/tag.ts" $F
# b) le cast de la console reste sur `TagType`
sed -i '' "s/as TagFormValues\['type'\] }))}/as TagType }))}/" $M
npx tsc --noEmit
cp "$B/TagsManager.tsx" $M
md5 -q $F "$B/tag.ts" $M "$B/TagsManager.tsx"
```

Attendu (mesuré dans le harnais) : a) `1 failed | 5 passed (6)` — « « Caractéristiques » n'est plus
un type » ; b) `TagsManager.tsx(427,51): error TS2345` ; `md5` identiques deux à deux.

**Step 8 : signaler**

Signaler (⚠ hors territoire, après accord de la session) : `lib/schemas/tag.ts`, `TagsManager.tsx`,
`TagsManager.test.tsx`, `fix(web): la console des tags ne propose plus le type « Caractéristiques » (TCK-633)`.

---

## Tâche 25 — Les deux files de propositions de la console (25 min)

AC5 : « une file de modération des quartiers proposés (approuver, renommer, fusionner, refuser) »,
et ADR-0061 §9 la même chose pour les équipements. L'API existe (tâches 6 et 12) ; il manque
l'écran, que le plan maître range dans le territoire de D, et deux entrées de menu.

Ce qui est lu, et qui décide de la forme :

- Le relais `app/api/super-admin/[...path]/route.ts` (L17-56) transmet `GET`, `POST`, `PATCH` vers
  `/api/admin/<chemin>`, jeton pris du cookie : le navigateur appelle `/api/super-admin/geo/…` et
  `/api/super-admin/tags/…` avec `credentials: 'include'`, comme `lib/queries/kyc.ts` (L4-10,
  `jsonOrThrow` local) et `fetchAdminAgencyUpgradeRequests` (`lib/queries/super-admin.ts` L1470).
  Les chemins passent par `cheminApi` / `requete` (`lib/chemin-api.ts`).
- `EnsureSuperAdmin` (L34-63, refus par défaut L57-60) : sans `platform-can:`, une route `admin/*` est au `super_admin`
  SEUL. Les routes des tâches 6 et 12 n'en déclarent aucun : les entrées de menu ne portent donc
  pas d'`ability` — `navigationPour()` (L178) les cache à `viewer` et `support`.
- Les pages restent dans le territoire du plan maître (« pages super-admin `geo/**` et
  `tags/**` ») : `/super-admin/geo` et `/super-admin/tags/proposals`. L'état actif du menu est
  PRÉFIXE (`isActiveHref`, L50-56 ; `active-path.ts` L40-43) : la file des équipements est donc un
  ENFANT de l'entrée « Tags » (`children`, rendu L367-396 comme ceux de « Système », L158) — le parent
  reste allumé sous son enfant (L325), et `aria-current` ne marque que la page exacte (L337, L378).
- Les cibles de fusion : les entrées APPROUVÉES, de la même ville pour un quartier
  (`geo.merge_other_city`, tâche 6). L'API plafonne une page à 100 (`HasQueryBuilder::PER_PAGE_MAX`,
  L47) et Dakar compte **151** quartiers au jeu de la tâche 2 : la liste des cibles lit toutes les
  pages (`filter[status]=approved&filter[geo_city_id]=…&sort=name&per_page=100`). Filtre et tri
  sont faits par le serveur ; la liste à recherche (tâche 15) ne fait que chercher dedans.
- Ni `fields[]` ni `include=` : `GeoNeighborhoodAdminController::format()` et
  `TagModerationAdminController::format()` rendent une forme fixe, déjà réduite à la file.
- Gardes : `check-feedback-states` (l'état vide est l'`EmptyState` de `@/components/feedback`, via
  `DataState`, L49-89) et `check-super-admin-tokens` (jetons du DS seulement : `bg-card`,
  `border-border`, `text-muted-foreground`, `text-destructive`).

Les libellés sont sous `superAdmin.propositions` et `nav.superAdmin.items.{geoProposals,tagProposals}`,
posés en tâche 14 (dont `noTarget`).

**Fichiers**
- Créer : `takussan-web/src/lib/queries/super-admin-propositions.ts`
- Créer : `takussan-web/src/lib/queries/__tests__/super-admin-propositions.test.ts`
- Créer : `takussan-web/src/components/admin/super/FileDePropositions.tsx`
- Créer : `takussan-web/src/components/admin/super/__tests__/FileDePropositions.test.tsx`
- Créer : `takussan-web/src/app/(super-admin)/super-admin/geo/page.tsx`
- Créer : `takussan-web/src/app/(super-admin)/super-admin/tags/proposals/page.tsx` (la page `tags/page.tsx` existante n'est pas touchée)
- Modifier : `takussan-web/src/components/layout/SuperAdminSidebar.tsx` (L19-20, L139) — co-tenu (D, F)
- Créer : `takussan-web/src/components/layout/__tests__/SuperAdminSidebar.propositions.test.tsx`

**Step 1 : sauvegarde**

```bash
cd "$WEB"
mkdir -p "$S/abl/t25"
cp src/components/layout/SuperAdminSidebar.tsx "$S/abl/t25/SuperAdminSidebar.orig.tsx"
```

**Step 2 : les tests**

`src/lib/queries/__tests__/super-admin-propositions.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agirSurProposition, ciblesDeFusion, listerPropositions } from '../super-admin-propositions';

/**
 * TCK-633 (AC5) — les files de propositions parlent au relais `/api/super-admin/…` (→
 * `/api/admin/…`), filtrent CÔTÉ SERVEUR, et un geste est une requête.
 */
const fetchMock = vi.fn();

function reponse(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

function meta(page: number, last: number) {
  return { total: 0, per_page: 100, current_page: page, last_page: last };
}

/** L'URL et les paramètres d'un appel, décodés. */
function appel(n: number): { chemin: string; params: Record<string, string>; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  const u = new URL(url, 'http://test');
  return { chemin: u.pathname, params: Object.fromEntries(u.searchParams), init };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('listerPropositions', () => {
  it('lit les quartiers EN ATTENTE, par le relais, et les met à la forme commune', async () => {
    fetchMock.mockResolvedValueOnce(reponse({
      data: [{
        id: 7, name: 'Liberté 7', slug: 'liberte-7', status: 'pending', origin: 'proposed',
        city: { id: 3, name: 'Dakar' }, region: { id: 1, name: 'Dakar' },
        created_by: { id: 9, name: 'Awa Diop' }, addresses_count: 2, created_at: '2026-10-12T10:00:00+00:00',
      }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    }));

    const page = await listerPropositions('geo', 2);

    const { chemin, params, init } = appel(0);
    expect(chemin).toBe('/api/super-admin/geo/neighborhoods');
    expect(params).toEqual({ 'filter[status]': 'pending', page: '2', per_page: '20' });
    expect(init.credentials).toBe('include');
    expect(page.data).toEqual([{ id: 7, name: 'Liberté 7', auteur: 'Awa Diop', usage: 2, lieu: 'Dakar · Dakar', villeId: 3 }]);
    expect(page.meta.total).toBe(1);
  });

  it('lit les équipements en attente — un auteur sans nom n’est pas affiché', async () => {
    fetchMock.mockResolvedValueOnce(reponse({
      data: [{ id: 4, name: 'Puits', slug: 'puits', type: 'amenity', status: 'pending', created_by: { id: 2, name: ' ' }, properties_count: 1, created_at: null }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    }));

    const page = await listerPropositions('tags', 1);

    expect(appel(0).chemin).toBe('/api/super-admin/tags/proposals');
    expect(appel(0).params['filter[status]']).toBe('pending');
    expect(page.data).toEqual([{ id: 4, name: 'Puits', auteur: null, usage: 1, lieu: null, villeId: null }]);
  });

  it('une erreur de l’API remonte (la file affiche son état d’erreur)', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ message: 'Forbidden' }, 403));
    await expect(listerPropositions('geo', 1)).rejects.toMatchObject({ status: 403 });
  });
});

describe('ciblesDeFusion', () => {
  it('quartiers : les APPROUVÉS de la même ville, triés, TOUTES les pages (Dakar en compte plus de 100)', async () => {
    fetchMock
      .mockResolvedValueOnce(reponse({ data: [{ id: 1, name: 'Almadies' }], meta: meta(1, 2) }))
      .mockResolvedValueOnce(reponse({ data: [{ id: 2, name: 'Yoff' }], meta: meta(2, 2) }));

    const cibles = await ciblesDeFusion('geo', 3);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(appel(0).params).toEqual({ 'filter[status]': 'approved', 'filter[geo_city_id]': '3', sort: 'name', per_page: '100', page: '1' });
    expect(appel(1).params.page).toBe('2');
    expect(cibles).toEqual([{ value: '1', label: 'Almadies' }, { value: '2', label: 'Yoff' }]);
  });

  it('équipements : les approuvés, sans filtre de ville ; un quartier sans ville n’appelle rien', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ data: [{ id: 5, name: 'Piscine' }], meta: meta(1, 1) }));

    expect(await ciblesDeFusion('tags', null)).toEqual([{ value: '5', label: 'Piscine' }]);
    expect(appel(0).chemin).toBe('/api/super-admin/tags/proposals');
    expect(appel(0).params['filter[geo_city_id]']).toBeUndefined();

    expect(await ciblesDeFusion('geo', null)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('agirSurProposition', () => {
  it.each([
    ['geo', { type: 'approve' }, 'POST', '/api/super-admin/geo/neighborhoods/7/approve', undefined],
    ['geo', { type: 'reject' }, 'POST', '/api/super-admin/geo/neighborhoods/7/reject', undefined],
    ['geo', { type: 'rename', name: 'Liberté 6' }, 'PATCH', '/api/super-admin/geo/neighborhoods/7', { name: 'Liberté 6' }],
    ['geo', { type: 'merge', intoId: 2 }, 'POST', '/api/super-admin/geo/neighborhoods/7/merge', { into_id: 2 }],
    ['tags', { type: 'approve' }, 'POST', '/api/super-admin/tags/7/approve', undefined],
    ['tags', { type: 'merge', intoId: 5 }, 'POST', '/api/super-admin/tags/7/merge', { into_id: 5 }],
  ] as const)('%s %j → %s %s', async (genre, geste, methode, chemin, corps) => {
    fetchMock.mockResolvedValueOnce(reponse({ data: {} }));

    await agirSurProposition(genre, 7, geste);

    const a = appel(0);
    expect(a.chemin).toBe(chemin);
    expect(a.init.method).toBe(methode);
    expect(a.init.body === undefined ? undefined : JSON.parse(String(a.init.body))).toEqual(corps);
  });

  it('un refus de l’API (422) est levé, avec son corps', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ code: 'geo.merge_other_city' }, 422));
    await expect(agirSurProposition('geo', 7, { type: 'merge', intoId: 2 })).rejects.toMatchObject({ status: 422, data: { code: 'geo.merge_other_city' } });
  });
});
```

`src/components/admin/super/__tests__/FileDePropositions.test.tsx` :

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agirSurProposition,
  ciblesDeFusion,
  listerPropositions,
  type Proposition,
} from '@/lib/queries/super-admin-propositions';
import { withIntl } from '@/test/intl';
import { FileDePropositions } from '../FileDePropositions';

vi.mock('@/lib/queries/super-admin-propositions', () => ({
  listerPropositions: vi.fn(),
  ciblesDeFusion: vi.fn(),
  agirSurProposition: vi.fn(),
}));

/**
 * TCK-633 (AC5) — la file : une ligne par proposition en attente, quatre gestes, et la file
 * relue après chaque geste réussi.
 */
const LIBERTE_7: Proposition = { id: 7, name: 'Liberté 7', auteur: 'Awa Diop', usage: 2, lieu: 'Dakar · Dakar', villeId: 3 };
const PAGE = { data: [LIBERTE_7], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } };

function monter(genre: 'geo' | 'tags' = 'geo') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <FileDePropositions genre={genre} />
    </QueryClientProvider>,
  ));
}

async function ligne(nom = 'Liberté 7') {
  return screen.findByRole('listitem', { name: nom });
}

describe('<FileDePropositions /> — TCK-633', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listerPropositions).mockResolvedValue(PAGE);
    vi.mocked(ciblesDeFusion).mockResolvedValue([{ value: '2', label: 'Liberté 6' }, { value: '5', label: 'Sacré-Cœur' }]);
    vi.mocked(agirSurProposition).mockResolvedValue(undefined);
  });

  it('liste les quartiers en attente : nom, lieu, auteur, nombre d’annonces', async () => {
    monter();

    const l = await ligne();
    expect(screen.getByRole('heading', { name: 'Quartiers proposés' })).toBeInTheDocument();
    expect(within(l).getByText('Dakar · Dakar · Proposé par Awa Diop · 2 annonces')).toBeInTheDocument();
    expect(listerPropositions).toHaveBeenCalledWith('geo', 1);
  });

  it('une file vide le dit, avec l’état vide du design system', async () => {
    vi.mocked(listerPropositions).mockResolvedValue({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } });
    monter('tags');

    expect(await screen.findByText('Aucune proposition en attente')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Équipements proposés' })).toBeInTheDocument();
    expect(listerPropositions).toHaveBeenCalledWith('tags', 1);
  });

  it('une file en erreur se relance', async () => {
    vi.mocked(listerPropositions).mockRejectedValueOnce(new Error('500'));
    const user = userEvent.setup();
    monter();

    expect(await screen.findByText('Erreur de chargement des propositions.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await ligne()).toBeInTheDocument();
  });

  it('approuver : un appel, puis la file est relue et la décision annoncée', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(within(await ligne()).getByRole('button', { name: 'Approuver' }));

    expect(agirSurProposition).toHaveBeenCalledWith('geo', 7, { type: 'approve' });
    expect(await screen.findByRole('status')).toHaveTextContent('Décision enregistrée.');
    await waitFor(() => expect(listerPropositions).toHaveBeenCalledTimes(2));
  });

  it('refuser', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(within(await ligne()).getByRole('button', { name: 'Refuser' }));

    expect(agirSurProposition).toHaveBeenCalledWith('geo', 7, { type: 'reject' });
  });

  it('renommer : le nouveau nom, sans espaces autour ; inchangé, rien ne part', async () => {
    const user = userEvent.setup();
    monter();
    const l = await ligne();

    await user.click(within(l).getByRole('button', { name: 'Renommer' }));
    const champ = within(l).getByLabelText('Nouveau nom');
    expect(champ).toHaveValue('Liberté 7');
    expect(within(l).getByRole('button', { name: 'Valider' })).toBeDisabled();

    await user.clear(champ);
    await user.type(champ, '  Liberté 6 Extension ');
    await user.click(within(l).getByRole('button', { name: 'Valider' }));

    expect(agirSurProposition).toHaveBeenCalledWith('geo', 7, { type: 'rename', name: 'Liberté 6 Extension' });
    await waitFor(() => expect(within(l).queryByLabelText('Nouveau nom')).not.toBeInTheDocument());
  });

  it('fusionner : les cibles approuvées de la même ville, choisies dans la liste', async () => {
    const user = userEvent.setup();
    monter();
    const l = await ligne();

    await user.click(within(l).getByRole('button', { name: 'Fusionner' }));
    expect(ciblesDeFusion).toHaveBeenCalledWith('geo', 3);
    expect(within(l).getByRole('button', { name: 'Valider' })).toBeDisabled();

    await user.type(within(l).getByLabelText('Fusionner dans'), 'lib');
    await user.click(await screen.findByRole('option', { name: 'Liberté 6' }));
    await user.click(within(l).getByRole('button', { name: 'Valider' }));

    expect(agirSurProposition).toHaveBeenCalledWith('geo', 7, { type: 'merge', intoId: 2 });
  });

  it('un geste refusé par l’API est annoncé, et le formulaire reste ouvert', async () => {
    vi.mocked(agirSurProposition).mockRejectedValueOnce(new Error('422'));
    const user = userEvent.setup();
    monter();
    const l = await ligne();

    await user.click(within(l).getByRole('button', { name: 'Renommer' }));
    await user.type(within(l).getByLabelText('Nouveau nom'), ' bis');
    await user.click(within(l).getByRole('button', { name: 'Valider' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La décision n’a pas pu être enregistrée.');
    expect(within(l).getByLabelText('Nouveau nom')).toHaveValue('Liberté 7 bis');
    expect(listerPropositions).toHaveBeenCalledTimes(1);
  });
});
```

`src/components/layout/__tests__/SuperAdminSidebar.propositions.test.tsx` — les simulations
reprennent celles de `SuperAdminSidebar.niveaux.test.tsx` (L10-16), et `SUPPORT` ses gestes
(L26-36) :

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformAbilities } from '@/lib/platform-abilities';
import { avecGestes, SUPER_ADMIN } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import { SuperAdminSidebar } from '../SuperAdminSidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/super-admin/tags/proposals' }));
vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminAgencyUpgradePendingCount: vi.fn().mockResolvedValue(0),
  fetchAdminKycQueue: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  fetchFailedJobs: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  fetchModerationQueue: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
}));

/** Les gestes d'un `support` (`PlatformAbility::forLevel`), comme dans `SuperAdminSidebar.niveaux.test`. */
const SUPPORT: PlatformAbilities = {
  level: 'support',
  abilities: [
    'platform.console.access', 'platform.reports.view', 'platform.health.view', 'platform.agencies.view',
    'platform.users.view', 'platform.users.support', 'platform.users.block', 'platform.moderation.view',
    'platform.search.global',
  ],
};

function monter(value: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>{avecGestes(<SuperAdminSidebar />, value)}</QueryClientProvider>,
  ));
  return within(screen.getByRole('navigation'));
}

/** TCK-633 (AC5) — les deux files de propositions ont une entrée de menu, au `super_admin` seul. */
describe('SuperAdminSidebar — files de propositions (TCK-633)', () => {
  it('un super_admin les trouve sous « Contenu » : les équipements proposés sous « Tags »', () => {
    const nav = monter(SUPER_ADMIN);

    expect(nav.getByRole('link', { name: 'Quartiers proposés' })).toHaveAttribute('href', '/super-admin/geo');
    const equipements = nav.getByRole('link', { name: 'Équipements proposés' });
    expect(equipements).toHaveAttribute('href', '/super-admin/tags/proposals');
    expect(equipements).toHaveAttribute('aria-current', 'page');
    // Un ENFANT de « Tags » : rendu dans son bloc, et le parent n'est pas la page courante.
    const tags = nav.getByRole('link', { name: 'Tags' });
    expect(tags.parentElement).toContainElement(equipements);
    expect(tags).not.toHaveAttribute('aria-current');
  });

  it('un support ne les voit pas : les routes `admin/geo` et `admin/tags` ne déclarent aucun geste', () => {
    const nav = monter(SUPPORT);

    expect(nav.queryByRole('link', { name: 'Quartiers proposés' })).not.toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'Équipements proposés' })).not.toBeInTheDocument();
  });
});
```

**Step 3 : rouge**

```bash
npx vitest run src/lib/queries/__tests__/super-admin-propositions.test.ts src/components/admin/super/__tests__/FileDePropositions.test.tsx src/components/layout/__tests__/SuperAdminSidebar.propositions.test.tsx < /dev/null
```

Attendu (mesuré dans le harnais) : `Test Files 3 failed (3)` — les deux premiers sur
`Failed to resolve import "../super-admin-propositions"` et `"../FileDePropositions"` ; le menu
`1 failed | 1 passed (2)` (« un super_admin les trouve » ; l'absence chez `support` est verte
avant, c'est l'ablation f) qui l'éprouve).

**Step 4 : les requêtes** — `src/lib/queries/super-admin-propositions.ts` :

```ts
import { ApiError } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';

/**
 * TCK-633 (AC5, ADR-0061 §9, ADR-0062) — les deux files de propositions de la console : les
 * quartiers saisis hors du référentiel, les équipements saisis hors du catalogue.
 *
 * Les deux passent par le relais same-origin `app/api/super-admin/[...path]` (→ `/api/admin/…`).
 * ⚠ Ni `fields[]` ni `include=` : les deux contrôleurs (`GeoNeighborhoodAdminController`,
 * `TagModerationAdminController`) rendent une forme FIXE, déjà réduite à ce que la file affiche.
 */
export type GenreDePropositions = 'geo' | 'tags';

/** Une ligne de file, commune aux deux genres. */
export interface Proposition {
  readonly id: number;
  readonly name: string;
  /** Le nom de l'auteur, ou `null` (compte supprimé, proposition sans auteur). */
  readonly auteur: string | null;
  /** Les annonces qui l'emploient : adresses d'un quartier, biens d'un équipement. */
  readonly usage: number;
  /** « Ville · Région » pour un quartier ; `null` pour un équipement. */
  readonly lieu: string | null;
  /** La ville d'un quartier : on ne fusionne que dans la même (`geo.merge_other_city`). */
  readonly villeId: number | null;
}

export interface MetaDePage {
  readonly total: number;
  readonly per_page: number;
  readonly current_page: number;
  readonly last_page: number;
}

export interface PageDePropositions {
  readonly data: Proposition[];
  readonly meta: MetaDePage;
}

/** Une cible de fusion, prête pour la liste à recherche (`OptionDeListe`). */
export interface CibleDeFusion {
  readonly value: string;
  readonly label: string;
}

export type GesteDeModeration =
  | { readonly type: 'approve' }
  | { readonly type: 'reject' }
  | { readonly type: 'rename'; readonly name: string }
  | { readonly type: 'merge'; readonly intoId: number };

interface Auteur {
  readonly id: number;
  readonly name: string;
}

interface QuartierAdmin {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly city: { readonly id: number; readonly name: string };
  readonly region: { readonly id: number; readonly name: string };
  readonly created_by: Auteur | null;
  readonly addresses_count: number;
}

interface EquipementAdmin {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly created_by: Auteur | null;
  readonly properties_count: number;
}

interface Enveloppe<T> {
  readonly data: T[];
  readonly meta: MetaDePage;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

/** Un auteur sans nom (prénom et nom vides) n'est pas un auteur affichable. */
function nomDAuteur(auteur: Auteur | null): string | null {
  const nom = auteur?.name.trim() ?? '';
  return nom === '' ? null : nom;
}

function depuisQuartier(q: QuartierAdmin): Proposition {
  return {
    id: q.id,
    name: q.name,
    auteur: nomDAuteur(q.created_by),
    usage: q.addresses_count,
    lieu: `${q.city.name} · ${q.region.name}`,
    villeId: q.city.id,
  };
}

function depuisEquipement(e: EquipementAdmin): Proposition {
  return { id: e.id, name: e.name, auteur: nomDAuteur(e.created_by), usage: e.properties_count, lieu: null, villeId: null };
}

async function lireQuartiers(qs: URLSearchParams): Promise<Enveloppe<QuartierAdmin>> {
  const res = await fetch(cheminApi`/api/super-admin/geo/neighborhoods${requete(qs)}`, { credentials: 'include' });
  return jsonOrThrow<Enveloppe<QuartierAdmin>>(res);
}

async function lireEquipements(qs: URLSearchParams): Promise<Enveloppe<EquipementAdmin>> {
  const res = await fetch(cheminApi`/api/super-admin/tags/proposals${requete(qs)}`, { credentials: 'include' });
  return jsonOrThrow<Enveloppe<EquipementAdmin>>(res);
}

/** La file : les propositions EN ATTENTE, les plus récentes d'abord (tri par défaut de l'API). */
export async function listerPropositions(genre: GenreDePropositions, page: number): Promise<PageDePropositions> {
  const qs = new URLSearchParams();
  qs.set('filter[status]', 'pending');
  qs.set('page', String(page));
  qs.set('per_page', '20');
  if (genre === 'geo') {
    const corps = await lireQuartiers(qs);
    return { data: corps.data.map(depuisQuartier), meta: corps.meta };
  }
  const corps = await lireEquipements(qs);
  return { data: corps.data.map(depuisEquipement), meta: corps.meta };
}

/** Au-delà, la liste des cibles s'arrête : 1 000 entrées approuvées dans une même ville. */
const PAGES_DE_CIBLES_MAX = 10;

/**
 * Les cibles d'une fusion : les entrées APPROUVÉES — de la même ville pour un quartier. Toutes
 * les pages : Dakar compte 151 quartiers au jeu de la tâche 2, et l'API plafonne une page à 100
 * (`HasQueryBuilder::PER_PAGE_MAX`). Une liste tronquée rendrait « Liberté 6 » introuvable.
 * La proposition elle-même n'y figure jamais : elle est `pending`.
 */
export async function ciblesDeFusion(genre: GenreDePropositions, villeId: number | null): Promise<CibleDeFusion[]> {
  if (genre === 'geo' && villeId === null) return [];
  const qs = new URLSearchParams();
  qs.set('filter[status]', 'approved');
  if (genre === 'geo') qs.set('filter[geo_city_id]', String(villeId));
  qs.set('sort', 'name');
  qs.set('per_page', '100');

  const cibles: CibleDeFusion[] = [];
  for (let page = 1; page <= PAGES_DE_CIBLES_MAX; page++) {
    qs.set('page', String(page));
    const corps = genre === 'geo' ? await lireQuartiers(qs) : await lireEquipements(qs);
    for (const ligne of corps.data) cibles.push({ value: String(ligne.id), label: ligne.name });
    if (page >= corps.meta.last_page) break;
  }
  return cibles;
}

function cheminDeLaProposition(genre: GenreDePropositions, id: number): string {
  return genre === 'geo' ? cheminApi`/api/super-admin/geo/neighborhoods/${id}` : cheminApi`/api/super-admin/tags/${id}`;
}

/** Approuver, refuser, renommer, fusionner — un geste, une requête. */
export async function agirSurProposition(genre: GenreDePropositions, id: number, geste: GesteDeModeration): Promise<void> {
  const chemin = cheminDeLaProposition(genre, id);
  const json = { 'Content-Type': 'application/json', Accept: 'application/json' };
  let res: Response;
  switch (geste.type) {
    case 'approve':
    case 'reject':
      res = await fetch(`${chemin}/${geste.type}`, { method: 'POST', credentials: 'include', headers: json });
      break;
    case 'rename':
      res = await fetch(chemin, { method: 'PATCH', credentials: 'include', headers: json, body: JSON.stringify({ name: geste.name }) });
      break;
    case 'merge':
      res = await fetch(`${chemin}/merge`, { method: 'POST', credentials: 'include', headers: json, body: JSON.stringify({ into_id: geste.intoId }) });
      break;
  }
  await jsonOrThrow<unknown>(res);
}
```

**Step 5 : la file** — `src/components/admin/super/FileDePropositions.tsx` :

```tsx
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, MapPinned } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DataState, PageHeader, Pagination } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Combobox, type OptionDeListe } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import {
  agirSurProposition,
  ciblesDeFusion,
  listerPropositions,
  type GenreDePropositions,
  type GesteDeModeration,
  type Proposition,
} from '@/lib/queries/super-admin-propositions';

/** La longueur maximale d'un nom, celle des règles de l'API (`GeoRenameRequest`, `TagRenameRequest`). */
const NOM_MAX: Record<GenreDePropositions, number> = { geo: 120, tags: 100 };

type Agir = (id: number, geste: GesteDeModeration) => Promise<boolean>;

/**
 * TCK-633 (AC5) — une file de propositions : quartiers (`geo`) ou équipements (`tags`). Chaque
 * ligne s'approuve, se refuse, se renomme ou se fusionne dans une entrée APPROUVÉE ; la file se
 * recharge après chaque geste — une proposition traitée en sort.
 *
 * ⚠ Aucun `useMemo` / `useCallback` : le React Compiler s'en charge (ADR-0015).
 */
export function FileDePropositions({ genre }: { readonly genre: GenreDePropositions }) {
  const t = useTranslations('superAdmin.propositions');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [issue, setIssue] = useState<'done' | 'failed' | null>(null);

  const file = useQuery({
    queryKey: ['super-admin', 'propositions', genre, page],
    queryFn: () => listerPropositions(genre, page),
  });

  const geste = useMutation({
    mutationFn: ({ id, g }: { id: number; g: GesteDeModeration }) => agirSurProposition(genre, id, g),
    onSuccess: () => {
      setIssue('done');
      return queryClient.invalidateQueries({ queryKey: ['super-admin', 'propositions', genre] });
    },
    onError: () => setIssue('failed'),
  });

  const agir: Agir = (id, g) => {
    setIssue(null);
    return geste.mutateAsync({ id, g }).then(
      () => true,
      () => false,
    );
  };

  const lignes = file.data?.data ?? [];
  const meta = file.data?.meta;
  const Icone = genre === 'geo' ? MapPinned : ListChecks;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(genre === 'geo' ? 'geoTitle' : 'tagsTitle')}
        description={t(genre === 'geo' ? 'geoDescription' : 'tagsDescription')}
      />

      {issue ? (
        <p
          role={issue === 'failed' ? 'alert' : 'status'}
          className={issue === 'failed' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {t(issue)}
        </p>
      ) : null}

      <DataState
        loading={file.isLoading}
        error={file.isError ? t('error') : null}
        onRetry={() => void file.refetch()}
        retryLabel={t('retry')}
        isEmpty={lignes.length === 0}
        skeletonRows={4}
        skeletonRowClassName="h-16"
        emptyState={
          <EmptyState
            icon={<Icone className="size-8" aria-hidden="true" />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        }
      >
        <ul className="space-y-3">
          {lignes.map((p) => (
            <LigneDeProposition key={p.id} proposition={p} genre={genre} occupe={geste.isPending} agir={agir} />
          ))}
        </ul>
      </DataState>

      {meta ? <Pagination page={meta.current_page} lastPage={meta.last_page} onChange={setPage} /> : null}
    </div>
  );
}

function LigneDeProposition({
  proposition: p,
  genre,
  occupe,
  agir,
}: {
  readonly proposition: Proposition;
  readonly genre: GenreDePropositions;
  readonly occupe: boolean;
  readonly agir: Agir;
}) {
  const t = useTranslations('superAdmin.propositions');
  const [mode, setMode] = useState<'rename' | 'merge' | null>(null);
  const [nom, setNom] = useState(p.name);
  const [cible, setCible] = useState<OptionDeListe | null>(null);

  const cibles = useQuery({
    queryKey: ['super-admin', 'propositions', genre, 'cibles', p.villeId],
    queryFn: () => ciblesDeFusion(genre, p.villeId),
    enabled: mode === 'merge',
  });

  const fermer = () => {
    setMode(null);
    setNom(p.name);
    setCible(null);
  };
  const executer = async (g: GesteDeModeration) => {
    if (await agir(p.id, g)) fermer();
  };

  const details = [p.lieu, p.auteur ? t('author', { name: p.auteur }) : t('authorUnknown'), t('usage', { count: p.usage })]
    .filter((x): x is string => x !== null);
  const idNom = `proposition-${genre}-${p.id}-nom`;
  const idCible = `proposition-${genre}-${p.id}-cible`;

  return (
    <li className="rounded-xl border border-border bg-card p-4" aria-label={p.name}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{p.name}</p>
          <p className="text-sm text-muted-foreground">{details.join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={occupe} onClick={() => void executer({ type: 'approve' })}>
            {t('approve')}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={occupe} aria-expanded={mode === 'rename'} onClick={() => setMode('rename')}>
            {t('rename')}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={occupe} aria-expanded={mode === 'merge'} onClick={() => setMode('merge')}>
            {t('merge')}
          </Button>
          <Button type="button" size="sm" variant="destructive" disabled={occupe} onClick={() => void executer({ type: 'reject' })}>
            {t('reject')}
          </Button>
        </div>
      </div>

      {mode === 'rename' ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void executer({ type: 'rename', name: nom.trim() });
          }}
        >
          <div className="min-w-56 flex-1 space-y-1">
            <label htmlFor={idNom} className="text-xs font-medium text-muted-foreground">{t('newName')}</label>
            <Input id={idNom} value={nom} maxLength={NOM_MAX[genre]} onChange={(e) => setNom(e.target.value)} />
          </div>
          <Button type="submit" disabled={occupe || nom.trim() === '' || nom.trim() === p.name}>{t('confirm')}</Button>
          <Button type="button" variant="ghost" onClick={fermer}>{t('cancel')}</Button>
        </form>
      ) : null}

      {mode === 'merge' ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (cible) void executer({ type: 'merge', intoId: Number(cible.value) });
          }}
        >
          <div className="min-w-56 flex-1 space-y-1">
            <label htmlFor={idCible} className="text-xs font-medium text-muted-foreground">{t('mergeInto')}</label>
            <Combobox
              id={idCible}
              options={cibles.data ?? []}
              value={cible?.value ?? null}
              onChange={setCible}
              chargement={cibles.isLoading}
              aucunResultat={t('noTarget')}
            />
          </div>
          <Button type="submit" disabled={occupe || cible === null}>{t('confirm')}</Button>
          <Button type="button" variant="ghost" onClick={fermer}>{t('cancel')}</Button>
        </form>
      ) : null}
    </li>
  );
}
```

**Step 6 : les deux pages**

`src/app/(super-admin)/super-admin/geo/page.tsx` :

```tsx
import { FileDePropositions } from '@/components/admin/super/FileDePropositions';

/** TCK-633 (AC5) — les quartiers saisis hors du référentiel, à approuver, renommer, fusionner ou refuser. */
export default function SuperAdminGeoProposalsPage() {
  return <FileDePropositions genre="geo" />;
}
```

`src/app/(super-admin)/super-admin/tags/proposals/page.tsx` :

```tsx
import { FileDePropositions } from '@/components/admin/super/FileDePropositions';

/** TCK-633 (AC5, ADR-0061 §9) — les équipements saisis hors du catalogue. */
export default function SuperAdminTagProposalsPage() {
  return <FileDePropositions genre="tags" />;
}
```

La coque `(super-admin)/super-admin/layout.tsx` porte la garde d'accès (jeton d'opérateur, second
facteur) et le `QueryClientProvider` vient de la racine (`app/layout.tsx` L94) : les pages ne font
que monter la file. Un opérateur `viewer` ou `support` qui taperait l'URL verrait l'état d'erreur
de la file — l'API lui répond 403 (`EnsureSuperAdmin`, L57-60).

**Step 7 : le menu** — `src/components/layout/SuperAdminSidebar.tsx` (co-tenu avec F : Edit
seulement, ancres relues juste avant) :

Edit 1 (L19-20) :

```
old:  ListTree,
  ListX,
new:  ListChecks,
  ListTree,
  ListX,
  MapPinned,
```

Edit 2 (L139-139) :

```
old:      { href: '/super-admin/tags', labelKey: 'tags', icon: Tags },
new:      // TCK-633 (AC5) — les deux files de propositions. Sans geste : `super_admin` seul, comme les
      // routes `admin/geo` et `admin/tags` qu'elles lisent (middleware `super-admin`). Les
      // équipements proposés sont un ENFANT des tags : l'état actif est préfixe (`isActiveHref`),
      // et le parent reste allumé sous son enfant — le fil visuel voulu plus haut.
      {
        href: '/super-admin/tags',
        labelKey: 'tags',
        icon: Tags,
        children: [{ href: '/super-admin/tags/proposals', labelKey: 'tagProposals', icon: ListChecks }],
      },
      { href: '/super-admin/geo', labelKey: 'geoProposals', icon: MapPinned },
```

**Step 8 : vert, types, lint, gardes**

```bash
npx vitest run src/lib/queries/__tests__/super-admin-propositions.test.ts src/components/admin/super src/components/layout < /dev/null
npx tsc --noEmit
npx eslint src/lib/queries/super-admin-propositions.ts src/components/admin/super src/components/layout "src/app/(super-admin)/super-admin/geo" "src/app/(super-admin)/super-admin/tags/proposals"
cd .. && node scripts/check-feedback-states.mjs && node scripts/check-super-admin-tokens.mjs && cd takussan-web
```

Attendu : vert — les 22 tests neufs (12 + 8 + 2) et les tests existants du menu
(`SuperAdminSidebar.test`, `.niveaux.test` dont « un super_admin voit tout », qui dérive sa liste
de `NAV_GROUPS`, et `SuperAdminShell.a11y.test`) ; `tsc` muet ; ESLint 0 erreur ; les deux gardes
muettes. Mesuré dans le harnais : `41 passed (41)` sur les trois dossiers, `tsc` muet, ESLint muet
sur les huit fichiers.

**Step 9 : ablations**

```bash
L=src/lib/queries/super-admin-propositions.ts; C=src/components/admin/super/FileDePropositions.tsx; N=src/components/layout/SuperAdminSidebar.tsx
T="src/lib/queries/__tests__/super-admin-propositions.test.ts src/components/admin/super/__tests__/FileDePropositions.test.tsx src/components/layout/__tests__/SuperAdminSidebar.propositions.test.tsx"
B="$S/abl/t25/nouveau" && mkdir -p "$B" && cp $L $C $N "$B/"
# a) la file n'est plus filtrée sur les propositions en attente
sed -i '' "s/  qs.set('filter\[status\]', 'pending');//" $L
npx vitest run $T < /dev/null
cp "$B/super-admin-propositions.ts" $L
# b) les cibles s'arrêtent à la première page
sed -i '' 's/    if (page >= corps.meta.last_page) break;/    break;/' $L
npx vitest run $T < /dev/null
cp "$B/super-admin-propositions.ts" $L
# c) la file n'est plus relue après un geste
sed -i '' "s/      return queryClient.invalidateQueries({ queryKey: \['super-admin', 'propositions', genre\] });//" $C
npx vitest run $T < /dev/null
cp "$B/FileDePropositions.tsx" $C
# d) le nouveau nom part avec ses espaces
sed -i '' "s/void executer({ type: 'rename', name: nom.trim() });/void executer({ type: 'rename', name: nom });/" $C
npx vitest run $T < /dev/null
cp "$B/FileDePropositions.tsx" $C
# e) la file des équipements sort du bloc de « Tags » (entrée de premier niveau)
sed -i '' "s#        children: \[{ href: '/super-admin/tags/proposals', labelKey: 'tagProposals', icon: ListChecks }\],##" $N
sed -i '' "s#      { href: '/super-admin/geo', labelKey: 'geoProposals', icon: MapPinned },#      { href: '/super-admin/geo', labelKey: 'geoProposals', icon: MapPinned }, { href: '/super-admin/tags/proposals', labelKey: 'tagProposals', icon: ListChecks },#" $N
npx vitest run $T < /dev/null
cp "$B/SuperAdminSidebar.tsx" $N
# f) l'entrée des quartiers s'ouvre au support
sed -i '' "s#labelKey: 'geoProposals', icon: MapPinned }#labelKey: 'geoProposals', icon: MapPinned, ability: 'platform.moderation.view' }#" $N
npx vitest run $T < /dev/null
cp "$B/SuperAdminSidebar.tsx" $N
md5 -q $L "$B/super-admin-propositions.ts" $C "$B/FileDePropositions.tsx" $N "$B/SuperAdminSidebar.tsx"
```

Attendu (mesuré dans le harnais, sur 22 tests) : a) 2 échecs — les deux `listerPropositions` ;
b) 1 — « TOUTES les pages (Dakar en compte plus de 100) » ; c) 1 — « approuver : … la file est
relue » ; d) 1 — « renommer : … sans espaces autour » ; e) 1 — « les équipements proposés sous
« Tags » » (le lien n'est plus dans le bloc du parent) ; f) 1 — « un support ne les voit pas » ;
`md5` identiques deux à deux.

**Step 10 : signaler**

Signaler : les six fichiers créés, `SuperAdminSidebar.tsx` (co-tenu D, F : préciser les deux
Edits), le test du menu, `feat(web): files de modération des quartiers et des équipements proposés (TCK-633)`.

---

## Tâche 26 — La mention ODbL couvre le référentiel (5 min)

ADR-0062 §3 : « la mention « © les contributeurs d'OpenStreetMap » est due là où le référentiel
est servi. Elle s'ajoute aux pages légales. » Les mentions légales la portent déjà (E-5), mais
pour les **fonds de carte** seulement (`content/legal/notice.ts` L57 en français, L109 en
anglais) ; le wolof retombe sur le français (`wo` vide, L124). La ligne nomme désormais le
référentiel extrait par la tâche 2.

**Fichiers**
- Modifier : `takussan-web/src/content/legal/notice.ts` (L11, L57, L109)
- Créer : `takussan-web/src/content/legal/__tests__/mention-odbl.test.ts`

`__tests__/textes.test.ts` n'est pas touché : il garde la forme des textes (interpolations,
syntaxe, nombre d'articles), et la ligne modifiée ne change aucun des trois.

**Step 1 : sauvegarde**

```bash
mkdir -p "$S/abl/t26" && cp src/content/legal/notice.ts "$S/abl/t26/notice.orig.ts"
```

**Step 2 : le test** — `src/content/legal/__tests__/mention-odbl.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { en, fr } from '@/content/legal/notice';

/**
 * TCK-633 (ADR-0062 §3) — le référentiel des régions, villes et quartiers est extrait
 * d'OpenStreetMap : la mention ODbL lui est due, pas seulement aux fonds de carte. La ligne des
 * crédits nomme donc les DEUX, dans chaque langue publiée.
 */
function ligneOsm(texte: string): string {
  const lignes = texte.split('\n').filter((l) => l.includes('OpenStreetMap'));
  expect(lignes).toHaveLength(1);
  return lignes[0];
}

describe('mentions légales — crédit OpenStreetMap (TCK-633)', () => {
  it('fr : la carte ET le référentiel géographique, sous ODbL', () => {
    const ligne = ligneOsm(fr);
    expect(ligne).toMatch(/référentiel des régions, villes et quartiers/);
    expect(ligne).toMatch(/Open Database License \(ODbL\)/);
  });

  it('en : the map AND the geographic directory, under the ODbL', () => {
    const ligne = ligneOsm(en);
    expect(ligne).toMatch(/region, city and neighbourhood directory/);
    expect(ligne).toMatch(/Open Database License \(ODbL\)/);
  });
});
```

**Step 3 : rouge**

```bash
npx vitest run src/content/legal < /dev/null
```

Attendu (mesuré) : les deux tests neufs rouges, `textes.test.ts` vert (15).

**Step 4 : le texte** — `src/content/legal/notice.ts` :

Edit 1 (L11-11) :

```
old: * cartographiques l'exige.
new: * cartographiques l'exige — et celles du référentiel des régions, villes et quartiers, extrait
 * d'OpenStreetMap (TCK-633, ADR-0062 §3).
```

Edit 2 (L57-57) :

```
old:- Données cartographiques : © les contributeurs d’OpenStreetMap, disponibles sous licence Open Database License (ODbL).
new:- Données cartographiques et référentiel des régions, villes et quartiers : © les contributeurs d’OpenStreetMap, disponibles sous licence Open Database License (ODbL).
```

Edit 3 (L109-109) :

```
old:- Map data: © OpenStreetMap contributors, available under the Open Database License (ODbL).
new:- Map data and the region, city and neighbourhood directory: © OpenStreetMap contributors, available under the Open Database License (ODbL).
```

**Step 5 : vert**

```bash
npx vitest run src/content/legal < /dev/null
```

Attendu (mesuré dans le harnais) : `17 passed (17)`.

**Step 6 : ablations**

```bash
N=src/content/legal/notice.ts && cp $N "$S/abl/t26/notice.nouveau.ts"
# a) l'anglais perd le référentiel
sed -i '' 's/- Map data and the region, city and neighbourhood directory: ©/- Map data: ©/' $N
npx vitest run src/content/legal < /dev/null
cp "$S/abl/t26/notice.nouveau.ts" $N
# b) le français perd le référentiel
sed -i '' 's/^- Données cartographiques et référentiel des régions, villes et quartiers : ©/- Données cartographiques : ©/' $N
npx vitest run src/content/legal < /dev/null
cp "$S/abl/t26/notice.nouveau.ts" $N
md5 -q $N "$S/abl/t26/notice.nouveau.ts"
```

Attendu (mesuré) : a) `1 failed | 16 passed` — « en : … » ; b) `1 failed | 16 passed` — « fr : … » ;
`md5` identiques.

**Step 7 : signaler**

Signaler : `notice.ts`, `mention-odbl.test.ts`,
`docs(legal): la mention ODbL couvre le référentiel géographique (TCK-633)`.

---

## Tâche 27 — La relecture humaine du jeu de données (agent : 15 min ; relecture : une personne, hors délai)

**Cette tâche contient une étape qu'aucun agent ne peut faire : la relecture.** ADR-0062 §3 :
« un jeu extrait automatiquement, relu à la main ». L'agent prépare la feuille de relecture,
applique les corrections DÉCIDÉES par la personne, puis signe en son nom — jamais en celui d'un
agent, jamais avec un nom inventé. Sans relecture, `GeoDatasetReviewedTest` reste rouge et la
branche ne se fusionne pas : c'est le but du test.

**Fichiers**
- Créer : `takussan-api/tests/Unit/Geo/GeoDatasetReviewedTest.php`
- Modifier : `takussan-api/database/data/geo/corrections.json` (tâche 2), puis régénérer `database/data/geo/regions/sn-*.json`
- Outils hors dépôt : `$S/geo-revue.mjs`, `$S/geo-signer.mjs`

**Step 1 : le test** — `tests/Unit/Geo/GeoDatasetReviewedTest.php`. Unitaire pur
(`PHPUnit\Framework\TestCase`, garde `check-test-base-classes` : « unitaire pur, ne démarre pas
l'application ») :

```php
<?php

namespace Tests\Unit\Geo;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-633 (ADR-0062 §3) — le jeu de données du référentiel est extrait d'OpenStreetMap par
 * `database/data/geo/extract.mjs`, puis RELU par une personne avant la fusion.
 *
 * Ce test ne juge pas la justesse d'un nom — c'est la relecture. Il garde deux choses :
 *  1. la relecture a eu lieu, fichier par fichier : `source.relu_par` / `relu_le`. Le script
 *     les remet à `null` à chaque extraction : une ré-extraction annule la relecture, et ce test
 *     redevient rouge — c'est voulu ;
 *  2. ce qu'une relecture à l'œil laisse passer : un slug en double, une coordonnée hors du pays,
 *     une espace en trop, une parenthèse collée (« Golf Sud(Cité Aliou SOW) », relevé le
 *     2026-10-12).
 *
 * Test unitaire pur : il lit des fichiers, ni base ni conteneur.
 */
class GeoDatasetReviewedTest extends TestCase
{
    /** Les 14 régions du Sénégal, codes ISO 3166-2:SN. */
    private const REGIONS = ['dk', 'db', 'fk', 'ka', 'kl', 'ke', 'kd', 'lg', 'mt', 'sl', 'se', 'tc', 'th', 'zg'];

    /** Le cadre du pays — celui de `CADRE_SENEGAL` (front, tâche 16) et du contrôle de la tâche 2. */
    private const LAT_MIN = 12.2;

    private const LAT_MAX = 16.8;

    private const LNG_MIN = -17.6;

    private const LNG_MAX = -11.3;

    private const SLUG = '/^[a-z0-9]+(?:-[a-z0-9]+)*$/';

    private static function dossier(): string
    {
        return dirname(__DIR__, 3).'/database/data/geo/regions';
    }

    /** @return array<string, mixed> */
    private static function lire(string $code): array
    {
        $chemin = self::dossier()."/sn-{$code}.json";
        self::assertFileExists($chemin);

        return json_decode((string) file_get_contents($chemin), true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, array{string}> */
    public static function regions(): array
    {
        return array_combine(self::REGIONS, array_map(fn (string $c) => [$c], self::REGIONS));
    }

    public function test_le_jeu_compte_les_quatorze_regions_et_rien_d_autre(): void
    {
        $fichiers = array_map('basename', glob(self::dossier().'/*.json') ?: []);
        sort($fichiers);
        $attendus = array_map(fn (string $c) => "sn-{$c}.json", self::REGIONS);
        sort($attendus);

        $this->assertSame($attendus, $fichiers);
    }

    #[DataProvider('regions')]
    public function test_chaque_region_est_relue_par_une_personne_nommee_et_datee(string $code): void
    {
        $source = self::lire($code)['source'];

        $this->assertIsString($source['relu_par'], "sn-{$code}.json : relecture humaine absente (tâche 27)");
        $this->assertNotSame('', trim($source['relu_par']));
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', (string) $source['relu_le']);
        $this->assertGreaterThanOrEqual($source['extraite_le'], $source['relu_le'], "sn-{$code}.json : relu AVANT l'extraction qu'il porte");
    }

    #[DataProvider('regions')]
    public function test_chaque_region_tient_le_format(string $code): void
    {
        $jeu = self::lire($code);

        $this->assertSame('SN-'.strtoupper($code), $jeu['region']['code']);
        $this->assertStringContainsString('OpenStreetMap', $jeu['source']['licence']);
        $this->assertNotEmpty($jeu['cities']);

        $defauts = [];
        $this->lieu($jeu['region'], "sn-{$code}", $defauts);
        $villes = [];
        foreach ($jeu['cities'] as $ville) {
            $chemin = "sn-{$code}/{$ville['slug']}";
            $this->lieu($ville, $chemin, $defauts);
            if (isset($villes[$ville['slug']])) {
                $defauts[] = "{$chemin} : ville en double";
            }
            $villes[$ville['slug']] = true;

            $quartiers = [];
            foreach ($ville['neighborhoods'] as $quartier) {
                $this->lieu($quartier, "{$chemin}/{$quartier['slug']}", $defauts);
                if (isset($quartiers[$quartier['slug']])) {
                    $defauts[] = "{$chemin}/{$quartier['slug']} : quartier en double";
                }
                $quartiers[$quartier['slug']] = true;
                if ($quartier['osm'] !== null && preg_match('/^[nwr]\d+$/', (string) $quartier['osm']) !== 1) {
                    $defauts[] = "{$chemin}/{$quartier['slug']} : référence OSM illisible « {$quartier['osm']} »";
                }
            }
        }

        $this->assertSame([], $defauts);
    }

    /**
     * @param  array<string, mixed>  $lieu
     * @param  list<string>  $defauts
     */
    private function lieu(array $lieu, string $chemin, array &$defauts): void
    {
        $nom = (string) $lieu['name'];
        if (preg_match(self::SLUG, (string) $lieu['slug']) !== 1) {
            $defauts[] = "{$chemin} : slug illisible";
        }
        if ($nom === '' || $nom !== trim($nom) || str_contains($nom, '  ')) {
            $defauts[] = "{$chemin} : espaces en trop dans « {$nom} »";
        }
        if (preg_match('/\S\(|\(\s|\s\)/u', $nom) === 1) {
            $defauts[] = "{$chemin} : parenthèse mal espacée dans « {$nom} »";
        }
        $lat = $lieu['latitude'];
        $lng = $lieu['longitude'];
        if (! is_float($lat) && ! is_int($lat) || ! is_float($lng) && ! is_int($lng)
            || $lat < self::LAT_MIN || $lat > self::LAT_MAX || $lng < self::LNG_MIN || $lng > self::LNG_MAX) {
            $defauts[] = "{$chemin} : coordonnées hors du Sénégal";
        }
    }
}
```

**Step 2 : rouge**

```bash
cd "$API" && ./vendor/bin/pint tests/Unit/Geo/GeoDatasetReviewedTest.php && php artisan test tests/Unit/Geo/GeoDatasetReviewedTest.php
```

Attendu : `test_le_jeu_compte_les_quatorze_regions_et_rien_d_autre` vert (tâche 2 a produit les
14 fichiers), les 14 `test_chaque_region_est_relue_…` rouges (`relecture humaine absente
(tâche 27)`), et au moins `test_chaque_region_tient_le_format@dk` rouge sur
`sn-dk/guediawaye/golf-sud-cite-aliou-sow : parenthèse mal espacée dans « Golf Sud(Cité Aliou SOW) »`
— mesuré sur l'extrait du 2026-10-12 de `SN-DK`. Les 13 autres régions ne sont pas encore
extraites à l'heure de ce plan : relever leurs défauts de format dans le rapport.

**Step 3 : la feuille de relecture** — écrire `$S/geo-revue.mjs` (n'écrit rien, lit seulement) :

```js
// TCK-633 (tâche 27) — la FEUILLE DE RELECTURE du référentiel : ce qu'une personne doit trancher,
// région par région. N'écrit rien. Usage : node revue.mjs <dossier des régions>
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dossier = process.argv[2];
const replier = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const SUSPECT = [
  [/\S\(|\(\s|\s\)/, 'parenthèse mal espacée'],
  [/\bcite\b/i, '« cite » sans accent'],
  [/^[a-zà-ÿ]/, 'commence par une minuscule'],
  [/^(?:cité|cite|quartier|zone|extension)$/i, 'nom générique seul'],
];

for (const f of readdirSync(dossier).filter((x) => x.endsWith('.json')).sort()) {
  const jeu = JSON.parse(readFileSync(join(dossier, f), 'utf8'));
  const prefixe = jeu.region.code;
  const lignes = [];
  const parNom = new Map();
  for (const v of jeu.cities) {
    if (v.neighborhoods.length === 0) lignes.push(`  - ville sans quartier : ${v.name} (${prefixe}/${v.slug})`);
    for (const q of v.neighborhoods) {
      const chemin = `${prefixe}/${v.slug}/${q.slug}`;
      if (q.osm === null) lignes.push(`  - ajouté ou regroupé à la main (coordonnées à vérifier) : ${q.name} — ${chemin} (${q.latitude}, ${q.longitude})`);
      for (const [motif, raison] of SUSPECT) if (motif.test(q.name)) lignes.push(`  - ${raison} : « ${q.name} » — ${chemin}`);
      const cle = replier(q.name);
      parNom.set(cle, [...(parNom.get(cle) ?? []), chemin]);
    }
  }
  for (const [, chemins] of parNom) if (chemins.length > 1) lignes.push(`  - même nom (accents et ponctuation repliés) : ${chemins.join(' ; ')}`);
  // Deux graphies d'un même lieu (« Djida » / « Djidah ») : mêmes lettres une fois les « h »
  // retirés. Les numéros (« Maka II » / « Maka III ») ne sont pas des doublons.
  const sansH = new Map();
  for (const [cle, chemins] of parNom) {
    const k = cle.replaceAll('h', '');
    sansH.set(k, [...(sansH.get(k) ?? []), ...chemins.map((c) => [cle, c])]);
  }
  for (const [, paires] of sansH) {
    if (new Set(paires.map(([cle]) => cle)).size > 1) lignes.push(`  - graphies voisines : ${paires.map(([, c]) => c).join(' ; ')}`);
  }
  const quartiers = jeu.cities.reduce((n, v) => n + v.neighborhoods.length, 0);
  console.log(`${f} — ${jeu.region.name} : ${jeu.cities.length} villes, ${quartiers} quartiers, relu_par=${jeu.source.relu_par ?? 'personne'}`);
  console.log(lignes.length ? lignes.join('\n') : '  (rien de mécanique à signaler — la liste se relit quand même)');
}
```

```bash
node "$S/geo-revue.mjs" database/data/geo/regions > "$S/geo-revue.txt"; head -20 "$S/geo-revue.txt"
```

Attendu, pour `sn-dk.json` (mesuré sur l'extrait du 2026-10-12) : `13 villes, 198 quartiers,
relu_par=personne`, puis 30 lignes — 4 villes sans quartier (Bambylor, Sébikhotane, Sendou,
Yenne), 10 lignes posées à la main (Liberté 1 à 6, Sicap Baobab, Rufisque Est, Nord et Ouest),
13 « cite » sans accent, 1 parenthèse mal espacée (Golf Sud), 1 même nom dans deux villes
(`SN-DK/dakar/dalifort` ; `SN-DK/pikine/dalifort`), 1 paire de graphies voisines
(`SN-DK/pikine/djida-thiaroye-kaw` ; `SN-DK/pikine/djidah-thiaroye-kaw`).

**Step 4 : ⚠ ÉTAPE HUMAINE — la relecture**

Remettre `$S/geo-revue.txt` à la session, qui la porte à une personne (le porteur du produit, ou
qui il désigne). **L'agent s'arrête ici** et marque la tâche `en_attente_relecture` dans le
rapport. La personne relit les 14 régions — la feuille dit où regarder d'abord, pas où s'arrêter
— et rend ses décisions sous la forme des clés de `corrections.json` (tâche 2 : `renommer`,
`retirer`, `ajouter`, `villes`, `regrouper` ; chemins `<RÉGION>/<ville>/<quartier>`, slugs
AVANT correction).

Les points déjà relevés, à trancher par elle (propositions, pas décisions) :

| Chemin | Constat | Proposition |
|---|---|---|
| `SN-DK/guediawaye/golf-sud-cite-aliou-sow` | « Golf Sud(Cité Aliou SOW) » | `renommer` → « Golf Sud (Cité Aliou Sow) » |
| `SN-DK/dakar/hlm-grand-yoff-ii-cite-assane-diop` (et les 12 autres « cite ») | accent manquant | `renommer` → « … (Cité Assane Diop) », etc. |
| `SN-DK/dakar/hlm-grand-yoff` | « Hlm Grand Yoff », à côté de « HLM Grand Yoff I, II, III » | `retirer`, ou `renommer` → « HLM Grand Yoff » |
| `SN-DK/dakar/bgazelle-i` | « Bgazelle I » : coquille probable d'OSM | `renommer` ou `retirer` |
| `SN-DK/pikine/djida-thiaroye-kaw` / `djidah-thiaroye-kaw` | deux graphies d'une même commune | `retirer` l'une |
| `SN-DK/dakar/dalifort` / `SN-DK/pikine/dalifort` | Dalifort est une commune de Pikine | `retirer` celle de Dakar, ou garder les deux |
| Liberté 1 à 6, Sicap Baobab | coordonnées posées à la main (4 décimales, `corrections.json` → `ajouter`) | vérifier sur une carte, corriger dans `ajouter` |
| Bambylor, Sébikhotane, Sendou, Yenne | villes sans quartier | accepter (un quartier s'y propose depuis le formulaire) ou `ajouter` |

**Step 5 : appliquer les décisions** (agent, après retour de la session)

Écrire les clés décidées dans `corrections.json` (Edit), puis rejouer chaque région touchée SANS
réseau, depuis les réponses brutes gardées à la tâche 2 :

```bash
cd "$API"
node database/data/geo/extract.mjs --region=SN-DK --depuis="$S/geo-brut"
node "$S/geo-revue.mjs" database/data/geo/regions | grep -c '^  - '
```

puis rejouer le contrôle mécanique de la tâche 2 (Step 6) : `0 défaut(s)`. Une ré-extraction
remet `relu_par` à `null` (tâche 2, `fichier()`) : c'est voulu, la signature vient APRÈS.

**Step 6 : signer** — écrire `$S/geo-signer.mjs` :

```js
// TCK-633 (tâche 27) — signe la relecture de fichiers de région : `node signer.mjs "<nom>" <fichier>...`
// N'écrit que `source.relu_par` et `source.relu_le` ; la mise en forme est celle d'`extract.mjs`.
import { readFileSync, writeFileSync } from 'node:fs';

const [nom, ...fichiers] = process.argv.slice(2);
if (!nom || nom.trim() === '' || fichiers.length === 0) {
  console.error('usage : node signer.mjs "<prénom nom>" <fichier.json>...');
  process.exit(2);
}
const aujourdhui = new Date().toISOString().slice(0, 10);
for (const f of fichiers) {
  const jeu = JSON.parse(readFileSync(f, 'utf8'));
  jeu.source.relu_par = nom.trim();
  jeu.source.relu_le = aujourdhui;
  writeFileSync(f, JSON.stringify(jeu, null, 2) + '\n');
  console.log(`✓ ${f} : relu par ${jeu.source.relu_par} le ${aujourdhui}`);
}
```

```bash
node "$S/geo-signer.mjs" "<prénom et nom de la personne qui a relu>" database/data/geo/regions/sn-*.json
```

⚠ Le nom est celui que la session a transmis. Une région que la personne n'a pas relue ne se
signe pas : la passer en argument seulement si elle l'a été.

**Step 7 : vert**

```bash
php artisan test tests/Unit/Geo/GeoDatasetReviewedTest.php
php artisan test tests/Feature/Geo/GeoReferentialSeederTest.php
```

Attendu : `29 passed` (1 + 14 + 14) — mesuré `OK (29 tests, 155 assertions)` sur un jeu de 14
copies signées de l'extrait `SN-DK` corrigé ; puis le chargement vert (la tâche 4 lit des
fixtures, pas le jeu : il ne doit pas bouger).

**Step 8 : ablations**

```bash
D=database/data/geo/regions && mkdir -p "$S/abl/t27" && cp $D/sn-dk.json $D/sn-th.json "$S/abl/t27/"
T=tests/Unit/Geo/GeoDatasetReviewedTest.php
# a) une région n'est plus signée
node -e 'const fs=require("fs");const f=process.argv[1];const j=JSON.parse(fs.readFileSync(f,"utf8"));j.source.relu_par=null;j.source.relu_le=null;fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")' $D/sn-th.json
php artisan test $T; cp "$S/abl/t27/sn-th.json" $D/
# b) un quartier repasse hors du pays
node -e 'const fs=require("fs");const f=process.argv[1];const j=JSON.parse(fs.readFileSync(f,"utf8"));const v=j.cities.find(c=>c.neighborhoods.length>0);v.neighborhoods[0].latitude=17.2;fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")' $D/sn-dk.json
php artisan test $T; cp "$S/abl/t27/sn-dk.json" $D/
# c) un quinzième fichier
cp $D/sn-dk.json $D/sn-xx.json; php artisan test $T; rm $D/sn-xx.json
md5 -q $D/sn-dk.json "$S/abl/t27/sn-dk.json" $D/sn-th.json "$S/abl/t27/sn-th.json"
```

Attendu (mesuré sur le jeu d'essai) : a) 1 échec — `…relue_par_une_personne…@th` ; b) 1 échec —
`…tient_le_format@dk` (`coordonnées hors du Sénégal`) ; c) 1 échec — `…quatorze_regions…` ;
`md5` identiques deux à deux ; `ls $D | wc -l` → 14.

**Step 9 : signaler**

Signaler : `tests/Unit/Geo/GeoDatasetReviewedTest.php`, `database/data/geo/corrections.json`,
`database/data/geo/regions/sn-*.json` (14),
`chore(data): référentiel géographique relu par <nom> (TCK-633)`. Les deux outils de `$S` ne se
commitent pas.

---

## Tâche 28 — Vérifications finales et rapport (15 min)

Rien de neuf : rejouer ce que les tâches ont déjà vérifié une à une, ensemble, sur l'arbre où les
autres lots ont aussi travaillé. **Pas la suite entière** (contrainte 5) : c'est la session qui la
lance, une fois, à la fin.

**Step 1 : la charge**

```bash
uptime && sysctl -n hw.ncpu
```

Noter les trois moyennes dans `tests.charge`. Au-dessus de 16 : relever `ps -Ao pcpu,comm -r | head`
avant d'interpréter un rouge.

**Step 2 : le back**

```bash
cd "$API"
./vendor/bin/pint --test --dirty
php artisan test tests/Feature/Geo tests/Feature/Tags tests/Unit/Geo tests/Unit/Services/Geo tests/Unit/Services/Property/CoutDEntreeConcordanceTest.php
php artisan test tests/Feature/Api/Property/PropertyNumericBoundsTest.php tests/Feature/Api/Property/PropertyCurrencyForcedTest.php tests/Feature/Api/Property/AgencyFeeIndividualTest.php tests/Feature/Api/Property/PropertyEntryCostAndTourTest.php tests/Feature/Api/Property/PropertyWritableFieldsTest.php tests/Feature/Api/PropertyCrudTest.php tests/Feature/Api/PropertyTagsTest.php tests/Feature/Api/TagTest.php tests/Feature/Api/TagWriteAuthorizationTest.php tests/Feature/Search/SearchServiceGeoTest.php tests/Feature/Seeders/FilterCoverageTagsTest.php tests/Feature/Public/PropertyResourceSparseFieldsTest.php tests/Feature/Admin/Platform/PlatformRoutesDefaultDenyTest.php tests/Unit/Lang/LangGroupParityTest.php
php bin/impacted-tests.php --run
```

Attendu : Pint `--test` muet sur les fichiers de D (`--dirty` liste aussi ceux des autres lots :
ne corriger QUE ceux de D, signaler les autres) ; tout vert. `impacted-tests` : vert, et un vert
ici ne dit rien de la suite (CLAUDE.md).

**Step 3 : le front**

```bash
cd "$WEB"
npx tsc --noEmit
npm run lint
npm run check:i18n
node scripts/check-i18n-namespaces.mjs --update && node scripts/check-i18n-namespaces.mjs
npx vitest run src/components/property-form src/components/ui src/components/map src/lib src/components/admin/super src/components/admin-tags src/components/layout src/content/legal "src/app/(dashboard)/app/properties/new" < /dev/null
```

Attendu : `tsc` muet ; ESLint 0 erreur ; `check:i18n` vert ; la garde des espaces verte après
`--update` (⚠ `src/i18n/namespaces.json` est hors territoire : le signaler, avec son diff) ; vitest
vert — mesuré dans le harnais : `property-form` + `ui` 243 tests, les files et le menu 41,
`admin-tags` 6, `content/legal` 17.

**Step 4 : les gardes du dépôt**

```bash
cd "$R"
for g in scripts/check-*.mjs; do node "$g" > /dev/null 2>&1 || echo "✗ $g"; done
node docs/backlog/gen-index.mjs --check
```

Attendu : **une seule** ligne `✗ scripts/check-models-spec.mjs` — `GeoRegion`, `GeoCity`,
`GeoNeighborhood` ne sont pas encore dans `docs/models-spec.md` (E-34). Toute autre ligne `✗` :
relancer la garde seule, copier sa sortie dans `collisions`.

**Step 5 : le rapport** — `docs/plans/rapports/tck-633-lot-d.json` (outil Write), le verdict en
premier :

```json
{
  "verdict": "PRET | PRET_AVEC_RESERVES | BLOQUE",
  "fichiers": { "crees": [], "modifies": [], "hors_territoire": [] },
  "tests": { "charge": "", "api": [], "web": [], "commandes": [] },
  "ablations": [
    { "tache": 1, "fichier": "", "mutation": "", "rouge_observe": "", "md5_restaure": true }
  ],
  "jeu_de_donnees": { "regions": 14, "villes": 0, "quartiers": 0, "relu_par": "", "relu_le": "" },
  "ecarts_au_ticket": [],
  "collisions": []
}
```

Remplir chaque tableau de ce qui a été **exécuté** (sortie relevée), jamais de ce plan. Le verdict
est `BLOQUE` tant que la tâche 27 attend sa relecture. `collisions` reçoit : chaque fichier ⚠ HORS
TERRITOIRE avec la réponse de la session, `namespaces.json`, `check-models-spec`, et toute
reformulation par Pint d'un fichier co-tenu.

**Step 6 : message final**, une ligne :
`lot D : <verdict>, <N> tests neufs verts, <M> ablations rejouées, rapport docs/plans/rapports/tck-633-lot-d.json`.

---

## Écarts relevés

Ce que la lecture du code a rendu, et qui diffère du ticket, du plan maître ou d'une hypothèse
naturelle. Chaque écart porte sa source ; les tâches y renvoient. À recopier dans
`ecarts_au_ticket` du rapport, complété de ce que l'exécution aura trouvé en plus.

**E-1 — L'étage accepte déjà un sous-sol ; le vrai défaut est le 500.** Les colonnes sont
`unsignedSmallInteger` / `unsignedTinyInteger` (`2026_04_17_160005_create_properties_table.php`
L28-34) : PostgreSQL n'a pas de non-signé, ce sont des `smallint` signés, et `floor_number = -1`
passe aujourd'hui. Le défaut réel : `parking_spaces = 40000` déborde la colonne et rend **500** au
lieu de 422 (`StorePropertyRequest` L65, L66, L70 sans borne). Tâche 8.

**E-2 — La production ne lance aucun seeder.** Un `GeoReferentialSeeder` seul laisserait la
production sans référentiel : le chargement passe aussi par la commande idempotente
`geo:sync-referential` (et `tags:sync-catalog`), ajoutées à `docker/release.sh` (⚠ hors
territoire). La migration ne charge rien : une migration qui insère casserait toute suite qui
compte des lignes. Tâches 4 et 10.

**E-3 — La route des étiquettes d'un bien est `POST`, pas `PUT`.** `routes/api/properties.php` L70.
Tâche 21.

**E-4 — La page super-admin des tags existe déjà** (`app/(super-admin)/super-admin/tags/page.tsx`,
`TagsManager`), et le front n'appelle jamais `/api/admin/*` directement : le relais
`app/api/super-admin/[...path]/route.ts` y préfixe `admin/`. La file des équipements est donc une
page ENFANT (`tags/proposals`), à côté de la page existante, non touchée. Tâche 25.

**E-5 — La mention ODbL existe déjà dans les mentions légales**, pour les fonds de carte
(`content/legal/notice.ts` L57, L109) : la tâche 26 l'étend au référentiel au lieu d'en écrire une.
Même section du ticket : un lien court Google suivi depuis l'Europe passe par
`consent.google.com` ; le résolveur lit son paramètre `continue` sans requête (tâche 7).

**E-6 — Deux docblocks interdisaient le total de l'aperçu.** `ApercuAnnonce` (L28-31) et son test
(L75-85) portaient la règle de TCK-598 (« aucun écran ne refait l'addition »). Elle est levée pour
l'aperçu seul, et la note affichée le dit (« l'annonce publiée fait foi »). Tâches 14 et 22.

**E-7 — Le paquet `open-location-code` est écarté** : 1.0.3, CommonJS, sans types, inchangé
depuis 2022. Le décodage des Plus Codes tient en 85 lignes, éprouvées contre l'implémentation de
référence. Tâche 16.

**E-8 — La base de développement ne contient qu'un pays et dix villes.** Mesuré le 2026-10-12
(lecture seule) : 820 adresses, 10 villes distinctes (Dakar 500, Kaolack 47, Thiès 41,
Saint-Louis 41, Diourbel 37, Louga 36, Rufisque 32, Touba 31…), 22 quartiers distincts, toutes en
`SN` ; 836 biens, tous en `XOF`. D'où les corrections « Rufisque » (regroupement des trois
communes) et « Touba » (tâche 2), sans lesquelles des adresses de dev resteraient sans
rattachement.

**E-9 — L'extraction dépend d'Overpass, service tiers.** Il refuse (406) une requête sans
User-Agent et rend souvent 504 / 500 sous charge : le script réessaie, garde les réponses brutes
(`--brut`) et rejoue sans réseau (`--depuis`). User-Agent : `takussan-geo-extract/1.0
(+https://www.takussan.com)` — **aucune adresse e-mail** dans un en-tête envoyé à un tiers.
Tâche 2.

**E-10 — Les étiquettes `feature` avaient des lecteurs, et deux équipements invisibles.** Le
formulaire n'affichait que les `amenity` (`SyncPropertyTagRequest` n'accepte qu'eux) : Piscine et
Climatisation, rangées en `feature`, étaient impossibles à cocher ; `PropertyAmenities.tsx` L8
les filtrait aussi à l'affichage. La migration de la tâche 10 les fusionne dans `amenity`.

**E-11 — L'écran d'édition n'est attribué à aucun lot.** `PropertyForm.tsx` n'apparaît pas dans
la table du plan maître, alors que le ticket vaut « à la création ET à l'édition » (AC9, AC10).
Tâche 23, hors territoire. Les endpoints publics existants (recherche, filtres) restent : leur
évolution est au lot E.

**E-12 — Le territoire du plan maître ne suffit pas.** Fichiers EXISTANTS que D doit modifier sans
qu'aucune ligne du plan maître les lui attribue (aucun n'est tenu par un autre lot, vérifié contre
la table) — demande d'extension à faire en tâche 0 :

| Côté | Fichiers | Tâches |
|---|---|---|
| API | `app/Models/Address.php`, `app/Models/Tag.php`, `app/Http/Controllers/Api/TagController.php`, `app/Http/Requests/Api/StoreTagRequest.php`, `UpdateTagRequest.php`, `app/Http/Controllers/Api/PropertyTagController.php`, `app/Http/Resources/PropertyResource.php`, `docker/release.sh`, `tests/Feature/Seeders/FilterCoverageTagsTest.php` | 3, 4, 10, 11, 13 |
| Front, code | `components/property-form/PropertyForm.tsx`, `app/(dashboard)/app/properties/new/page.tsx`, `app/actions/dashboard-properties.ts`, `lib/queries/properties-server.ts`, `types/property.ts`, `types/tag.ts`, `lib/schemas/tag.ts`, `components/admin-tags/TagsManager.tsx`, `i18n/namespaces.json` (régénéré) | 14, 20, 21, 23, 24, 28 |
| Front, tests existants | `property-form/__tests__/{wizard-steps,abonnement-des-etapes,cibles-tactiles,PropertyForm,StepBien,ApercuAnnonce}.test.tsx`, `admin-tags/__tests__/TagsManager.test.tsx` | 14, 19–24 |
| Front, neufs hors des dossiers de D | `src/test/doublure-referentiel-geo.ts` (doublure partagée par six tests) | 19 |
| i18n | clés hors de l'espace de D : `nav.superAdmin.items.*`, `property.wizard.*` | 14 |

`components/map/LocationPickerMap.tsx` est, lui, au territoire de D (plan maître) ; ses tests le
sont aussi.

**E-13 — Le contrat de `resolve-link`.** `POST /api/geo/resolve-link {url}` → `200 {data:{latitude,
longitude, outside_senegal}}` ou `422 {code:'geo.link_unresolved'}`, authentifié, 20 appels par
minute. Enveloppe `data` comme le reste de l'API. Tâches 7 et 19.

**E-14 — `?region=`, `?city=`, `?q=` ne sont pas des filtres spatie.** Les endpoints publics du
référentiel sont des listes fermées, non paginées, à forme fixe : ni `fields[]` ni `include=` à
négocier, et un `filter[…]` y serait une promesse que rien ne tient. Tâches 5 et 19.

**E-15 — `property.form.address` n'existait pas** : l'espace est créé par la tâche 14.

**E-16 — `property.wizard.geoDefaultsNote` annonçait « le pays et la devise »** : la devise ne se
devine plus, la note est remplacée (et son test, `StepBien.test.tsx` L123-126). Tâche 14.

**E-17 — La géo-IP peut poser `country = FR`** (un propriétaire de la diaspora). Une adresse
rattachée au référentiel reçoit `SN` du serveur (tâche 3, `GeoAddressCanonicalizer`) ; une
adresse hors référentiel garde son pays.

**E-18 — Le slug PHP et le slug du script divergent sur l'apostrophe** : `Str::slug("Patte d'Oie")`
→ `patte-doie`, le script → `patte-d-oie`. Le chargement retrouve une ligne par son slug PUIS par
son nom replié. Tâche 4.

**E-19 — XOF est imposé aussi à la modification**, pas seulement à la création : aucun bien
non-XOF en développement (E-8), aucune API en production (CLAUDE.md) — rien à migrer. Tâche 8.

**E-20 — Trois conséquences assumées de la modération des équipements.** Un nom que le catalogue
a REFUSÉ reste refusé (le catalogue ne ressuscite pas un refus, tâche 10) ; un nom refusé, retapé
dans le formulaire, est ignoré sans message (tâche 11) ; une proposition est visible sur la fiche
du bien avant modération — c'est la règle des quartiers proposés (ADR-0062), étendue.

**E-21 — Cinq choix de mise en œuvre.** La course de deux propositions du même quartier est
sérialisée par un verrou sur la ligne de la VILLE (piège PostgreSQL n° 2) ; F co-tient
`UpdatePropertyRequest` (`featured`, `prepareForValidation`) : Edit par blocs ancrés seulement ;
le `Combobox.Trigger` est retiré (un `aria-expanded` de plus par champ cassait les tests du
parcours) ; sous jsdom, Échap est nécessaire pour éprouver la garde de raison ;
`superAdmin.propositions` remplace les espaces `superAdmin.geo` / `superAdmin.tags` du plan maître.

**E-22 — `feature` survit dans deux fichiers de test-données.** `FilterCoverageSeeder::PROPERTY_TAG_TYPES`
(L78) le garde, et `TagFactory` le tire encore : inoffensif (aucune ligne ne porte plus ce type
après la migration), non corrigé ici. Tâche 10.

**E-23 — Le wolof est un brouillon.** Les valeurs `wo` de la tâche 14 évitent le repli silencieux
sur le français ; elles demandent une relecture par un locuteur.

**E-24 — Des clés i18n et un champ perdent leur lecteur, sans être supprimés** :
`property.wizard.fields.{city,quarter,region,currency}`,
`property.wizard.placeholders.{city,quarter,region,yearBuilt,parking}`,
`property.form.fields.{city,quarter,region,cityPlaceholder,quarterPlaceholder,regionPlaceholder,currency}`,
`property.form.location.gps` ; et `useGeoSuggestion` (`hooks/useGeoSuggestion.ts` L49-50) produit
encore `defaults.currency`. Dictionnaires co-tenus : le ménage est à la session.

**E-25 — Une liste vide reste fermée.** Ouverte, la liste de Base UI rend le reste de la page
`aria-hidden` (gestion modale du focus) : un référentiel indisponible laisserait un champ
inutilisable. Tâche 15.

**E-26 — Échap vidait la sélection.** Base UI vide la valeur sur Échap liste fermée
(`input/ComboboxInput.js` L312-321) ; la garde `reason === 'escape-key'` l'empêche. Tâche 15.

**E-27 — Latitude et longitude restent visibles et saisissables**, sous la position collée, par
un `Controller` et non `FormInput` : `FormInput` numérique transformait `''` en `0`, soit un point
dans le golfe de Guinée. Tâche 19.

**E-28 — La garde d'abonnement des étapes est étendue** aux composants neufs (`ChampsLieu`,
`ChampEquipements`, `NombreEnListe`). Tâches 19 et 20.

**E-29 — `StepBien.test` et `ApercuAnnonce.test` bougent dès la tâche 14** : ils citent mot pour
mot les deux libellés remplacés.

**E-30 — `types/tag.ts` passe de la tâche 24 à la tâche 20** : `ChampEquipements` lit
`tag.status`.

**E-31 — Le test de l'étage à 500 passe par un brouillon**, non par la saisie : l'étage se choisit
désormais dans une liste bornée (sous-sol à 40), et un brouillon repris est le seul chemin qui
apporte une valeur hors bornes. Le test (`PropertyWizard.test.tsx`, « ne déclenche à l'étape 3 que
les champs que la MATRICE juge pertinents ») éprouve la validation de l'étape, pas la saisie.
Tâche 20.

**E-32 — Puces et croix « Retirer » à 44 px.** La garde `cibles-tactiles` (TCK-468) mesure les
pastilles d'équipements de l'édition ; les puces du `Combobox` passent à `min-h-11` et leur croix
à `size-11`, et le test de la garde mesure désormais un équipement RETENU. Tâches 15 et 23.

**E-33 — Deux conséquences du XOF imposé côté front.** Un brouillon enregistré en EUR est remis
en XOF au rechargement (`PropertyWizard`, tâche 21) ; à l'édition, `CHAMPS_ADRESSE_EFFACABLES`
(`PropertyForm.tsx` L133-142) ne change pas — un quartier vidé part en `null`, et le serveur
détache alors l'identifiant (tâche 3, règle 2).

**E-34 — `check-models-spec` rougit, et la CI du dépôt avec.** Trois modèles neufs (`GeoRegion`,
`GeoCity`, `GeoNeighborhood`) ne sont pas mentionnés dans `docs/models-spec.md` ; un lot qui
implémente ne modifie pas les specs (`/implement-spec`). La session lance `/sync-specs` **avant**
la PR : sans cela, `repo-ci` est rouge. Tâches 1 et 28.

**E-35 — Dakar compte plus de quartiers qu'une page d'API.** 151 quartiers approuvés au jeu
extrait (tâche 2), `HasQueryBuilder::PER_PAGE_MAX = 100` (L47) : la liste des cibles de fusion lit
toutes les pages. Tâche 25.

**E-36 — L'extrait d'OSM porte des défauts de forme, et un test les arrête.** Sur `SN-DK` le
2026-10-12 : « Golf Sud(Cité Aliou SOW) », treize « cite » sans accent, deux graphies de Djidah
Thiaroye Kao, Dalifort dans deux villes, quatre villes sans quartier, dix lieux posés à la main.
`GeoDatasetReviewedTest` arrête les défauts mécaniques et l'absence de relecture ; le reste est la
relecture humaine (tâche 27).

---

## Collisions et fichiers partagés

Ce que la session doit savoir AVANT de commiter, lot par lot.

| Fichier | Autre lot | Ce que D y fait | Règle |
|---|---|---|---|
| `app/Http/Requests/Api/StorePropertyRequest.php`, `app/Http/Requests/UpdatePropertyRequest.php` | F (`featured`, `prepareForValidation`) | bornes, adresse `geo_*`, XOF, frais d'un indépendant | Edit par blocs ancrés ; relire si Edit signale un changement |
| `lang/{fr,en,wo}/errors.php` | tous | blocs `geo` (avant `'guarantor' => [`) et `tags` (avant `'task' => [`) | Edit seulement |
| `database/seeders/YearOfActivitySeeder.php` | « System/* d'appel » | une ligne `GeoReferentialSeeder::class` | Edit seulement |
| `components/property-form/PropertyWizard.tsx` + son test | C | prop `fraisDAgence`, envoi des tags, devise non devinée | Edit seulement, 7 blocs |
| `components/layout/SuperAdminSidebar.tsx` | F | deux entrées (`geo`, enfant `tags/proposals`) | Edit seulement, 2 blocs |
| `messages/{fr,en,wo}.json` | tous | clés de D, plus `nav.superAdmin.items.*` et `property.wizard.*` hors espace | script idempotent de la tâche 14, refuse d'écraser |
| `i18n/namespaces.json` | tous | régénéré par `check-i18n-namespaces --update` | à commiter en dernier, régénéré sur l'arbre final |
| `docs/models-spec.md` | session | rien (E-34) | `/sync-specs` avant la PR |

Hors territoire (E-12) : la liste complète est en E-12. Pour chacun, sans accord de la session,
la tâche s'arrête et le diff exact part dans `collisions`.

Migrations : D prend `2026_10_12_4000xx` à `4002xx` ; si un autre lot a pris le préfixe
`2026_10_12_4`, décaler en `2026_10_12_45xxxx` (tâche 0, Step 2).
