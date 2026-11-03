---
id: TCK-1708
title: "Un bien qui porte une réservation confirmée ou une visite à venir ne se supprime pas (422)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#17-propertyvisit-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-130--fiches-client-garant-et-bien-supprimées-en-douceur-et-encore-citées"
tags: [back, properties, bookings, visits, pistes]
---

## Contexte

Réf : **P130.04** du fichier de pistes, `validé` (critères V7 et V1 accordés).
`DELETE /api/properties/{id}` rend 204 sans regarder les réservations ni les visites : une
réservation `confirmed` et une visite `scheduled` survivent sur un bien supprimé, sans que le
client ni le visiteur en soient prévenus.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

**Choix retenu** : la piste laisse deux voies sans recommandation (refus en 422, ou annulation
avec notification et tâche de remboursement). La plus étroite est le **refus en 422**, sur la
forme du client et du garant sous bail ouvert : il n'écrit ni statut, ni avis, ni argent. Une
« visite à venir » est une visite `scheduled` ou `confirmed` dont `scheduled_at` n'est pas passé ;
une réservation retient le bien dès qu'elle est `confirmed`.

## Delta à produire

- [x] `PropertyController::destroy` : `422 property.has_confirmed_booking`, puis
  `422 property.has_upcoming_visit`, avant `delete()`.
- [x] `lang/{fr,en,wo}/errors.php` : les deux messages (`wo` porte le texte français, wolof en
  pause).
- [x] `PropertySuppressionEngagementsTest` (neuf).

## Critères d'acceptation

- [x] AC1 — réservation `confirmed` → 422 `property.has_confirmed_booking`, bien intact,
  réservation toujours `confirmed`.
- [x] AC2 — visite `scheduled` ou `confirmed` à venir → 422 `property.has_upcoming_visit`, bien
  intact.
- [x] AC3 — réservations `pending` ou `cancelled`, visite passée ou annulée → 204, bien supprimé.

## Hors périmètre

- La suppression de modération (`PropertyModerationService`) n'est pas gardée : elle n'est pas le
  geste de l'annonceur que décrit la piste.
- Le refus de supprimer un bien sous bail ouvert reste le « reste » de P130.02, au porteur.
- L'annulation avec avis et remboursement, autre voie de la piste, n'est pas faite.

## Notes d'implémentation

- Ablation : contrôleur remis à `43c553036` → 2 rouges sur 3 ; correctif remis → 3/3 verts.
  `PropertyCrudTest`, `PropertyAuthorizationTest`, `MaintenanceDUnBienSupprimeTest`,
  `LangGroupParityTest` verts.
