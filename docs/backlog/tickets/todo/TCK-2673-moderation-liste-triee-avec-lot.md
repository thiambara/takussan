---
id: TCK-2673
title: "Modération : la liste triée par risque avec publication par lot, et le bien vu comme le public le verra"
status: todo
phase: P1
family: front
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2672]
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#11-gestion-des-biens"
  models: []
tags: [front, moderation, reviews, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin trie les avis du jour en deux minutes — publier d'un coup les avis sans risque, regarder de près les autres avec leur sujet — et ne publie une annonce qu'après l'avoir vue.

## Contrat de données

- Avis : `GET /api/reviews` avec `filter[risk]`, `meta.risk_counts`, `target.photo_url`, `target.agent`, `risk` (TCK-2672) ; décision unitaire `PATCH /api/reviews/{id}/moderate` ; lot `POST /api/reviews/moderate-batch` (TCK-2672) ; réponse publique `POST|DELETE /api/reviews/{id}/reply` (existante) ; signalements `GET /api/reviews/{id}/reports` (existant).
- Biens : `GET /api/properties/moderation` (liste, recherche) et `GET /api/properties/moderation/{property}` (détail et liste de contrôle, TCK-2672) ; `POST …/approve` ; `POST …/reject` avec `reason_code` et `rejection_reason` (TCK-2672).
- Comptes du menu : existants (`reviewModeration`, `propertyModeration`).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-moderation&a=b` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « File des avis », « Détail d'un avis » (téléphone seul) et « Bien à valider », téléphone et bureau.
- **Téléphone** : pastilles « À risque (4) · Sans risque (51) · Biens (1) » et un bouton « Filtres » ; cartes compactes : le sujet en titre (photo du bien ou initiales de l'agent, « Avis sur le bien / sur l'agent »), les étoiles, le début du texte, l'auteur, la date, la raison du risque ; sur « Sans risque », des cases, « Tout cocher (51) » et une barre collante « 12 sélectionnés · Publier ». Le toucher ouvre le détail **plein écran**.
- **Bureau (dès `lg`)** : onglets « Avis · Biens à valider » avec leurs comptes ; deux colonnes — la liste (360 px) avec cases et « Publier la sélection · N avis », le détail à droite : le sujet (photo, lien vers le bien ou l'agent), la note, le texte entier, les signalements, puis « Publier », « Répondre publiquement » (600 caractères, signée du nom de l'agence ; « Publier avec la réponse »), « Masquer », « Supprimer », « Ignorer les signalements », le motif.
- **Bien à valider** : au téléphone, plein écran — carrousel de toutes les photos, titre, prix en F CFA par mois, type en français, quartier, description, « Soumis par {nom} · {Propriétaire|Agent} · le {date} · son 3ᵉ bien chez vous » ; liste de contrôle (photos, adresse, description, prix et médiane du quartier) ; barre collante « Demander une correction » / « Publier ». Au bureau, l'aperçu de la fiche au centre, la liste de contrôle et les gestes à droite ; « Demander une correction » : un motif en liste et un texte de 20 caractères au moins, avec son compteur.
- Une phrase rappelle que les avis sur l'agence elle-même sont modérés par Takussan.

## Contraintes strictes (métier)

Fonctions existantes à garder (`moderation/page.tsx`, `moderation/properties/page.tsx`, `ModerationWorkspace.tsx`, `ModerationDetail.tsx`, `PropertyModerationWorkspace.tsx`) :

- Bandeau de périmètre ; filtres statut (en attente, signalés, approuvés, rejetés), sujet (biens, agents), « Signalés uniquement » ; compte de la file ; pagination de 20.
- Détail : signalements (nombre, auteurs), Approuver · Masquer · Supprimer · Ignorer les signalements, motif codé et texte, confirmations ; avis sur l'agence ou déjà publié : réservé à la plateforme.
- Biens : recherche, compte, Approuver, rejet avec raison de 20 caractères au moins et confirmation.
- La publication par lot n'est proposée que sur « Sans risque ».
- Le détail s'ouvre **à l'écran** au téléphone (aujourd'hui il est empilé sous les vingt cartes de la liste).
- Corrections : prix en F CFA (jamais « XOF »), type en français (jamais `apartment`), l'auteur avec son vrai profil (« Propriétaire »), une seule forme de date (« 18 nov. 2026 », `useFormatteurs()`), des messages d'échec qui disent la cause et le geste suivant (plus « Une erreur est survenue. »).
- i18n `fr` / `en` / `wo` (`wo` = texte français), vouvoiement.

## Delta à produire

- [ ] File des avis par risque, sélection et publication par lot, détail plein écran au téléphone, deux colonnes au bureau.
- [ ] Sujet de l'avis et réponse publique dans le détail.
- [ ] Bien à valider : aperçu complet, liste de contrôle, « Demander une correction » avec motif.
- [ ] Tests : lot envoyé avec les seuls avis cochés ; cases absentes sur « À risque » ; détail plein écran au téléphone ; motif obligatoire ; prix en F CFA et type traduit.

## Critères d'acceptation

- [ ] AC1 — Cocher 12 avis sur « Sans risque » puis « Publier » envoie **une** requête `moderate-batch` à 12 identifiants ; les 12 cartes quittent la liste et le compte passe de 51 à 39.
- [ ] AC2 — Sur « À risque », aucune case ni barre de lot n'est rendue.
- [ ] AC3 — À 390 px, toucher un avis montre son texte entier et ses gestes dans le premier écran, sans faire défiler la liste.
- [ ] AC4 — Le détail d'un avis sur un bien montre la photo et le titre du bien, avec un lien vers sa fiche.
- [ ] AC5 — « Demander une correction » reste inactif sans motif ou sous 20 caractères ; l'envoi part avec `reason_code` et `rejection_reason`.
- [ ] AC6 — Le bien de démo affiche « 1 095 619 F CFA / mois », « Appartement », et « Propriétaire » pour un bien déposé par un bailleur ; « XOF » et `apartment` n'apparaissent pas dans le DOM.

## Hors périmètre

- La pile (approche A) et la modération depuis le sujet (approche C), non retenues.
- « Autres avis sur ce bien » dans le détail (aucun filtre par sujet précis n'existe sur la file).
- Le pré-tri par IA.

## Notes d'implémentation

_(à remplir par implementing-specs)_
