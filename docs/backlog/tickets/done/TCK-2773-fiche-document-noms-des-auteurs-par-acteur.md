---
id: TCK-2773
title: "Fiche d'un document : le nom de qui l'a ajouté, vérifié, versionné ou partagé — et à qui le montrer"
status: done
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: [TCK-2656]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, front, documents, visibilite, suite-de-tck-2656, audit-ux, app]
---

## Objectif utilisateur

Sur la fiche d'un document, le gestionnaire sait qui a ajouté la pièce, qui l'a vérifiée, qui a déposé
chaque version et qui a créé chaque lien de partage. Le locataire ou le bailleur sait au moins que c'est
« l'agence » qui a vérifié sa pièce, sans apprendre ce que la règle de visibilité ne lui ouvre pas.

## Contrat de données

**Constat (2026-11-13).** La maquette de la fiche (`app-documents` a, écrans 5 à 7) écrit « Ajouté par
Ousmane Niang, le 28 juin », « Vérifié par Awa Diop », « Ousmane Niang · 28 juin » sous chaque version et
« Créé le 5 nov. par Sokhna Sène » sur chaque lien. L'API ne sert que des identifiants :

- `DocumentResource` : `uploaded_by`, `verified_by`, `documentable_type` / `documentable_id` ;
- `DocumentVersionResource` : `uploaded_by_id` ;
- `DocumentShareLinkController::format` : aucun créateur.

TCK-2656 (lot 3, décision L3-1 (a)) n'a donc rendu que « vous » quand l'identifiant est celui de l'appelant,
la date seule sinon, et ni « Rattaché à » ni « Bien ».

**Ce que ce ticket tranche d'abord : la règle de visibilité par acteur.** Montrer un nom est une question
de visibilité, pas un ajout de champ :

- le personnel de l'agence du document ;
- le bailleur du bien ;
- le locataire du bail ;
- le prestataire ;
- le sujet d'une fiche client (TCK-2759 : jamais une pièce interne).

Pour chaque couple (lecteur, auteur), dire ce qui est servi : le nom, un rôle générique (« l'agence »,
« votre bailleur »), ou rien. La règle s'écrit une fois, côté API, et se teste par acteur.

**Delta côté API (après la règle).**

- Des champs additifs : le nom (ou le rôle) de l'auteur, du vérificateur, de l'auteur de chaque version.
- `created_by` sur `DocumentShareLink` (colonne et migration) avec le même jugement.
- L'entité de rattachement nommée (« Bail LS-… », le bien) selon la lecture déjà ouverte au lecteur.

**Delta côté front.** Les lignes de la fiche sont déjà construites par les données (`DocumentDetailClient`,
`VersionsDuDocument`, `LiensDePartage`) : elles paraissent dès que les champs sont servis.

## Contraintes strictes

- Aucun nom servi à un acteur que la règle n'y autorise pas.
- Aucun numéro ni courriel : un nom ou un rôle, rien d'autre.

## Critères d'acceptation

1. Le personnel de l'agence lit « Ajouté par <nom> » et « Vérifié par <nom> » ; un test par acteur fixe
   ce que lisent le bailleur, le locataire et le prestataire.
2. Un lien de partage créé porte son créateur, et la fiche le rend au personnel.
3. Le sujet d'une fiche client ne reçoit aucun nom du personnel que la règle ne lui ouvre pas.

## Hors périmètre

- Le renommage d'un document (aucune route ; le menu « … » de la fiche est tenu pour lui, TCK-2656).

## Notes d'implémentation

**La prémisse diffère (relevé du 2026-11-13 sur 7641542ea).**

- **`created_by_id` existe déjà** sur `document_share_links` : la migration `2026_04_17_160026` le crée,
  `DocumentShareLinkService::create` l'écrit, `DocumentShareLink::creator()` le lit. Aucune migration.
- **Le vérificateur est Takussan, jamais l'agence** : `DocumentController::verify` est réservé au super-admin, et
  c'est le seul écrivain de `documents.verified_by`. « Vérifié par Awa Diop » (maquette) et « l'agence a vérifié »
  (objectif) désigneraient un opérateur de la plateforme.
