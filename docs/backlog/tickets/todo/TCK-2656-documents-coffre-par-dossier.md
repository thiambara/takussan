---
id: TCK-2656
title: "Documents : le coffre par dossier pour chaque profil, l'ajout par photo depuis le contexte, la fiche d'un document et le partage par lien"
status: todo
phase: P1
family: front
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2655]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
    - "docs/models-spec.md#29-documentsharelink-"
tags: [front, documents, camera, mobile, audit-ux, app]
---

## Objectif utilisateur

« Où est mon contrat ? » se règle en un toucher. Le locataire, le bailleur et le prestataire trouvent leurs documents rangés comme leur vie locative. L'agence ouvre le dossier d'un bien puis d'un bail. Une pièce d'identité s'ajoute en la photographiant et se range sans connaître aucun numéro. Ce qui expire bientôt se voit.

## Contrat de données

- `GET /api/me/document-vault` (TCK-2655) : dossiers, entrées `uploaded` / `generated`, `attachable_targets`, comptes `expiring_soon` et `unverified`.
- Agence : `GET /api/documents` avec une cible et `GET /api/documents/generated?target=` (TCK-2655), plus `filter[expiring_within_days]` et `is_verified`.
- Les endpoints existants :
  - téléversement : `DocumentUploadDialog`, 10 Mo au plus ;
  - fiche ;
  - versions : liste, téléchargement, restauration, nouvelle version avec commentaire ;
  - vérification ;
  - liens de partage : durée, téléchargements maximum, mot de passe, liste, révocation ;
  - suppression.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-documents&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Locataire — le coffre », « ajouter (photo ou fichier) », « nommer et ranger », « coffre encore vide », « Agence — par bien, par bail », « Fiche d'un document », « Fiche — partager par lien », « Fiche — lien copié », « Bailleur — un dossier par bien » et « Prestataire — factures et pièces ». Au téléphone et au bureau.
- **Locataire** :
  - dossier « Mon bail » : contrat et état des lieux, avec la pastille « Généré par Takussan » ;
  - « Quittances 2026 (n) », replié, avec « Tout télécharger » ;
  - « Mes pièces », avec « expire dans 42 jours » en ambre ;
  - bouton collé « Ajouter un document ».
- **Ajouter** : feuille « Prendre une photo / Choisir un fichier », puis « Nommer et ranger » :
  - nom, catégorie, expiration ;
  - « Rangé dans : Mes pièces · bail … », choisi parmi `attachable_targets`, **jamais un identifiant**.
- **Agence** :
  - recherche « Chercher un document, un locataire, un bien » ;
  - pastilles « Expire bientôt (n) », « Non vérifiés (n) » ;
  - dossiers Bien › Bail › (Contrat, États des lieux, Quittances, Pièces du locataire).
- **Bailleur** : un dossier par bien, plus « Relevés et attestations ».
- **Prestataire** : « Mes factures » et « Mes pièces ».
- **Fiche d'un document** :
  - aperçu, nom, « Vérifié ✓ · expire le … », « Rattaché à : … » ;
  - « Télécharger », « Partager » ;
  - section « Versions (n) ».
- **Partager** :
  - feuille : durée, mot de passe, téléchargements maximum ;
  - puis « Lien copié », avec la liste des liens actifs et « Révoquer ».
- **Téléphone (360-390 px)** : dossiers repliables, bouton d'ajout collé. L'appareil photo est proposé d'abord.
- **Bureau (≥ 1280 px)** : dès `lg`, l'arborescence à gauche, la liste au centre, et à droite l'aperçu avec les versions et les liens de partage.

## Contraintes strictes (métier)

**Rien ne se perd** (audit famille 4, § 6, *Fonctions existantes* 1-7, lues dans `components/documents/*`) :

- compteur, **recherche**, filtre par catégorie et par entité, pagination ;
- « Téléverser » :
  - glisser-déposer au bureau, ou sélection ;
  - taille maximale contrôlée ;
  - nom, catégorie, **date d'expiration**, rattachement, description ;
