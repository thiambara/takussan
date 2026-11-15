---
id: TCK-2895
title: "API — les documents de l'agence rangés par bien et par bail : l'arbre compté, les alertes par dossier, la recherche et les pastilles sur toute l'agence"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2896]
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, documents, coffre, agence, audit-ux, app]
---

## Objectif utilisateur

Le personnel d'une agence ouvre « Documents » et trouve chaque pièce là où elle vit : sous le bien, puis sous le bail (contrat, états des lieux, quittances, pièces du locataire), avec ce qui expire bientôt et ce qui reste à vérifier compté par dossier.

## Contrat de données

Constat (audit du 2026-11-15, `audit-f4-patrimoine.md`, app-documents **e4**, et vérifié dans l'API à l'écriture) :

- `GET /api/documents` **sans cible** ne liste que les téléversements de l'appelant (`DocumentController::index`, `DocumentPolicy::restreindreAuTeleverseur`, règle TCK-820 reprise par ADR-0099 § 1). Les filtres existants sont `filter[documentable_type]` + `filter[documentable_id]`, `filter[property_with_leases]` (TCK-2841), `filter[expiring_within_days]`, `filter[is_verified]`, `filter[search]` ; la méta porte `counts` par type, `expiring_soon` (60 j) et `unverified` (`Document::attentionCounts`).
- `GET /api/documents/generated?target=lease:{id}|property:{id}` rend les documents générés (contrats, états des lieux, quittances) **cible par cible** (`DocumentVaultController::generated`, `DocumentVault.php:275-320`).
- `GET /api/me/document-vault` range par dossier pour le locataire, le bailleur et le prestataire (ADR-0099 § 2) — **aucun coffre pour l'agence**.
- Rien ne rend l'arbre « bien › bail › dossier » de toute l'agence avec ses comptes, ni la liste des documents de toute l'agence (pastilles « Expire bientôt » / « Non vérifiés » / « Générés », recherche « un document, un locataire, un bien »).

À servir :

1. **L'arbre de l'agence**, pour le personnel actif de l'agence (profil actif) : par bien de l'agence, son nom, son quartier, son nombre de documents, ses alertes (`expiring_soon`, `unverified`) ; sous le bien, « Pièces du bien » (documents rattachés au bien) et un nœud par bail hors brouillon (locataire, référence, date de début), lui-même découpé en **Contrat**, **États des lieux**, **Quittances** (générés, comptés depuis leur source, ADR-0099 § 3) et **Pièces du locataire** (téléversés rattachés au bail), chaque dossier avec son compte et ses alertes (« 1 expire dans 42 jours · 1 à vérifier ») ; puis le dossier **de l'agence** (documents rattachés à l'agence : NINEA, RC, modèles) avec son compte.
2. **Les totaux de l'en-tête** : nombre de documents de l'agence, nombre qui expirent bientôt, nombre à vérifier.
3. **La liste de toute l'agence** filtrable par `expiring_within_days`, `is_verified=false`, `generated` (uniquement les générés), et cherchable sur le nom du document, du locataire et du bien.
4. **Le contexte d'un document** dans `DocumentResource` (fiche) : le bien et, le cas échéant, le bail auxquels il est rattaché (nom du bien, quartier, référence du bail, nom du locataire), pour « Rattaché à », « Bien » et le fil « Bien › Bail › dossier » de la fiche (app-documents **e5**).

## Contraintes strictes (métier)

- **Décision structurelle** : la liste sans cible est écartée par ADR-0099 (§ 1 et « Options écartées » : « une liste globale sans écran pour la lire »). L'écran existe désormais (maquette app-documents e4). **Amender ADR-0099 avant tout code** : le coffre de l'agence (§ 2), et la liste de l'agence entière comme cible nommée (`agency`), bornée au personnel actif.
- **La liste suit la lecture** (ADR-0099 § 1) : un seul prédicat ; tout ce que l'arbre compte et tout ce que la liste rend s'ouvre en `show` (200), et rien de ce qu'un `show` refuse n'y figure. Le test de parité de TCK-2655 s'étend à la cible agence.
- **Isolation par agence** (principe 2) : jamais un bien, un bail ni un document d'une autre agence, même pour un utilisateur membre de deux agences — c'est l'agence du profil actif qui borne.
- Règles conservées d'ADR-0099 § 4 : impersonation (pas de pièces de profil), agent suspendu ou retiré.
- **Nombre de requêtes constant** pour l'arbre, quel que soit le nombre de biens et de baux (même garde que le coffre).
- Les générés restent listés depuis leur source, jamais copiés (ADR-0099 § 3).
- Sparse fieldsets et `include=` selon `docs/spatie-query-builder.md`.

## Delta à produire

- [ ] **Amender ADR-0099** (le coffre de l'agence, la cible `agency`) — avant le code.
- [ ] Endpoint : `GET /api/agency/document-vault` (arbre + totaux), `DocumentVaultController::agency` (ou contrôleur dédié), service `App\Services\Documents\AgencyDocumentVault`.
- [ ] Cible `agency` sur `GET /api/documents` (`filter[agency]=current` ou alias de cible) + filtre `filter[generated]` ; recherche étendue au locataire et au bien.
- [ ] `DocumentResource` : bloc `context` (bien, bail) au détail.
- [ ] Tests : `AgencyDocumentVaultTest` (arbre, comptes, alertes par dossier, dossier de l'agence, autre agence absente, agent retiré, impersonation, compte de requêtes constant) ; parité liste ↔ `show` pour la cible agence (vérifiée par ablation) ; `DocumentResource` contexte.

## Critères d'acceptation

- [ ] AC1 — Pour l'admin d'une agence avec un bien loué (bail actif portant 1 contrat, 1 état des lieux signé, 6 échéances payées, 3 pièces téléversées dont une qui expire dans 42 jours et une non vérifiée), l'arbre rend ce bien avec un nœud de bail découpé en Contrat 1, États des lieux 1, Quittances 6, Pièces du locataire 3, et sur ce dernier `expiring_soon=1`, `unverified=1`.
- [ ] AC2 — Un bien d'une autre agence, et un document qu'un `show` refuse à l'appelant, n'apparaissent ni dans l'arbre ni dans ses comptes ni dans la liste (`filter[agency]`) : test de parité, rouge si la condition d'agence est retirée du SQL.
- [ ] AC3 — Les totaux de l'en-tête égalent la somme des dossiers de l'arbre (documents, expirent bientôt, à vérifier).
- [ ] AC4 — `GET /api/documents?filter[agency]=…&filter[search]=Niang` rend les pièces du bail dont le locataire s'appelle Niang, même si leur nom de fichier ne contient pas « Niang ».
- [ ] AC5 — `filter[generated]=1` sur la cible agence ne rend que des entrées générées (contrat, état des lieux, quittance), chacune avec son chemin de téléchargement existant.
- [ ] AC6 — Le détail d'une pièce rattachée à un bail porte le nom du bien, son quartier, la référence du bail et le nom du locataire ; celui d'une pièce rattachée au bien porte le bien et aucun bail.
- [ ] AC7 — L'arbre d'une agence de 30 biens et 40 baux s'obtient en un nombre de requêtes égal à celui d'une agence de 1 bien et 1 bail.
- [ ] AC8 — Un locataire, un bailleur ou un prestataire qui appelle l'arbre de l'agence reçoit 403.

## Hors périmètre

- L'écran (TCK-2896).
- Le coffre du bailleur et du prestataire (TCK-2897).

## Notes d'implémentation

_(à remplir par implementing-specs)_
