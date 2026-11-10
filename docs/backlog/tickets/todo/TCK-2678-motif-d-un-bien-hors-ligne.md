---
id: TCK-2678
title: "Un bien hors ligne dit pourquoi : des codes de motif servis par l'API, issus du même prédicat que « En ligne »"
status: todo
phase: P2
family: full
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2637, TCK-2638, TCK-2639]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
tags: [back, front, properties, en-ligne, audit-ux, app]
---

## Objectif utilisateur

Le bailleur ou l'agent qui voit « Hors ligne » sur un bien sait aussitôt pourquoi — privé, en attente
de validation, loué, agence suspendue… — et ce qu'il peut faire pour le remettre en ligne, sans
appeler l'agence ni deviner.

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `Property::scopePublic` (`Property.php:607-624`) exige : agence active (`ofPublicAgency` :
  `agency_id` nul ou agence `active`), `visibility = public`, `is_test = false`, `published_at` non
  nul, statut hors `draft, sold, rented, archived, under_maintenance, unavailable, pending_review,
  rejected` (`Property::NON_PUBLIC_STATUSES`).
- TCK-2637 extrait ce prédicat en un seul endroit (`Property::isOnline()` ou équivalent) et sert
  `is_online` ([ADR-0097](../../../adr/0097-en-ligne-est-un-etat-derive.md) § 1).

**À créer** :

- Le prédicat **décomposé** : une fonction unique qui rend la liste des conditions non remplies, et
  dont `isOnline()` devient « la liste est vide ». Il n'y a **pas** deux définitions.
- Champ `offline_reasons` sur `PropertyResource` : liste de codes, vide quand le bien est en ligne,
  demandé comme tout champ (`fields[properties]=…,offline_reasons`, [ADR-0006](../../../adr/0006-lecture-api-par-query-builder.md)).
- Codes, un par condition, dans cet ordre de priorité d'affichage :

  | Code | Condition non remplie |
  |---|---|
  | `agency_inactive` | l'agence du bien n'est pas `active` (suspendue ou inactive, [ADR-0048](../../../adr/0048-effet-d-une-suspension-d-agence.md)) |
  | `status_<valeur>` | le statut est dans `NON_PUBLIC_STATUSES` (ex. `status_pending_review`, `status_rented`) |
  | `not_published` | `published_at` est nul |
  | `private` | `visibility ≠ public` |
  | `test` | `is_test = true` |

- L'API ne rend **que des codes** ([ADR-0032](../../../adr/0032-l-api-n-ecrit-plus-de-prose.md)) ; le texte est au front.

## Direction UX / Artistique

- Pas de maquette dédiée : le motif se pose là où « Hors ligne » s'affiche dans les écrans retenus —
  liste des biens (`/fr/playground/maquettes?p=app-biens&a=b`) et fiche du bien
  (`?p=app-fiche-bien&a=a`), références de fidélité non versionnées (cf.
  [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes)).
- **Fiche du bien** : sous la pastille « Hors ligne », une phrase par motif, du plus prioritaire au
  moins, avec le geste quand il existe (« Privé — rendre public », « En attente de validation par
  l'agence », « Loué — remis en ligne à la fin du bail », « Agence suspendue »).
- **Liste** : la pastille « Hors ligne » porte le premier motif en sous-texte ; au bureau, le motif
  complet au survol et au focus clavier ; au téléphone (360-390 px), le premier motif seul, sur une
  ligne, tronqué proprement.
- Bureau (≥ 1280 px) : rien ne passe en colonnes avant `lg` (`md` n'est pas le bureau).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0097](../../../adr/0097-en-ligne-est-un-etat-derive.md) § 5 (décidé par le porteur le 2026-11-10), [ADR-0032](../../../adr/0032-l-api-n-ecrit-plus-de-prose.md).

- **Un seul prédicat** : `offline_reasons` vide ⇔ `is_online = true` ⇔ le bien sort par
  `filter[public]=1`. Le front ne recompose jamais un motif à partir du statut ou de la visibilité.
- **Ce que chacun lit** : le motif se sert à qui lit déjà le bien dans la console (personnel,
  bailleur du bien, collaborateurs). Il n'est **jamais** servi par les routes publiques : un bien hors
  ligne n'y existe pas.
- Le libellé du statut `published` est « Validé » (ADR-0097 § 4, décidé le 2026-11-10) ; le mot
  « Publié » ne s'affiche toujours pas comme état.
- i18n : un libellé par code en `fr` / `en` / `wo` (le `wo` porte le texte français tel quel),
  vouvoiement. Un code inconnu du front s'affiche par un libellé générique (« Hors ligne »), sans erreur.

## Delta à produire

- [ ] API : prédicat décomposé (une source), `isOnline()` qui le lit, champ `offline_reasons` dans `PropertyResource`.
- [ ] Front : motifs sur la fiche du bien et dans la liste, avec les gestes existants quand il y en a.
- [ ] Tests API : `PropertyOfflineReasonsTest` — un cas par code ; plusieurs codes cumulés dans l'ordre ; parité `offline_reasons == []` ⇔ `is_online` ⇔ `filter[public]=1` sur le jeu croisé de TCK-2637.
- [ ] Tests front : un libellé par code ; code inconnu → libellé générique.

## Critères d'acceptation

- [ ] AC1 — Sur le jeu de 8 biens de TCK-2637 (AC2), pour chaque bien, `offline_reasons` est vide **si et seulement si** il figure dans `filter[public]=1`. Retirer une condition du prédicat décomposé fait rougir ce test (ablation).
- [ ] AC2 — Un bien `pending_review`, privé, d'une agence suspendue rend exactement `["agency_inactive","status_pending_review","private"]`, dans cet ordre.
- [ ] AC3 — `GET /api/public/properties/{slug}` d'un bien hors ligne rend 404 et la réponse ne contient pas `offline_reasons`.
- [ ] AC4 — Sur la fiche d'un bien loué, la phrase « Loué » est rendue sous « Hors ligne », et aucun texte ne nomme « Publié ».
- [ ] AC5 — À 390 px, la ligne de liste d'un bien hors ligne tient sur sa largeur (aucun défilement horizontal du document) et montre un seul motif.

## Hors périmètre

- Le quota de biens (inchangé, ADR-0097 § 6, décidé le 2026-11-10).
- Remettre un bien en ligne en un geste depuis le motif, au-delà des gestes qui existent déjà.

## Notes d'implémentation

_(à remplir par implementing-specs)_
