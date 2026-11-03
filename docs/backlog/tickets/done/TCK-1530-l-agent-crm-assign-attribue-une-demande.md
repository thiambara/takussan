---
id: TCK-1530
title: "Demandes de contact : l'agent qui détient crm.assign attribue, sur une liste de cibles triée et bornée au personnel"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1244, TCK-1246]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-120--listes-de-personnes-des-sélecteurs-face-au-prédicat-décriture"
tags: [web, api, crm, demandes-de-contact, autorisation, pistes]
---

## Contexte

Réf : **P120.05** du fichier de pistes, `validé` (critère accordé : V2).

Le bouton « Attribuer » d'une demande de contact n'était montré qu'à l'administrateur de
l'agence, parce que `GET /api/agencies/{id}/members` lui est réservé : l'agent qui détient
`crm.assign`, à qui `PropertyContactLeadPolicy::assign` ouvre le geste, n'avait aucune liste où
choisir. Le dialogue n'envoyait pas non plus de tri : au-delà de 100 membres, les plus anciens
disparaissaient sans mention.

## Décision du porteur

> validé — porteur (2026-10-22) : `sort=first_name` dans le dialogue, et ouvrir à l'agent `crm.assign` une lecture des cibles bornée au personnel ; docblocks corrigés avec P120.02

## Objectif

L'agent qui détient `crm.assign` dans l'agence attribue une demande, sur une liste triée par
prénom qui ne rend que le personnel joignable.

## Delta à produire

- [x] `AgencyPolicy::listAssignableStaff` : `crm.assign` dans l'agence de la route, sous le profil
      actif de cette agence.
- [x] `AgencyController::listMembers` : qui n'administre pas l'agence passe par cette règle, et
      reçoit `filter[assignable]=1` imposé, sans `include`, avec `id`, `first_name`, `last_name`
      seuls ; le chemin de l'administrateur ne change pas.
- [x] `ContactLeadsInbox` : « Attribuer » se juge par `crm.assign` seul ; `AttribuerDialog`
      envoie `sort=first_name`.
- [x] Docblocks de `useDelegationCandidates` et de `CreateDelegationDialog` : déjà corrigés par
      TCK-1244 (P120.02), rien à reprendre.

## Critères d'acceptation

- [x] AC1 — Un agent `crm.assign` de l'agence lit `/members` : le personnel joignable (lui
      compris), ni bailleur ni compte bloqué, trié par prénom, chaque ligne réduite à
      `id`, `first_name`, `last_name` même si la requête demande d'autres colonnes ou un `include`.
- [x] AC2 — Le même agent reçoit 403 sur les membres d'une autre agence ; un bailleur reçoit 403.
- [x] AC3 — Le bouton « Attribuer » est montré à l'agent qui détient `crm.assign`, et le dialogue
      envoie `sort=first_name`.

## Hypothèse (mode sans humain)

« Une lecture des cibles bornée au personnel » est servie par la route existante plutôt que par une
route neuve, pour que le dialogue garde une seule lecture et que son `sort=first_name` s'applique
aux deux chemins. Le bornage aux colonnes du nom est le plus étroit que le dialogue demande : il
n'ouvre à l'agent ni le courriel, ni le téléphone, ni les rôles de ses collègues (V3 non touché).

## Hors périmètre

- Le reste de `/members` (bailleurs, filtres de rôle, recherche, colonnes) reste réservé à
  l'administrateur.

## Notes d'implémentation

- Ablations : `AgencyController.php` remis à `HEAD` → le test API neuf rouge (403) ; la seule
  ligne qui impose `filter[assignable]=1` retirée → rouge (« Un compte bloqué n'est pas une
  cible ») ; `ContactLeadsInbox.tsx` remis à `HEAD` → test front rouge (pas de bouton) ; le seul
  `sort` retiré → rouge (`expected undefined to be 'first_name'`). Tout remis → vert.
- Le test front `%s lit ses demandes mais n'a pas « Attribuer »` pour `agent` décrivait l'ancien
  état ; il devient « un bailleur sans crm.assign n'a pas Attribuer » et le cas de l'agent est
  inversé.