- par document : vérifié / non vérifié, versions, télécharger, partager, supprimer avec confirmation ;
- fiche : statut de vérification, version active, expiration, commentaire, retour ;
- **versions** : nouvelle version avec commentaire, restauration ;
- **lien de partage** : durée, téléchargements maximum, mot de passe, liens actifs avec leurs usages, révocation ;
- le guide `OwnerDocumentsPrimer` du bailleur, s'il reste utile au coffre ;
- l'état vide pédagogique de l'agence (exemples du métier).

Autres contraintes :

- **Appareil photo** : l'ajout au téléphone propose une entrée `capture="environment"` (image) **et** une entrée fichier. Aujourd'hui l'entrée n'a pas de `capture` (`DocumentUploadDialog.tsx:220`).
- **Rattachement sans identifiant** : les champs « type d'entité » et « identifiant » (`DocumentUploadDialog.tsx:258-274`) disparaissent de tous les profils. Le rattachement se choisit parmi les dossiers nommés. Depuis une fiche (bien, bail, client), il est prérempli et verrouillé, comme `AddDocumentButton` aujourd'hui.
- **Un document généré** se télécharge, mais ne se versionne, ne se vérifie, ne se supprime ni ne se partage par lien ([ADR-0099](../../../adr/0099-le-coffre-de-documents-la-liste-suit-la-lecture.md)). Ces gestes ne sont pas rendus pour lui.
- **États vides propres au profil** :
  - locataire : « Vos pièces, votre contrat et vos quittances apparaîtront ici » ;
  - jamais « Glissez-déposez » au téléphone ;
  - un seul bouton d'ajout.
- **L'entrée « Documents » du bailleur** dans le menu relève de la coque (famille 3) : cf. le RAPPORT.
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, dates relatives (« expire dans 42 jours ») par `useFormatteurs()`.

## Delta à produire

- [ ] Coffre par dossier pour le locataire, le bailleur et le prestataire.
- [ ] Vue de l'agence par bien et par bail, avec les pastilles d'expiration et de vérification.
- [ ] Ajout en deux temps : photo ou fichier, puis nommer et ranger parmi les dossiers.
- [ ] Fiche d'un document : aperçu, versions, partage en feuille, lien copié et liens actifs.
- [ ] Gestes masqués pour un document généré. États vides par profil.
- [ ] Tests :
  - coffre du locataire (contrat, quittances, état des lieux) ;
  - aucun champ d'identifiant ;
  - `capture` présent ;
  - document généré sans gestes de gestion ;
  - expiration affichée ;
  - partage : charge utile et révocation ;
  - 1280 px en trois colonnes.

## Critères d'acceptation

- [ ] AC1 — `locataire-f4` ouvre « Documents » : le dossier « Mon bail » contient le contrat, et « Quittances 2026 » compte autant d'entrées que d'échéances payées rendues par l'API. Le texte « 0 document » n'apparaît pas.
- [ ] AC2 — L'ajout au téléphone offre une entrée `capture="environment"`. Le formulaire « Nommer et ranger » ne contient aucun champ numérique d'identifiant (DOM). Le rattachement envoyé est celui du dossier choisi.
- [ ] AC3 — Sur un contrat généré, la fiche rend « Télécharger », et ni « Nouvelle version », ni « Supprimer », ni « Partager ».
- [ ] AC4 — Une pièce qui expire dans 42 jours porte « expire dans 42 jours ». La pastille « Expire bientôt » de l'agence la compte.
- [ ] AC5 — Partager avec 7 jours, un mot de passe et 3 téléchargements envoie ces trois valeurs. Le lien apparaît dans « Liens actifs », et « Révoquer » le retire.
- [ ] AC6 — À 1280 px, l'arborescence, la liste et l'aperçu sont côte à côte. À 390 px, aucune ligne ne déborde.

## Hors périmètre

- Le dossier de location à partager (ambition).
- L'OCR, et la signature de documents autres que le bail et l'état des lieux (§1.10, P3).
- L'entrée de menu « Documents » du bailleur et du prestataire (coque, famille 3).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
