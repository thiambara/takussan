# TCK-633 — Plan maître d'implémentation

> **Pour les agents :** ce document est le plan **maître**. Il fixe les territoires, les interfaces
> entre lots, l'ordre et les règles de l'arbre partagé. Le détail de chaque lot — tâches TDD, code,
> commandes — vit dans son plan de lot (§ Plans de lot). Compétence d'exécution :
> `superpowers:subagent-driven-development`. Cases `- [ ]` pour le suivi.

**Objectif :** livrer TCK-633 (neuf retours du porteur) en six lots parallèles sur une seule
branche, sans conflit, chacun prouvé par ses tests et une vérification adverse.

**Architecture :** une branche `feat/tck-633-lot-retours-porteur`, un **arbre partagé** : les agents
éditent, la session principale commite par lot avec des pathspecs. Les décisions structurelles sont
dans [ADR-0061](../adr/0061-credits-d-espace-et-boost-des-annonces.md) et
[ADR-0062](../adr/0062-referentiel-geographique-region-ville-quartier.md) ; le delta et les AC dans
[TCK-633](../backlog/tickets/TCK-633-lot-retours-porteur-publication-recherche-boost.md).

**Pile :** Laravel 13 / PHP 8.4 / PostgreSQL 17 / Meilisearch (Scout) — Next.js 16 / React 19 /
TypeScript 5 / Tailwind 4 / next-intl / `@base-ui/react` / vitest.

## Contraintes globales

- Le ticket TCK-633 et les ADR-0061 / 0062 font foi ; **re-mesurer chaque affirmation** du ticket
  avant de coder, et écrire dans le rapport ce qui différait.
- `takussan-api/CLAUDE.md` et `takussan-web/CLAUDE.md` s'appliquent (enveloppe JSON, `HasQueryBuilder`,
  `apiFetch` vs `apiRequest`/`useApiQuery` et le préfixe `/api`, sparse fieldsets, base-ui sans Radix).
- PostgreSQL : pièges 1 à 9 du `CLAUDE.md` racine (transaction abandonnée, `FOR UPDATE` sur la
  ligne parent, noms d'index ≤ 63 caractères **explicites**, `jsonb`, longueur `VARCHAR` appliquée,
  `CaseInsensitive::sql()`/`fold()` par paire). Jamais `enum()` en migration (ADR-0007).
- Erreurs d'API : `abort_code` / `abort_code_if` avec une clé de `lang/{fr,en,wo}/errors.php`.
- Le front possède le texte : toute chaîne visible passe par next-intl, en **fr, en et wo** ;
  `npm run check:i18n` vert. Vouvoiement dans l'interface.
- Montants : décimal en base, ×100 à la frontière du driver. **Les crédits sont des entiers et ne
  passent jamais par ×100.**
- Chaque test neuf **échoue sans son correctif** (ablation rejouée, écrite dans le rapport).
- Pint avant chaque commit backend (`./vendor/bin/pint`), `npx tsc --noEmit` et `npm run lint`
  avant chaque commit front.
- Messages de commit en français, préfixe conventionnel, `(TCK-633)`, et les deux lignes
  d'attribution de session.

## Règles de l'arbre partagé (non négociables)

1. **Aucune commande git qui écrit** pour un agent : ni `add`, `commit`, `checkout`, `stash`,
   `restore`, `reset`, `switch`, `merge`, `push`. Les agents éditent ; la session commite.
2. **Un agent ne touche que son territoire** (§ Territoires). Un fichier hors territoire dont il a
   besoin → champ `collisions` de son rapport, jamais une édition.
3. **Fichiers co-tenus** (§ Fichiers co-tenus) : édités **uniquement avec l'outil Edit**, par petits
   blocs ancrés sur un texte stable ; jamais par un script, `sed`, ou une réécriture complète
   (`Write`). Si Edit signale que le fichier a changé, **relire puis rejouer** l'édition.
4. **Dictionnaires i18n** (`takussan-web/src/messages/{fr,en,wo}.json`) : chaque lot écrit sous
   **son propre espace de clés** (§ Territoires) ; insertion par Edit, jamais de reformatage du
   fichier. Une clé existante d'un autre espace ne se modifie pas : `collisions`.
5. **Documents partagés à écrivain unique** : `docs/models-spec.md`, `docs/features.md`, le ticket,
   `INDEX.md`, `CLAUDE.md`, `docs/ardoise.md` — **personne** pendant les lots ; l'étape
   d'intégration (§ Étape 3) les écrit seule.
