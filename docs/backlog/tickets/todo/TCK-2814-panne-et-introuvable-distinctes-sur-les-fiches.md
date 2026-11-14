---
id: TCK-2814
title: "Fiches et sous-blocs d'un objet : une panne propose « Réessayer », un objet introuvable ou refusé ne le propose pas ; DataState lit le statut"
status: todo
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#11-gestion-des-biens"
tags: [front, erreurs, 404, 403, baux, biens, documents, suite-de-tck-2807, audit-ux, app]
---

## Objectif utilisateur

Quand une fiche ne s'ouvre pas, la personne sait pourquoi : le service a eu un raté et elle peut réessayer, ou
l'objet n'existe pas, ou elle n'y a pas droit, et réessayer ne servirait à rien.

## Contrat de données

**Origine.** Écart laissé par TCK-2807 (notes, « Écart laissé » et « Inventaire des blocs d'erreur maison »), relevé
par reessayer-2807 le 2026-11-14.

**Constat, relu sur HEAD (`765093279`) le 2026-11-14.**

- **Fiche du bail** (`LeaseDetail`) : seul le 403 a son message (`lease.detail.forbidden`, TCK-2807). Toute autre
  erreur, panne (5xx, réseau) comme 404, rend « Bail introuvable. » (`lease.detail.error`) AVEC « Réessayer ». La
  panne est donc dite « introuvable », et l'objet absent propose une reprise inutile.
- **Les trois onglets nommés par TCK-2807**, qui proposent « Réessayer » sur toute erreur sans lire le statut :
  `OngletsDuBail` (Documents et Historique), `OngletLocation` (échéances et bail), `OngletDocuments` (du bien).
- **Les autres vues d'un objet unique ou leurs sous-blocs** du même inventaire : `FeuilleDesGarants`,
  `LeaseSchedule`, `VersionsDuDocument`, `FilDuClient`, `PropertyModerationDetail`, la fiche utilisateur du
  super-admin (`admin/super/user-detail`) et `AdminCreditWalletDetail`. Aucun ne lit le statut (relu : aucun
  `status === 403`, `forbidden` ni `refuse` à leur ligne d'erreur).
- **`DataState`** (`components/console/DataState.tsx`, 29 appelants) reçoit l'erreur déjà mise en texte et
  `onRetry` : il ne peut pas lire le statut. `QueryBoundary` (`components/shared/QueryBoundary.tsx`) le lit, lui,
  sur l'erreur brute.
- **Aucun 403 n'a été provoqué sur les onglets** : leur comportement réel sous 403/404 n'est pas mesuré.
- L'inventaire complet (77 fichiers, surtout des listes) se régénère par le grep de TCK-2807 : fichiers de
  `takussan-web/src` qui portent `onRetry=` et ni `status === 403`, ni `forbidden`, ni `refuse`.

## Direction UX / Artistique

Trois états, trois phrases, sans nommer l'objet refusé : la panne dit qu'un problème est survenu et offre de
réessayer ; l'objet introuvable le dit, avec un retour à la liste quand la vue en a une ; le refus reprend la phrase
neutre du profil actif de TCK-2807. Rien d'autre ne change à l'écran.

## Contraintes strictes (métier)

- Une panne (5xx, réseau, délai) propose toujours « Réessayer ». Un 403 ou un 404 ne le propose jamais.
- La fiche du bail ne dit plus « introuvable » sur une panne.
- La règle vit en un seul endroit, celui que `QueryBoundary` applique déjà (statut lu sur l'erreur brute), et non
  recopiée dans chaque vue.
- `DataState` accepte l'erreur brute à côté de son texte : un appelant qui la lui passe reçoit la règle. Les appelants
  qui ne la passent pas gardent leur rendu d'aujourd'hui.
- Textes en fr/en ; wo porte le texte français tel quel (wolof en pause).

## Delta à produire

- Fiche du bail : panne, introuvable et refus distingués.
- Les trois onglets et les sept vues ou sous-blocs d'objet unique ci-dessus suivent la même règle.
- `DataState` lit le statut quand il reçoit l'erreur brute ; `AdminCreditWalletDetail`, seul des dix à passer par lui,
  la lui passe.
- Tests vitest à côté de ceux de TCK-2807.

## Critères d'acceptation

- [ ] AC1 — Mesure d'abord : pour les trois onglets, un test rend chaque onglet sous une réponse 403 puis 404 de sa
  requête et consigne dans les notes ce qu'il affiche AVANT le changement (texte et présence de « Réessayer »).
- [ ] AC2 — Fiche du bail, réponse 500 : le texte de panne est présent, « Réessayer » est présent, et « Bail
  introuvable. » est ABSENT. Réponse 404 : « Bail introuvable. » est présent et « Réessayer » ABSENT. Réponse 403 :
  inchangée (TCK-2807).
- [ ] AC3 — Pour chacune des dix vues ou sous-blocs (une ligne par vue dans un tableau de tests, nommée) : 500 →
  « Réessayer » présent ; 403 et 404 → « Réessayer » absent et un texte présent.
- [ ] AC4 — `DataState` avec l'erreur brute : 500 → reprise ; 403/404 → pas de reprise. Sans erreur brute : le rendu
  d'aujourd'hui, avec reprise (un appelant non migré ne change pas).
- [ ] AC5 — Les tests de TCK-2807 restent verts.
- [ ] AC6 — Ablation : la lecture du statut retirée du point unique rend AC2, AC3 et AC4 rouges ensemble.

## Hors périmètre

- Les listes de l'inventaire (67 fichiers hors des dix vues) : un ticket de suite par famille si on le veut.
- Toute bascule d'espace automatique depuis une fiche refusée.

## Notes d'implémentation

_(à remplir par implementing-specs)_