- **La liste des liens n'est pas au seul personnel** : `DocumentPolicy::share` s'ouvre aussi au titulaire du porteur
  (bailleur d'un bien, sujet d'une fiche client sur un document non interne). Le créateur d'un lien passe donc par
  la même règle que les autres noms.
- Le delta front n'est pas nul : la fiche ne lit aujourd'hui que les identifiants (« vous » ou la date seule).

**La règle** (décisions 1b, 2a, 3a de la session, appliquées par défaut le 2026-11-13 et portées sur la liste du
porteur) : [ADR-0099, amendement du 2026-11-13](../../../adr/0099-le-coffre-de-documents-la-liste-suit-la-lecture.md#amendement-du-2026-11-13--le-nom-des-auteurs-dun-document-selon-le-lecteur-tck-2773).
Le nom au personnel actif de l'agence, au super-admin et à soi ; un rôle (`agency`, `landlord`, `tenant`,
`customer`) à tout autre lecteur ; `platform` pour un opérateur, à tout lecteur hors console.

**Back (2026-11-13).** Le juge `App\Services\Documents\AuteurDuDocument` (une instance par fiche, chaque auteur
jugé une fois) ; `uploaded_by_person` et `verified_by_person` sur un document seul (`show`, `store`, `verify`,
`visibility` : `DocumentResource::avecAuteurs()`), jamais sur une liste ; `uploaded_by_person` de chaque version
(`GET …/versions`, `store` et `restore` d'une version, `include=versions` de la fiche) ; `created_by_person` de chaque
lien (liste et création). Le lien public (`/api/share/{token}`) ne porte aucun auteur.

Tests : `tests/Feature/Documents/NomsDesAuteursParActeurTest.php`, 10 tests, 143 assertions — personnel, super-admin,
locataire, bailleur, sujet d'une fiche client, personnel sujet de sa fiche, prestataire, auteur parti, liste et lien
public ; chaque refus lu sur le corps brut (sous `include=uploader,verifier,versions`), apparié au personnel qui lit
le nom. Ablations, une à une, juge restauré au md5 : le nom servi à tous → 5 rouges (locataire, bailleur, sujet,
personnel sujet, auteur parti) ; sans `platform` → 3 rouges (personnel, locataire, prestataire) ; le sujet ignoré → 1
rouge (personnel sujet de sa fiche) ; les auteurs servis aussi sur une liste → 1 rouge.

**Front (2026-11-13, sur 5ee095698, le lot 3 de TCK-2656).** `fiche/auteur.ts` (`useNomDAuteur`) écrit le nom servi,
sinon le rôle traduit (`documents.fiche.auteurs.role.*` au fil de la phrase, `.roleSeul.*` en tête de ligne), sinon
rien : le front ne déduit jamais un nom d'un identifiant. La fiche écrit « Ajouté par Ousmane Niang, le 27 juin » /
« Ajouté par l’agence, le … », « Vérifié par Takussan, le … », la légende « ajoutée le … par … », « Ousmane Niang ·
28 juin » / « L’agence · 28 juin » sous chaque version, « Créé le 5 nov. par … » sur chaque lien ; sans auteur servi,
la date seule, comme avant. Test : `src/components/documents/__tests__/auteurs.tck-2773.test.tsx` (3 tests : le
personnel, le locataire, sans auteur). Ablations : les trois composants rendus à HEAD → 2 rouges ; le rôle ignoré → 2
rouges ; restaurés à l'identique (`cmp`).

**Reste** : l'entité de rattachement nommée (« Bail LS-… », le bien) — hors de ce lot (session, 2026-11-13).

- 2026-11-14 — passé done : AC tenus au HEAD (a78c5752e, b512ccfe5) ; « Vérifié par Takussan » hors console et « votre locataire / votre bailleur » sans nom confirmés par le porteur (décisions as, at, 2026-11-14).