6. **Tests** : un agent ne lance que ses classes (`php artisan test <fichier>`,
   `npx vitest run <fichier>`) ou `php bin/impacted-tests.php --run`. **Jamais la suite entière.**
   Une commande de plus de 10 minutes ne se lance pas dans un agent.
7. **Ablation** : restaurer par `cp` depuis le scratchpad et prouver par `md5` — jamais
   `git checkout`, qui écraserait les autres lots.
8. **Rapport** : écrit dans `docs/plans/rapports/tck-633-lot-<x>.json` (outil Write), **verdict en
   premier**, puis `fichiers`, `tests`, `ablations`, `ecarts_au_ticket`, `collisions`. Le message
   final de l'agent ne fait qu'**une ligne**.

## Territoires

| Lot | Contenu (ticket) | Fichiers tenus seul | Espace i18n |
|---|---|---|---|
| **A** | Déconnexion n'est PAS ici (lot B) ; Louer avant Acheter (sélecteur, menu mobile) ; texte de suppression ; filigrane | `components/search/SelecteurDeTransaction.tsx`, `data/navigation.ts`, `app/Services/Media/**`, `app/Listeners/Media/**`, `app/Jobs/Media/**`, `app/Support/**Watermark**`, `PublicPhotoUrl`, `app/Console/Commands/Media/RegenerateWithoutWatermark*.php`, `tests/Feature/Media/WatermarkGlobalFlagTest.php` | `property.dashboard.actions.delete*` (modification de valeurs), `nav.*` (ordre seul) |
| **B** | Accès admin dynamique ; **déconnexion vers l'accueil** | `components/layout/AdminSidebar.tsx`, `UserMenu.tsx`, `AdminShell.tsx`, `lib/access/**`, `app/(dashboard)/admin/**` (pages et layout), `components/profile/ProfileAdminSection.tsx`, `components/dashboard/DashboardShortcuts.tsx`, `DashboardEmpty.tsx`, `NoAgencyState.tsx`, `scripts/check-pro-routes.mjs` | `admin.nav.*`, `profile.admin.*` |
| **C** | Création automatique, second numéro, WhatsApp, coordonnées à la publication, CGU, contacts sur place | `app/Http/Controllers/HostAutoOnboardController.php`, `app/Services/Onboarding/**`, `routes/api/onboarding.php`, `app/Http/Controllers/Api/Auth/SecondaryPhoneController.php`, `app/Services/Auth/PhoneVerificationService.php`, `routes/api/auth.php`, `UpdateProfileRequest`, `app/Models/PropertyContact.php`, `PropertyContactController`, `app/Services/Property/PublishReadiness.php`, `PrimaryPropertyContact`, `app/publish/**`, `hooks/usePublishIntent.ts`, `components/profile/ProfileContactSection.tsx`, `components/profile/security/**`, `PropertyAgentCard.tsx`, `components/contact/**`, `wizard/steps/StepFinition.tsx` | `profile.contact.*` (ajouts), `publish.*`, `property.contacts.*`, `property.form.publishContact.*` |
| **D** | Référentiel géographique, résolveur de liens, formulaire (adresse, nombres, équipements, XOF, frais d'agence, total dans l'aperçu), modération des quartiers et des équipements | `app/Models/Geo*.php`, `app/Http/Controllers/**/Geo*`, `app/Services/Geo/**`, `routes/api/geo.php` (nouveau), `database/data/geo/**`, `database/seeders/**/Geo*`, `TagSeeder`, `routes/api/tags.php`, `SyncPropertyTagRequest`, `CoutDEntree.php`, `components/ui/combobox.tsx` (nouveau), `wizard/steps/StepLieu.tsx`, `StepCaracteristiques.tsx`, `StepPrix.tsx`, `wizard/ApercuAnnonce.tsx`, `lib/schemas/property.ts`, `components/property-form/field-matrix.ts`, `payload.ts`, `components/map/LocationPickerMap.tsx`, pages super-admin `geo/**` et `tags/**` (nouvelles) | `property.form.address.*`, `property.form.features.*`, `amenities.*`, `superAdmin.geo.*`, `superAdmin.tags.*` |
| **E** | Filtres (après D) ; Louer avant Acheter **dans le panneau de filtres** | `components/search/FilterSidebar.tsx`, `SearchToolbar.tsx`, `types/search.ts`, `lib/recherche-publique.ts`, `hooks/useSearch.ts`, `MapPublicPropertyRequest.php`, `SearchPublicPropertyRequest.php`, `components/home/Navbar.tsx` | `search.filters.*` |
| **F** | Crédits et boost | `app/Models/Credit*.php`, `BoostProduct.php`, `PropertyBoost*.php`, `app/Services/Credits/**`, `app/Services/Boost/**`, `routes/api/credits.php` et `routes/api/admin-credits.php` (nouveaux), `app/Console/Commands/BoostsTick.php`, `app/Notifications/Credits/**`, `app/Notifications/Boost/**`, `HomepageDiscoveryService.php`, `EditablePlatformSettings.php`, `config/scout.php`, `BoostProductSeeder`, `components/boost/**`, pages `app/credits/**`, pages super-admin `credits/**` et `boosts/**` | `credits.*`, `boost.*`, `search.sponsored.*`, `superAdmin.credits.*`, `superAdmin.boosts.*` |

