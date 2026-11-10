---
id: TCK-2655
title: "Documents côté API : un coffre par dossier qui liste ce qu'on a le droit de lire, y compris les documents que la plateforme produit, avec les expirations"
status: todo
phase: P1
family: back
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2639, TCK-2641, TCK-2656]
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#22-document-"
    - "docs/models-spec.md#29-documentsharelink-"
tags: [back, documents, audit-ux, app]
---

## Objectif utilisateur

Le locataire qui cherche « mon contrat » le trouve dans son coffre, à côté de ses quittances, de son état des lieux et de ses pièces, sans rien avoir téléversé. L'agence ouvre le dossier d'un bien ou d'un bail et y voit tous les documents qui s'y rattachent, quel que soit celui qui les a déposés.

## Contrat de données

**Relevé sur `dev` le 2026-11-10** :

- **`GET /api/documents` ne liste que les téléversements de l'appelant.** C'est `DocumentPolicy::restreindreAuTeleverseur`, `where('uploaded_by', $user->id)`, posé par TCK-820 au motif qu'« aucun écran de la console ne lit cette liste ». Conséquences :
  - le locataire ne voit pas un document que l'agence a rattaché à son bail ;
  - l'agence ne voit pas, depuis un bien, ce qu'un collègue y a déposé.
- **Les PDF que la plateforme produit ne sont pas des `Document`.** Ils sont rendus à la volée par des endpoints dédiés :
  - `leases/{lease}/contract/pdf` ;
  - `leases/{lease}/receipts/{payment}/pdf` ;
  - `inventories/{inventory}/pdf` ;
  - `invoices/{invoice}/pdf` ;
  - `owner-statements/pdf|csv` ;
  - `maintenance-requests/{id}/quote/pdf`.
  Le contrat signé est un média du bail (`signed_contract`). `DocumentPdfService::store()` n'a aucun appelant.
- **Filtres** : `documentable_type`, `documentable_id`, `uploaded_by`, `type`, `is_verified`, `search`.
  - Sans table d'alias, le type doit être le nom de classe complet.
  - Il n'y a aucun filtre d'expiration.
- **Lecture unitaire** (`DocumentPolicy::view` / `reaches`) : un document de bail se lit par le bailleur, le personnel de l'agence ou le locataire ; un document de bien, par le bailleur ou le personnel.

**À servir** (consommé par TCK-2656, TCK-2639 et TCK-2641) :

