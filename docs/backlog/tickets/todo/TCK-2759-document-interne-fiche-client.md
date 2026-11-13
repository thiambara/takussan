---
id: TCK-2759
title: "Document interne de la fiche client : le personnel range une pièce que le client ne lit pas, ni à l'écran, ni en liste, ni dans son coffre, son accueil ou par lien"
status: todo
phase: P1
family: full
estimate: M
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, front, documents, crm, customers, policy, audit-ux, app]
---

## Objectif utilisateur

L'agent dépose sur la fiche d'un client une pièce qui ne regarde que l'agence : une note de solvabilité, une copie reçue d'un tiers, un échange avec un garant. Il sait qu'elle ne sera montrée au client que s'il le décide.

## Contrat de données

Décision : [ADR-0099](../../../adr/0099-le-coffre-de-documents-la-liste-suit-la-lecture.md), **amendement du 2026-11-12** (décision 9 (b) du porteur). La colonne est décrite dans `models-spec.md` § 22.

- `documents.is_internal` : `boolean NOT NULL DEFAULT false`.
- `POST /api/documents` accepte `is_internal` (booléen, facultatif).
- `PATCH /api/documents/{document}/visibility` reçoit `{ is_internal: bool }` et rend le document.
- `DocumentResource` rend `is_internal`.

Relevé du 2026-11-12 (0bec981e2). Six chemins rendent aujourd'hui au sujet d'une fiche un document que le personnel y a déposé. Le ticket en **ferme cinq**, et le sixième garde les métadonnées :

1. `DocumentPolicy::view` : `GET /api/documents/{id}`, et `DocumentVersionController` (`index`, `download`) ;
2. `DocumentPolicy::listableOn` : `GET /api/documents?filter[documentable_type]=customer&filter[documentable_id]=…` ;
3. `DocumentVault::uploadedDocuments` : `GET /api/me/document-vault` ;
4. `DashboardTenantService` : `documents.recent` de l'accueil du locataire ;
5. `DocumentPolicy::share` : la branche « titulaire du porteur » (`$porteur->user_id`), qui laisse le client publier un lien ;
6. `DataExportBuilder::documents` : il **garde** les métadonnées, sans le fichier (ADR-0099, amendement, § 8). Ce lecteur ne change pas.

`CustomerResource.documents` (personnel seul, par `CustomerPolicy::view`) et `DocumentSearchService` (ses propres téléversements seulement) ne rendent rien au client. Ils ne changent pas.

## Direction UX / Artistique

- Partout où le **personnel** téléverse sur une fiche client, le formulaire porte une case **« Visible par le client »**, **décochée par défaut**, et sa phrase d'aide : « Sinon, seule l'agence la voit. » Relevé du 2026-11-12, deux surfaces :
  - le panneau « Documents » de la fiche client (`/app/customers/[id]`) ;
  - la bibliothèque de documents, quand le dossier choisi est une fiche client.

  Le dialogue de téléversement est partagé : la case n'apparaît que pour une fiche client.