Les chemins front sont relatifs à `takussan-web/src/`, les chemins back à `takussan-api/`.

## Fichiers co-tenus

Édités par **Edit uniquement**, par blocs, selon la règle 3.

| Fichier | Lots | Ce que chacun y fait |
|---|---|---|
| `app/Domain/Features/Flag.php` | A, C | A : `MediaWatermark = 'media_watermark'` ; C : `HostAutoSpace = 'host_auto_space'` |
| `app/Models/Property.php` | C, D, F | C : relation `contacts()` ; D : bornes / casts éventuels ; F : colonnes de boost, `toSearchableArray` (`is_sponsored`, `ranked_at`, `badge`) |
| `app/Models/User.php` | C | (seul, mais lu par F pour l'empreinte du numéro) |
| `app/Models/Agency.php` | F | (seul : relations `creditLots`, `creditMovements`) |
| `app/Models/Enums/Capability.php`, `SystemRoleCapabilities.php` | F | (seul : `BoostSpend`) |
| `app/Http/Controllers/Api/PropertyController.php` | C | (seul : `PublishReadiness` dans `publish` et la visibilité ; D passe par les FormRequests) |
| `StorePropertyRequest.php`, `UpdatePropertyRequest.php` | D, F | D : bornes, XOF, frais d'agence ; F : `featured` interdit à tous |
| `app/Http/Controllers/Public/PublicPropertyController.php` | C, F | C : `contact()` ; F : tri de la liste publique (`ranked_at`, `sponsored`) |
| `app/Services/Search/PropertySearchService.php` | E, F | E : minimums ; F : tri organique, emplacements, places réservées. **E passe après F sur ce fichier** (§ Ordre) |
| `app/Observers/PropertyObserver.php` | F | (seul : branchement du cycle de vie du boost) |
| `routes/api/properties.php` | C | (seul : contacts) — F écrit ses routes de bien dans `routes/api/credits.php` |
| `routes/api/public.php` | C | (seul) — D écrit ses routes publiques dans `routes/api/geo.php` |
| `lang/{fr,en,wo}/errors.php` | C, D, F | chacun sous sa propre clé de premier niveau : `publish` et `onboarding` (C), `geo` et `tags` (D), `credits` et `boost` (F) |
| `database/seeders/DatabaseSeeder.php` (et `System/*` d'appel) | D, F | une ligne d'appel chacun |
| `components/layout/AppSidebar.tsx` | B, F | B : entrée admin dérivée ; F : entrée « Crédits » |
| `components/layout/SuperAdminSidebar.tsx` | D, F | une entrée par page neuve |
| `components/property-form/PropertyWizard.tsx` | C, D | C : bloc des coordonnées et CGU au moment de publier, écran de succès ; D : retrait de la devise devinée |
| `components/property/PropertiesDiscoveryPage.tsx` | E, F | E : paramètres de la carte ; F : rendu des emplacements et des places réservées |
| `components/property-dashboard/PropertyRowActions.tsx`, `PropertyHeaderActions.tsx` | F | (seul : bouton « Booster ») — A ne change que des valeurs i18n |
| `app/[locale]/(public)/properties/[slug]/components/PropertyHeader.tsx` | F | (seul : badges) |
| `(dashboard)/app/profile/page.tsx` | B, C | B : carte admin ; C : section numéros |
| `takussan-web/src/messages/{fr,en,wo}.json` | tous | règle 4 |
| `docs/legal/**` ou page légale des mentions | D | (seul : mention ODbL) |

## Interfaces entre lots

- **C → tous** : `GET /api/me` (et `user` du contexte d'auth) expose `phone_whatsapp: boolean`,
  `secondary_phone: string|null`, `secondary_phone_verified_at: string|null`,
  `secondary_phone_whatsapp: boolean`, `terms_accepted_at: string|null`. Type front `User`
  (`types/user.ts`) étendu par C.
- **C → F** : l'empreinte d'un numéro pour l'offre de bienvenue se calcule par
  `App\Support\PhoneFingerprint::of(string $e164): string` (HMAC sha256, clé `app.key`), **posé par
  F** (lot F tient `app/Support/PhoneFingerprint.php`). F écoute l'événement
  `App\Events\Auth\PhoneVerified(User $user)` — **posé par C** dans `PhoneVerificationService::markVerified`
  (créé s'il n'existe pas ; s'il existe, réutilisé). F écoute aussi la création d'espace :
  `App\Events\Onboarding\SpaceCreated(Agency $agency)`, **posé par C** dans le service d'onboarding
  (wizard et création automatique).
- **D → E** : `GET /api/public/geo/regions` → `{ data: [{ id, name, slug }] }` ;
  `GET /api/public/geo/cities?region={id}` → `{ data: [{ id, region_id, name, slug, latitude, longitude }] }` ;
  `GET /api/public/geo/neighborhoods?city={id}` → `{ data: [{ id, city_id, name, slug, latitude, longitude, status }] }`.
  La recherche filtre toujours par **nom** (`city`, `location`) : E passe le nom canonique.
  Primitive `components/ui/combobox.tsx` posée par D (liste avec recherche, simple et multiple,
  option « créer »), réutilisée par E.
- **D → E** : liste des équipements approuvés : `GET /api/tags?filter[type]=amenity&filter[status]=approved`.
- **F → E** : la réponse de `GET /api/public/properties/search` gagne `sponsored: Property[]` (hors
  pagination) et `placement: 'reserved' | 'organic'` sur chaque élément de `data`. E ne les
  consomme pas ; F les rend dans `PropertiesDiscoveryPage`.
- **F → B** : la page annonceur « Crédits » vit à `/app/credits` ; son entrée de menu exige
  `boost.spend` **ou** d'être admin de l'espace (lecture du solde).

## Ordre

```
Étape 0 (session)   branche, prérequis, vérifications de base
Vague 1 (parallèle) A · B · C · D · F         — chacun : implémentation, puis vérification adverse
Vague 2             E                         — après D (référentiel, combobox) et après F
                                                sur PropertySearchService
Étape 3 (session)   intégration : models-spec, features, ticket, INDEX ; suites entières par la CI
Étape 4 (session)   rituel de fin de branche : PR vers dev, CI verte, merge ; promotion preview
                    sur demande
```

Pourquoi E en dernier : il consomme la primitive et les listes de D, et partage
`PropertySearchService` avec F ; le faire passer après évite deux réécritures croisées du même
service.

## Étape 0 — session principale

- [ ] `git rev-parse origin/dev` = base de la branche ; `git switch -c feat/tck-633-lot-retours-porteur`
      depuis `docs/tck-633-lot-retours-porteur` (porte le ticket, les ADR et ce plan).
- [ ] `./dev.sh doctor` : PostgreSQL, Meilisearch, Redis, Mailpit répondent.
- [ ] Créer `docs/plans/rapports/` (vide, un `.gitkeep`).
- [ ] Relever la charge (`uptime`, `sysctl -n hw.ncpu`) avant de lancer la vague 1.

## Plans de lot

Chaque lot a son plan détaillé, écrit en lisant le code, au format de la compétence
`writing-plans` (tâches TDD, code complet, commandes et sorties attendues) :

- [Lot A](2026-10-12-tck-633-lot-a-correctifs.md)
- [Lot B](2026-10-12-tck-633-lot-b-acces-admin.md)
- [Lot C](2026-10-12-tck-633-lot-c-publication-numeros.md)
- [Lot D](2026-10-12-tck-633-lot-d-formulaire-referentiel.md)
- [Lot E](2026-10-12-tck-633-lot-e-filtres.md)
- [Lot F](2026-10-12-tck-633-lot-f-credits-boost.md)

## Vérification adverse (par lot, après son implémentation)

Un agent neuf par lot, dont la mission est de **refuser** :

- il reçoit le rapport JSON de l'implémenteur **comme une hypothèse à réfuter** ;
- il vérifie **par exécution**, jamais par lecture : chaque AC du lot, chaque test neuf ;
- il rejoue l'ablation **avec des formes de son invention**, sans lire celles de l'implémenteur,
  restaure par `cp` et prouve par `md5` ;
- il renseigne honnêtement `ablation_rejouee: true|false`, `ac_executes: [...]` ;
- un AC coché sans exécution derrière → **REFUSE** ;
- il écrit `docs/plans/rapports/tck-633-lot-<x>-verif.json`, verdict en premier.

Un refus renvoie le lot à un agent de correction (même territoire), puis à une nouvelle
vérification.

## Étape 3 — intégration (session, seule)

- [ ] Lire les champs `collisions` et `ecarts_au_ticket` de tous les rapports ; appliquer ou
      trancher avec le porteur.
- [ ] `docs/models-spec.md` : entrées des tables neuves (`geo_*`, `property_contacts`, `credit_*`,
      `boost_products`, `property_boosts`, `property_boost_daily_stats`) et colonnes ajoutées
      (`users`, `addresses`, `tags`, `properties`) ; `node scripts/check-models-spec.mjs`.
- [ ] Ticket : AC cochés **sur preuve d'exécution** seulement, `Notes d'implémentation`, statut ;
      `node docs/backlog/gen-index.mjs` puis `check-backlog.mjs`.
- [ ] Gardes racine (`for g in scripts/check-*.mjs …`), `gen-features-by-actor.mjs --check`.
- [ ] Commits par lot avec pathspecs, Pint, `tsc`, lint, `check:i18n`.

## Étape 4 — fin de branche

- [ ] Suites entières **par la CI** (PR vers `dev`), pas en local.
- [ ] Ticket à `done` une fois mergé sur `dev`, critères vérifiés un par un.
- [ ] Promotion `dev → preview` **seulement sur demande du porteur**. Jamais `master`.

## Addendum — arbitrages de la session après lecture des six plans de lot (2026-10-12)

Les plans de lot ont relevé 147 écarts en lisant le code. Ce qui suit **remplace** la table des
territoires et celle des fichiers co-tenus là où elles divergent. Les décisions du porteur sont dans
la section suivante.

### Corrections de fait

- **L'étage n'a jamais refusé un sous-sol** (D, E-1) : PostgreSQL n'a pas de non-signé, les colonnes
  `unsigned*` sont des `smallint` signés. Le vrai défaut est un **500** sur `parking_spaces = 40000`
  (débordement), faute de borne à la création. Le ticket le disait à tort ; le lot D corrige les bornes,
  pas le signe.
- **`/api/me` n'existe pas** : c'est `GET /api/auth/me` (`UserResource`). Les champs de l'interface C →
  tous n'y sortent que pour soi (`mergeWhen`), et sont optionnels dans le type front (C, E1).
- **Le paramètre d'étage est `floor_number`**, pas `floor` (E, écart 1).
- **La route des étiquettes d'un bien est `POST`** (D, E-3).
- **La production ne lance aucun seeder** (D, E-2) : référentiel et catalogue se chargent par les
  commandes idempotentes `geo:sync-referential` et `tags:sync-catalog`, appelées par `docker/release.sh`.

### Territoires étendus

| Lot | Ajouts accordés |
|---|---|
| A | `tests/Feature/Api/Admin/FeatureFlagTest.php` (**seul écrivain**, version tolérante aux deux drapeaux ; C n'y touche pas) ; `tests/Support/FiligraneGlobalAllume.php` et une ligne par classe de test média **mesurée** rouge ; `components/home/__tests__/Navbar.transaction.test.tsx` |
| B | espace i18n réel `nav.admin.*` ; `components/shared/NoAgencyState.tsx` ; les quatre fichiers de B-E5 (layout `/app` et `bandeau-suspension.test.tsx`, `AuthContext.session.test.tsx`, `AppSidebar.test.tsx`) |
| C | `UserResource.php` et `AuthController::updateProfile` (les deux insertions **[EXT]**) ; espace i18n `publishRedirect.auto.*` ; erreurs `property.publish_contact_incomplete` et groupe `secondary_phone` ; migrations `2026_10_12_300xxx` |
| D | toute la liste D-E12 (API, front, tests existants, `src/test/doublure-referentiel-geo.ts`, `docker/release.sh`) ; espace i18n `superAdmin.propositions.*` ; migrations `2026_10_12_4000xx`–`4002xx`. **Et, pour E :** `GET /api/public/geo/cities` sans `region` (toutes les villes) et une lecture **publique** du catalogue approuvé : `GET /api/public/amenities` → `{ data: [{ id, name, slug }] }` dans `routes/api/geo.php` |
| E | `src/test/__tests__/surface-publique.contraste.test.ts` (entrée datée, avec cause) ; commentaires périmés `components/map/PropertyMap.tsx:122`, `lib/queries/properties.ts:168` ; consomme `GET /api/public/amenities` (et non `/api/tags`) |
| F | collisions C1–C11 de son plan : `ProtectedActions.php`, `routes/console.php`, `MembershipCapabilityResolverTest.php`, `PlatformSettingsCatalogueTest.php`, `PropertyListTest.php`, `CompteurDeVue.tsx`, `types/super-admin.ts`, `platform-settings.tsx`, `NotificationTarget.php`, clés i18n hors espace listées en C9 ; migrations `2026_10_12_5000xx` |

### Fichiers co-tenus ajoutés

| Fichier | Lots |
|---|---|
| `app/Http/Resources/PropertyResource.php` | C (`primary_contact.has_whatsapp`), D (adresse `geo_*`), F (`badge`, `badge_until`) |
| `app/Http/Controllers/Public/PublicPropertyController.php` | C (`contact()`), **E** (`map()` : filtres), F (tri de la liste) |
| `components/property-form/__tests__/PropertyWizard.test.tsx` | C, D |
| écran de succès de publication (créé par C) | C, F (`BoostButton`) |

### Règles renforcées

- **Dictionnaires i18n : Edit uniquement, même avec un script « idempotent ».** Le script de la tâche 14
  du lot D ne s'exécute pas pendant la vague 1 : un script qui réécrit le fichier entier perd les clés
  qu'un autre lot vient d'insérer, et la parité fr/en/wo reste verte quand la clé disparaît des trois.
- **`src/i18n/namespaces.json`** : régénéré **par la session seule**, à l'intégration, sur l'arbre final
  (`node scripts/check-i18n-namespaces.mjs --update`).
- **Événements C → F** : F écrit ses écouteurs de bienvenue **en dernier** dans son lot, après avoir
  constaté sur disque `app/Events/Auth/PhoneVerified.php` et `app/Events/Onboarding/SpaceCreated.php`
  (posés par C, tâche dédiée). Jamais de copie de ces classes par F.
- **Aucune requête sortante portant une donnée personnelle.** Le lot D a envoyé une fois, pendant sa
  mesure, une requête Overpass dont l'en-tête `User-Agent` portait une adresse e-mail du porteur.
  User-Agent imposé : `takussan-geo-extract/1.0 (+https://www.takussan.com)`.
- **`check-models-spec` est rouge** pendant les lots (modèles neufs de C, D, F) : attendu, levé à
  l'étape 3, **avant** la PR.

### Décisions du porteur sur les plans de lot (2026-10-12)

Toutes sur la recommandation :

1. **Menu admin d'un solo (B-E6)** : le menu ne montre que les pages qu'il peut ouvrir ; les cadenas
   de TCK-371 disparaissent, et l'incitation passe par **une** carte « Passer en agence » dans
   « Mon espace » (la carte existante `components/layout/ProUpgradeCard.tsx`, au lot B).
2. **Unicité croisée (C-E10)** : un numéro vérifié n'appartient qu'à un compte, **principal ou second**.
   `isVerifiedElsewhere` (et tout chemin qui rend un numéro principal : vérification du profil,
   connexion ou inscription par téléphone) le juge aussi contre les seconds numéros vérifiés. Lot C.
3. **Publier depuis « Mes biens » ou l'en-tête d'un bien (C-E12)** : le bloc « Vos coordonnées pour
   les intéressés » s'ouvre en boîte de dialogue, puis la publication part. Lot C ;
   `PropertyRowActions.tsx` et `PropertyHeaderActions.tsx` deviennent **co-tenus C, F**.
4. **Filtre des équipements (E-8)** : **ET** — un bien doit offrir tous les équipements cochés.
   Lot E (`PropertySearchService::buildFilter`, une clause par équipement), libellé à l'avenant,
   alertes comprises.