- **`GET /api/me/document-vault`** → `DocumentVaultController`. Il rend les dossiers de l'appelant selon son profil actif :

  | Profil | Dossiers |
  |---|---|
  | Locataire | « Mon bail » par bail (contrat, états des lieux signés, documents rattachés au bail qu'il peut lire) ; « Quittances {année} » (une entrée par échéance payée) ; « Mes pièces » (ses téléversements, documents de sa fiche client et de son compte) |
  | Bailleur | un dossier par bien (documents du bien et de ses baux, contrats, états des lieux) ; « Relevés et attestations » ; « Mes pièces » |
  | Prestataire | « Mes factures » (factures d'intervention) ; « Mes pièces » |

  Chaque entrée porte :
  - `kind` : `uploaded` ou `generated` ;
  - `title`, `date`, `category` ;
  - `download_path`, le chemin d'API existant ;
  - pour un document téléversé : `document_id`, `is_verified`, `expiry_date`, `versions_count` ;
  - `targets` : les dossiers auxquels l'entrée appartient (bail, bien).
- **Lecture par cible** : `GET /api/documents?filter[documentable_type]=lease&filter[documentable_id]=…` (alias courts `property`, `lease`, `customer`, `owner_profile`, `inventory`) liste **tous** les documents de cette cible que l'appelant peut `view`, quel qu'en soit l'auteur. Sans cible, la règle de TCK-820 reste : ses propres téléversements.
- **Documents générés d'une cible** : `GET /api/documents/generated?target=lease:{id}` (ou `property:{id}`) rend les entrées générées de cette cible, pour l'onglet Documents d'un bien ou d'un bail.
- **Expirations** :
  - `filter[expiring_within_days]=N` ;
  - comptes `expiring_soon` et `unverified` pour une cible ou pour le coffre.
- **Rattachement sans identifiant** : le coffre rend aussi `attachable_targets`, la liste nommée des dossiers où l'appelant peut téléverser.

## Contraintes strictes (métier)

- **La liste suit la lecture** ([ADR-0099](../../../adr/0099-le-coffre-de-documents-la-liste-suit-la-lecture.md)) :
  - aucune entrée n'est listée qu'un `show` refuserait. **Un seul prédicat** (`DocumentPolicy::view` / `reaches`), traduit en SQL pour la liste ; la règle n'est pas copiée deux fois ;
  - test de parité : toute entrée listée s'ouvre, et toute entrée refusée n'est pas listée.
- **Les documents générés ne sont pas copiés** en `Document` :
  - ils sont listés depuis leur source (bail, échéance payée, état des lieux signé, relevé, facture) ;
  - ils se téléchargent par leur endpoint actuel, sous sa propre autorisation ;
  - ni versions ni vérification ;
  - partage par lien : hors périmètre (cf. ADR).
- **Quittances** : une entrée par échéance **payée** seulement, jamais pour une échéance non acquittée (§1.4). Une échéance remboursée n'en a plus (TCK-2505).
- **Règles conservées** :
  - sous impersonation, les pièces de profil ne se listent pas (TCK-697) ;
  - un agent suspendu ou retiré ne liste plus ce qu'il a téléversé dans l'agence (TCK-2295) ;
  - le super-admin n'a pas de coffre de plateforme, et ouvre toujours un document par son identifiant, journalisé (TCK-820).
- **Performance** : le coffre d'un locataire de 36 échéances se lit en un nombre constant de requêtes.

## Delta à produire

- [ ] `App\Services\Documents\DocumentVault` : dossiers par profil, entrées générées par source, `attachable_targets`.
- [ ] Route `GET /api/me/document-vault` et route `GET /api/documents/generated`.
- [ ] `DocumentController@index` : avec une cible, la lecture de la cible remplace la restriction à l'auteur. Alias courts de `documentable_type`.
- [ ] Filtre `expiring_within_days`, et les comptes.
- [ ] Tests :
  - `DocumentVaultTenantTest` : 6 quittances payées, contrat, état des lieux signé ; un document de l'agence rattaché à son bail présent ; celui d'un autre locataire absent ; une échéance impayée sans quittance ;
  - `DocumentVaultOwnerTest` ;
  - `DocumentVaultProviderTest` ;
  - `DocumentIndexByTargetTest` : personnel de l'agence, tous les auteurs ; personne extérieure, rien ; sans cible, règle de TCK-820 intacte ;
  - `DocumentListReadParityTest` ;
  - `DocumentExpiringFilterTest` ;
  - `DocumentVaultImpersonationTest`.

## Critères d'acceptation

- [ ] AC1 — `locataire-f4` de l'audit (6 échéances payées, 1 état des lieux, 1 bail) : son coffre contient 6 quittances, le contrat de bail et l'état des lieux s'il est signé. Aucune quittance pour une échéance non payée.
- [ ] AC2 — Un document téléversé par l'admin sur le bail 22 apparaît dans le coffre du locataire du bail 22, et pas dans celui d'un autre locataire.
- [ ] AC3 — `GET /api/documents?filter[documentable_type]=lease&filter[documentable_id]=22`, appelé par un agent de l'agence, rend les documents de tous les auteurs. Appelé par un agent d'une autre agence, il ne rend rien.
- [ ] AC4 — Sans filtre de cible, `GET /api/documents` rend toujours les seuls téléversements de l'appelant (test de TCK-820 inchangé, vert).
- [ ] AC5 — Pour un échantillon de chaque entrée listée, `GET` de son `download_path` rend 200. Pour un échantillon d'entrées que `view` refuse, l'entrée est absente du coffre.
- [ ] AC6 — `filter[expiring_within_days]=60` rend la pièce d'identité qui expire dans 42 jours, et pas celle qui expire dans 90 jours.

## Hors périmètre

- L'écran (TCK-2656).
- La copie des documents générés en `Document` (versions, partage) : écartée par l'ADR, sauf décision contraire.
- Le « dossier de location à partager » d'un candidat (ambition).
- L'OCR.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