- Un document interne se lit à la ligne : pastille **« Interne »**, sobre (ton neutre, pas d'alerte).
- Le personnel bascule la visibilité depuis la ligne (« Rendre visible au client » / « Garder pour l'agence »). Le geste se confirme quand il rend visible : c'est l'irréversible.
- Le client ne voit ni la case, ni la pastille, ni le geste.
- i18n : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement.

## Contraintes strictes (métier)

- **La règle est positive.** Un document interne se lit par le super-admin et par le personnel **actif** de l'agence de la fiche, le téléverseur compris tant qu'il en est membre (règle d'auteur, ADR-0031, amendement du 2026-10-25). Personne d'autre ne le lit.
  - **Jamais par le sujet de la fiche** (`customers.user_id`), même s'il en est l'auteur (`added_by_id`), même s'il est du personnel de l'agence.
  - Retirer la seule branche `user_id === $user->id` de `reaches` **ne suffit pas** : la branche « auteur encore membre » laisserait passer le bailleur auteur de sa propre fiche (le cas de TCK-2757).
- **Un seul prédicat.** La définition du lecteur d'un document interne s'écrit une fois. `view`, `listableOn` et `share` la lisent ; le coffre et l'accueil la lisent sous sa forme SQL. Elle n'est jamais recopiée.
- **Le drapeau ne vaut que sur une fiche client.** Sur tout autre porteur : 422 `document.internal_customer_only`, et rien n'est créé.
- **Le client ne pose jamais le drapeau.** `is_internal=true` envoyé par le sujet sur sa fiche : 403.
- **Une pièce téléversée par le sujet n'est jamais interne** : 422 `document.internal_own_upload`, à la création comme à la bascule.
- **Défaut.** Le personnel qui téléverse sur une fiche client sans envoyer `is_internal` obtient `true`. Partout ailleurs (autres porteurs, client, écrivains hors de `POST /api/documents`), la colonne vaut `false`.
- **La bascule** (`setVisibility`) : tout membre actif du personnel de l'agence de la fiche, et le super-admin.
  - Pas le sujet, pas un bailleur de l'agence, pas le personnel d'une autre agence.
  - `update` (le téléverseur seul) **ne change pas** : il garde le fichier et ses versions.
  - Journal : `activity('Document')`, évènement `document_visibility_changed`, avec `from` et `to`.
- **Pas de migration de données** : les lignes existantes restent `false`.
- **À la bascule vers « interne »**, les liens que le **sujet** avait publiés vers le document sont révoqués (`created_by_id`), dans la même transaction. Les liens du personnel restent.
- **Sous impersonation**, les règles de TCK-697 restent.
- **Codes d'erreur** : `lang/{fr,en,wo}/errors.php`, avec la parité gardée par `LangGroupParity`.

## Delta à produire

- [ ] Migration `add_is_internal_to_documents_table` : `boolean('is_internal')->default(false)`, `down()` qui la retire.
- [ ] `Document` : `is_internal` dans `$fillable`, `$casts` (booléen), `$queryFields`.
- [ ] `DocumentPolicy` :
  - [ ] la méthode unique qui dit si un utilisateur lit les documents internes d'une fiche (super-admin, ou personnel actif de son agence, et jamais le sujet) ;
  - [ ] `view` la lit pour un document interne ;
  - [ ] `listableOn` ajoute `is_internal = false` quand l'appelant n'y a pas droit ;
  - [ ] `share` ne passe plus par la branche du titulaire pour un document interne ;
  - [ ] l'ability `setVisibility`.
- [ ] `StoreDocumentRequest` : `is_internal` (`sometimes`, `boolean`). `DocumentController::store` : les refus, puis le défaut.
- [ ] `PATCH /api/documents/{document}/visibility` : `DocumentVisibilityController` (ou une action de `DocumentController`), `UpdateDocumentVisibilityRequest`, le journal.
- [ ] `DocumentVault::uploadedDocuments` et `DashboardTenantService` : la forme SQL de la règle pour les documents de fiche client.
- [ ] `DocumentResource` : `is_internal`.
- [ ] Codes d'erreur `document.internal_customer_only`, `document.internal_own_upload` (fr, en, wo).
- [ ] Front, fiche client : la case, la pastille, la bascule (cf. Direction UX).
- [ ] Tests (back) : `DocumentInternalVisibilityTest` (les six chemins), `DocumentInternalUploadTest` (défaut, refus), `DocumentVisibilityToggleTest`, le test de parité de TCK-2655 étendu à la ligne interne.
- [ ] Tests (front) : la case décochée envoie `is_internal: true` ; cochée, `false` ; pastille et bascule absentes pour un client.

## Critères d'acceptation

Fixture commune : une agence A, une fiche client C d'A dont le sujet est le compte U, un agent actif X d'A, un agent Y d'une autre agence. X téléverse D sur C sans envoyer `is_internal`.

- [ ] **AC1 — Le défaut, en base.** `documents.is_internal` de D vaut `true`. Le même téléversement avec `is_internal=false` donne `false`.
- [ ] **AC2 — Le sujet ne le lit par aucun chemin, et le lit dès qu'il est visible.** Pour U :
  - `GET /api/documents/{D}` → 403 ;
  - `GET /api/documents/{D}/versions` → 403, et le téléchargement d'une version → 403 ;
  - la liste à cible `customer`/C ne contient pas D ;
  - `GET /api/me/document-vault` ne contient pas D ;
  - `documents.recent` de son accueil ne contient pas D.

  **Puis X bascule D à `false`** : les cinq mêmes appels rendent D (200, ou présent). Le refus vient donc du drapeau, et non d'un chemin cassé. Chaque refus se vérifie par ablation de la condition qui le porte.
- [ ] **AC3 — Le sujet auteur, le sujet membre.**
  - Un bailleur B d'A, auteur de sa propre fiche C' (`added_by_id = B`, `user_id = B`), ne lit pas un document interne de C' : 403, et absent de la liste.
  - Même chose pour un agent actif d'A qui est le sujet d'une fiche d'A.
  - Ablation : retirer la seule branche « client » de la règle laisse ce test **rouge**.
- [ ] **AC4 — Le personnel le lit.**
  - X et un autre agent actif d'A : 200 et présent en liste.
  - Y (autre agence) : 403.
  - X, une fois suspendu dans A : 403. La règle d'auteur s'applique.
  - Le super-admin : 200.
- [ ] **AC5 — Parité liste ⇔ lecture.** Le test de parité d'ADR-0099 § 1, étendu : pour U, X, Y et le super-admin, l'ensemble listé sur la cible C est exactement l'ensemble des documents de C dont le `show` rend 200, avec au moins un document interne et un document visible dans C. Ablation : retirer `is_internal = false` de `listableOn` rend le test rouge, et le retirer de `view` aussi.
- [ ] **AC6 — Le partage.**
  - U ne publie pas de lien vers D : `POST /api/documents/{D}/share` → 403.
  - Sur un document **visible** de C déposé par X, U publie toujours (201). La branche du titulaire n'est fermée que pour l'interne.
  - X publie un lien vers D : 201.
  - Un document E de C est visible. U publie un lien vers E, puis X publie le sien. X bascule E vers « interne » : le lien de U porte `revoked_at`, et le lien public rend 410 `share_link.revoked`, et celui de X sert toujours.
- [ ] **AC7 — Qui pose, et où.**
  - U envoie `is_internal=true` en téléversant sur C → 403.
  - U téléverse sur C sans le champ → `false`.
  - X bascule à `true` un document que U a téléversé → 422 `document.internal_own_upload`, et la ligne ne change pas.
  - X envoie `is_internal=true` sur un bail, un bien, une réservation, un état des lieux → 422 `document.internal_customer_only`, et aucune ligne n'est créée.
- [ ] **AC8 — La bascule.**
  - Un agent actif d'A qui n'est pas le téléverseur bascule D (200), et le journal porte `document_visibility_changed` avec `from: true, to: false`.
  - U, un bailleur d'A et Y → 403, sans entrée de journal.
- [ ] **AC9 — L'existant.** Un document de fiche créé avant la migration (ou inséré sans la colonne) vaut `false`, et U le lit. La migration et son `down()` passent, sans migration de données.
- [ ] **AC10 — L'export.** L'export des données de U contient D en métadonnées (type, nom, date), sans fichier ni chemin, comme toute pièce déposée par un autre (ADR-0099, amendement, § 8).
- [ ] **AC11 — Le front.**
  - Sur la fiche client, la case « Visible par le client » est décochée. L'envoyer décochée produit `is_internal: true` dans la requête réseau, cochée `false`.
  - D porte la pastille « Interne ». La bascule est proposée au personnel.
  - Aucune des trois n'est rendue pour un client.

## Hors périmètre

- Le document interne sur un autre porteur que la fiche client (bail, bien, réservation) : un autre amendement (ADR-0099, amendement, § 2).
- Exclure le document interne de l'export des données personnelles : **écarté par le porteur le 2026-11-12** (l'export garde les métadonnées, jamais le contenu ; ADR-0099, amendement, § 8). L'AC10 est la règle validée.
- La révocation, à la bascule, des liens publiés par le personnel.
- La recherche de documents : elle ne rend que les téléversements de l'appelant, et le sujet n'a pas déposé les documents internes.

## Notes d'implémentation

**2026-11-12 (back-4).** Rien n'est commité ; la session déléguante commite.

### Ce qui a été fait

- **Le prédicat unique** : `DocumentPolicy::readsInternalOf(User, Customer)` — jamais le sujet
  (`customers.user_id`), sinon le super-admin ou `isStaffOf` (personnel actif). Sa forme SQL,
  `DocumentPolicy::restreindreAuxLecteursDInternes()`, est posée par le coffre
  (`DocumentVault::uploadedDocuments`), l'accueil du locataire (`DashboardTenantService`) et la règle
  des propres téléversements (`restreindreAuTeleverseur`). `view` et `share` commencent par une branche
  « interne » qui ne lit qu'elle ; `listableOn` ajoute `is_internal = false` sur une fiche client pour
  qui ne la passe pas ; `keepsInternalOn` (téléversement) et `setVisibility` (bascule) la lisent.
- **Un septième chemin de lecture, absent du ticket** : `GET /api/customers/{id}?include=documents`
  (la fiche client le lit). `CustomerResource` filtre désormais les documents internes pour qui ne les
  lit pas (le verdict est jugé une fois pour la fiche), et sert `is_internal` et
  `abilities.set_visibility` à chaque ligne. Sans ce filtre, l'admin d'une agence sujet d'une fiche de
  sa propre agence (il voit tout le CRM) lisait le nom et le type du document interne. Épinglé par
  `test_the_fiche_include_follows_the_same_rule`, rouge par ablation (m8).
- `DocumentResource` : `is_internal`, et `abilities.set_visibility` (sur une fiche client seulement —
  ailleurs la bascule rend 422 et ne s'offre pas). `DocumentAbilitiesTest` mis à jour en conséquence.
- `PATCH /api/documents/{document}/visibility` : action `DocumentController::visibility`,
  `UpdateDocumentVisibilityRequest` (`authorize` = `setVisibility`, donc 403 avant 422),
  `App\Services\Documents\DocumentVisibility` (verrou de la ligne, révocation des liens du sujet,
  journal `document_visibility_changed` avec `from`/`to` ; rien ne s'écrit si la valeur ne change pas).
- **Export (AC10)** : aucun changement de code — la pièce déposée par un autre sur la fiche du titulaire
  sort déjà en métadonnées (`DataExportBuilder::DOCUMENT_METADATA` : id, type, name, created_at).
  Retirer le document interne de l'export serait UN filtre sur `is_internal` dans
  `DataExportBuilder::documents()` ; `test_ac10_…` changerait alors de sens. Décision laissée au
  porteur (§ 8).
- **Front** : la case « Visible par le client » (décochée) dans `DocumentUploadDialog`, montrée au seul
  personnel actif (`usePersonnelActif`) quand la cible est une fiche client — le panneau de la fiche et
  la bibliothèque (cible « Client ») partagent ce dialogue. Décochée → `is_internal=1` dans le
  `FormData`, cochée → `0`, sans la case → le champ ne part pas. La pastille « Interne » et la bascule
  (`components/documents/VisibiliteDuDocument.tsx`) sur la ligne de la bibliothèque et du panneau, au
  seul verdict de l'API ; « Rendre visible au client » passe par une confirmation, « Garder pour
  l'agence » non.
- **Le panneau de la fiche lisait des champs qu'aucune réponse ne portait** (`uploaded_at`, `size`,
  `url` : date « Invalid », lien « Ouvrir » sans cible). `CustomerDocument` suit désormais ce que
  `CustomerResource` sert, et « Ouvrir » mène à `/app/documents/{id}`. La clé
  `crm.customerDetail.documents.sizeMb` n'est plus lue.

### Écart à la lettre d'un AC

- **AC5, super-admin** : il lit les trois documents de C (200) mais n'en liste aucun par la cible —
  `listableOn` le renvoie à la règle de ses propres téléversements (ADR-0099 § 1 : « il ouvre un
  document par son identifiant, journalisé », TCK-820), qui écarte même ses dépôts sur la fiche d'une
  agence dont il n'est pas membre (règle d'auteur). Antérieur au ticket ; la parité tient pour U, X et
  Y, et pour le super-admin la liste n'est jamais plus large que la lecture.
- **AC3, ablation** : la règle est positive, et un bailleur n'est pas du personnel — retirer la
  vérification du sujet de `readsInternalOf` (m5) rougit le cas de l'agent sujet et celui de l'admin
  sujet (include), pas celui du bailleur, qui n'y passe à aucun titre. Le bailleur, lui, LISTE sur sa
  propre fiche : `listableOn` sans le filtre (m2) rougit son cas.

### Tests et mesures

- Back : `tests/Feature/Documents/DocumentInterneLectureTest.php` (AC1, AC2 les cinq chemins plus
  l'include, AC3, AC4, AC5, AC9 avec `down()`/`up()`, AC10, l'ability, la bibliothèque) et
  `DocumentInterneEcritureTest.php` (AC6, AC7, AC8) — les trois classes nommées par le delta y sont
  regroupées en deux. 16 tests verts.
- Ablations, une à une, toutes rouges : m1 branche interne de `view` (4 rouges) · m2 filtre de
  `listableOn` (3) · m3 forme SQL du coffre · m4 forme SQL de l'accueil · m5 vérification du sujet (2) ·
  m6 branche interne de `share` · m7 révocation des liens du sujet · m8 filtre de l'include de fiche ·
  m9 défaut au téléversement (6) · m10 branche « personnel » de la forme SQL (la bibliothèque du
  téléverseur perd D). Front : f1 sens de la case (2 rouges), f2 garde du personnel (1).
- Le sujet n'écrit rien sur D : `DELETE`, `POST …/versions` et `POST …/verify` → 403 (`update` est au
  seul téléverseur, `verify` au super-admin). Aucun écouteur, aucune notification ni tâche planifiée ne
  nomme un `Document` (relevé : `app/Listeners`, `app/Observers`, `app/Notifications`, `app/Jobs`,
  `routes/console.php`) : pas de huitième chemin par envoi.
- Existants : 46 classes qui citent `DocumentPolicy`, `/api/documents`, le coffre, l'accueil ou
  l'export, plus les gardes (`ImpersonationReadSweep`, `ValeursEnListe`, `LangGroupParity`, les trois
  d'architecture) : verts, hors `DateInventoryByValueTest` rouge à ce moment sur des clés d'autres tickets
  (`InvitationResource::abilities`, `PropertyResource::sponsored_until`), vert à la relance suivante.
- Front : `components/documents/__tests__/visibilite-interne.tck-2759.test.tsx` (9 tests : la case et
  son sens, le `FormData`, le `PATCH`, la pastille, la confirmation, rien pour un client) et deux cas de
  plus dans `DocumentsLibrary.test.tsx`. Les deux tests existants du dialogue doublent désormais
  `usePersonnelActif` (le dialogue lit le profil actif). La cible du dialogue se lit par `useWatch`
  (garde TCK-571). Gardes front et racine : aucun rouge ne cite un fichier de ce ticket.


- **AC5, amendé (décision relayée par team-lead, 2026-11-13, option a)** : la liste d'une fiche n'est jamais plus large que la lecture du sujet. Le super-admin ne liste pas un document interne par sa cible ; il l'ouvre par son identifiant, et cette lecture est journalisée (ADR-0099 § 1). L'export garde les métadonnées d'un document interne, jamais son contenu, sans branche nouvelle : c'est le comportement actuel de `DataExportBuilder`, épinglé par `test_ac10`.

### Suivi (2026-11-13) — r1 et t1 de la vérification de cd48b8f57/44f6de314 (back-4)

- **r1, une offre qui ne ment pas.** Sur la pièce visible téléversée par le sujet, `abilities.set_visibility` valait `true` pour le personnel, puis « Garder pour l'agence » rendait 422 `document.internal_own_upload`.
  - La règle vit dans `DocumentVisibility::basculeOfferte()` : un document interne offre « Rendre visible », un document visible offre « Garder pour l'agence » sauf s'il est une pièce du sujet. `change()` lit le même prédicat (`estUnePieceDuSujet`).
  - `DocumentResource` et `CustomerResource` (`include=documents`) la lisent après la policy. La policy `setVisibility` ne change pas, et le PATCH non plus : il rend toujours 422 sur ce cas.
  - Front : aucun changement. La ligne ne monte la bascule que sur `abilities.set_visibility`, et c'est déjà épinglé par `visibilite-interne.tck-2759` « sans le verdict de l'API, ni pastille ni bascule ».
  - Épinglé par `DocumentInterneEcritureTest::test_r1_la_piece_visible_du_sujet_n_offre_pas_une_bascule_refusee`, sur la ligne, la liste de la fiche et `include=documents`. Le test vérifie aussi que le dépôt visible de X garde son offre et qu'une pièce du sujet restée interne offre « Rendre visible », qui passe.
  - Ablations, toutes rouges : `CustomerResource` sans la règle ; `DocumentResource` sans la règle ; la règle qui ignore l'état interne.
- **t1.** `test_ac3` s'étend au coffre (`/api/me/document-vault`) et à l'accueil (`/api/dashboard/tenant`) de l'agent sujet. Un témoin visible prouve que ces deux chemins lisent bien sa fiche.
  - Ablation C3 (la forme SQL perd sa garde du sujet) : rouge, d'abord sur le coffre.
  - Le contrôle de l'accueil suit la même forme SQL ; il n'a pas été ablaté séparément.

### Suivi (2026-11-13) — r1 et r2 de la vérification de 416274da0 : le jugement ne dépend plus des `fields`

- **r1.** La bibliothèque demandait `fields[documents]` sans `is_internal`. Tout document revenait donc `is_internal=false` : pas de pastille « Interne », « Garder pour l'agence » offert sur un document déjà interne, et « Rendre visible » perdu sur la pièce du sujet restée interne. `DOCUMENT_LIST_FIELDS` porte maintenant `is_internal` (épinglé par `documents-fields.tck-2759.test.ts`).
- **r2.** L'offre se jugeait sur le modèle tel que spatie l'avait sélectionné. Sans `uploaded_by`, la pièce visible du sujet promettait la bascule refusée.
- **Côté API, des deux chemins.** `DocumentVisibility::completerLesColonnes()` relit, en UNE requête pour la page, les colonnes du jugement absentes des modèles (`is_internal`, `uploaded_by`). Elle est appelée :
  - par `DocumentResource::page()`, avec en plus `documentable_type` et `documentable_id` ;
  - par l'`include=documents` de `CustomerResource`, AVANT le filtre des internes.
- **Fuite relevée.** Sur l'`include`, des `fields[documents]` sans `is_internal` faisaient passer le document interne à l'admin d'A, sujet de la fiche, qui ne lit pas les internes. Le test le reproduisait, rouge avant le correctif.
- **Tests.**
  - `DocumentInterneEcritureTest::test_r1_la_bibliotheque_dit_l_interne_quels_que_soient_ses_fields` : les `fields` du front, et ceux d'avant le correctif.
  - `DocumentInterneEcritureTest::test_r2_l_offre_ne_depend_pas_des_colonnes_demandees`.
  - `DocumentInterneLectureTest::test_the_fiche_include_judges_the_database_not_the_requested_fields`.
- **Ablations, toutes rouges.**
  - `page()` sans complétion : r1 et r2.
  - `include` sans complétion : test de l'include.
  - complétion sans `uploaded_by` : r2.
  - front sans `is_internal` : les deux tests front.
