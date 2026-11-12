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
- Exclure le document interne de l'export des données personnelles : une question de droit, laissée au porteur (§ 8).
- La révocation, à la bascule, des liens publiés par le personnel.
- La recherche de documents : elle ne rend que les téléversements de l'appelant, et le sujet n'a pas déposé les documents internes.

## Notes d'implémentation

_(à remplir par implementing-specs)_
